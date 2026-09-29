import { act, fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'

const watchItems = vi.fn()
const createItem = vi.fn()
const updateItem = vi.fn()
const setItemState = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  createItem: (db: unknown, input: unknown) => createItem(db, input),
  updateItem: (db: unknown, previous: unknown, input: unknown) => updateItem(db, previous, input),
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

beforeEach(() => {
  watchItems.mockReset()
  createItem.mockReset().mockResolvedValue(undefined)
  updateItem.mockReset().mockResolvedValue(undefined)
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

  it("falls back to 'Unknown Shop' instead of the raw id when the resolved Shop is missing", () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    renderWith([bandages], [medicine], [])

    expect(screen.getByText('Shop: Unknown Shop')).toBeInTheDocument()
  })
})

describe('an Item whose Category is not in the local list', () => {
  const orphan: ItemRecord = {
    id: core.itemId('orphan'),
    name: 'Mystery item',
    state: 'enough',
    categoryId: catalogue.categoryId('deleted-category'),
    necessity: 'important',
  }

  it('is grouped under "Uncategorised" instead of disappearing', () => {
    renderWith([orphan], [medicine], [pharmacy])

    expect(screen.getByRole('heading', { name: 'Uncategorised' })).toBeInTheDocument()
    expect(screen.getByText('Mystery item')).toBeInTheDocument()
  })

  it("shows its own Shop override as the resolved Shop, with no Category default to fall back to", () => {
    renderWith([{ ...orphan, shopId: grocery.id }], [medicine], [pharmacy, grocery])

    expect(screen.getByText('Shop: Grocery')).toBeInTheDocument()
  })

  it("falls back to 'Unknown Shop' when it also has no Shop override", () => {
    renderWith([orphan], [medicine], [pharmacy])

    expect(screen.getByText('Shop: Unknown Shop')).toBeInTheDocument()
  })

  it('offers its own unknown id as a Category option, instead of silently showing the first Category', () => {
    renderWith([orphan], [medicine, cleaning], [pharmacy])

    expect(screen.getByLabelText('Category for Mystery item')).toHaveValue(orphan.categoryId)
    expect(screen.getByRole('option', { name: 'Unknown Category' })).toBeInTheDocument()
  })

  it('keeps its own Category id when saved without picking a new one', () => {
    renderWith([orphan], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Save Mystery item' }))

    expect(updateItem).toHaveBeenCalledWith(
      fakeDb,
      orphan,
      expect.objectContaining({ categoryId: orphan.categoryId }),
    )
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

describe('editing an Item', () => {
  const bandages: ItemRecord = {
    id: core.itemId('bandages'),
    name: 'Bandages',
    brandNote: 'the waterproof ones',
    state: 'enough',
    categoryId: medicine.id,
    necessity: 'essential',
  }

  it('saves the edited fields', () => {
    renderWith([bandages], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.input(screen.getByLabelText('Edit Bandages'), { target: { value: 'Large bandages' } })
    fireEvent.change(screen.getByLabelText('Category for Bandages'), { target: { value: cleaning.id } })
    fireEvent.change(screen.getByLabelText('Necessity for Bandages'), { target: { value: 'optional' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bandages' }))

    expect(updateItem).toHaveBeenCalledWith(fakeDb, bandages, {
      name: 'Large bandages',
      brandNote: 'the waterproof ones',
      categoryId: cleaning.id,
      necessity: 'optional',
      shopId: undefined,
    })
  })

  it('adds a Shop override', () => {
    renderWith([bandages], [medicine], [pharmacy, grocery])

    fireEvent.change(screen.getByLabelText('Shop override for Bandages'), { target: { value: grocery.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bandages' }))

    expect(updateItem).toHaveBeenCalledWith(
      fakeDb,
      bandages,
      expect.objectContaining({ shopId: grocery.id }),
    )
  })

  it('clears the brand note when edited blank', () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.input(screen.getByLabelText('Brand note for Bandages'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bandages' }))

    expect(updateItem).toHaveBeenCalledWith(
      fakeDb,
      bandages,
      expect.objectContaining({ brandNote: undefined }),
    )
  })

  it('refuses to save a blank name, without calling updateItem', () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.input(screen.getByLabelText('Edit Bandages'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bandages' }))

    expect(screen.getByRole('alert')).toHaveTextContent('An Item needs a name.')
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('keeps an unsaved edit in one row when another Item snapshot arrives', () => {
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'enough',
      categoryId: cleaning.id,
      necessity: 'important',
    }
    let itemsCallback: ((items: ItemRecord[]) => void) | undefined
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      itemsCallback = cb
      cb([bandages, soap])
      return vi.fn()
    })
    watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
      cb([medicine, cleaning])
      return vi.fn()
    })
    watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
      cb([pharmacy, grocery])
      return vi.fn()
    })
    render(<ItemsManager db={fakeDb} />)

    fireEvent.input(screen.getByLabelText('Edit Bandages'), { target: { value: 'Large bandages' } })
    // watchItems builds a new ItemRecord for every Item on every snapshot, including one
    // triggered by saving a different row; the resets from that shouldn't touch this input.
    act(() => itemsCallback?.([{ ...bandages }, { ...soap, name: 'Dish soap (large)' }]))

    expect(screen.getByText('Dish soap (large)')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit Bandages')).toHaveValue('Large bandages')
  })
})

describe("changing an Item's State", () => {
  const bandages: ItemRecord = {
    id: core.itemId('bandages'),
    name: 'Bandages',
    state: 'enough',
    categoryId: medicine.id,
    necessity: 'essential',
  }

  it('sets the State with one tap', () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'running low' }))

    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages.id, 'running low')
  })

  it("marks the Item's current State as pressed, without taking it out of the tab order", () => {
    renderWith([bandages], [medicine], [pharmacy])

    const currentState = screen.getByRole('button', { name: 'enough' })
    expect(currentState).toHaveAttribute('aria-pressed', 'true')
    expect(currentState).toHaveAttribute('aria-disabled', 'true')
    expect(currentState).not.toBeDisabled()

    const otherState = screen.getByRole('button', { name: 'out' })
    expect(otherState).toHaveAttribute('aria-pressed', 'false')
    expect(otherState).toHaveAttribute('aria-disabled', 'false')
  })

  it('taps on the current State as a no-op', () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'enough' }))

    expect(setItemState).not.toHaveBeenCalled()
  })
})
