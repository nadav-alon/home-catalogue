import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { ShoppingList } from './ShoppingList.tsx'
import { choose } from '../testing/select.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { SnackbarHost, resetSnackbar } from '../ui/Snackbar.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import type { TagRecord } from './tags.ts'
import { cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'

const watchItems = vi.fn()
const setItemState = vi.fn()
const findBarcodeHolders = vi.fn()
const attachBarcode = vi.fn()
const createItem = vi.fn()
const findDeletedItemByBarcode = vi.fn()
const restoreItem = vi.fn()
const restoreItemWithEdit = vi.fn()
vi.mock('./items.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./items.ts')>()),
  watchItems: (db: unknown, cb: unknown) => watchItems(db, cb),
  setItemState: (db: unknown, item: unknown, state: unknown) => setItemState(db, item, state),
  findBarcodeHolders: (...args: unknown[]) => findBarcodeHolders(...args),
  attachBarcode: (...args: unknown[]) => attachBarcode(...args),
  createItem: (db: unknown, input: unknown) => createItem(db, input),
  findDeletedItemByBarcode: (db: unknown, barcode: unknown) => findDeletedItemByBarcode(db, barcode),
  restoreItem: (db: unknown, item: unknown, categories: unknown, shops: unknown) => restoreItem(db, item, categories, shops),
  restoreItemWithEdit: (db: unknown, item: unknown, edit: unknown) => restoreItemWithEdit(db, item, edit),
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

const watchTags = vi.fn()
const createTag = vi.fn()
vi.mock('./tags.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tags.ts')>()),
  watchTags: (db: unknown, cb: unknown) => watchTags(db, cb),
  createTag: (db: unknown, name: unknown) => createTag(db, name),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  watchItems.mockReset()
  setItemState.mockReset().mockResolvedValue(undefined)
  findBarcodeHolders.mockReset().mockResolvedValue([])
  attachBarcode.mockReset().mockResolvedValue(undefined)
  createItem.mockReset().mockResolvedValue(undefined)
  findDeletedItemByBarcode.mockReset().mockResolvedValue(undefined)
  restoreItem.mockReset().mockResolvedValue(undefined)
  restoreItemWithEdit.mockReset().mockResolvedValue(undefined)
  watchCategories.mockReset()
  watchShops.mockReset()
  watchTags.mockReset().mockImplementation((_db: unknown, cb: (tags: TagRecord[]) => void) => {
    cb([])
    return vi.fn()
  })
  createTag.mockReset()
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
  return render(
    <TopAppBar title="Shopping list">
      <ShoppingList db={fakeDb} />
    </TopAppBar>,
  )
}

describe('ShoppingList', () => {
  it('lists Items at running low or out, grouped by resolved Shop', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
      tagIds: [],
    }
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.queryByText(/Nothing to buy/)).not.toBeInTheDocument()
  })

  it('leaves out a Shop with no pending Items', () => {
    renderWith([], [medicine], [pharmacy, grocery])

    expect(screen.queryByRole('heading', { name: 'Pharmacy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grocery' })).not.toBeInTheDocument()
  })

  it('flags a running low Item as running low', () => {
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
      tagIds: [],
    }
    renderWith([soap], [cleaning], [grocery])

    const row = screen.getByText('Dish soap').closest('li')
    expect(row).toHaveTextContent('running low')
    expect(row).not.toHaveTextContent('optional')
  })

  it('flags a running low Item whose Necessity is optional as running low only', () => {
    const candles: ItemRecord = {
      id: core.itemId('candles'),
      name: 'Candles',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'optional',
      tagIds: [],
    }
    renderWith([candles], [cleaning], [grocery])

    const row = screen.getByText('Candles').closest('li')
    expect(row).toHaveTextContent('running low')
    expect(row).not.toHaveTextContent('optional')
  })

  it('sets a running low row back visually from an out row', () => {
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
      tagIds: [],
    }
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
      tagIds: [],
    }
    renderWith([soap, bandages], [cleaning, medicine], [grocery, pharmacy])

    expect(screen.getByText('Dish soap').closest('li')).toHaveClass('ui-list-row--muted')
    expect(screen.getByText('Bandages').closest('li')).not.toHaveClass('ui-list-row--muted')
  })

  it('does not flag an out Item as running low', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
      tagIds: [],
    }
    renderWith([bandages], [medicine], [pharmacy])

    expect(screen.getByText('Bandages').closest('li')).not.toHaveTextContent('running low')
  })

  it('groups an Item with no resolved Shop under Unknown Shop', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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
      tagIds: [],
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

  it.each(['running low', 'out'] as const)(
    'returns the row to its Shop with its flag when Undo reverts the tick to %s',
    (state) => {
      const bandages: ItemRecord = {
        id: core.itemId('bandages'),
        name: 'Bandages',
        state,
        categoryId: medicine.id,
        necessity: 'essential',
        tagIds: [],
      }
      let itemsCallback: ((items: ItemRecord[]) => void) | undefined
      watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
        itemsCallback = cb
        cb([bandages])
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
      render(<SnackbarHost />)

      fireEvent.click(screen.getByRole('checkbox', { name: /Bandages/ }))
      act(() => itemsCallback?.([{ ...bandages, state: 'enough' }]))
      expect(screen.queryByText('Bandages')).not.toBeInTheDocument()

      fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
      act(() => itemsCallback?.([bandages]))

      const shopHeading = screen.getByRole('heading', { name: pharmacy.name })
      const row = within(shopHeading.parentElement as HTMLElement).getByText('Bandages').closest('li')
      expect(row).not.toBeNull()
      expect(within(row as HTMLElement).queryByText('running low') !== null).toBe(state === 'running low')
    },
  )
})

describe('a scanned barcode', () => {
  const scanned = core.barcode('4006381333931')
  const bandages: ItemRecord = {
    id: core.itemId('bandages'),
    name: 'Bandages',
    state: 'out',
    categoryId: medicine.id,
    necessity: 'essential',
    tagIds: [],
    barcodes: [scanned],
  }

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    })
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = async () => [{ rawValue: scanned }]
      },
    )
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  function scan() {
    fireEvent.click(screen.getByRole('button', { name: 'Scan barcode' }))
  }

  it('sets the Item it sits on enough, with an Undo that restores its State', async () => {
    render(<SnackbarHost />)
    renderWith([bandages], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, 'enough'))
    setItemState.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, 'out')
  })

  it('sets an Item that is not on the list enough all the same, when it is not already enough', async () => {
    render(<SnackbarHost />)
    renderWith([bandages], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(setItemState).toHaveBeenCalledWith(fakeDb, bandages, 'enough'))
  })

  it('says an Item that is already enough is, without a write or an Undo', async () => {
    render(<SnackbarHost />)
    const stocked: ItemRecord = { ...bandages, state: 'enough' }
    renderWith([stocked], [medicine], [pharmacy])

    scan()

    expect(await screen.findByText('Bandages is already enough')).toBeInTheDocument()
    expect(setItemState).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('asks for another scan instead of opening the chooser while the Items are loading', async () => {
    watchItems.mockReturnValue(vi.fn())
    watchCategories.mockReturnValue(vi.fn())
    watchShops.mockReturnValue(vi.fn())
    render(
      <TopAppBar title="Shopping list">
        <ShoppingList db={fakeDb} />
      </TopAppBar>,
    )

    scan()

    expect(await screen.findByText('Items are still loading, scan again in a moment')).toBeInTheDocument()
    expect(findBarcodeHolders).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Unknown barcode' })).not.toBeInTheDocument()
  })

  it('opens the Unknown barcode chooser for a barcode no Item carries', async () => {
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])

    scan()

    expect(await screen.findByRole('dialog', { name: 'Unknown barcode' })).toHaveTextContent(scanned)
    expect(setItemState).not.toHaveBeenCalled()
  })

  it('attaches the barcode to the Item the Member picks in the chooser, and sets it enough with an Undo', async () => {
    render(<SnackbarHost />)
    const unscanned: ItemRecord = { ...bandages, barcodes: undefined }
    renderWith([unscanned], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
    fireEvent.click(within(chooser).getByText('Bandages'))

    await waitFor(() => expect(attachBarcode).toHaveBeenCalledWith(fakeDb, unscanned, scanned, []))
    await waitFor(() => expect(setItemState).toHaveBeenCalledWith(fakeDb, unscanned, 'enough'))
    setItemState.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(setItemState).toHaveBeenCalledWith(fakeDb, unscanned, 'out')
  })

  it('sets the picked Item enough with an Undo when the barcode is moved off another Item', async () => {
    render(<SnackbarHost />)
    const unscanned: ItemRecord = { ...bandages, barcodes: undefined }
    const holders = [{ id: 'other-item' as ItemRecord['id'], name: 'Plasters' }]
    findBarcodeHolders.mockResolvedValue(holders)
    renderWith([unscanned], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
    fireEvent.click(within(chooser).getByText('Bandages'))
    fireEvent.click(within(chooser).getByRole('button', { name: 'Move' }))

    await waitFor(() => expect(attachBarcode).toHaveBeenCalledWith(fakeDb, unscanned, scanned, holders))
    await waitFor(() => expect(setItemState).toHaveBeenCalledWith(fakeDb, unscanned, 'enough'))
    setItemState.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(setItemState).toHaveBeenCalledWith(fakeDb, unscanned, 'out')
  })

  it('only confirms the attach when the picked Item is already enough', async () => {
    render(<SnackbarHost />)
    const stocked: ItemRecord = { ...bandages, barcodes: undefined, state: 'enough' }
    renderWith([stocked], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
    fireEvent.click(within(chooser).getByText('Bandages'))

    expect(await screen.findByText('Added barcode to Bandages')).toBeInTheDocument()
    expect(setItemState).not.toHaveBeenCalled()
  })

  it('reports a failed barcode lookup instead of opening the chooser', async () => {
    findBarcodeHolders.mockRejectedValue(new Error('Could not look up the barcode'))
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])

    scan()

    expect(await screen.findByText('Could not look up the barcode')).toHaveAttribute('role', 'alert')
    expect(screen.queryByRole('dialog', { name: 'Unknown barcode' })).not.toBeInTheDocument()
  })

  it('reports a failed attach and keeps the chooser open', async () => {
    attachBarcode.mockRejectedValue(new Error('Could not add the barcode'))
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Add to existing Item' }))
    fireEvent.click(within(chooser).getByText('Bandages'))

    expect(await screen.findByText('Could not add the barcode')).toHaveAttribute('role', 'alert')
    expect(chooser).toHaveAttribute('open')
  })

  it('creates a new Item carrying the scanned barcode from the chooser', async () => {
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Plasters' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        fakeDb,
        expect.objectContaining({ name: 'Plasters', barcode: { value: scanned, movedOff: [] } }),
      ),
    )
  })

  it('offers to bring back a deleted Item that holds the barcode, instead of the unknown chooser', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])

    scan()

    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })
    expect(offer).toHaveTextContent('Bandages was deleted. Bring it back?')
    expect(screen.queryByRole('dialog', { name: 'Unknown barcode' })).not.toBeInTheDocument()
    expect(findDeletedItemByBarcode).toHaveBeenCalledWith(fakeDb, scanned)
  })

  it('restores the deleted Item on Yes without marking it enough', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(restoreItem).toHaveBeenCalledWith(fakeDb, bandages, [medicine], [pharmacy]))
    expect(setItemState).not.toHaveBeenCalled()
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
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    choose(within(dialog).getByLabelText('Category'), cleaning.id)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(restoreItemWithEdit).toHaveBeenCalledWith(fakeDb, bandages, expect.objectContaining({ categoryId: cleaning.id })),
    )
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('restores with the Tags the Item kept plus one newly attached in the dialog', async () => {
    const sweet: TagRecord = { id: catalogue.tagId('sweet'), name: 'sweet' }
    const cooking: TagRecord = { id: catalogue.tagId('cooking'), name: 'cooking' }
    watchTags.mockImplementation((_db: unknown, cb: (tags: TagRecord[]) => void) => {
      cb([sweet, cooking])
      return vi.fn()
    })
    findDeletedItemByBarcode.mockResolvedValue({ ...bandages, tagIds: [sweet.id] })
    renderWith([], [cleaning], [grocery])
    scan()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deleted Item' })).getByRole('button', { name: 'Yes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore Item' })
    choose(within(dialog).getByLabelText('Category'), cleaning.id)
    expect(within(dialog).getByRole('button', { name: 'Remove Tag sweet' })).toBeInTheDocument()

    fireEvent.input(within(dialog).getByLabelText('Tags'), { target: { value: 'cooking' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Tag' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(restoreItemWithEdit).toHaveBeenCalledWith(
        fakeDb,
        expect.objectContaining({ id: bandages.id }),
        expect.objectContaining({ tagIds: [sweet.id, cooking.id] }),
      ),
    )
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
    expect(restoreItemWithEdit).not.toHaveBeenCalled()
  })

  it('reports a failed restore and confirms nothing', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    restoreItem.mockRejectedValue(new Error('Restore refused'))
    render(<SnackbarHost />)
    renderWith([], [medicine], [pharmacy])
    scan()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deleted Item' })).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Restore refused')
    expect(screen.queryByText('Restored Bandages')).not.toBeInTheDocument()
  })

  it('confirms a restore with a snackbar', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    render(<SnackbarHost />)
    renderWith([], [medicine], [pharmacy])
    scan()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deleted Item' })).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByText('Restored Bandages')).toBeInTheDocument()
  })

  it('keeps the offer open and says why when Yes is pressed before the Categories and Shops have loaded', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    watchItems.mockImplementation((_db: unknown, cb: (items: ItemRecord[]) => void) => {
      cb([])
      return vi.fn()
    })
    watchCategories.mockReturnValue(vi.fn())
    watchShops.mockReturnValue(vi.fn())
    render(
      <TopAppBar title="Shopping list">
        <ShoppingList db={fakeDb} />
        <SnackbarHost />
      </TopAppBar>,
    )
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByText('Categories and Shops are still loading, try again in a moment')).toBeInTheDocument()
    expect(offer).toHaveAttribute('open')
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('opens the Item dialog on Yes when only the deleted Item\'s Shop is gone', async () => {
    findDeletedItemByBarcode.mockResolvedValue({ ...bandages, shopId: pharmacy.id })
    renderWith([], [medicine], [grocery])
    scan()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deleted Item' })).getByRole('button', { name: 'Yes' }))

    expect(await screen.findByRole('dialog', { name: 'Restore Item' })).toBeInTheDocument()
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('ticks a live Item holding the barcode without looking for a deleted one', async () => {
    renderWith([bandages], [medicine], [pharmacy])
    scan()

    await waitFor(() => expect(setItemState).toHaveBeenCalled())
    expect(findDeletedItemByBarcode).not.toHaveBeenCalled()
  })

  it('leaves the Item deleted on No and opens the unknown-barcode chooser', async () => {
    findDeletedItemByBarcode.mockResolvedValue(bandages)
    renderWith([], [medicine], [pharmacy])
    scan()
    const offer = await screen.findByRole('dialog', { name: 'Deleted Item' })

    fireEvent.click(within(offer).getByRole('button', { name: 'No' }))

    expect(await screen.findByRole('dialog', { name: 'Unknown barcode' })).toHaveTextContent(scanned)
    expect(restoreItem).not.toHaveBeenCalled()
  })

  it('preselects enough as the State of a New Item created from the chooser, and marks nothing', async () => {
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'New Item' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Item' })

    expect(within(dialog).getByLabelText('State')).toHaveValue('enough')
    expect(setItemState).not.toHaveBeenCalled()

    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Plasters' } })
    choose(within(dialog).getByLabelText('Category'), medicine.id)
    choose(within(dialog).getByLabelText('Necessity'), 'essential')
    choose(within(dialog).getByLabelText('State'), 'out')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createItem).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ state: 'out' })))
  })

  it('marks nothing when the chooser is cancelled', async () => {
    renderWith([{ ...bandages, barcodes: undefined }], [medicine], [pharmacy])
    scan()
    const chooser = await screen.findByRole('dialog', { name: 'Unknown barcode' })

    fireEvent.click(within(chooser).getByRole('button', { name: 'Cancel' }))

    expect(attachBarcode).not.toHaveBeenCalled()
    expect(setItemState).not.toHaveBeenCalled()
  })
})
