import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ItemsManager } from './ItemsManager.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import { resetHash } from '../testing/hash.ts'
import { bandages, bandagesWithBarcodes, cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'
import { choose } from '../testing/select.ts'

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
const createCategory = vi.fn()
vi.mock('./categories.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./categories.ts')>()),
  watchCategories: (db: unknown, cb: unknown) => watchCategories(db, cb),
  createCategory: (db: unknown, name: unknown, shopId: unknown) => createCategory(db, name, shopId),
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
  createCategory.mockReset()
  watchShops.mockReset()
})

function renderWith(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
  itemIds?: readonly core.ItemId[],
) {
  let publishCategories: (categories: CategoryRecord[]) => void = () => {}
  watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
    cb(items)
    return vi.fn()
  })
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    publishCategories = cb
    cb(categories)
    return vi.fn()
  })
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    cb(shops)
    return vi.fn()
  })
  return { ...render(<ItemsManager db={fakeDb} itemIds={itemIds} />), publishCategories }
}

afterEach(resetHash)

describe('ItemsManager', () => {
  it('shows exactly the Items whose ids are given, ignoring unknown ids', () => {
    const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Dish soap', categoryId: cleaning.id }
    const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
    renderWith([bandages, soap, tape], [medicine, cleaning], [pharmacy, grocery], [soap.id, tape.id, core.itemId('gone')])

    expect(screen.getByText('Dish soap')).toBeInTheDocument()
    expect(screen.getByText('Tape')).toBeInTheDocument()
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('names a single filtered Item in a chip in place of the search box', () => {
    renderWith([bandages], [medicine], [pharmacy], [bandages.id])

    expect(screen.getByText('Scanned: Bandages')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search Items')).not.toBeInTheDocument()
  })

  it('counts several filtered Items in the chip, not counting unknown ids', () => {
    const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
    renderWith([bandages, tape], [medicine], [pharmacy], [bandages.id, tape.id, core.itemId('gone')])

    expect(screen.getByText('Scanned: 2 Items')).toBeInTheDocument()
  })

  it('ignores earlier search text once the Items are filtered by id', () => {
    const { rerender } = renderWith([bandages], [medicine], [pharmacy])
    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'zzz' } })

    rerender(<ItemsManager db={fakeDb} itemIds={[bandages.id]} />)

    expect(screen.getByText('Bandages')).toBeInTheDocument()
  })

  it('says no scanned Items were found when every id is unknown', () => {
    renderWith([bandages], [medicine], [pharmacy], [core.itemId('gone')])

    expect(screen.getByText('No scanned Items found.')).toBeInTheDocument()
    expect(screen.getByText('Scanned: no Items')).toBeInTheDocument()
    expect(screen.queryByText('No Items match your search.')).not.toBeInTheDocument()
  })

  it('returns to the unfiltered #/items when the chip is dismissed', () => {
    window.location.hash = '#/items?item=bandages'
    renderWith([bandages], [medicine], [pharmacy], [bandages.id])

    fireEvent.click(screen.getByRole('button', { name: 'Clear scanned filter' }))

    expect(window.location.hash).toBe('#/items')
  })

  it('changes State on a filtered row', () => {
    const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Dish soap', categoryId: cleaning.id }
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery], [soap.id])

    fireEvent.click(within(screen.getByRole('group', { name: 'State for Dish soap' })).getByText('out'))

    expect(setItemState).toHaveBeenCalledWith(fakeDb, soap, 'out')
  })

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

  it("lists the Item's barcodes as digits", () => {
    renderWith([bandagesWithBarcodes], [medicine], [pharmacy])

    openRow('Bandages')

    const list = within(screen.getByRole('region', { name: 'Barcodes' })).getByRole('list')
    expect(within(list).getAllByRole('listitem').map((row) => row.textContent)).toEqual(['12345678', '1234567890123'])
  })

  it('removes a barcode on save, leaving the others', async () => {
    renderWith([bandagesWithBarcodes], [medicine], [pharmacy])

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Remove barcode 12345678' }))
    expect(screen.queryByText('12345678')).not.toBeInTheDocument()
    expect(updateItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem).toHaveBeenCalledWith(
      fakeDb,
      bandagesWithBarcodes,
      expect.objectContaining({ removedBarcodes: [core.barcode('12345678')] }),
    )
  })

  it('leaves the barcodes alone when the Item is saved without pressing ✕', async () => {
    renderWith([bandagesWithBarcodes], [medicine], [pharmacy])

    openRow('Bandages')
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![2]).not.toHaveProperty('removedBarcodes')
  })

  it('lists a barcode attached to the Item while the dialog is open', () => {
    renderWith([bandages], [medicine], [pharmacy])
    const pushItems = watchItems.mock.calls[0]![1] as (items: ItemRecord[]) => void

    openRow('Bandages')
    expect(screen.queryByRole('region', { name: 'Barcodes' })).not.toBeInTheDocument()
    act(() => pushItems([bandagesWithBarcodes]))

    expect(screen.getByText('12345678')).toBeInTheDocument()
  })

  it('hides the barcodes section when the Item has none', () => {
    renderWith([bandages, { ...bandages, id: core.itemId('gauze'), name: 'Gauze', barcodes: [] }], [medicine], [pharmacy])

    openRow('Bandages')
    expect(screen.queryByRole('region', { name: 'Barcodes' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    openRow('Gauze')
    expect(screen.queryByRole('region', { name: 'Barcodes' })).not.toBeInTheDocument()
  })

  it('has no barcodes section when adding an Item', () => {
    renderWith([bandagesWithBarcodes], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Barcodes' })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))
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

  it('keeps a removed barcode on Cancel', async () => {
    renderWith([bandagesWithBarcodes], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove barcode 12345678' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))

    expect(updateItem).not.toHaveBeenCalled()
    expect(screen.getByText('12345678')).toBeInTheDocument()
  })

  it('reopens on the Item as saved, not as edited', async () => {
    await fillAndLeave(() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))

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

describe('adding a Category from the Item dialog', () => {
  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
  }

  function chooseNewCategory() {
    const option = screen.getByRole<HTMLOptionElement>('option', { name: '+ New Category' })
    choose(screen.getByLabelText('Category'), option.value)
  }

  it('lists "+ New Category" in the Category picker', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    expect(
      within(screen.getByLabelText('Category')).getByRole('option', { name: '+ New Category' }),
    ).toBeInTheDocument()
  })

  it('asks for a name and a default Shop when "+ New Category" is chosen', () => {
    renderWith([], [medicine], [pharmacy, grocery])
    openDialog()
    expect(screen.queryByLabelText('New Category name')).not.toBeInTheDocument()

    chooseNewCategory()

    expect(screen.getByLabelText('New Category name')).toHaveValue('')
    expect(screen.getByLabelText('Default Shop')).toBeInTheDocument()
  })

  it('creates the Category and selects it, keeping what was typed in the dialog', async () => {
    const created: CategoryRecord = {
      ...cleaning,
      id: catalogue.categoryId('first-aid'),
      name: 'First aid',
      defaultShopId: pharmacy.id,
    }
    const { publishCategories } = renderWith([], [medicine], [pharmacy, grocery])
    createCategory.mockImplementation(() => {
      publishCategories([medicine, created])
      return Promise.resolve(created.id)
    })
    openDialog()
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })

    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue(created.id))
    expect(createCategory).toHaveBeenCalledWith(fakeDb, 'First aid', pharmacy.id)
    expect(screen.getByLabelText('Name')).toHaveValue('Plasters')
    expect(screen.queryByLabelText('New Category name')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
  })

  it('shows "+ New Category" in the picker while the prompt is open and restores the previous selection when it is cancelled', () => {
    renderWith([], [medicine, cleaning], [pharmacy])
    openDialog()
    choose(screen.getByLabelText('Category'), cleaning.id)

    chooseNewCategory()
    expect(screen.getByLabelText('Category')).toHaveValue('+new')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new Category' }))

    expect(screen.getByLabelText('Category')).toHaveValue(cleaning.id)
    expect(screen.queryByLabelText('New Category name')).not.toBeInTheDocument()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('closes the prompt when a real Category is chosen while it is open', () => {
    renderWith([], [medicine, cleaning], [pharmacy])
    openDialog()

    chooseNewCategory()
    choose(screen.getByLabelText('Category'), medicine.id)

    expect(screen.getByLabelText('Category')).toHaveValue(medicine.id)
    expect(screen.queryByLabelText('New Category name')).not.toBeInTheDocument()
  })

  it('keeps the typed draft when "+ New Category" is chosen again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })

    chooseNewCategory()

    expect(screen.getByLabelText('New Category name')).toHaveValue('First aid')
  })

  it('creates the Category on Enter in the name field instead of submitting the Item', async () => {
    const created: CategoryRecord = { ...cleaning, id: catalogue.categoryId('first-aid'), name: 'First aid' }
    const { publishCategories } = renderWith([], [medicine], [pharmacy])
    createCategory.mockImplementation(() => {
      publishCategories([medicine, created])
      return Promise.resolve(created.id)
    })
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)

    const notPrevented = fireEvent.keyDown(screen.getByLabelText('New Category name'), { key: 'Enter' })

    expect(notPrevented).toBe(false)
    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue(created.id))
    expect(createCategory).toHaveBeenCalledWith(fakeDb, 'First aid', pharmacy.id)
    expect(createItem).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
  })

  it('ends on the new Category when the snapshot listing it arrives after createCategory resolves', async () => {
    const created: CategoryRecord = { ...cleaning, id: catalogue.categoryId('first-aid'), name: 'First aid' }
    const { publishCategories } = renderWith([], [medicine], [pharmacy])
    createCategory.mockResolvedValue(created.id)
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))
    await waitFor(() => expect(screen.queryByLabelText('New Category name')).not.toBeInTheDocument())

    act(() => publishCategories([medicine, created]))

    expect(screen.getByLabelText('Category')).toHaveValue(created.id)
  })

  it('refuses a blank name on the name field, without calling createCategory', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)

    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    expect(screen.getByLabelText('New Category name')).toHaveAccessibleDescription('A Category needs a name.')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('refuses a missing default Shop on the Shop field, without calling createCategory', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    expect(screen.getByLabelText('Default Shop')).toHaveAccessibleDescription('Choose a default Shop.')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('shows a createCategory rejection and keeps the prompt and the Item fields', async () => {
    renderWith([], [medicine], [pharmacy])
    createCategory.mockRejectedValue(new Error('Offline'))
    openDialog()
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)

    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    expect(screen.getByLabelText('New Category name')).toHaveValue('First aid')
    expect(screen.getByLabelText('Default Shop')).toHaveValue(pharmacy.id)
    expect(screen.getByLabelText('Name')).toHaveValue('Plasters')
  })

  it('says a Shop is needed first when there are no Shops', () => {
    renderWith([], [medicine], [])
    openDialog()

    chooseNewCategory()

    expect(screen.getByText('Add a Shop in Settings before adding a Category.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Default Shop')).not.toBeInTheDocument()
  })
})
