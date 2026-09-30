import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { bandages, cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'

const watchItems = vi.fn()
const createItem = vi.fn()
const setItemState = vi.fn()
const updateItem = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  createItem: (db: unknown, input: unknown) => createItem(db, input),
  setItemState: (db: unknown, item: unknown, state: unknown) => setItemState(db, item, state),
  updateItem: (db: unknown, previous: unknown, input: unknown) => updateItem(db, previous, input),
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
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  watchItems.mockReset()
  createItem.mockReset().mockResolvedValue(undefined)
  setItemState.mockReset().mockResolvedValue(undefined)
  updateItem.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
})

/**
 * Picks an option the way a browser does. Once `preact/compat` is loaded (the top app bar's portal
 * pulls it in), Testing Library's `fireEvent.change` no longer reaches a `<select>`'s `onChange`.
 */
function choose(select: HTMLElement, value: string) {
  ;(select as HTMLSelectElement).value = value
  fireEvent(select, new Event('change', { bubbles: true }))
}

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

  it('leaves out a Category with no Items', () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])

    expect(screen.queryByRole('heading', { name: 'Medicine' })).not.toBeInTheDocument()
  })

  it("shows each Item's name, brand note and Necessity in its row", () => {
    const waterproofBandages: ItemRecord = { ...bandages, brandNote: 'the waterproof ones' }
    renderWith([waterproofBandages], [medicine], [pharmacy])

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.getByText('the waterproof ones · essential')).toBeInTheDocument()
  })

  it('has no inline edit form on a row', () => {
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.queryByLabelText('Edit Bandages')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Bandages' })).not.toBeInTheDocument()
  })

  it('lists Uncategorised last, after every Category', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'enough',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }
    renderWith([orphan, bandages], [medicine], [pharmacy])

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Medicine', 'Uncategorised'])
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
})

describe('adding an Item', () => {
  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
  }

  it('opens the dialog empty from the FAB', () => {
    renderWith([], [medicine], [pharmacy])

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    openDialog()

    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('offers every Category and Necessity, and every Shop as an override choice', () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])
    openDialog()

    expect(screen.getByRole('option', { name: 'Medicine' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cleaning' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'essential' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pharmacy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grocery' })).toBeInTheDocument()
  })

  it('creates a new Item with the chosen Category, Necessity and an optional brand note', async () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    fireEvent.input(screen.getByLabelText('Brand note'), { target: { value: 'the waterproof ones' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createItem).toHaveBeenCalledWith(fakeDb, {
      name: 'Bandages',
      brandNote: 'the waterproof ones',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: undefined,
    })
  })

  it('closes the dialog once the Item is saved', async () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the error and the typed values when saving fails', async () => {
    createItem.mockRejectedValue(new Error('Could not reach the database'))
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the database')
    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Bandages')
    expect(screen.getByLabelText('Category')).toHaveValue(medicine.id)
    expect(screen.getByLabelText('Necessity')).toHaveValue('essential')
  })

  it('creates a new Item with a Shop override', async () => {
    renderWith([], [medicine, cleaning], [pharmacy, grocery])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    choose(screen.getByLabelText('Shop override'), grocery.id)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

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
    openDialog()

    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('An Item needs a name.')
    expect(createItem).not.toHaveBeenCalled()
  })

  it('shows every invalid field at once, each on its own field', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Name')).toBeInvalid()
    expect(screen.getByLabelText('Category')).toBeInvalid()
    expect(screen.getByLabelText('Necessity')).toBeInvalid()
    expect(screen.getByLabelText('Brand note')).toBeValid()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('refuses to add an Item without choosing a Category', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Necessity'), 'essential')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Category')).toHaveAccessibleDescription('Choose a Category.')
    expect(createItem).not.toHaveBeenCalled()
  })

  it('refuses to add an Item without choosing a Necessity', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Necessity')).toHaveAccessibleDescription('Choose a Necessity.')
    expect(createItem).not.toHaveBeenCalled()
  })
})

describe('editing an Item', () => {
  const waterproofBandages: ItemRecord = { ...bandages, brandNote: 'the waterproof ones', shopId: grocery.id }

  function openRow(name: string) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  }

  it('opens the dialog prefilled from the tapped row', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])

    openRow('Bandages')

    expect(screen.getByRole('dialog', { name: 'Edit Item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Bandages')
    expect(screen.getByLabelText('Brand note')).toHaveValue('the waterproof ones')
    expect(screen.getByLabelText('Category')).toHaveValue(medicine.id)
    expect(screen.getByLabelText('Necessity')).toHaveValue('essential')
    expect(screen.getByLabelText('Shop override')).toHaveValue(grocery.id)
  })

  it('updates that Item on save, and closes', async () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])

    openRow('Bandages')
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })
    choose(screen.getByLabelText('Shop override'), '')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateItem).toHaveBeenCalledWith(fakeDb, waterproofBandages, {
      name: 'Plasters',
      brandNote: 'the waterproof ones',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: undefined,
    })
    expect(createItem).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('updates from the Item as it is at save time when it changed while the dialog was open', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    const pushItems = watchItems.mock.calls[0]![1] as (items: ItemRecord[]) => void

    openRow('Bandages')
    const movedElsewhere: ItemRecord = { ...waterproofBandages, categoryId: cleaning.id, shopId: undefined }
    act(() => pushItems([movedElsewhere]))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateItem).toHaveBeenCalledWith(fakeDb, movedElsewhere, expect.anything())
  })

  it('does not open from the State buttons on the row', () => {
    renderWith([bandages], [medicine], [pharmacy])

    const group = screen.getByRole('group', { name: 'State for Bandages' })
    fireEvent.click(within(group).getByRole('button', { name: 'out' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the FAB dialog empty again after an edit', () => {
    renderWith([bandages], [medicine], [pharmacy])

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })
})

describe('leaving the Item dialog without saving', () => {
  async function fillAndLeave(leave: () => void) {
    renderWith([bandages], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: /^Bandages/ }))
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })
    await waitFor(() => expect(history.state).toHaveProperty('ui-dialog'))
    leave()
  }

  afterEach(() => history.replaceState(null, ''))

  it('discards the edit on Cancel', async () => {
    await fillAndLeave(() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateItem).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('discards the edit on back', async () => {
    await fillAndLeave(() => window.dispatchEvent(new PopStateEvent('popstate')))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateItem).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('discards the edit on Escape', async () => {
    await fillAndLeave(() => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateItem).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('reopens on the Item as saved, not as edited', async () => {
    await fillAndLeave(() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Bandages/ }))

    expect(screen.getByLabelText('Name')).toHaveValue('Bandages')
  })
})

describe("changing an Item's State", () => {
  it('sets the State with one tap', () => {
    renderWith([bandages], [medicine], [pharmacy])

    const group = screen.getByRole('group', { name: 'State for Bandages' })
    fireEvent.click(within(group).getByRole('button', { name: 'running low' }))

    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, 'running low')
  })

  it("marks the Item's current State as pressed", () => {
    renderWith([bandages], [medicine], [pharmacy])

    const group = screen.getByRole('group', { name: 'State for Bandages' })
    expect(within(group).getByRole('button', { name: 'enough' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'running low' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('taps on the current State as a no-op', () => {
    renderWith([bandages], [medicine], [pharmacy])

    const group = screen.getByRole('group', { name: 'State for Bandages' })
    fireEvent.click(within(group).getByRole('button', { name: 'enough' }))

    expect(setItemState).not.toHaveBeenCalled()
  })
})

describe('searching Items', () => {
  const soap: ItemRecord = {
    id: core.itemId('soap'),
    name: 'Dish soap',
    state: 'enough',
    categoryId: cleaning.id,
    necessity: 'important',
  }

  it('filters rows by name, ignoring case', () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'BAND' } })

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByText('Dish soap')).not.toBeInTheDocument()
  })

  it('hides a group left with no matching rows', () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'soap' } })

    expect(screen.queryByRole('heading', { name: 'Medicine' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cleaning' })).toBeInTheDocument()
  })

  it('hides the Uncategorised group when the search matches none of its Items', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'enough',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }
    renderWith([bandages, orphan], [medicine], [pharmacy])

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'band' } })

    expect(screen.getByRole('heading', { name: 'Medicine' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Uncategorised' })).not.toBeInTheDocument()
  })
})

describe('the empty state', () => {
  it('says so when there are no Items', () => {
    renderWith([], [medicine], [pharmacy])

    expect(screen.getByText('No Items yet.')).toBeInTheDocument()
  })

  it('says so when the search matches no Item', () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'zzz' } })

    expect(screen.getByText('No Items match your search.')).toBeInTheDocument()
    expect(screen.queryByText('No Items yet.')).not.toBeInTheDocument()
  })

  it('is not shown before the first Items snapshot arrives', () => {
    watchItems.mockImplementation(() => vi.fn())
    watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
      cb([medicine])
      return vi.fn()
    })
    watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
      cb([pharmacy])
      return vi.fn()
    })
    render(<ItemsManager db={fakeDb} />)

    expect(screen.queryByText(/^No Items/)).not.toBeInTheDocument()
  })

  it('is not shown while Items are listed', () => {
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.queryByText(/^No Items/)).not.toBeInTheDocument()
  })
})
