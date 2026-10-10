import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { CategoriesManager } from './CategoriesManager.tsx'
import { CATEGORY_IN_USE_MESSAGE, type CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { actionLabels } from '../testing/dialog.ts'
import { resetHash } from '../testing/hash.ts'
import { choose } from '../testing/select.ts'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import { grocery, medicine, pharmacy } from './testFixtures.ts'
import { stubModalDialog } from '../testing/dialog.ts'

const createCategory = vi.fn()
const renameCategory = vi.fn()
const deleteCategory = vi.fn()
const restoreCategory = vi.fn()
const changeCategoryDefaultShop = vi.fn()
const watchCategories = vi.fn()

vi.mock('./categories.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./categories.ts')>()),
  changeCategoryDefaultShop: (db: unknown, category: unknown, shopId: unknown) => changeCategoryDefaultShop(db, category, shopId),
  createCategory: (db: unknown, name: string, shopId: unknown) => createCategory(db, name, shopId),
  renameCategory: (db: unknown, category: unknown, name: string) => renameCategory(db, category, name),
  deleteCategory: (db: unknown, category: unknown) => deleteCategory(db, category),
  restoreCategory: (db: unknown, category: unknown, shops: unknown) => restoreCategory(db, category, shops),
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
}))

const watchShops = vi.fn()
const createShop = vi.fn()
vi.mock('./shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shops.ts')>()),
  createShop: (db: unknown, name: string) => createShop(db, name),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const categoriesUnsubscribe = vi.fn()
const shopsUnsubscribe = vi.fn()

// Closing over unsaved edits asks; tests agree to discard unless they refuse.
let confirmSpy: MockInstance<typeof window.confirm>

afterEach(() => {
  cleanup()
  confirmSpy.mockRestore()
  resetHash()
})

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  stubModalDialog()
  createCategory.mockReset().mockResolvedValue(undefined)
  renameCategory.mockReset().mockResolvedValue(undefined)
  deleteCategory.mockReset().mockResolvedValue(undefined)
  restoreCategory.mockReset().mockResolvedValue(undefined)
  resetSnackbar()
  changeCategoryDefaultShop.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
  createShop.mockReset()
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

  it('lists "+ New Shop" in the default Shop picker of the Add and Edit dialogs', () => {
    renderWith([medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    expect(screen.getByRole('option', { name: '+ New Shop' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    openEditor('Medicine')
    expect(screen.getByRole('option', { name: '+ New Shop' })).toBeInTheDocument()
  })

  it('creates a Shop from the prompt and selects it, keeping the Category name', async () => {
    createShop.mockResolvedValue(grocery.id)
    const { publishShops } = renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })
    choose(screen.getByLabelText('Default Shop'), '+new')
    fireEvent.input(screen.getByLabelText('New Shop name'), { target: { value: ' Grocery ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }))

    await waitFor(() => expect(screen.queryByLabelText('New Shop name')).toBeNull())
    expect(createShop).toHaveBeenCalledWith(fakeDb, 'Grocery')
    act(() => publishShops([pharmacy, grocery]))
    expect(screen.getByLabelText('Default Shop')).toHaveValue(grocery.id)
    expect(screen.getByLabelText('New Category name')).toHaveValue('Snacks')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('restores the previous selection when the new Shop prompt is cancelled', () => {
    renderWith([medicine], [pharmacy, grocery])
    openEditor('Medicine')
    choose(screen.getByLabelText('Default Shop'), '+new')
    expect(screen.getByLabelText('Default Shop')).toHaveValue('+new')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new Shop' }))

    expect(screen.queryByLabelText('New Shop name')).toBeNull()
    expect(screen.getByLabelText('Default Shop')).toHaveValue(pharmacy.id)
    expect(createShop).not.toHaveBeenCalled()
  })

  it('lays the new Shop actions out side by side like the dialog action row, Cancel before Create', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    choose(screen.getByLabelText('Default Shop'), '+new')

    const cancel = screen.getByRole('button', { name: 'Cancel new Shop' })
    const create = screen.getByRole('button', { name: 'Create Shop' })
    expect(cancel.parentElement).toHaveClass('ui-dialog-actions__main')
    expect(create.parentElement).toBe(cancel.parentElement)
    expect(cancel.nextElementSibling).toBe(create)
    expect(screen.getByLabelText('New Shop name').closest('.ui-dialog-form')).toContainElement(cancel)
  })

  it('restores the unchosen Shop when the new Shop prompt is cancelled in the Add dialog', () => {
    renderWith([], [pharmacy, grocery])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    choose(screen.getByLabelText('Default Shop'), '+new')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new Shop' }))

    expect(screen.queryByLabelText('New Shop name')).toBeNull()
    expect(screen.getByLabelText('Default Shop')).toHaveValue('')
    expect(createShop).not.toHaveBeenCalled()
  })

  it('refuses a blank new Shop name without creating a Shop', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    choose(screen.getByLabelText('Default Shop'), '+new')
    fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Shop needs a name.')
    expect(createShop).not.toHaveBeenCalled()
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

  it('disables Delete for an in-use Category and says why before any press', () => {
    renderWith([{ ...medicine, referenceCount: 2 }], [pharmacy])
    openEditor('Medicine')

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeDisabled()
    expect(deleteButton).toHaveAccessibleDescription(CATEGORY_IN_USE_MESSAGE)
    expect(screen.getByText(CATEGORY_IN_USE_MESSAGE)).toBeVisible()
  })

  it('keeps Delete enabled, with no in-use note, for an unused Category', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeEnabled()
    expect(deleteButton).not.toHaveAccessibleDescription()
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

  it('closes the Add dialog on Cancel without creating a Category', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('closes the Add dialog from the title-row Close icon without creating a Category', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('closes the Edit dialog from the title-row Close icon without saving', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(renameCategory).not.toHaveBeenCalled()
    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('orders the Add dialog actions Cancel, Add', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    const names = actionLabels(screen.getByRole('dialog'))
    expect(names).toEqual(['Cancel', 'Add'])
  })

  it('closes the Edit dialog on Cancel without saving', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')
    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: 'Other' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(renameCategory).not.toHaveBeenCalled()
    expect(changeCategoryDefaultShop).not.toHaveBeenCalled()
    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('orders the Edit dialog actions Delete, Cancel, Save', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    const names = actionLabels(screen.getByRole('dialog'))
    expect(names).toEqual(['Delete', 'Cancel', 'Save'])
  })

  it('sets Delete apart from Cancel and Save in the Edit dialog', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    const dialog = screen.getByRole('dialog')
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    expect(del.parentElement).toHaveClass('ui-dialog-actions__destructive')
    expect(within(dialog).getByRole('button', { name: 'Save' }).closest('.ui-dialog-actions')).toBe(
      del.closest('.ui-dialog-actions'),
    )
  })

  it('lays out the Add dialog actions in the shared action row', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))

    expect(screen.getByRole('button', { name: 'Add' }).closest('.ui-dialog-actions')).not.toBeNull()
  })

  it('unsubscribes from Categories and Shops on unmount', () => {
    const { unmount } = renderWith([], [])
    unmount()

    expect(categoriesUnsubscribe).toHaveBeenCalled()
    expect(shopsUnsubscribe).toHaveBeenCalled()
  })
})

describe('closing a Category dialog over unsaved edits', () => {
  it('asks before the Close button discards a typed new Category name, and stays open when declined', () => {
    confirmSpy.mockReturnValue(false)
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Snacks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('New Category name')).toHaveValue('Snacks')
  })

  it('asks when only the default Shop of a new Category was chosen', () => {
    confirmSpy.mockReturnValue(false)
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
  })

  it('closes the Add dialog without asking while it is as it opened', () => {
    renderWith([], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks before the Close button discards a changed name or default Shop of an edited Category', () => {
    confirmSpy.mockReturnValue(false)
    renderWith([medicine], [pharmacy, grocery])
    openEditor('Medicine')
    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: 'Meds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)

    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: 'Medicine' } })
    choose(screen.getByLabelText('Default Shop'), grocery.id)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(confirmSpy).toHaveBeenCalledTimes(2)
  })

  it('asks while the "+ New Shop" prompt is open', () => {
    confirmSpy.mockReturnValue(false)
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')
    choose(screen.getByLabelText('Default Shop'), '+new')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
  })

  it('closes the Edit dialog without asking while it is as it opened', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('discards edits at once from Cancel', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')
    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: 'Meds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
