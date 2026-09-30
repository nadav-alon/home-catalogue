import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { attachBarcode, createItem, findDeletedItemByBarcode, softDeleteItem, itemsWithBarcode, matchesName, isLiveReference, restoreItem, restoreItemWithEdit, setItemState, updateItem, watchItems, type ItemRecord } from './items.ts'
import { createCategory, watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { RestoreDeletedItemOffer } from '../scan/RestoreDeletedItemOffer.tsx'
import { UnknownBarcodeChooser } from '../scan/UnknownBarcodeChooser.tsx'
import { watchShops, type ShopRecord } from './shops.ts'
import { navigateToItems } from '../ui/useRoute.ts'
import { ItemDialog } from './ItemDialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { SegmentedButton } from '../ui/SegmentedButton.tsx'
import { TextField } from '../ui/TextField.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import AddIcon from '~icons/material-symbols/add'
import CloseIcon from '~icons/material-symbols/close'
import './ItemsManager.css'

export interface ItemsManagerProps {
  db: Firestore
  /** Show only the Items with these ids; unknown ids are ignored. Every Item when empty or omitted. */
  itemIds?: readonly core.ItemId[]
  /** Called when the chip naming the id filter is dismissed. */
  onClearFilter?: () => void
}

export function ItemsManager({ db, itemIds = [], onClearFilter }: ItemsManagerProps) {
  const [items, setItems] = useState<ItemRecord[] | undefined>(undefined)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  /**
   * `null` while the Item dialog is closed; otherwise editing `item`, restoring the deleted `item` with a live
   * Category and Shop, or adding an Item that may carry `barcode`.
   */
  const [dialog, setDialog] = useState<
    | { kind: 'edit'; item: ItemRecord }
    | { kind: 'restore'; item: ItemRecord }
    | { kind: 'add'; barcode?: core.Barcode }
    | null
  >(null)
  /** Whether `watchCategories` and `watchShops` have delivered, so a missing Category or Shop means deleted, not not-yet-loaded. */
  const [listsLoaded, setListsLoaded] = useState({ categories: false, shops: false })
  const [error, setError] = useState<string | null>(null)
  /** Set by a scan made before the Items arrived; shown only while they are still loading. */
  const [scanWaiting, setScanWaiting] = useState(false)
  const [search, setSearch] = useState('')
  /** The scanned Barcode no Item carries, while the Member is choosing what to do with it. */
  const [unknownBarcode, setUnknownBarcode] = useState<core.Barcode | undefined>(undefined)

  /** The deleted Item a scanned Barcode belongs to, and that Barcode, while the Member is deciding whether to bring it back. */
  const [deletedMatch, setDeletedMatch] = useState<{ item: ItemRecord; barcode: core.Barcode } | undefined>(undefined)

  /** The Item just created from a scan, whose scanned filter opens once the Item dialog has closed. */
  const createdFromScan = useRef<core.ItemId | undefined>(undefined)

  // A layout effect, so it runs after the closed dialog's cleanup has issued its history pop in the same commit: the filter's
  // push then waits for that pop rather than landing on top of the dialog's entry.
  useLayoutEffect(() => {
    if (dialog !== null || createdFromScan.current === undefined) return
    const id = createdFromScan.current
    createdFromScan.current = undefined
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
      if (deleted === undefined) setUnknownBarcode(barcode)
      else setDeletedMatch({ item: deleted, barcode })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
  }

  async function handleRestore(item: ItemRecord) {
    // Until both lists have loaded, a Category or Shop cannot be told from a deleted one; the offer stays open.
    if (!listsLoaded.categories || !listsLoaded.shops) return
    setDeletedMatch(undefined)
    if (!isLiveReference(categories, item.categoryId) || !isLiveReference(shops, item.shopId)) {
      return setDialog({ kind: 'restore', item })
    }
    await restoreItem(db, item)
    navigateToItems([item.id])
  }

  function handleDeclineRestore() {
    if (deletedMatch === undefined) return
    setUnknownBarcode(deletedMatch.barcode)
    setDeletedMatch(undefined)
  }

  async function handleAttach(item: ItemRecord) {
    if (unknownBarcode === undefined) return
    await attachBarcode(db, item, unknownBarcode)
    setUnknownBarcode(undefined)
    // The chooser's Dialog issues its history pop when the render that closes it commits; navigating before that
    // would push the filter on top of the chooser's entry.
    await Promise.resolve()
    navigateToItems([item.id])
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
    showSnackbar({ text: `Deleted ${item.name}`, action: { label: 'Undo', onAction: () => void restoreItem(db, item) } })
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
  const visibleItems = scanFiltered
    ? candidateItems
    : candidateItems.filter((item) => matchesName(item, search))
  const groups = categories
    .map((category) => ({ category, items: visibleItems.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)
  const uncategorisedItems = visibleItems.filter(
    (item) => !categories.some((category) => category.id === item.categoryId),
  )

  return (
    <section class="items-manager">
      <h2>Items</h2>
      <ScanEntry onScan={(barcode) => void handleScan(barcode)} />
      {error !== null && <p role="alert">{error}</p>}
      {scanWaiting && items === undefined && <p role="status">Items are still loading, scan again in a moment</p>}
      {!scanFiltered ? (
        <TextField type="search" label="Search Items" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
      ) : (
        items !== undefined && (
          <span>
            Scanned: {scannedLabel}
            <IconButton symbol={CloseIcon} label="Clear scanned filter" onClick={onClearFilter} />
          </span>
        )
      )}
      {items !== undefined && visibleItems.length === 0 && (
        <p>
          {items.length === 0 ? 'No Items yet.' : scanFiltered ? 'No scanned Items found.' : 'No Items match your search.'}
        </p>
      )}
      {groups.map(({ category, items: categoryItems }) => (
        <ItemGroup key={category.id} heading={category.name} items={categoryItems} onSetState={handleSetState} onOpen={openDialog} />
      ))}
      {uncategorisedItems.length > 0 && (
        <ItemGroup heading="Uncategorised" items={uncategorisedItems} onSetState={handleSetState} onOpen={openDialog} />
      )}
      <RestoreDeletedItemOffer item={deletedMatch?.item} onRestore={(item) => void handleRestore(item)} onDecline={handleDeclineRestore} />
      <UnknownBarcodeChooser
        barcode={unknownBarcode}
        items={items ?? []}
        onAttach={(item) => void handleAttach(item)}
        onNewItem={() => {
          setDialog({ kind: 'add', barcode: unknownBarcode })
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
            navigateToItems([editedItem.id])
            return
          }
          if (!editedItem) {
            const id = await createItem(db, { ...input, barcode: pendingBarcode })
            if (pendingBarcode !== undefined) createdFromScan.current = id
            return
          }
          // Its reference counts move from the current record.
          await updateItem(db, editedItem, input)
        }}
        onDelete={dialog?.kind === 'restore' ? undefined : handleDelete}
        onClose={() => setDialog(null)}
      />
    </section>
  )
}

interface ItemGroupProps {
  heading: string
  items: ItemRecord[]
  onSetState: (item: ItemRecord, state: core.State) => Promise<void>
  onOpen: (item: ItemRecord) => void
}

function ItemGroup({ heading, items, onSetState, onOpen }: ItemGroupProps) {
  return (
    <div>
      <h3>{heading}</h3>
      <ul>
        {items.map((item) => (
          <ListRow
            key={item.id}
            headline={item.name}
            supporting={[item.brandNote, item.necessity].filter((part) => part !== undefined).join(' · ')}
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
    </div>
  )
}
