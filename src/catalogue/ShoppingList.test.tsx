import { act, fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ShoppingList } from './ShoppingList.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'

const watchItems = vi.fn()
const setItemState = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  setItemState: (db: unknown, id: unknown, state: unknown) => setItemState(db, id, state),
}))

const watchCategories = vi.fn()
vi.mock('./categories.ts', () => ({
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
}))

const watchShops = vi.fn()
vi.mock('./shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shops.ts')>()),
  watchShops: (db: unknown, cb: unknown) => watchShops(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy' }
const grocery: ShopRecord = { id: catalogue.shopId('grocery'), name: 'Grocery' }
const medicine: CategoryRecord = { id: catalogue.categoryId('medicine'), name: 'Medicine', defaultShopId: pharmacy.id }
const cleaning: CategoryRecord = { id: catalogue.categoryId('cleaning'), name: 'Cleaning', defaultShopId: grocery.id }

beforeEach(() => {
  watchItems.mockReset()
  setItemState.mockReset().mockResolvedValue(undefined)
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
  return render(<ShoppingList db={fakeDb} />)
}

describe('ShoppingList', () => {
  it('lists Items at running low or out, grouped by resolved Shop', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
    }
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(screen.getByRole('heading', { name: 'Pharmacy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Grocery' })).toBeInTheDocument()
    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
  })

  it('leaves out an Item that is enough', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('leaves out a Shop with no pending Items', () => {
    renderWith([], [medicine], [pharmacy, grocery])

    expect(screen.queryByRole('heading', { name: 'Pharmacy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grocery' })).not.toBeInTheDocument()
  })

  it('flags a running low Item as optional', () => {
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
    }
    renderWith([soap], [cleaning], [grocery])

    expect(screen.getByText('Dish soap').closest('li')).toHaveTextContent('optional')
  })

  it('does not flag an out Item as optional', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByText('Bandages').closest('li')).not.toHaveTextContent('optional')
  })

  it('groups an Item with no resolved Shop under Unknown Shop', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }
    renderWith([orphan], [medicine], [pharmacy])

    expect(screen.getByRole('heading', { name: 'Unknown Shop' })).toBeInTheDocument()
    expect(screen.getByText('Mystery item')).toBeInTheDocument()
  })

  it('updates live when a new snapshot of Items arrives', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    let itemsCallback: ((items: ItemRecord[]) => void) | undefined
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      itemsCallback = cb
      cb([])
      return vi.fn()
    })
    watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
      cb([medicine])
      return vi.fn()
    })
    watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
      cb([pharmacy])
      return vi.fn()
    })
    render(<ShoppingList db={fakeDb} />)

    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()

    act(() => itemsCallback?.([bandages]))

    expect(screen.getByText('Bandages')).toBeInTheDocument()
  })
})

describe('ticking an Item', () => {
  it('sets the Item to enough', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bandages' }))

    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages.id, 'enough')
  })

  it('reports an error instead of throwing when the update fails', async () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    setItemState.mockRejectedValueOnce(new Error('Could not update State'))
    renderWith([bandages], [medicine], [pharmacy])

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bandages' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not update State')
  })
})
