import { fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'

const watchItems = vi.fn()
const createItem = vi.fn()
vi.mock('./items.ts', () => ({
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  createItem: (db: unknown, input: unknown) => createItem(db, input),
}))

const watchCategories = vi.fn()
vi.mock('./categories.ts', () => ({
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
}))

const watchShops = vi.fn()
vi.mock('./shops.ts', () => ({
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy' }
const grocery: ShopRecord = { id: catalogue.shopId('grocery'), name: 'Grocery' }
const medicine: CategoryRecord = { id: catalogue.categoryId('medicine'), name: 'Medicine', defaultShopId: pharmacy.id }
const cleaning: CategoryRecord = { id: catalogue.categoryId('cleaning'), name: 'Cleaning', defaultShopId: grocery.id }

beforeEach(() => {
  watchItems.mockReset()
  createItem.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
})

function renderWith(items: ItemRecord[], categories: CategoryRecord[], shops: ShopRecord[]) {
  watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
    cb(items)
    return vi.fn()
  })
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    cb(categories)
    return vi.fn()
  })
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return vi.fn()
  })
  return render(<ItemsManager db={fakeDb} />)
}

describe('ItemsManager', () => {
  it('groups Items by Category', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'enough',
      categoryId: cleaning.id,
      necessity: 'important',
    }
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(screen.getByRole('heading', { name: 'Medicine' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cleaning' })).toBeInTheDocument()
    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
  })

  it("shows a Category's default Shop as an Item's resolved Shop", () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy, grocery])

    expect(screen.getByText('Shop: Pharmacy')).toBeInTheDocument()
  })

  it("shows an Item's own Shop override instead of the Category default", () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: grocery.id,
    }
    renderWith([bandages], [medicine], [pharmacy, grocery])

    expect(screen.getByText('Shop: Grocery')).toBeInTheDocument()
  })

  it('leaves out a Category with no Items', () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])

    expect(screen.queryByRole('heading', { name: 'Medicine' })).not.toBeInTheDocument()
  })
})

describe('adding an Item', () => {
  it('offers every Category and Necessity, and every Shop as an override choice', () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])

    expect(screen.getByRole('option', { name: 'Medicine' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cleaning' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'essential' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pharmacy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grocery' })).toBeInTheDocument()
  })

  it('creates a new Item with the chosen Category, Necessity and an optional brand note', async () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.input(screen.getByLabelText('New Item name'), { target: { value: 'Bandages' } })
    fireEvent.input(screen.getByLabelText('Brand note'), { target: { value: 'the waterproof ones' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: medicine.id } })
    fireEvent.change(screen.getByLabelText('Necessity'), { target: { value: 'essential' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(createItem).toHaveBeenCalledWith(fakeDb, {
      name: 'Bandages',
      brandNote: 'the waterproof ones',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: undefined,
    })
  })

  it('creates a new Item with a Shop override', async () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.input(screen.getByLabelText('New Item name'), { target: { value: 'Bandages' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: medicine.id } })
    fireEvent.change(screen.getByLabelText('Necessity'), { target: { value: 'essential' } })
    fireEvent.change(screen.getByLabelText('Shop override'), { target: { value: grocery.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(createItem).toHaveBeenCalledWith(fakeDb, {
      name: 'Bandages',
      brandNote: undefined,
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: grocery.id,
    })
  })

  it('refuses to add an Item with a blank name, without calling createItem', () => {
    renderWith([], [medicine], [pharmacy])

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: medicine.id } })
    fireEvent.change(screen.getByLabelText('Necessity'), { target: { value: 'essential' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('alert')).toHaveTextContent('An Item needs a name.')
    expect(createItem).not.toHaveBeenCalled()
  })

  it('refuses to add an Item without choosing a Category', () => {
    renderWith([], [medicine], [pharmacy])

    fireEvent.input(screen.getByLabelText('New Item name'), { target: { value: 'Bandages' } })
    fireEvent.change(screen.getByLabelText('Necessity'), { target: { value: 'essential' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a Category.')
    expect(createItem).not.toHaveBeenCalled()
  })

  it('refuses to add an Item without choosing a Necessity', () => {
    renderWith([], [medicine], [pharmacy])

    fireEvent.input(screen.getByLabelText('New Item name'), { target: { value: 'Bandages' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: medicine.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a Necessity.')
    expect(createItem).not.toHaveBeenCalled()
  })
})
