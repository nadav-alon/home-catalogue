import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { CategoriesManager } from './CategoriesManager.tsx'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { grocery, medicine, pharmacy } from './testFixtures.ts'

const createCategory = vi.fn()
const renameCategory = vi.fn()
const deleteCategory = vi.fn()
const changeCategoryShop = vi.fn()
const watchCategories = vi.fn()

const { FakeCategoryInUseError } = vi.hoisted(() => ({
  FakeCategoryInUseError: class extends Error {},
}))

vi.mock('./categories.ts', () => ({
  changeCategoryShop: (db: unknown, category: unknown, shopId: unknown) => changeCategoryShop(db, category, shopId),
  createCategory: (db: unknown, name: string, shopId: unknown) => createCategory(db, name, shopId),
  renameCategory: (db: unknown, category: unknown, name: string) => renameCategory(db, category, name),
  deleteCategory: (db: unknown, category: unknown) => deleteCategory(db, category),
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
  changeCategoryShop.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
  categoriesUnsubscribe.mockClear()
  shopsUnsubscribe.mockClear()
})

function openEditor(categoryName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${categoryName}` }))
}

function renderWith(categories: CategoryRecord[], shops: ShopRecord[]) {
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    cb(categories)
    return categoriesUnsubscribe
  })
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return shopsUnsubscribe
  })
  return render(<CategoriesManager db={fakeDb} />)
}

describe('CategoriesManager', () => {
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
    fireEvent.change(screen.getByLabelText('Default Shop'), { target: { value: grocery.id } })
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
    fireEvent.change(screen.getByLabelText('Default Shop'), { target: { value: pharmacy.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Category needs a name.')
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
    expect(changeCategoryShop).toHaveBeenCalledWith(fakeDb, medicine, pharmacy.id)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('changes the default Shop without renaming', async () => {
    renderWith([medicine], [pharmacy, grocery])
    openEditor('Medicine')

    fireEvent.change(screen.getByLabelText('Default Shop'), { target: { value: grocery.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(changeCategoryShop).toHaveBeenCalledWith(fakeDb, medicine, grocery.id)
    expect(renameCategory).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses to rename a Category to a blank name, without writing', () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.input(screen.getByLabelText('Category name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A Category needs a name.')
    expect(renameCategory).not.toHaveBeenCalled()
    expect(changeCategoryShop).not.toHaveBeenCalled()
  })

  it('deletes a Category and closes the dialog', async () => {
    renderWith([medicine], [pharmacy])
    openEditor('Medicine')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteCategory).toHaveBeenCalledWith(fakeDb, medicine)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the CategoryInUseError message when deletion is refused', async () => {
    deleteCategory.mockRejectedValueOnce(new FakeCategoryInUseError('This Category is in use.'))
    renderWith([medicine], [pharmacy])

    openEditor('Medicine')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This Category is in use.')
  })

  it('unsubscribes from Categories and Shops on unmount', () => {
    const { unmount } = renderWith([], [])
    unmount()

    expect(categoriesUnsubscribe).toHaveBeenCalled()
    expect(shopsUnsubscribe).toHaveBeenCalled()
  })
})
