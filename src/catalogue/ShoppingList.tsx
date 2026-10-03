import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { core } from 'data-platform'
import { attachBarcode, createItem, findBarcodeHolders, findDeletedItemByBarcode, isLiveReference, itemsWithBarcode, restoreItem, restoreItemWithEdit, setItemState, watchItems, type BarcodeHolder, type CarriedBarcode, type ItemRecord } from './items.ts'
import { createCategory, watchCategories, type CategoryRecord } from './categories.ts'
import { createTag, watchTags, type TagRecord } from './tags.ts'
import { UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'
import { AlertBanner } from './AlertBanner.tsx'
import { ItemDialog } from './ItemDialog.tsx'
import { RestoreDeletedItemOffer } from '../scan/RestoreDeletedItemOffer.tsx'
import { UnknownBarcodeChooser } from '../scan/UnknownBarcodeChooser.tsx'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { CalendarExport } from '../export/CalendarExport.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { groupPendingItemsByShop } from './pendingItemsByShop.ts'

export interface ShoppingListProps {
  db: Firestore
}

interface ShopGroup {
  key: string
  name: string
  items: ItemRecord[]
}

export function ShoppingList({ db }: ShoppingListProps) {
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [tags, setTags] = useState<TagRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchTags(db, setTags), [db])
  /** Whether `watchCategories` and `watchShops` have delivered, so a missing Category or Shop means deleted, not not-yet-loaded. */
  const [listsLoaded, setListsLoaded] = useState({ categories: false, shops: false })
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

  /** Set by a scan made before the Items arrived; shown only while they are still loading. */
  const [scanWaiting, setScanWaiting] = useState(false)
  /** The scanned Barcode no live Item carries, and the Items it still sits on, while the Member chooses what to do with it. */
  const [unknownBarcode, setUnknownBarcode] = useState<{ barcode: core.Barcode; holders: BarcodeHolder[] }>()
  /** The deleted Item a scanned Barcode belongs to, and that Barcode, while the Member is deciding whether to bring it back. */
  const [deletedMatch, setDeletedMatch] = useState<{ item: ItemRecord; barcode: core.Barcode }>()
  /** The deleted Item whose Category or Shop is gone, while the Member picks live ones to restore it with. */
  const [itemToRestore, setItemToRestore] = useState<ItemRecord>()
  /** The Barcode a new Item carries from the start, while the Item dialog is open. */
  const [newItemBarcode, setNewItemBarcode] = useState<CarriedBarcode>()

  async function handleSetState(item: ItemRecord, state: core.State) {
    try {
      await setItemState(db, item, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  function handleTick(item: ItemRecord, text = `Marked ${item.name} enough`) {
    void handleSetState(item, 'enough')
    showSnackbar({
      text,
      action: { label: 'Undo', onAction: () => void handleSetState(item, item.state) },
    })
  }

  /** A scanned Barcode sits on at most one Item; it is set `enough` whether or not it is on the Shopping list. */
  function handleScan(barcode: core.Barcode) {
    if (items === null) {
      setScanWaiting(true)
      return
    }
    setScanWaiting(false)
    const [item] = itemsWithBarcode(items, barcode)
    if (item?.state === 'enough') return showSnackbar({ text: `${item.name} is already enough` })
    if (item !== undefined) return handleTick(item)
    void lookUpUnknown(items, barcode)
  }

  async function lookUpUnknown(liveItems: readonly ItemRecord[], barcode: core.Barcode) {
    try {
      const deleted = await findDeletedItemByBarcode(db, barcode)
      if (deleted !== undefined) return setDeletedMatch({ item: deleted, barcode })
    } catch (err) {
      return setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
    await openChooser(liveItems, barcode)
  }

  async function openChooser(liveItems: readonly ItemRecord[], barcode: core.Barcode) {
    try {
      setUnknownBarcode({ barcode, holders: await findBarcodeHolders(db, liveItems, barcode) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
  }

  async function handleRestore(item: ItemRecord) {
    // Until both lists have loaded, a Category or Shop cannot be told from a deleted one; the offer stays open.
    if (!listsLoaded.categories || !listsLoaded.shops) {
      return showSnackbar({ text: 'Categories and Shops are still loading, try again in a moment' })
    }
    setDeletedMatch(undefined)
    if (!isLiveReference(categories, item.categoryId) || !isLiveReference(shops, item.shopId)) return setItemToRestore(item)
    try {
      await restoreItem(db, item, categories, shops)
      setError(null)
      showSnackbar({ text: `Restored ${item.name}` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore the Item')
    }
  }

  async function handleDeclineRestore() {
    if (deletedMatch === undefined) return
    const { barcode } = deletedMatch
    setDeletedMatch(undefined)
    await openChooser(items ?? [], barcode)
  }

  /** Attaching sets the picked Item `enough` with Undo, unless it already is; Undo reverts the State, not the attach. */
  async function handleAttach(item: ItemRecord, holders: readonly BarcodeHolder[]) {
    if (unknownBarcode === undefined) return
    try {
      await attachBarcode(db, item, unknownBarcode.barcode, holders)
      setUnknownBarcode(undefined)
      setError(null)
      if (item.state === 'enough') showSnackbar({ text: `Added barcode to ${item.name}` })
      else handleTick(item, `Added barcode to ${item.name} and marked it enough`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the barcode')
    }
  }

  const { groups: shopGroups, unresolved } = groupPendingItemsByShop(items ?? [], categories, shops)
  const groups: ShopGroup[] = shopGroups.map(({ shop, items: shopItems }) => ({
    key: shop.id,
    name: shop.name,
    items: shopItems,
  }))
  if (unresolved.length > 0) {
    groups.push({ key: UNKNOWN_SHOP_NAME, name: UNKNOWN_SHOP_NAME, items: unresolved })
  }

  return (
    <section>
      <ScanEntry onScan={handleScan} />
      <AlertBanner items={items ?? []} />
      <CalendarExport items={items ?? []} categories={categories} shops={shops} />
      {error !== null && <p role="alert">{error}</p>}
      {scanWaiting && items === null && <p role="status">Items are still loading, scan again in a moment</p>}
      {items !== null && groups.length === 0 && <p>Nothing to buy — every Item is enough.</p>}
      {groups.map(({ key, name, items: groupItems }) => (
        <div key={key}>
          <h2>{name}</h2>
          <ul>
            {groupItems.map((item) => (
              <ShoppingListRow key={item.id} item={item} onTick={() => handleTick(item)} />
            ))}
          </ul>
        </div>
      ))}
      <RestoreDeletedItemOffer item={deletedMatch?.item} onRestore={(item) => void handleRestore(item)} onDecline={() => void handleDeclineRestore()} />
      <UnknownBarcodeChooser
        barcode={unknownBarcode?.barcode}
        items={items ?? []}
        holders={unknownBarcode?.holders ?? []}
        onAttach={(item, from) => void handleAttach(item, from)}
        onNewItem={(from) => {
          if (unknownBarcode !== undefined) setNewItemBarcode({ value: unknownBarcode.barcode, movedOff: from })
          setUnknownBarcode(undefined)
        }}
        onClose={() => setUnknownBarcode(undefined)}
      />
      <ItemDialog
        open={newItemBarcode !== undefined}
        barcode={newItemBarcode?.value}
        categories={categories}
        shops={shops}
        tags={tags}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onCreateTag={(name) => createTag(db, name)}
        onSave={async (input) => {
          if (input.state !== undefined) await createItem(db, { ...input, barcode: newItemBarcode })
        }}
        onClose={() => setNewItemBarcode(undefined)}
      />
      <ItemDialog
        open={itemToRestore !== undefined}
        item={itemToRestore}
        restoring
        categories={categories}
        shops={shops}
        tags={tags}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onCreateTag={(name) => createTag(db, name)}
        onSave={async (input) => {
          if (itemToRestore !== undefined) await restoreItemWithEdit(db, itemToRestore, input)
        }}
        onClose={() => setItemToRestore(undefined)}
      />
    </section>
  )
}

interface ShoppingListRowProps {
  item: ItemRecord
  onTick: () => void
}

function ShoppingListRow({ item, onTick }: ShoppingListRowProps) {
  const runningLow = item.state === 'running low'
  return (
    <ListRow
      headline={item.name}
      supporting={runningLow ? 'running low' : undefined}
      muted={runningLow}
      control={<input type="checkbox" checked={false} onChange={onTick} />}
    />
  )
}
