import { act, fireEvent, render, screen, within } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ShoppingList } from './ShoppingList.tsx'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'

const watchItems = vi.fn()
const setItemState = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  setItemState: (db: unknown, item: unknown, state: unknown) => setItemState(db, item, state),
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

beforeEach(() => {
  watchItems.mockReset()
  setItemState.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
  resetSnackbar()
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

    const pharmacyGroup = screen.getByRole('heading', { name: 'Pharmacy' }).closest('div')
    const groceryGroup = screen.getByRole('heading', { name: 'Grocery' }).closest('div')
    if (pharmacyGroup === null || groceryGroup === null) throw new Error('group not found')

    expect(within(pharmacyGroup).getByText('Bandages')).toBeInTheDocument()
    expect(within(pharmacyGroup).queryByText('Dish soap')).not.toBeInTheDocument()
    expect(within(groceryGroup).getByText('Dish soap')).toBeInTheDocument()
    expect(within(groceryGroup).queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('titles each Shop group with a level 2 heading, under the top app bar title', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByRole('heading', { level: 2, name: 'Pharmacy' })).toBeInTheDocument()
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: grocery.id,
    }
    renderWith([bandages], [medicine], [pharmacy, grocery])

    const groceryGroup = screen.getByRole('heading', { name: 'Grocery' }).closest('div')
    if (groceryGroup === null) throw new Error('group not found')

    expect(within(groceryGroup).getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pharmacy' })).not.toBeInTheDocument()
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

  it('shows an empty state when no Item is pending', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByText('Nothing to buy — every Item is enough.')).toBeInTheDocument()
  })

  it('shows the AlertBanner above the list from the same Items', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByRole('alert')).toHaveTextContent('1 urgent Item')
    expect(watchItems).toHaveBeenCalledTimes(1)
  })

  it('does not show the empty state before the first snapshot of Items arrives', () => {
    watchItems.mockReturnValue(vi.fn())
    watchCategories.mockReturnValue(vi.fn())
    watchShops.mockReturnValue(vi.fn())
    render(<ShoppingList db={fakeDb} />)

    expect(screen.queryByText(/Nothing to buy/)).not.toBeInTheDocument()
  })

  it('does not show the empty state while an Item is pending', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.queryByText(/Nothing to buy/)).not.toBeInTheDocument()
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

  it('sets a running low row back visually from an out row', () => {
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
    }
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([soap, bandages], [cleaning, medicine], [grocery, pharmacy])

    expect(screen.getByText('Dish soap').closest('li')).toHaveClass('ui-list-row--muted')
    expect(screen.getByText('Bandages').closest('li')).not.toHaveClass('ui-list-row--muted')
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

    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, 'enough')
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

    expect(screen.getByText('Could not update State')).toHaveAttribute('role', 'alert')
  })

  it.each(['running low', 'out'] as const)('offers Undo that reverts the tick to %s', (state) => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state,
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [pharmacy])
    render(<SnackbarHost />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Bandages/ }))

    const region = screen.getByRole('status')
    expect(within(region).getByText('Marked Bandages enough')).toBeInTheDocument()
    setItemState.mockClear()

    fireEvent.click(within(region).getByRole('button', { name: 'Undo' }))

    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, state)
  })
})
