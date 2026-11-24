import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core, recipes as recipesApi } from 'data-platform'
import { ShoppingList } from './ShoppingList.tsx'
import { choose } from '../testing/select.ts'
import { TopAppBar } from 'household-ui/shell/TopAppBar.tsx'
import { SnackbarHost, resetSnackbar } from 'household-ui/ui/Snackbar.tsx'
import type { ItemRecord } from './items.ts'
import type { CategoryRecord } from './categories.ts'
import type { ShopRecord } from './shops.ts'
import type { AisleRecord } from './aisles.ts'
import type { StoreRecord } from './stores.ts'
import type { TagRecord } from './tags.ts'
import { fakeRecipes, type FakeRecipes } from './recipesFake.ts'
import type { RecipeRecord } from './recipes.ts'
import { bandages, cleaning, grocery, medicine, pharmacy } from './testFixtures.ts'

const exportShoppingList = vi.fn()
vi.mock('../export/exportShoppingList.ts', () => ({
  exportShoppingList: (groups: unknown, date: unknown) => exportShoppingList(groups, date),
}))
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

const watchAisles = vi.fn()
const createAisle = vi.fn()
vi.mock('./aisles.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./aisles.ts')>()),
  watchAisles: (db: unknown, cb: unknown) => watchAisles(db, cb),
  createAisle: (db: unknown, name: unknown) => createAisle(db, name),
}))

const watchStores = vi.fn()
vi.mock('./stores.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stores.ts')>()),
  watchStores: (db: unknown, cb: unknown) => watchStores(db, cb),
}))

const watchTags = vi.fn()
const createTag = vi.fn()
vi.mock('./tags.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tags.ts')>()),
  watchTags: (db: unknown, cb: unknown) => watchTags(db, cb),
  createTag: (db: unknown, name: unknown) => createTag(db, name),
}))

const watchRecipeIngredientShop = vi.fn()
const setIngredientBought = vi.fn()
vi.mock('data-platform/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('data-platform/client')>()),
  watchRecipeIngredientShop: (...args: unknown[]) => watchRecipeIngredientShop(...args),
  setIngredientBought: (...args: unknown[]) => setIngredientBought(...args),
}))

let recipes: FakeRecipes

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  recipes = fakeRecipes()
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
  watchAisles.mockReset().mockImplementation((_db: unknown, cb: (aisles: AisleRecord[]) => void) => {
    cb([])
    return vi.fn()
  })
  createAisle.mockReset()
  watchStores.mockReset().mockImplementation((_db: unknown, cb: (stores: StoreRecord[]) => void) => {
    cb([])
    return vi.fn()
  })
  watchRecipeIngredientShop.mockReset().mockImplementation((_db: unknown, cb: (shopId: catalogue.ShopId | undefined) => void) => {
    cb(undefined)
    return vi.fn()
  })
  setIngredientBought.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
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
      <ShoppingList db={fakeDb} watchRecipes={recipes.watch} />
    </TopAppBar>,
  )
}

function wantedRecipeNeeding(itemId: string, wanted = true): RecipeRecord {
  return {
    id: recipesApi.recipeId('party'),
    title: 'Party',
    ingredients: [{ name: 'Candles', itemId: core.itemId(itemId) }],
    prepSteps: [],
    steps: [],
    ...(wanted ? { wanted: true } : {}),
  }
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
    render(<ShoppingList db={fakeDb} watchRecipes={recipes.watch} />)

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

  it('flags a running low Item whose Necessity is optional, needed by a Wanted Recipe, as running low only', () => {
    recipes = fakeRecipes([wantedRecipeNeeding('candles')])
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
    render(<ShoppingList db={fakeDb} watchRecipes={recipes.watch} />)

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
      render(<ShoppingList db={fakeDb} watchRecipes={recipes.watch} />)
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

  it('sets a needed optional Item enough by its Barcode, with an Undo that restores its State', async () => {
    render(<SnackbarHost />)
    const optional: ItemRecord = { ...bandages, necessity: 'optional' }
    recipes = fakeRecipes([wantedRecipeNeeding('bandages')])
    renderWith([optional], [medicine], [pharmacy])

    scan()

    await waitFor(() => expect(setItemState).toHaveBeenCalledWith(fakeDb, optional, 'enough'))
    setItemState.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(setItemState).toHaveBeenCalledWith(fakeDb, optional, 'out')
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
        <ShoppingList db={fakeDb} watchRecipes={recipes.watch} />
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
        <ShoppingList db={fakeDb} watchRecipes={recipes.watch} />
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

describe('ShoppingList sorted by aisle', () => {
  const aisleA = catalogue.aisleId('a')
  const aisleB = catalogue.aisleId('b')
  const osher: StoreRecord = { id: catalogue.storeId('osher'), name: 'Osher Ad', shopId: grocery.id, aisleOrder: [aisleB, aisleA] }
  const shufersal: StoreRecord = { id: catalogue.storeId('shufersal'), name: 'Shufersal', shopId: grocery.id, aisleOrder: [aisleA, aisleB] }
  const rice: ItemRecord = { ...bandages, id: core.itemId('rice'), name: 'Rice', state: 'out', categoryId: cleaning.id, aisleId: aisleA }
  const milk: ItemRecord = { ...bandages, id: core.itemId('milk'), name: 'Milk', state: 'out', categoryId: cleaning.id, aisleId: aisleB }
  const soap: ItemRecord = { ...bandages, id: core.itemId('soap'), name: 'Soap', state: 'out', categoryId: cleaning.id }

  function withStores(stores: StoreRecord[]) {
    watchAisles.mockImplementation((_db: unknown, cb: (aisles: AisleRecord[]) => void) => {
      cb([aisleA, aisleB].map((id) => ({ id, name: id }) as AisleRecord))
      return vi.fn()
    })
    watchStores.mockImplementation((_db: unknown, cb: (stores: StoreRecord[]) => void) => {
      cb(stores)
      return vi.fn()
    })
  }

  function rowNames() {
    return screen.getAllByRole('checkbox').slice(1).map((box) => box.closest('li')?.textContent)
  }

  it('keeps name order with no Store dropdown while the toggle is off', () => {
    withStores([osher, shufersal])
    renderWith([milk, rice, soap], [cleaning], [grocery])

    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap'])
    expect(screen.queryByLabelText('Store')).toBeNull()
  })

  it("follows a Shop's only Store silently, unassigned Items last", () => {
    withStores([osher])
    renderWith([milk, rice, soap], [cleaning], [grocery])

    fireEvent.click(screen.getByLabelText('Sort by aisle'))

    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap'])
    expect(screen.queryByLabelText('Store')).toBeNull()
  })

  it('offers a Store dropdown for a Shop with two, re-sorts on switching, and remembers the choice', () => {
    withStores([osher, shufersal])
    const view = renderWith([milk, rice, soap], [cleaning], [grocery])
    fireEvent.click(screen.getByLabelText('Sort by aisle'))
    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap'])

    choose(screen.getByLabelText('Store'), shufersal.id)
    expect(rowNames()).toEqual(['Rice', 'Milk', 'Soap'])

    view.unmount()
    renderWith([milk, rice, soap], [cleaning], [grocery])
    expect(screen.getByLabelText('Sort by aisle')).toBeChecked()
    expect(rowNames()).toEqual(['Rice', 'Milk', 'Soap'])
  })

  it('keeps name order for a Shop with no Store', () => {
    renderWith([soap, rice, milk], [cleaning], [grocery])

    fireEvent.click(screen.getByLabelText('Sort by aisle'))

    expect(rowNames()).toEqual(['Soap', 'Rice', 'Milk'])
  })
})

describe('ShoppingList optional Items', () => {
  const candles: ItemRecord = {
    id: core.itemId('candles'),
    name: 'Candles',
    state: 'out',
    categoryId: cleaning.id,
    necessity: 'optional',
    tagIds: [],
  }

  it('omits an optional Item no Wanted Recipe needs', () => {
    recipes = fakeRecipes([wantedRecipeNeeding('other'), wantedRecipeNeeding('candles', false)])
    renderWith([candles], [cleaning], [grocery])

    expect(screen.queryByText('Candles')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing to buy — every Item is enough.')).toBeInTheDocument()
  })

  it('lists it once a Recipe linking it becomes Wanted, and drops it when that Recipe stops being Wanted', () => {
    renderWith([candles], [cleaning], [grocery])
    expect(screen.queryByText('Candles')).not.toBeInTheDocument()

    act(() => recipes.set([wantedRecipeNeeding('candles')]))
    expect(screen.getByText('Candles')).toBeInTheDocument()

    act(() => recipes.set([wantedRecipeNeeding('candles', false)]))
    expect(screen.queryByText('Candles')).not.toBeInTheDocument()
  })

  it('keeps it while another Wanted Recipe still needs it', () => {
    const other = { ...wantedRecipeNeeding('candles'), id: recipesApi.recipeId('dinner') }
    renderWith([candles], [cleaning], [grocery])
    act(() => recipes.set([wantedRecipeNeeding('candles'), other]))
    act(() => recipes.set([wantedRecipeNeeding('candles', false), other]))
    expect(screen.getByText('Candles')).toBeInTheDocument()
  })

  it('does not claim there is nothing to buy while the Recipes are still loading', () => {
    recipes = { watch: () => vi.fn(), set: vi.fn() }
    renderWith([candles], [cleaning], [grocery])

    expect(screen.queryByText('Nothing to buy — every Item is enough.')).not.toBeInTheDocument()
  })

  it('ticks a needed optional Item enough like any other', () => {
    recipes = fakeRecipes([wantedRecipeNeeding('candles')])
    renderWith([candles], [cleaning], [grocery])

    fireEvent.click(within(screen.getByText('Candles').closest('li')!).getByRole('checkbox'))
    expect(setItemState).toHaveBeenCalledWith(fakeDb, candles, 'enough')
  })
})

describe('ShoppingList Recipe chips', () => {
  const flour: ItemRecord = { ...bandages, id: core.itemId('flour'), name: 'Flour', state: 'out', categoryId: cleaning.id }
  const salt: ItemRecord = { ...flour, id: core.itemId('salt'), name: 'Salt' }

  function recipeNeeding(title: string, itemId: core.ItemId, wanted = true): RecipeRecord {
    return {
      id: recipesApi.recipeId(title.toLowerCase()),
      title,
      ingredients: [{ name: 'Ingredient', itemId }],
      prepSteps: [],
      steps: [],
      ...(wanted ? { wanted: true } : {}),
    }
  }

  const recipesNeeding = (itemId: core.ItemId, ...titles: string[]) => titles.map((title) => recipeNeeding(title, itemId))
  const chipsOf = (name: string) => [...screen.getByText(name).closest('li')!.querySelectorAll('.shopping-list__recipe-chip')].map((chip) => chip.textContent)

  it.each(['essential', 'important', 'optional'] as const)('shows "for <Recipe title>" on a row a Wanted Recipe needs, at %s Necessity', (necessity) => {
    const item = { ...flour, necessity }
    recipes = fakeRecipes([recipeNeeding('Bread', item.id)])
    renderWith([item], [cleaning], [grocery])

    expect(chipsOf('Flour')).toEqual(['for Bread'])
  })

  it('shows no chip on a row no Wanted Recipe needs, and keeps its place in the group', () => {
    recipes = fakeRecipes([recipeNeeding('Bread', flour.id), recipeNeeding('Soup', salt.id, false)])
    renderWith([flour, salt], [cleaning], [grocery])

    expect(chipsOf('Salt')).toEqual([])
    expect(screen.getAllByRole('listitem').map((row) => row.querySelector('.ui-list-row__headline')?.textContent)).toEqual(['Flour', 'Salt'])
  })

  it('shows one chip per Recipe when two need it', () => {
    recipes = fakeRecipes(recipesNeeding(flour.id, 'Bread', 'Pie'))
    renderWith([flour], [cleaning], [grocery])

    expect(chipsOf('Flour')).toEqual(['for Bread', 'for Pie'])
  })

  it('collapses to "for <A> +2" when three need it, counting the Recipes besides the first', () => {
    recipes = fakeRecipes(recipesNeeding(flour.id, 'Bread', 'Pie', 'Cake'))
    renderWith([flour], [cleaning], [grocery])

    expect(chipsOf('Flour')).toEqual(['for Bread +2'])
  })

  it('collapses to "for <A> +3" when four need it', () => {
    recipes = fakeRecipes(recipesNeeding(flour.id, 'Bread', 'Pie', 'Cake', 'Scones'))
    renderWith([flour], [cleaning], [grocery])

    expect(chipsOf('Flour')).toEqual(['for Bread +3'])
  })

  it('keeps a chip for each of two Recipes sharing a title', () => {
    recipes = fakeRecipes([{ ...recipeNeeding('Bread', flour.id), id: recipesApi.recipeId('a') }, { ...recipeNeeding('Bread', flour.id), id: recipesApi.recipeId('b') }])
    renderWith([flour], [cleaning], [grocery])

    expect(chipsOf('Flour')).toEqual(['for Bread', 'for Bread'])
  })

  it('keeps chipped rows in aisle order while Sort by aisle is on', () => {
    const aisleA = catalogue.aisleId('a')
    const aisleB = catalogue.aisleId('b')
    const store: StoreRecord = { id: catalogue.storeId('shufersal'), name: 'Shufersal', shopId: grocery.id, aisleOrder: [aisleA, aisleB] }
    watchAisles.mockImplementation((_db: unknown, cb: (aisles: AisleRecord[]) => void) => {
      cb([aisleA, aisleB].map((id) => ({ id, name: id }) as AisleRecord))
      return vi.fn()
    })
    watchStores.mockImplementation((_db: unknown, cb: (stores: StoreRecord[]) => void) => {
      cb([store])
      return vi.fn()
    })
    const milk: ItemRecord = { ...flour, id: core.itemId('milk'), name: 'Milk', aisleId: aisleB }
    const rice: ItemRecord = { ...flour, id: core.itemId('rice'), name: 'Rice', aisleId: aisleA }
    recipes = fakeRecipes(recipesNeeding(milk.id, 'Bread'))
    renderWith([milk, rice], [cleaning], [grocery])

    fireEvent.click(screen.getByLabelText('Sort by aisle'))

    expect(screen.getAllByRole('listitem').map((row) => row.querySelector('.ui-list-row__headline')?.textContent)).toEqual(['Rice', 'Milk'])
    expect(chipsOf('Milk')).toEqual(['for Bread'])
    expect(chipsOf('Rice')).toEqual([])
  })
})

describe('ShoppingList Recipe rows', () => {
  afterEach(() => resetSnackbar())

  const sriracha = { name: 'Sriracha' }
  function recipeWith(ingredients: recipesApi.Recipe['ingredients'], id = 'noodles', wanted = true): RecipeRecord {
    return { id: recipesApi.recipeId(id), title: 'Noodles', ingredients, prepSteps: [], steps: [], ...(wanted ? { wanted: true } : {}) }
  }
  function rowNames() {
    return screen.queryAllByRole('listitem').map((row) => row.querySelector('.ui-list-row__headline')?.textContent)
  }

  it('shows an Unlinked Ingredient of a Wanted Recipe with its chip and no State flag, in a final "Not in the Catalogue" group when no Shop is set', () => {
    recipes = fakeRecipes([recipeWith([sriracha])])
    renderWith([], [], [])

    const group = screen.getByRole('heading', { name: 'Not in the Catalogue' }).parentElement!
    const row = within(group).getByRole('listitem')
    expect(row.querySelector('.ui-list-row__headline')?.textContent).toBe('Sriracha')
    expect(row.querySelector('.shopping-list__recipe-chip')?.textContent).toBe('for Noodles')
    expect(row.textContent).not.toMatch(/running low|out/)
    expect(screen.queryByText('Nothing to buy — every Item is enough.')).toBeNull()
  })

  it('puts them in the Shop for Recipe Ingredients\' group after its Items, and in a group of their own when no Item is pending there', () => {
    watchRecipeIngredientShop.mockImplementation((_db: unknown, cb: (shopId: catalogue.ShopId) => void) => {
      cb(grocery.id)
      return vi.fn()
    })
    const flour: ItemRecord = { id: core.itemId('flour'), name: 'Flour', state: 'out', categoryId: cleaning.id, shopId: grocery.id, necessity: 'essential', tagIds: [] }
    recipes = fakeRecipes([recipeWith([sriracha])])
    renderWith([flour], [cleaning], [pharmacy, grocery])

    expect(screen.queryByRole('heading', { name: 'Not in the Catalogue' })).toBeNull()
    expect(within(screen.getByRole('heading', { name: grocery.name }).parentElement!).getAllByRole('listitem').map((row) => row.querySelector('.ui-list-row__headline')?.textContent)).toEqual(['Flour', 'Sriracha'])
    expect(screen.queryByRole('heading', { name: pharmacy.name })).toBeNull()
  })

  it('ticking one marks it Bought through the client and Undo clears it', () => {
    recipes = fakeRecipes([recipeWith([{ name: 'Salt', assumed: true }, sriracha])])
    renderWith([], [], [])
    render(<SnackbarHost />)

    fireEvent.click(within(screen.getByText('Sriracha').closest('li')!).getByRole('checkbox'))

    expect(setIngredientBought).toHaveBeenCalledWith(fakeDb, 'noodles', 1, true)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(setIngredientBought).toHaveBeenLastCalledWith(fakeDb, 'noodles', 1, false)
  })

  it('lists no linked, Assumed or Bought Ingredient, and none of a Recipe that is not Wanted', () => {
    recipes = fakeRecipes([
      recipeWith([{ name: 'Candles', itemId: core.itemId('candles') }, { name: 'Salt', assumed: true }, { name: 'Honey', bought: true }]),
      recipeWith([sriracha], 'other', false),
    ])
    renderWith([], [], [])

    expect(rowNames()).toEqual([])
  })

  it('drops a ticked row once the Recipe comes back with it Bought', () => {
    recipes = fakeRecipes([recipeWith([sriracha])])
    renderWith([], [], [])

    fireEvent.click(within(screen.getByText('Sriracha').closest('li')!).getByRole('checkbox'))
    act(() => recipes.set([recipeWith([{ ...sriracha, bought: true }])]))

    expect(rowNames()).toEqual([])
  })

  it('does not clear Bought on another Ingredient when Undo is pressed after the Recipe\'s Ingredients moved', () => {
    recipes = fakeRecipes([recipeWith([sriracha])])
    renderWith([], [], [])
    render(<SnackbarHost />)

    fireEvent.click(within(screen.getByText('Sriracha').closest('li')!).getByRole('checkbox'))
    act(() => recipes.set([recipeWith([{ name: 'Salt', assumed: true }, { ...sriracha, bought: true }])]))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(setIngredientBought).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toMatch(/Could not undo/)
  })

  it('shows no "Not in the Catalogue" group until the Shop for Recipe Ingredients setting has loaded', () => {
    watchRecipeIngredientShop.mockImplementation(() => vi.fn())
    recipes = fakeRecipes([recipeWith([sriracha])])
    renderWith([], [], [])

    expect(screen.queryByRole('heading', { name: 'Not in the Catalogue' })).toBeNull()
  })
})

describe('ShoppingList filter by Recipe', () => {
  afterEach(() => resetSnackbar())

  const candles: ItemRecord = { id: core.itemId('candles'), name: 'Candles', state: 'out', categoryId: cleaning.id, shopId: grocery.id, necessity: 'essential', tagIds: [] }
  const soap: ItemRecord = { id: core.itemId('soap'), name: 'Soap', state: 'out', categoryId: cleaning.id, shopId: pharmacy.id, necessity: 'essential', tagIds: [] }
  const party: RecipeRecord = { ...wantedRecipeNeeding('candles'), ingredients: [{ name: 'Candles', itemId: candles.id }, { name: 'Sriracha' }] }
  const wash: RecipeRecord = { id: recipesApi.recipeId('wash'), title: 'Wash', ingredients: [{ name: 'Soap', itemId: soap.id }, { name: 'Rags' }], prepSteps: [], steps: [], wanted: true }
  const rowNames = () => screen.queryAllByRole('listitem').map((row) => row.querySelector('.ui-list-row__headline')?.textContent)

  const chooseRecipe = (title: string) =>
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by Recipe' })).getByRole('button', { name: title }))

  function renderFiltered() {
    watchRecipeIngredientShop.mockImplementation((_db: unknown, cb: (shopId: catalogue.ShopId) => void) => {
      cb(grocery.id)
      return vi.fn()
    })
    recipes = fakeRecipes([party, wash])
    renderWith([candles, soap], [cleaning], [grocery, pharmacy])
  }

  it('narrows each Shop group to the Recipe\'s linked Items and its own Recipe rows, hiding empty groups, and restores the list when cleared', () => {
    renderFiltered()
    expect(rowNames()).toEqual(['Candles', 'Sriracha', 'Rags', 'Soap'])

    chooseRecipe('Wash')
    expect(rowNames()).toEqual(['Rags', 'Soap'])
    expect(screen.queryByRole('heading', { name: grocery.name })).not.toBeNull()

    chooseRecipe('Wash')
    expect(rowNames()).toEqual(['Candles', 'Sriracha', 'Rags', 'Soap'])
  })

  it('still exports the Items the filter hides', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    exportShoppingList.mockResolvedValueOnce({ status: 'exported' })
    renderFiltered()
    chooseRecipe('Wash')

    fireEvent.click(screen.getByRole('button', { name: 'Export to Calendar' }))
    fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-03-05' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    })

    expect(exportShoppingList).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: grocery.name, items: [candles] })]),
      '2026-03-05',
    )
  })

  it('hides a Shop group the Recipe has nothing in', () => {
    renderFiltered()
    recipes.set([party, { ...wash, ingredients: [{ name: 'Soap', itemId: soap.id }] }])

    chooseRecipe('Wash')

    expect(screen.queryByRole('heading', { name: grocery.name })).toBeNull()
    expect(rowNames()).toEqual(['Soap'])
  })

  it('leaves the filter off when its Recipe is deleted', () => {
    renderFiltered()
    chooseRecipe('Wash')
    act(() => recipes.set([party]))

    expect(rowNames()).toEqual(['Candles', 'Sriracha', 'Soap'])
  })
})
