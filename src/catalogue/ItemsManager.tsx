import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { attachBarcode, createItem, findBarcodeHolders, findDeletedItemByBarcode, softDeleteItem, itemsWithBarcode, matchesName, isLiveReference, resolvedShopId, restoreItem, restoreItemWithEdit, setItemState, updateItem, watchItems, type ItemRecord } from './items.ts'
import { createCategory, watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { RestoreDeletedItemOffer } from '../scan/RestoreDeletedItemOffer.tsx'
import { UnknownBarcodeChooser } from '../scan/UnknownBarcodeChooser.tsx'
import { getCollapsedGroups, saveCollapsedGroups, UNCATEGORISED, type GroupKey } from './collapsedCategories.ts'
import { watchShops, type ShopRecord } from './shops.ts'
import type { CategoryAndShop } from '../ui/route.ts'
import { navigateToItems } from '../ui/useRoute.ts'
import { ItemDialog } from './ItemDialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { SegmentedButton } from '../ui/SegmentedButton.tsx'
import { TextField } from '../ui/TextField.tsx'
import { Chip } from '../ui/Chip.tsx'
import { FilterChip } from '../ui/FilterChip.tsx'
import AddIcon from '~icons/material-symbols/add'
import ExpandMoreIcon from '~icons/material-symbols/expand-more'
import { Icon } from '../ui/Icon.tsx'
import './ItemsManager.css'

export interface ItemsManagerProps {
  db: Firestore
  /** Show only the Items with these ids; unknown ids are ignored. Every Item when empty or omitted. */
  itemIds?: readonly core.ItemId[]
  /** Called when the chip naming the id filter is dismissed, with the Category and Shop filters that are live, to be kept. */
  onClearFilter?: (filter: CategoryAndShop) => void
  /**
   * Show only the Items in this Category and sold at this Shop (the Item's own or else its Category's); each is
   * ignored once no live Category or Shop has the id.
   */
  filter?: CategoryAndShop
  /** Called with the Category and Shop filters a pressed chip asks for; undefined clears one. */
  onFilterChange?: (filter: CategoryAndShop) => void
}

/** `current` cleared when it is `id`, else `id`: what pressing a chip of a one-at-a-time group selects. */
function toggledSelection<Id extends string>(current: Id | undefined, id: Id): Id | undefined {
  return current === id ? undefined : id
}

export function ItemsManager({ db, itemIds = [], onClearFilter, filter, onFilterChange }: ItemsManagerProps) {
  const { categoryId, shopId } = filter ?? { categoryId: undefined, shopId: undefined }
  const [items, setItems] = useState<ItemRecord[] | undefined>(undefined)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  // Undo outlives the render that deleted the Item, so it reads the Categories and Shops as they are when it is pressed.
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const shopsRef = useRef(shops)
  shopsRef.current = shops
  /**
   * `null` while the Item dialog is closed; otherwise editing `item`, restoring the deleted `item` with a live
   * Category and Shop, or adding an Item that may carry `barcode`.
   */
  const [dialog, setDialog] = useState<
    | { kind: 'edit'; item: ItemRecord }
    | { kind: 'restore'; item: ItemRecord }
    | { kind: 'add'; barcode?: core.Barcode; barcodeFrom?: readonly Pick<ItemRecord, 'id' | 'name'>[] }
    | null
  >(null)
  /** Whether `watchCategories` and `watchShops` have delivered, so a missing Category or Shop means deleted, not not-yet-loaded. */
  const [listsLoaded, setListsLoaded] = useState({ categories: false, shops: false })
  const listsLoadedRef = useRef(listsLoaded)
  listsLoadedRef.current = listsLoaded
  const [error, setError] = useState<string | null>(null)
  /** Set by a scan made before the Items arrived; shown only while they are still loading. */
  const [scanWaiting, setScanWaiting] = useState(false)
  const [search, setSearch] = useState('')
  /** The groups collapsed on this device, remembered across reloads. */
  const [collapsedGroups, setCollapsedGroups] = useState(getCollapsedGroups)
  /** The scanned Barcode no Item carries, while the Member is choosing what to do with it. */
  const [unknownBarcode, setUnknownBarcode] = useState<core.Barcode | undefined>(undefined)

  /** The Items the unknown Barcode still sits on, a deleted Item among them; empty when none. */
  const [barcodeHolders, setBarcodeHolders] = useState<Pick<ItemRecord, 'id' | 'name'>[]>([])

  /** The deleted Item a scanned Barcode belongs to, and that Barcode, while the Member is deciding whether to bring it back. */
  const [deletedMatch, setDeletedMatch] = useState<{ item: ItemRecord; barcode: core.Barcode } | undefined>(undefined)

  /** The Item just created from a scan or restored through the Item dialog, whose filter opens once the dialog has closed. */
  const filterOnClose = useRef<core.ItemId | undefined>(undefined)

  // A layout effect, so it runs after the closed dialog's cleanup has issued its history pop in the same commit: the filter's
  // push then waits for that pop rather than landing on top of the dialog's entry.
  useLayoutEffect(() => {
    if (dialog !== null || filterOnClose.current === undefined) return
    const id = filterOnClose.current
    filterOnClose.current = undefined
    navigateToItems([id])
  }, [dialog])

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(
    () =>
      watchCategories(db, (records) => {
        setCategories(records)
        setListsLoaded((current) => ({ ...current, categories: true }))
      }),
    [db],
  )
  useEffect(
    () =>
      watchShops(db, (records) => {
        setShops(records)
        setListsLoaded((current) => ({ ...current, shops: true }))
      }),
    [db],
  )

  async function handleScan(barcode: core.Barcode) {
    if (items === undefined) {
      setScanWaiting(true)
      return
    }
    setError(null)
    const found = itemsWithBarcode(items, barcode)
    if (found.length > 0) return navigateToItems(found.map((item) => item.id))
    try {
      const deleted = await findDeletedItemByBarcode(db, barcode)
      if (deleted === undefined) await openChooser(barcode)
      else setDeletedMatch({ item: deleted, barcode })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
  }

  async function openChooser(barcode: core.Barcode) {
    setBarcodeHolders(await findBarcodeHolders(db, items ?? [], barcode))
    setUnknownBarcode(barcode)
  }

  async function handleRestore(item: ItemRecord) {
    // Until both lists have loaded, a Category or Shop cannot be told from a deleted one; the offer stays open.
    if (!listsLoaded.categories || !listsLoaded.shops) return
    setDeletedMatch(undefined)
    if (!isLiveReference(categories, item.categoryId) || !isLiveReference(shops, item.shopId)) {
      return setDialog({ kind: 'restore', item })
    }
    await restoreItem(db, item, categories, shops)
    navigateToItems([item.id])
  }

  async function handleDeclineRestore() {
    if (deletedMatch === undefined) return
    const { barcode } = deletedMatch
    setDeletedMatch(undefined)
    await openChooser(barcode)
  }

  async function handleAttach(item: ItemRecord, from: readonly Pick<ItemRecord, 'id' | 'name'>[]) {
    if (unknownBarcode === undefined) return
    await attachBarcode(db, item, unknownBarcode, from)
    setUnknownBarcode(undefined)
    showSnackbar({ text: `Added barcode to ${item.name}` })
    navigateToItems([item.id])
  }

  function toggleGroup(key: GroupKey) {
    const next = new Set(collapsedGroups)
    if (!next.delete(key)) next.add(key)
    saveCollapsedGroups(next)
    setCollapsedGroups(next)
  }

  function openDialog(item: ItemRecord | undefined) {
    setDialog(item ? { kind: 'edit', item } : { kind: 'add' })
  }

  async function handleSetState(item: ItemRecord, state: core.State) {
    try {
      await setItemState(db, item, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  function handleDelete(item: ItemRecord) {
    void softDeleteItem(db, item)
    showSnackbar({ text: `Deleted ${item.name}`, action: { label: 'Undo', onAction: () => void undoDelete(item) } })
  }

  function undoDelete(item: ItemRecord) {
    // Until both lists have loaded, a Category or Shop cannot be told from a deleted one, so nothing is refused.
    const loaded = listsLoadedRef.current.categories && listsLoadedRef.current.shops
    return restoreItem(
      db,
      item,
      loaded ? categoriesRef.current : [{ id: item.categoryId }],
      loaded || item.shopId === undefined ? shopsRef.current : [{ id: item.shopId }],
    )
  }

  // The Item may have changed elsewhere since the dialog opened; the dialog and its save work from the current record.
  const pendingBarcode = dialog?.kind === 'add' ? dialog.barcode : undefined
  const editedItem =
    dialog !== null && dialog.kind !== 'add'
      ? (items?.find((item) => item.id === dialog.item.id) ?? dialog.item)
      : undefined

  const scanFiltered = itemIds.length > 0
  const candidateItems = (items ?? []).filter((item) => !scanFiltered || itemIds.includes(item.id))
  const scannedLabel =
    candidateItems.length === 0
      ? 'no Items'
      : candidateItems.length === 1
        ? candidateItems[0]!.name
        : `${candidateItems.length} Items`
  // Until a list has loaded, its id is taken at its word; afterwards one that names nothing live filters nothing.
  const activeCategoryId = !listsLoaded.categories || isLiveReference(categories, categoryId) ? categoryId : undefined
  const activeShopId = !listsLoaded.shops || isLiveReference(shops, shopId) ? shopId : undefined
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const chipFiltered = activeCategoryId !== undefined || activeShopId !== undefined
  const visibleItems = (scanFiltered ? candidateItems : candidateItems.filter((item) => matchesName(item, search))).filter(
    (item) =>
      (activeCategoryId === undefined || item.categoryId === activeCategoryId) &&
      // An Item's Shop may come from its Category, so the Shop filter waits for the Categories rather than hide those Items.
      (activeShopId === undefined ||
        !listsLoaded.categories ||
        resolvedShopId(item, categoriesById.get(item.categoryId)) === activeShopId),
  )
  // A search, scan or chip filter shows its matches whatever was collapsed; the remembered state is left alone for when it clears.
  const filterActive = scanFiltered || search !== '' || chipFiltered
  const groupToggle = (key: GroupKey) => ({
    collapsed: !filterActive && collapsedGroups.has(key),
    toggleDisabled: filterActive,
    onToggle: () => toggleGroup(key),
  })
  const groups = categories
    .map((category) => ({ category, items: visibleItems.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)
  const uncategorisedItems = visibleItems.filter(
    (item) => !categories.some((category) => category.id === item.categoryId),
  )

  return (
    <section class="items-manager">
      <ScanEntry onScan={(barcode) => void handleScan(barcode)} />
      {error !== null && <p role="alert">{error}</p>}
      {scanWaiting && items === undefined && <p role="status">Items are still loading, scan again in a moment</p>}
      {!scanFiltered ? (
        <TextField type="search" label="Search Items" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
      ) : (
        items !== undefined && (
          <Chip label={`Scanned: ${scannedLabel}`} dismissLabel="Clear scanned filter" onDismiss={() => onClearFilter?.({ categoryId: activeCategoryId, shopId: activeShopId })} />
        )
      )}
      <div role="group" aria-label="Filter by Category" class="items-manager__chips">
        {categories.map((category) => (
          <FilterChip
            key={category.id}
            label={category.name}
            selected={category.id === activeCategoryId}
            onToggle={() => onFilterChange?.({ categoryId: toggledSelection(activeCategoryId, category.id), shopId: activeShopId })}
          />
        ))}
      </div>
      <div role="group" aria-label="Filter by Shop" class="items-manager__chips">
        {shops.map((shop) => (
          <FilterChip
            key={shop.id}
            label={shop.name}
            selected={shop.id === activeShopId}
            onToggle={() => onFilterChange?.({ categoryId: activeCategoryId, shopId: toggledSelection(activeShopId, shop.id) })}
          />
        ))}
      </div>
      {items !== undefined && visibleItems.length === 0 && (
        <p>
          {items.length === 0
            ? 'No Items yet.'
            : chipFiltered
              ? 'No Items match your filters.'
              : scanFiltered
                ? 'No scanned Items found.'
                : 'No Items match your search.'}
        </p>
      )}
      {groups.map(({ category, items: categoryItems }) => (
        <ItemGroup key={category.id} heading={category.name} {...groupToggle(category.id)} items={categoryItems} onSetState={handleSetState} onOpen={openDialog} />
      ))}
      {uncategorisedItems.length > 0 && (
        <ItemGroup heading="Uncategorised" {...groupToggle(UNCATEGORISED)} items={uncategorisedItems} onSetState={handleSetState} onOpen={openDialog} />
      )}
      <RestoreDeletedItemOffer item={deletedMatch?.item} onRestore={(item) => void handleRestore(item)} onDecline={() => void handleDeclineRestore()} />
      <UnknownBarcodeChooser
        barcode={unknownBarcode}
        items={items ?? []}
        holders={barcodeHolders}
        onAttach={(item, from) => void handleAttach(item, from)}
        onNewItem={(from) => {
          setDialog({ kind: 'add', barcode: unknownBarcode, barcodeFrom: from })
          setUnknownBarcode(undefined)
        }}
        onClose={() => setUnknownBarcode(undefined)}
      />
      <Fab symbol={AddIcon} label="Add Item" onClick={() => openDialog(undefined)} />
      <ItemDialog
        open={dialog !== null}
        item={editedItem}
        restoring={dialog?.kind === 'restore'}
        barcode={pendingBarcode}
        categories={categories}
        shops={shops}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onSave={async (input) => {
          if (dialog?.kind === 'restore' && editedItem) {
            await restoreItemWithEdit(db, editedItem, input)
            filterOnClose.current = editedItem.id
            return
          }
          if (input.state !== undefined) {
            const id = await createItem(db, { ...input, barcode: pendingBarcode, barcodeFrom: dialog?.kind === 'add' ? dialog.barcodeFrom : undefined })
            if (pendingBarcode !== undefined) filterOnClose.current = id
            return
          }
          if (!editedItem) return
          // Its reference counts move from the current record.
          await updateItem(db, editedItem, input, categories)
        }}
        onDelete={dialog?.kind === 'restore' ? undefined : handleDelete}
        onClose={() => setDialog(null)}
      />
    </section>
  )
}

interface ItemGroupProps {
  heading: string
  collapsed: boolean
  /** True while a search or scan filter is showing its matches, when collapsing would change nothing. */
  toggleDisabled: boolean
  onToggle: () => void
  items: ItemRecord[]
  onSetState: (item: ItemRecord, state: core.State) => Promise<void>
  onOpen: (item: ItemRecord) => void
}

/** The heading of a collapsed group, followed by how many of its Items are running low or out; unchanged when none are. */
function collapsedHeading(heading: string, items: ItemRecord[]): string {
  const counts = (['running low', 'out'] as const).map((state) => ({
    label: state,
    count: items.filter((item) => item.state === state).length,
  }))
  const summary = counts.filter(({ count }) => count > 0).map(({ count, label }) => `${count} ${label}`).join(', ')
  return summary === '' ? heading : `${heading} · ${summary}`
}

function ItemGroup({ heading, collapsed, toggleDisabled, onToggle, items, onSetState, onOpen }: ItemGroupProps) {
  return (
    <div>
      <h3 class="item-group__heading">
        <button type="button" class="item-group__toggle" aria-expanded={!collapsed} disabled={toggleDisabled} onClick={onToggle}>
          <Icon symbol={ExpandMoreIcon} />
          {collapsed ? collapsedHeading(heading, items) : heading}
        </button>
      </h3>
      {!collapsed && (
        <ul>
          {items.map((item) => (
            <ListRow
              key={item.id}
              headline={item.name}
              supporting={[item.brandNote, item.necessity].filter((part) => part !== undefined).join(' · ')}
              stackTrailing
              onActivate={() => onOpen(item)}
              trailing={
                <SegmentedButton
                  label={`State for ${item.name}`}
                  options={core.stateSchema.options.map((state) => ({ value: state, label: state }))}
                  value={item.state}
                  onChange={(state) => {
                    if (state !== item.state) void onSetState(item, state)
                  }}
                />
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
