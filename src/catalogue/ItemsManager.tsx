import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { createItem, findItemsByBarcode, setItemState, updateItem, watchItems, type ItemRecord } from './items.ts'
import { createCategory, watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { UnknownBarcodeChooser } from '../scan/UnknownBarcodeChooser.tsx'
import { watchShops, type ShopRecord } from './shops.ts'
import { navigateToItems } from '../ui/useRoute.ts'
import { ItemDialog } from './ItemDialog.tsx'
import { Fab } from '../ui/Fab.tsx'
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
  /** `null` while the Item dialog is closed; `item` is the Item being edited, absent when adding. */
  const [dialog, setDialog] = useState<{ item?: ItemRecord } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  /** The scanned Barcode no Item carries, while the Member is choosing what to do with it. */
  const [unknownBarcode, setUnknownBarcode] = useState<core.Barcode | undefined>(undefined)

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleScan(barcode: core.Barcode) {
    try {
      const found = await findItemsByBarcode(db, barcode)
      setError(null)
      if (found.length === 0) setUnknownBarcode(barcode)
      else navigateToItems(found.map((item) => item.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up the barcode')
    }
  }

  function openDialog(item: ItemRecord | undefined) {
    setDialog({ item })
  }

  async function handleSetState(item: ItemRecord, state: core.State) {
    try {
      await setItemState(db, item, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  // The Item may have changed elsewhere since the dialog opened; the dialog and its save work from the current record.
  const editedItem = dialog?.item && (items?.find((item) => item.id === dialog.item?.id) ?? dialog.item)

  const needle = search.trim().toLowerCase()
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
    : candidateItems.filter((item) => item.name.toLowerCase().includes(needle))
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
      <UnknownBarcodeChooser barcode={unknownBarcode} onClose={() => setUnknownBarcode(undefined)} />
      <Fab symbol={AddIcon} label="Add Item" onClick={() => openDialog(undefined)} />
      <ItemDialog
        open={dialog !== null}
        item={editedItem}
        categories={categories}
        shops={shops}
        onCreateCategory={(name, defaultShopId) => createCategory(db, name, defaultShopId)}
        onSave={async (input) => {
          if (!editedItem) return createItem(db, input)
          // Its reference counts move from the current record.
          await updateItem(db, editedItem, input)
        }}
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
