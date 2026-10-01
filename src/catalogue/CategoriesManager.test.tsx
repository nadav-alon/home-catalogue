import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { CategoriesManager } from './CategoriesManager.tsx'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'
import { choose } from '../testing/select.ts'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import { grocery, medicine, pharmacy } from './testFixtures.ts'

const createCategory = vi.fn()
const renameCategory = vi.fn()
const deleteCategory = vi.fn()
const restoreCategory = vi.fn()
const changeCategoryDefaultShop = vi.fn()
const watchCategories = vi.fn()

const { FakeCategoryInUseError } = vi.hoisted(() => ({
  FakeCategoryInUseError: class extends Error {},
}))

vi.mock('./categories.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./categories.ts')>()),
  changeCategoryDefaultShop: (db: unknown, category: unknown, shopId: unknown) => changeCategoryDefaultShop(db, category, shopId),
  createCategory: (db: unknown, name: string, shopId: unknown) => createCategory(db, name, shopId),
  renameCategory: (db: unknown, category: unknown, name: string) => renameCategory(db, category, name),
  deleteCategory: (db: unknown, category: unknown) => deleteCategory(db, category),
  restoreCategory: (db: unknown, category: unknown, shops: unknown) => restoreCategory(db, category, shops),
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
  CategoryInUseError: FakeCategoryInUseError,
}))

const watchShops = vi.fn()
vi.mock('./shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shops.ts')>()),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const categoriesUnsubscribe = vi.fn()
const shopsUnsubscribe = vi.fn()

afterEach(resetHash)

beforeEach(() => {
  // jsdom has no modal dialog; stand in for the browser's open/close bookkeeping.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  createCategory.mockReset().mockResolvedValue(undefined)
  renameCategory.mockReset().mockResolvedValue(undefined)
  deleteCategory.mockReset().mockResolvedValue(undefined)
  restoreCategory.mockReset().mockResolvedValue(undefined)
  resetSnackbar()
  changeCategoryDefaultShop.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
  categoriesUnsubscribe.mockClear()
  shopsUnsubscribe.mockClear()
})

function openEditor(categoryName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${categoryName}` }))
}

function renderWith(categories: CategoryRecord[], shops: ShopRecord[]) {
  let publishShops: (shops: ShopRecord[]) => void = () => {}
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    cb(categories)
    return categoriesUnsubscribe
  })
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    publishShops = cb
    cb(shops)
    return shopsUnsubscribe
  })
  const rendered = render(
    <>
      <CategoriesManager db={fakeDb} />
      <SnackbarHost />
    </>,
  )
  return { ...rendered, publishShops }
}

describe('CategoriesManager', () => {
  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    watchCategories.mockReturnValue(categoriesUnsubscribe)
    watchShops.mockReturnValue(shopsUnsubscribe)
    window.location.hash = '#/settings/categories'
    render(
      <TopAppBar title="Categories">
        <CategoriesManager db={fakeDb} />
      </TopAppBar>,
    )

    const banner = screen.getByRole('banner')
    const back = within(banner).getByRole('button', { name: 'Back to Settings' })
    const heading = within(banner).getByRole('heading', { level: 1 })
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(back)

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every Category as a row with its default Shop name', () => {
    renderWith([medicine], [pharmacy, grocery])

    expect(screen.getByText('Medicine')).toBeInTheDocument()
    expect(screen.getByText('Pharmacy')).toBeInTheDocument()
  })

  it("falls back to 'Unknown Shop' instead of the raw id when the default Shop is missing", () => {
    renderWith([medicine], [])

    expect(screen.getByText('Unknown Shop')).toBeInTheDocument()
  })

  it('offers every Shop as a default Shop choice', () => {
    renderWith([], [pharmacy, grocery])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    const select = screen.getByLabelText('Default Shop')
    expect(screen.getByRole('option', { name: 'Pharmacy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grocery' })).toBeInTheDocument()
    expect(select).toHaveValue('')
  })

  it('adds a new Category with the chosen default Shop', async () => {
    renderWith([], [pharmacy, grocery])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })
    choose(screen.getByLabelText('Default Shop'), grocery.id)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(createCategory).toHaveBeenCalledWith(fakeDb, 'Snacks', grocery.id)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses to add a Category without choosing a default Shop', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a default Shop.')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('refuses to add a Category with a blank name, without calling createCategory', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: '   ' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('A Category needs a name.')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('opens a row into a dialog holding its name and default Shop', () => {
    renderWith([medicine], [pharmacy, grocery])

    openEditor('Medicine')

    expect(screen.getByRole('dialog', { name: 'Edit Category' })).toBeInTheDocument()
    expect(screen.getByLabelText('Category name')).toHaveValue('Medicine')
    expect(screen.getByLabelText('Default Shop')).toHaveValue(pharmacy.id)
  })

  it('renames a Category and closes the dialog', async () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: 'Medicine & First aid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renameCategory).toHaveBeenCalledWith(fakeDb, medicine, 'Medicine & First aid')
    expect(changeCategoryDefaultShop).toHaveBeenCalledWith(fakeDb, medicine, pharmacy.id)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('changes the default Shop without renaming', async () => {
    renderWith([medicine], [pharmacy, grocery])
    openEditor('Medicine')

    choose(screen.getByLabelText('Default Shop'), grocery.id)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(changeCategoryDefaultShop).toHaveBeenCalledWith(fakeDb, medicine, grocery.id)
    expect(renameCategory).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses to rename a Category to a blank name, without writing', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('A Category needs a name.')
    expect(renameCategory).not.toHaveBeenCalled()
    expect(changeCategoryDefaultShop).not.toHaveBeenCalled()
  })

  it('closes the dialog at once on Delete and offers Undo in the snackbar', async () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteCategory).toHaveBeenCalledWith(fakeDb, medicine)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByRole('status')).getByText('Deleted Medicine')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('restores the Category when Undo is pressed', async () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(restoreCategory).toHaveBeenCalledWith(fakeDb, medicine, [pharmacy])
  })

  it('hands Undo the Shops as they are when it is pressed, not when the Category was deleted', async () => {
    const { publishShops } = renderWith([medicine], [pharmacy, grocery])
    openEditor('Medicine')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const undo = await screen.findByRole('button', { name: 'Undo' })

    act(() => publishShops([grocery]))
    fireEvent.click(undo)

    expect(restoreCategory).toHaveBeenCalledWith(fakeDb, medicine, [grocery])
  })

  it('shows the CategoryInUseError message when deletion is refused', async () => {
    deleteCategory.mockRejectedValueOnce(new FakeCategoryInUseError('This Category is in use.'))
    renderWith([medicine], [pharmacy])

    openEditor('Medicine')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('This Category is in use.')
    expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('shows the Choose a Shop placeholder when the default Shop is not among the Shops', () => {
    renderWith([medicine], [grocery])
    openEditor('Medicine')

    expect(screen.getByLabelText('Default Shop')).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Choose a default Shop.')
    expect(changeCategoryDefaultShop).not.toHaveBeenCalled()
  })

  it('clears the draft and the error when the Add dialog is cancelled', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('New Category name')).toHaveValue('')
  })

  it('unsubscribes from Categories and Shops on unmount', () => {
    const { unmount } = renderWith([], [])
    unmount()

    expect(categoriesUnsubscribe).toHaveBeenCalled()
    expect(shopsUnsubscribe).toHaveBeenCalled()
  })
})
