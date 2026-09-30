import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { createItem, setItemState, updateItem, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { watchShops, type ShopRecord } from './shops.ts'
import { ItemDialog } from './ItemDialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { SegmentedButton } from '../ui/SegmentedButton.tsx'
import { TextField } from '../ui/TextField.tsx'
import AddIcon from '~icons/material-symbols/add'
import './ItemsManager.css'

export interface ItemsManagerProps {
  db: Firestore
}

export function ItemsManager({ db }: ItemsManagerProps) {
  const [items, setItems] = useState<ItemRecord[] | undefined>(undefined)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  /** `null` while the Item dialog is closed; `item` is the Item being edited, absent when adding. */
  const [dialog, setDialog] = useState<{ item?: ItemRecord } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

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

  const needle = search.trim().toLowerCase()
  const loadedItems = items ?? []
  const visibleItems = loadedItems.filter((item) => item.name.toLowerCase().includes(needle))
  const groups = categories
    .map((category) => ({ category, items: visibleItems.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)
  const uncategorisedItems = visibleItems.filter(
    (item) => !categories.some((category) => category.id === item.categoryId),
  )

  return (
    <section class="items-manager">
      <h2>Items</h2>
      {/* TODO[#169]: route the scanned barcode to its Items, or attach it. */}
      <ScanEntry onScan={() => {}} />
      {error !== null && <p role="alert">{error}</p>}
      <TextField type="search" label="Search Items" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
      {items !== undefined && visibleItems.length === 0 && (
        <p>{items.length === 0 ? 'No Items yet.' : 'No Items match your search.'}</p>
      )}
      {groups.map(({ category, items: categoryItems }) => (
        <ItemGroup key={category.id} heading={category.name} items={categoryItems} onSetState={handleSetState} onOpen={openDialog} />
      ))}
      {uncategorisedItems.length > 0 && (
        <ItemGroup heading="Uncategorised" items={uncategorisedItems} onSetState={handleSetState} onOpen={openDialog} />
      )}
      <Fab symbol={AddIcon} label="Add Item" onClick={() => openDialog(undefined)} />
      <ItemDialog
        open={dialog !== null}
        item={dialog?.item}
        categories={categories}
        shops={shops}
        onSave={async (input) => {
          if (!dialog?.item) return createItem(db, input)
          const editedId = dialog.item.id
          // The Item may have changed elsewhere since the dialog opened; its reference counts move from the current record.
          const previous = items?.find((item) => item.id === editedId) ?? dialog.item
          await updateItem(db, previous, input)
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
