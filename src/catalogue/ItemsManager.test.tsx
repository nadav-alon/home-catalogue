import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { ItemsManager } from './ItemsManager.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import type { CategoryAndShop } from '../ui/route.ts'
import { resetHash } from '../testing/hash.ts'
import { bandages, bandagesWithBarcodes, cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import { choose } from '../testing/select.ts'
import { resetPendingPop } from '../ui/pendingPop.ts'
import { tokenUsage } from '../testing/css.ts'

const watchItems = vi.fn()
const createItem = vi.fn()
const setItemState = vi.fn()
const updateItem = vi.fn()
const softDeleteItem = vi.fn()
const restoreItem = vi.fn()
const restoreItemWithEdit = vi.fn()
const attachBarcode = vi.fn()
const findDeletedItemByBarcode = vi.fn()
const findBarcodeHolders = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  createItem: (db: unknown, input: unknown) => createItem(db, input),
  setItemState: (db: unknown, item: unknown, state: unknown) => setItemState(db, item, state),
  updateItem: (db: unknown, previous: unknown, input: unknown, categories: unknown) =>
    updateItem(db, previous, input, categories),
  softDeleteItem: (db: unknown, item: unknown) => softDeleteItem(db, item),
  restoreItem: (db: unknown, item: unknown, categories: unknown, shops: unknown) => restoreItem(db, item, categories, shops),
  restoreItemWithEdit: (db: unknown, item: unknown, edit: unknown) => restoreItemWithEdit(db, item, edit),
  attachBarcode: (db: unknown, item: unknown, barcode: unknown, from: unknown) => attachBarcode(db, item, barcode, from),
  findBarcodeHolders: (db: unknown, items: unknown, barcode: unknown) => findBarcodeHolders(db, items, barcode),
  findDeletedItemByBarcode: (db: unknown, barcode: unknown) => findDeletedItemByBarcode(db, barcode),
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
  softDeleteItem.mockReset().mockResolvedValue(undefined)
  restoreItem.mockReset().mockResolvedValue(undefined)
  restoreItemWithEdit.mockReset().mockResolvedValue(undefined)
  attachBarcode.mockReset().mockResolvedValue(undefined)
  findDeletedItemByBarcode.mockReset().mockResolvedValue(undefined)
  findBarcodeHolders.mockReset().mockResolvedValue([])
  watchCategories.mockReset()
  createCategory.mockReset()
  watchShops.mockReset()
  localStorage.clear()
})

/** Records `history.back` calls and hash changes in the order they happen; call `stop` to detach. */
function recordHistoryOrder() {
  const order: string[] = []
  const back = history.back.bind(history)
  vi.spyOn(history, 'back').mockImplementation(() => {
    order.push('back')
    back()
  })
  const onHashChange = () => order.push(window.location.hash)
  window.addEventListener('hashchange', onHashChange)
  return { order, stop: () => window.removeEventListener('hashchange', onHashChange) }
}

function renderWith(
  items: ItemRecord[] | undefined,
  categories: CategoryRecord[],
  shops: ShopRecord[],
  itemIds?: readonly core.ItemId[],
  onClearFilter?: (filter: CategoryAndShop) => void,
) {
  let publishCategories: (categories: CategoryRecord[]) => void = () => {}
  let publishItems: (items: ItemRecord[]) => void = () => {}
  watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
    publishItems = cb
    if (items !== undefined) cb(items)
    return vi.fn()
  })
  watchCategories.mockImplementation((_db: unknown, cb: (categories: CategoryRecord[]) => void) => {
    publishCategories = cb
    cb(categories)
    return vi.fn()
  })
  let publishShops: (shops: ShopRecord[]) => void = () => {}
  watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
    publishShops = cb
    cb(shops)
    return vi.fn()
  })
  return {
    ...render(
      <TopAppBar title="Items">
        <ItemsManager db={fakeDb} itemIds={itemIds} onClearFilter={onClearFilter} />
      </TopAppBar>,
    ),
    publishCategories,
    publishItems,
    publishShops,
  }
}

/** The expand/collapse button in a Category's group heading, which the Category's filter chip shares its name with. */
function headingToggle(category: string) {
  return within(screen.getByRole('heading', { name: new RegExp(`^${category}`) })).getByRole('button')
}

afterEach(() => {
  vi.restoreAllMocks()
  resetPendingPop()
  resetHash()
  resetSnackbar()
})

describe('ItemsManager', () => {
  it('leaves the title to the top app bar, with no heading of its own', () => {
    renderWith([bandages], [medicine], [pharmacy])

    const headings = screen.getAllByRole('heading', { name: 'Items' })
    expect(headings).toHaveLength(1)
    expect(screen.getByRole('banner')).toContainElement(headings[0])
  })

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

    const chip = screen.getByText('Scanned: Bandages').parentElement!
    expect(within(chip).getByRole('button', { name: 'Clear scanned filter' })).toBeInTheDocument()
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

  it('calls onClearFilter when the chip is dismissed', () => {
    const onClearFilter = vi.fn()
    renderWith([bandages], [medicine], [pharmacy], [bandages.id], onClearFilter)

    fireEvent.click(screen.getByRole('button', { name: 'Clear scanned filter' }))

    expect(onClearFilter).toHaveBeenCalledOnce()
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

  it('stacks the State control under the name on Item rows', () => {
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByRole('listitem')).toHaveClass('ui-list-row--stack-trailing')
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
      state: 'enough',
      brandNote: 'the waterproof ones',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: undefined,
    })
  })

  it('offers every State in the Add Item dialog, defaulting to enough', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    const state = screen.getByLabelText('State')
    expect(state).toHaveValue('enough')
    expect(within(state).getAllByRole('option').map((option) => option.textContent)).toEqual(['enough', 'running low', 'out'])
  })

  it('creates a new Item at the chosen State', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })
    choose(screen.getByLabelText('Category'), medicine.id)
    choose(screen.getByLabelText('Necessity'), 'essential')
    choose(screen.getByLabelText('State'), 'out')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createItem).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ name: 'Bandages', state: 'out' }))
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
      state: 'enough',
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

  it('clears the name error once a name is typed, without saving again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('An Item needs a name.')
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bandages' } })

    expect(screen.getByLabelText('Name')).toBeValid()
    expect(screen.getByLabelText('Category')).toHaveAccessibleDescription('Choose a Category.')
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

  it('clears the Category error once a Category is chosen, without saving again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Category')).toHaveAccessibleDescription('Choose a Category.')
    choose(screen.getByLabelText('Category'), medicine.id)

    expect(screen.getByLabelText('Category')).toBeValid()
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('An Item needs a name.')
  })

  it('clears the Necessity error once a Necessity is chosen, without saving again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Necessity')).toHaveAccessibleDescription('Choose a Necessity.')
    choose(screen.getByLabelText('Necessity'), 'essential')

    expect(screen.getByLabelText('Necessity')).toBeValid()
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('An Item needs a name.')
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

  it('clears the name error once a name is typed, without saving again', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    openRow('Bandages')

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('An Item needs a name.')
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Plasters' } })

    expect(screen.getByLabelText('Name')).toBeValid()
  })

  it('has no State field in the Edit Item dialog', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])

    openRow('Bandages')

    expect(within(screen.getByRole('dialog', { name: 'Edit Item' })).queryByLabelText('State')).not.toBeInTheDocument()
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
    }, expect.anything())
    expect(createItem).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('deletes that Item and closes the dialog at once, without waiting on the write', () => {
    softDeleteItem.mockReturnValue(new Promise(() => {}))
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(softDeleteItem).toHaveBeenCalledWith(fakeDb, waterproofBandages)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers Undo in a snackbar, which restores the deleted Item', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    render(<SnackbarHost />)

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('status')).toHaveTextContent('Deleted Bandages')
    expect(restoreItem).not.toHaveBeenCalled()
    const hashBeforeUndo = window.location.hash
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(restoreItem).toHaveBeenCalledWith(fakeDb, waterproofBandages, [medicine, cleaning], [pharmacy, grocery])
    expect(window.location.hash).toBe(hashBeforeUndo)
  })

  it('hands Undo the Categories as they are when it is pressed, not when the Item was deleted', () => {
    const { publishCategories } = renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    render(<SnackbarHost />)

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    act(() => publishCategories([cleaning]))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(restoreItem).toHaveBeenCalledWith(fakeDb, waterproofBandages, [cleaning], [pharmacy, grocery])
  })

  it('hands Undo the Shops as they are when it is pressed, not when the Item was deleted', () => {
    const { publishShops } = renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    render(<SnackbarHost />)

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    act(() => publishShops([grocery]))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(restoreItem).toHaveBeenCalledWith(fakeDb, waterproofBandages, [medicine, cleaning], [grocery])
  })

  it('does not hand Undo a Category list that has not loaded as if every Category were deleted', () => {
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      cb([waterproofBandages])
      return vi.fn()
    })
    watchCategories.mockImplementation(() => vi.fn())
    watchShops.mockImplementation(() => vi.fn())
    render(<ItemsManager db={fakeDb} />)
    render(<SnackbarHost />)

    openRow('Bandages')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(restoreItem).toHaveBeenCalledWith(
      fakeDb,
      waterproofBandages,
      [{ id: waterproofBandages.categoryId }],
      [{ id: waterproofBandages.shopId }],
    )
  })

  it('offers no Delete when adding an Item', () => {
    renderWith([], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    expect(screen.getByRole('dialog', { name: 'Add Item' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('updates from the Item as it is at save time when it changed while the dialog was open', () => {
    renderWith([waterproofBandages], [medicine, cleaning], [pharmacy, grocery])
    const pushItems = watchItems.mock.calls[0]![1] as (items: ItemRecord[]) => void

    openRow('Bandages')
    const movedElsewhere: ItemRecord = { ...waterproofBandages, categoryId: cleaning.id, shopId: undefined }
    act(() => pushItems([movedElsewhere]))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateItem).toHaveBeenCalledWith(fakeDb, movedElsewhere, expect.anything(), expect.anything())
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
      expect.anything(),
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

  it('spaces the fields vertically', () => {
    renderWith([bandages], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))

    const form = screen.getByLabelText('Name').closest('form')
    expect(form).toHaveClass('item-form')
    const { used, undefinedTokens } = tokenUsage('src/catalogue/ItemDialog.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })

  it('puts Save last, with Delete apart from Cancel and Save', () => {
    renderWith([bandages], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))

    const dialog = screen.getByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Save' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons[buttons.length - 1]).toBe(save)
    expect(cancel.parentElement).toBe(save.parentElement)
    expect(del.parentElement).not.toBe(cancel.parentElement)
    expect(del.parentElement).toHaveClass('ui-dialog-actions__destructive')
  })

  it('spaces the New Category fields like the rest of the form', () => {
    renderWith([bandages], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Bandages essential' }))
    const option = screen.getByRole<HTMLOptionElement>('option', { name: '+ New Category' })
    choose(screen.getByLabelText('Category'), option.value)

    expect(screen.getByLabelText('New Category name').closest('.item-form__group')).toBe(
      screen.getByLabelText('Default Shop').closest('.item-form__group'),
    )
  })

  it('discards the edit on the header Close icon', async () => {
    await fillAndLeave(() => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateItem).not.toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
    await waitFor(() => expect(history.state?.['ui-dialog']).toBeUndefined())
  })

  it('returns exactly one step on the Back after the header Close icon', async () => {
    window.location.hash = '#/start'
    window.location.hash = '#/items'
    await fillAndLeave(() => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })))
    await waitFor(() => expect(history.state?.['ui-dialog']).toBeUndefined())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.location.hash).toBe('#/items')

    history.back()

    await waitFor(() => expect(window.location.hash).toBe('#/start'))
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

  it('lays the new Category actions out side by side like the dialog action row, Cancel before Create', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()

    const cancel = screen.getByRole('button', { name: 'Cancel new Category' })
    const create = screen.getByRole('button', { name: 'Create Category' })
    expect(cancel.parentElement).toHaveClass('ui-dialog-actions__main')
    expect(create.parentElement).toBe(cancel.parentElement)
    expect(cancel.nextElementSibling).toBe(create)
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

  it('clears the Category error when the new Category is created after Save was pressed meanwhile', async () => {
    const created: CategoryRecord = { ...cleaning, id: catalogue.categoryId('first-aid'), name: 'First aid' }
    const { publishCategories } = renderWith([], [medicine], [pharmacy])
    let resolveCreate: (id: typeof created.id) => void = () => {}
    createCategory.mockReturnValue(new Promise<typeof created.id>((resolve) => (resolveCreate = resolve)))
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Category')).toHaveAccessibleDescription('Choose a Category.')
    act(() => publishCategories([medicine, created]))
    resolveCreate(created.id)

    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue(created.id))
    expect(screen.getByLabelText('Category')).toBeValid()
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

  it('clears the name error once a name is typed, without pressing Create Category again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))
    expect(screen.getByLabelText('New Category name')).toHaveAccessibleDescription('A Category needs a name.')

    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })

    expect(screen.getByLabelText('New Category name')).toBeValid()
    expect(screen.getByLabelText('New Category name')).not.toHaveAccessibleDescription('A Category needs a name.')
  })

  it('clears the Shop error once a Shop is chosen, without pressing Create Category again', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))
    expect(screen.getByLabelText('Default Shop')).toHaveAccessibleDescription('Choose a default Shop.')

    choose(screen.getByLabelText('Default Shop'), pharmacy.id)

    expect(screen.getByLabelText('Default Shop')).toBeValid()
    expect(screen.getByLabelText('Default Shop')).not.toHaveAccessibleDescription('Choose a default Shop.')
  })

  it('leaves the Shop error when only the name is edited', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Medicine' } })

    expect(screen.getByLabelText('Default Shop')).toHaveAccessibleDescription('Choose a default Shop.')
  })

  it('leaves the name error when only the Shop is chosen', () => {
    renderWith([], [medicine], [pharmacy])
    openDialog()
    chooseNewCategory()
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))

    choose(screen.getByLabelText('Default Shop'), pharmacy.id)

    expect(screen.getByLabelText('New Category name')).toHaveAccessibleDescription('A Category needs a name.')
  })

  it('keeps a createCategory rejection while the fields are edited', async () => {
    renderWith([], [medicine], [pharmacy, grocery])
    createCategory.mockRejectedValue(new Error('Offline'))
    openDialog()
    chooseNewCategory()
    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'First aid' } })
    choose(screen.getByLabelText('Default Shop'), pharmacy.id)
    fireEvent.click(screen.getByRole('button', { name: 'Create Category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')

    fireEvent.input(screen.getByLabelText('New Category name'), { target: { value: 'Medicine' } })
    choose(screen.getByLabelText('Default Shop'), grocery.id)

    expect(screen.getByRole('alert')).toHaveTextContent('Offline')
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

describe('a scanned barcode', () => {
  const track = { stop: vi.fn() }

  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = async () => [{ rawValue: '4006381333931' }]
      },
    )
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  function scan() {
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
  }

  const scanned = core.barcode('4006381333931')

  it('opens the filter for the one Item carrying it', async () => {
    renderWith([{ ...bandages, barcodes: [scanned] }], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
  })

  it('leaves one history entry for the filter, so one Back returns to the Items screen', async () => {
    window.location.hash = '#/items'
    renderWith([{ ...bandages, barcodes: [scanned] }], [medicine], [pharmacy])

    scan()
    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    history.back()

    await waitFor(() => expect(window.location.hash).toBe('#/items'))
    expect(history.state?.['ui-dialog']).toBeUndefined()
  })

  it('opens the filter for every Item carrying it', async () => {
    const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape', barcodes: [scanned] }
    renderWith([{ ...bandages, barcodes: [scanned] }, tape], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages,tape'))
  })

  it('asks the Member to scan again while the Items have not loaded', async () => {
    const { publishItems } = renderWith(undefined, [medicine], [pharmacy])

    scan()

    expect(await screen.findByRole('status')).toHaveTextContent('Items are still loading')
    expect(screen.queryByRole('dialog', { name: 'Unknown barcode' })).toBeNull()
    expect(window.location.hash).toBe('')

    act(() => publishItems([bandages]))

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('opens the chooser naming an unknown barcode, leaving the route alone', async () => {
    renderWith([bandages], [medicine], [pharmacy])

    scan()

    expect(await screen.findByRole('dialog', { name: 'Unknown barcode' })).toHaveTextContent('4006381333931')
    expect(window.location.hash).toBe('')
  })

  it('offers to bring back a deleted Item that holds the barcode, instead of the unknown chooser', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])

    scan()

    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })
    expect(offer).toHaveTextContent('Bandages was deleted. Bring it back?')
    expect(screen.queryByRole('dialog', { name: 'Unknown barcode' })).not.toBeInTheDocument()
    expect(findDeletedItemByBarcode).toHaveBeenCalledWith(fakeDb, '4006381333931')
  })

  it('restores the deleted Item on Yes, then opens its filter', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
    expect(restoreItem).toHaveBeenCalledWith(fakeDb, bandages, [medicine], [pharmacy])
  })

  it('reports a failed restore on Yes in the alert banner', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    restoreItem.mockRejectedValue(new Error('Restore refused'))
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Restore refused')
    expect(window.location.hash).toBe('')
  })

  it('reports a failed holder lookup on No in the alert banner', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    findBarcodeHolders.mockRejectedValue(new Error('Lookup refused'))
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'No' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Lookup refused')
  })

  it('falls back to a fixed message when the restore rejects with a non-Error', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    restoreItem.mockRejectedValue('nope')
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore Bandages')
  })

  it('falls back to a fixed message when the holder lookup rejects with a non-Error', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    findBarcodeHolders.mockRejectedValue('nope')
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'No' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not look up the barcode')
  })

  it('opens the Item dialog on Yes when the deleted Item\'s Category is gone, restoring it with the new choice on save', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [cleaning], [grocery])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    const dialog = await screen.findByRole('dialog', { name: 'Restore Item' })
    expect(restoreItem).not.toHaveBeenCalled()
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Bandages')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('')
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    choose(within(dialog).getByLabelText('Category'), cleaning.id)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
    expect(restoreItemWithEdit).toHaveBeenCalledWith(fakeDb, bandages, expect.objectContaining({ categoryId: cleaning.id }))
    expect(restoreItem).not.toHaveBeenCalled()
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('issues the Item dialog\'s pop before pushing the restored Item\'s filter', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [cleaning], [grocery])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })
    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore Item' })
    choose(within(dialog).getByLabelText('Category'), cleaning.id)
    // Let the dialog's own history push land before recording.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const { order, stop } = recordHistoryOrder()

    try {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(order).toContain('#/items?item=bandages'))
    } finally {
      stop()
    }
    expect(order.indexOf('back')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('back')).toBeLessThan(order.indexOf('#/items?item=bandages'))
    expect(screen.queryByRole('dialog', { name: 'Restore Item' })).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/items?item=bandages')
  })

  it('opens the Item dialog on Yes when the deleted Item\'s Shop override is gone', async () => {
    findDeletedItemByBarcode.mockResolvedValue({ ...bandages, shopId: grocery.id })
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    const dialog = await screen.findByRole('dialog', { name: 'Restore Item' })
    expect(within(dialog).getByLabelText('Shop override')).toHaveValue('')
    expect(restoreItem).not.toHaveBeenCalled()
    choose(within(dialog).getByLabelText('Shop override'), pharmacy.id)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
    expect(restoreItemWithEdit).toHaveBeenCalledWith(fakeDb, { ...bandages, shopId: grocery.id }, expect.objectContaining({ shopId: pharmacy.id }))
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('leaves the Item deleted when the restoring dialog is cancelled', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [cleaning], [grocery])
    scan()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deleted Item' })).getByRole('button', { name: 'Yes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore Item' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('leaves the Item deleted on No and opens the unknown-barcode chooser', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'No' }))

    expect(await screen.findByRole('dialog', { name: 'Unknown barcode' })).toHaveTextContent('4006381333931')
    expect(restoreItem).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it('does not look for a deleted Item when a live one carries the barcode', async () => {
    renderWith([{ ...bandages, barcodes: [scanned] }], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=bandages'))
    expect(findDeletedItemByBarcode).not.toHaveBeenCalled()
  })

  it('closes the chooser on Cancel, writing nothing', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(chooser).not.toHaveAttribute('open'))
    expect(createItem).not.toHaveBeenCalled()
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('closes the chooser from its Close icon, writing nothing', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(chooser).not.toHaveAttribute('open'))
    expect(createItem).not.toHaveBeenCalled()
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('gives New Item and Add to existing Item the same button weight', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    const existing = within(chooser).getByRole('button', { name: 'Add to existing Item' })
    const added = within(chooser).getByRole('button', { name: 'New Item' })

    expect(existing).toHaveClass('ui-button--tonal')
    expect(added).toHaveClass('ui-button--tonal')
  })

  it('opts out of the full-screen dialog layout through its own class', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()

    expect(await screen.findByRole('dialog', { name: 'Unknown barcode' })).toHaveClass('unknown-barcode-dialog')
  })

  it('attaches the barcode to the Item picked from the chooser, then opens its filter', async () => {
    const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
    renderWith([bandages, tape], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
    fireEvent.input(within(chooser).getByRole('searchbox', { name: 'Find an Item' }), { target: { value: 'tap' } })
    expect(within(chooser).queryByText('Bandages')).not.toBeInTheDocument()
    fireEvent.click(within(chooser).getByRole('button', { name: 'Tape' }))

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=tape'))
    expect(attachBarcode).toHaveBeenCalledWith(fakeDb, tape, '4006381333931', [])
    await waitFor(() => expect(chooser).not.toHaveAttribute('open'))
  })

  describe('a barcode still on another Item', () => {
    const oldTape = { id: core.itemId('old-tape'), name: 'Old tape' }

    async function pickTape() {
      const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
      findBarcodeHolders.mockResolvedValue([oldTape])
      renderWith([bandages, tape], [medicine], [pharmacy])
      scan()
      const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
      fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
      fireEvent.click(within(chooser).getByRole('button', { name: 'Tape' }))
      return { chooser, tape }
    }

    it('names the Item it is on and asks before moving it', async () => {
      const { chooser } = await pickTape()

      expect(chooser).toHaveTextContent('4006381333931 is on Old tape. Move it to Tape?')
      expect(attachBarcode).not.toHaveBeenCalled()
    })

    it('moves it off that Item when confirmed', async () => {
      const { chooser, tape } = await pickTape()

      fireEvent.click(within(chooser).getByRole('button', { name: 'Move' }))

      await waitFor(() => expect(attachBarcode).toHaveBeenCalledWith(fakeDb, tape, '4006381333931', [oldTape]))
    })

    it('asks before moving it to a new Item, then creates that Item moving it off', async () => {
      findBarcodeHolders.mockResolvedValue([oldTape])
      renderWith([bandages], [medicine], [pharmacy])
      scan()
      const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

      fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
      expect(chooser).toHaveTextContent('4006381333931 is on Old tape. Move it to a new Item?')
      expect(screen.queryByRole('dialog', { name: 'Add Item' })).not.toBeInTheDocument()
      fireEvent.click(within(chooser).getByRole('button', { name: 'Move' }))

      const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
      fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Dish soap' } })
      choose(within(dialog).getByLabelText('Category'), medicine.id)
      choose(within(dialog).getByLabelText('Necessity'), 'essential')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(createItem).toHaveBeenCalledWith(
          fakeDb,
          expect.objectContaining({ barcode: { value: '4006381333931', movedOff: [oldTape] } }),
        ),
      )
    })

    it('changes nothing when cancelled, leaving the Item list to pick again', async () => {
      const { chooser } = await pickTape()

      fireEvent.click(within(chooser).getByRole('button', { name: 'Cancel' }))

      expect(attachBarcode).not.toHaveBeenCalled()
      expect(within(chooser).getByRole('button', { name: 'Tape' })).toBeInTheDocument()
    })
  })

  it('shows the pending barcode read-only in the Item dialog opened from "New Item"', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    const barcode = within(dialog).getByRole('textbox', { name: 'Barcode' })
    expect(barcode).toHaveValue('4006381333931')
    expect(barcode).toHaveAttribute('readonly')
    expect(barcode).toHaveClass('ui-field__control')
    expect(within(dialog).queryByRole('button', { name: /Remove barcode/ })).not.toBeInTheDocument()
  })

  it('keeps Cancel and Save in the Item dialog\'s one action row, with Delete joining it when editing', async () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
    const addDialog = await screen.findByRole('dialog', { name: 'Add Item' })
    const addConfirm = within(addDialog).getByRole('button', { name: 'Cancel' }).parentElement
    expect(addConfirm?.parentElement).toHaveClass('ui-dialog-actions')
    expect(within(addDialog).getByRole('button', { name: 'Save' }).parentElement).toBe(addConfirm)
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: /^Bandages/ }))
    const editDialog = await screen.findByRole('dialog', { name: 'Edit Item' })
    const editConfirm = within(editDialog).getByRole('button', { name: 'Cancel' }).parentElement
    const editRow = editConfirm?.parentElement
    expect(editRow).toHaveClass('ui-dialog-actions')
    expect(within(editDialog).getByRole('button', { name: 'Save' }).parentElement).toBe(editConfirm)
    expect(within(editDialog).getByRole('button', { name: 'Delete' }).parentElement?.parentElement).toBe(editRow)
  })

  it('shows no barcode in the Item dialog opened from the FAB', async () => {
    renderWith([bandages], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    expect(within(dialog).queryByRole('textbox', { name: 'Barcode' })).not.toBeInTheDocument()
  })

  it('issues the chooser\'s history pop before pushing the filter of the Item picked from it', async () => {
    const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape' }
    renderWith([bandages, tape], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    // The scanner's pop is still in flight; the chooser pushes its entry once it lands.
    await new Promise((resolve) => setTimeout(resolve, 50))
    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))

    const { order, stop } = recordHistoryOrder()
    try {
      fireEvent.click(within(chooser).getByRole('button', { name: 'Tape' }))
      await waitFor(() => expect(order).toContain('#/items?item=tape'))
    } finally {
      stop()
    }

    expect(order.indexOf('back')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('back')).toBeLessThan(order.indexOf('#/items?item=tape'))
  })

  it('confirms with a snackbar that the barcode was added to the Item picked from the chooser', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    render(<SnackbarHost />)
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))

    fireEvent.click(within(chooser).getByRole('button', { name: bandages.name }))

    expect(await screen.findByRole('status')).toHaveTextContent(`Added barcode to ${bandages.name}`)
  })

  it('creates the Item carrying the barcode from "New Item"', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Dish soap' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        fakeDb,
        expect.objectContaining({ name: 'Dish soap', barcode: { value: '4006381333931', movedOff: [] } }),
      ),
    )
    expect(attachBarcode).not.toHaveBeenCalled()
  })

  it('creates the Item carrying both the barcode and the chosen State from "New Item"', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Dish soap' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    choose(within(dialog).getByLabelText('State'), 'out')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        fakeDb,
        expect.objectContaining({ name: 'Dish soap', barcode: { value: '4006381333931', movedOff: [] }, state: 'out' }),
      ),
    )
  })

  it('opens the new Item\'s scanned filter once the Item dialog opened from "New Item" is saved', async () => {
    createItem.mockResolvedValue(core.itemId('dish-soap'))
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Dish soap' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(window.location.hash).toBe('#/items?item=dish-soap'))
  })

  it('issues the Item dialog\'s pop before pushing the new Item\'s scanned filter', async () => {
    createItem.mockResolvedValue(core.itemId('dish-soap'))
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Dish soap' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    // Let the dialog's own history push land before recording.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const { order, stop } = recordHistoryOrder()

    try {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(order).toContain('#/items?item=dish-soap'))
    } finally {
      stop()
    }
    expect(order.indexOf('back')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('back')).toBeLessThan(order.indexOf('#/items?item=dish-soap'))
  })

  it('leaves the route alone when an Item is added from the FAB', async () => {
    createItem.mockResolvedValue(core.itemId('tape'))
    renderWith([bandages], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Tape' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createItem).toHaveBeenCalled())
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(window.location.hash).toBe('')
  })

  it('writes nothing when the Item dialog opened from "New Item" is cancelled', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    expect(createItem).not.toHaveBeenCalled()
    expect(attachBarcode).not.toHaveBeenCalled()
  })

  it('adds an Item from the FAB without the barcode once a scan was cancelled', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'))

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Tape' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createItem).toHaveBeenCalled())
    expect(createItem.mock.calls[0]![1].barcode).toBeUndefined()
  })
})

describe('collapsing a Category', () => {
  const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Dish soap', categoryId: cleaning.id }

  it('starts every Category expanded, its heading a toggle button', () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    const toggle = within(screen.getByRole('heading', { name: 'Medicine' })).getByRole('button', { name: 'Medicine' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bandages')).toBeInTheDocument()
  })

  it("hides a Category's Items when its heading is pressed, and shows them when pressed again", () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.click(headingToggle('Medicine'))

    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()

    fireEvent.click(headingToggle('Medicine'))

    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bandages')).toBeInTheDocument()
  })

  it('collapses Uncategorised too', () => {
    const orphan: ItemRecord = { ...bandages, categoryId: catalogue.categoryId('gone') }
    renderWith([orphan], [medicine], [pharmacy])

    fireEvent.click(screen.getByRole('button', { name: 'Uncategorised' }))

    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it("summarises a collapsed heading with its Items' running low and out counts", () => {
    const items = [
      { ...soap, id: core.itemId('a'), state: 'running low' as const },
      { ...soap, id: core.itemId('b'), state: 'running low' as const },
      { ...soap, id: core.itemId('c'), state: 'out' as const },
      { ...soap, id: core.itemId('d'), state: 'enough' as const },
    ]
    renderWith(items, [cleaning], [grocery])

    fireEvent.click(headingToggle('Cleaning'))

    expect(screen.getByRole('button', { name: 'Cleaning · 2 running low, 1 out' })).toBeInTheDocument()
  })

  it('counts only the States that occur, and adds nothing when every Item is enough', () => {
    renderWith([{ ...soap, state: 'out' }, { ...bandages, state: 'enough' }], [medicine, cleaning], [pharmacy, grocery])

    fireEvent.click(headingToggle('Cleaning'))
    fireEvent.click(headingToggle('Medicine'))

    expect(screen.getByRole('button', { name: 'Cleaning · 1 out' })).toBeInTheDocument()
    expect(headingToggle('Medicine')).toBeInTheDocument()
  })

  it('shows no summary while the Category is expanded', () => {
    renderWith([{ ...soap, state: 'out' }], [cleaning], [grocery])

    expect(headingToggle('Cleaning')).toBeInTheDocument()
  })

  it('shows the Items a search matches in a collapsed Category, and restores the collapse when cleared', () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])
    fireEvent.click(headingToggle('Medicine'))

    const search = screen.getByRole('searchbox', { name: 'Search Items' })
    fireEvent.input(search, { target: { value: 'band' } })

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'true')

    fireEvent.input(search, { target: { value: '' } })

    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the Items a scan filter matches in a collapsed Category, and restores the collapse when cleared', () => {
    localStorage.setItem('home-catalogue:collapsed-categories', JSON.stringify([medicine.id]))
    const { rerender } = renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery], [bandages.id])

    expect(screen.getByText('Bandages')).toBeInTheDocument()

    rerender(<ItemsManager db={fakeDb} itemIds={[]} />)

    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'false')
  })

  it('disables the heading toggles while a filter is active, keeping the remembered state', () => {
    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])
    fireEvent.click(headingToggle('Medicine'))
    const remembered = localStorage.getItem('home-catalogue:collapsed-categories')

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'band' } })

    expect(headingToggle('Medicine')).toBeDisabled()
    expect(localStorage.getItem('home-catalogue:collapsed-categories')).toBe(remembered)
  })

  it('remembers a collapsed Category across reloads, by Category id', () => {
    const first = renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])
    fireEvent.click(headingToggle('Medicine'))
    first.unmount()

    renderWith([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(headingToggle('Medicine')).toHaveAttribute('aria-expanded', 'false')
    expect(headingToggle('Cleaning')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('remembers a collapsed Uncategorised group across reloads', () => {
    const orphan: ItemRecord = { ...bandages, categoryId: catalogue.categoryId('gone') }
    const first = renderWith([orphan], [medicine], [pharmacy])
    fireEvent.click(screen.getByRole('button', { name: 'Uncategorised' }))
    first.unmount()

    renderWith([orphan], [medicine], [pharmacy])

    expect(screen.getByRole('button', { name: 'Uncategorised' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('ItemsManager Category and Shop filter', () => {
  const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Dish soap', categoryId: cleaning.id }
  const aspirin: ItemRecord = { ...bandages, id: core.itemId('aspirin'), name: 'Aspirin', shopId: grocery.id }

  function renderFiltered(
    { itemIds, ...filter }: { categoryId?: catalogue.CategoryId; shopId?: catalogue.ShopId; itemIds?: readonly core.ItemId[] },
    onFilterChange = vi.fn(),
    onClearFilter = vi.fn(),
  ) {
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      cb([bandages, soap, aspirin])
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
    render(<ItemsManager db={fakeDb} itemIds={itemIds} filter={{ categoryId: filter.categoryId, shopId: filter.shopId }} onFilterChange={onFilterChange} onClearFilter={onClearFilter} />)
    return onFilterChange
  }

  it('offers a chip for every Category and every Shop, none pressed', () => {
    renderFiltered({})

    const categories = within(screen.getByRole('group', { name: 'Filter by Category' }))
    const shops = within(screen.getByRole('group', { name: 'Filter by Shop' }))
    expect(categories.getByRole('button', { name: 'Medicine', pressed: false })).toBeInTheDocument()
    expect(categories.getByRole('button', { name: 'Cleaning', pressed: false })).toBeInTheDocument()
    expect(shops.getByRole('button', { name: 'Pharmacy', pressed: false })).toBeInTheDocument()
    expect(shops.getByRole('button', { name: 'Grocery', pressed: false })).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
  })

  it('shows only the pressed Category’s Items', () => {
    renderFiltered({ categoryId: cleaning.id })

    expect(screen.getByRole('button', { name: 'Cleaning', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('shows only the Items of the pressed Shop, from the Item or else its Category', () => {
    renderFiltered({ shopId: grocery.id })

    expect(screen.getByText('Dish soap')).toBeInTheDocument()
    expect(screen.getByText('Aspirin')).toBeInTheDocument()
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
  })

  it('narrows by Category and Shop together', () => {
    renderFiltered({ categoryId: medicine.id, shopId: grocery.id })

    expect(screen.getByText('Aspirin')).toBeInTheDocument()
    expect(screen.queryByText('Bandages')).not.toBeInTheDocument()
    expect(screen.queryByText('Dish soap')).not.toBeInTheDocument()
  })

  it('narrows the name search', () => {
    renderFiltered({ categoryId: medicine.id })

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search Items' }), { target: { value: 'band' } })

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByText('Aspirin')).not.toBeInTheDocument()
  })

  it('narrows the scanned Items', () => {
    renderFiltered({ categoryId: medicine.id, itemIds: [bandages.id, soap.id] })

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByText('Dish soap')).not.toBeInTheDocument()
  })

  it('shows every group’s Items though it was collapsed while a filter applies', () => {
    localStorage.setItem('home-catalogue:collapsed-categories', JSON.stringify([cleaning.id]))
    renderFiltered({ shopId: grocery.id })

    expect(screen.getByText('Dish soap')).toBeInTheDocument()
  })

  it('says no Items match the filters when none do', () => {
    renderFiltered({ categoryId: cleaning.id, shopId: pharmacy.id })

    expect(screen.getByText('No Items match your filters.')).toBeInTheDocument()
  })

  it('reports the pressed Category, keeping the Shop', () => {
    const onFilterChange = renderFiltered({ shopId: grocery.id })

    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by Category' })).getByRole('button', { name: 'Cleaning' }))

    expect(onFilterChange).toHaveBeenCalledWith({ categoryId: cleaning.id, shopId: grocery.id })
  })

  it('clears a Shop when its pressed chip is pressed again', () => {
    const onFilterChange = renderFiltered({ categoryId: medicine.id, shopId: grocery.id })

    fireEvent.click(screen.getByRole('button', { name: 'Grocery' }))

    expect(onFilterChange).toHaveBeenCalledWith({ categoryId: medicine.id, shopId: undefined })
  })

  it('hands the live Category and Shop to onClearFilter, dropping one that no longer exists', () => {
    const onClearFilter = vi.fn()
    renderFiltered({ itemIds: [bandages.id], categoryId: medicine.id, shopId: catalogue.shopId('gone') }, vi.fn(), onClearFilter)

    fireEvent.click(screen.getByRole('button', { name: 'Clear scanned filter' }))

    expect(onClearFilter).toHaveBeenCalledWith({ categoryId: medicine.id, shopId: undefined })
  })

  it('does not hide an Item whose Shop comes from its Category before the Categories have loaded', () => {
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      cb([bandages])
      return vi.fn()
    })
    watchCategories.mockImplementation(() => vi.fn())
    watchShops.mockImplementation((_db: unknown, cb: (shops: ShopRecord[]) => void) => {
      cb([pharmacy, grocery])
      return vi.fn()
    })
    render(<ItemsManager db={fakeDb} filter={{ categoryId: undefined, shopId: pharmacy.id }} />)

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.queryByText('No Items match your filters.')).not.toBeInTheDocument()
  })

  it('ignores a Category or Shop that no longer exists', () => {
    renderFiltered({ categoryId: catalogue.categoryId('gone'), shopId: catalogue.shopId('gone') })

    expect(screen.getByText('Bandages')).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
  })
})
