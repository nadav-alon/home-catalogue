import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { createItem, setItemState, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { watchShops, type ShopRecord } from './shops.ts'
import { ItemDialog } from './ItemDialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { SegmentedButton } from '../ui/SegmentedButton.tsx'
import { TextField } from '../ui/TextField.tsx'
import AddIcon from '~icons/material-symbols/add'

export interface ItemsManagerProps {
  db: Firestore
}

export function ItemsManager({ db }: ItemsManagerProps) {
  const [items, setItems] = useState<ItemRecord[] | undefined>(undefined)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

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
    <section>
      <h2>Items</h2>
      {/* TODO[#169]: route the scanned barcode to its Items, or attach it. */}
      <ScanEntry onScan={() => {}} />
      {error !== null && <p role="alert">{error}</p>}
      <TextField type="search" label="Search Items" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
      {items !== undefined && visibleItems.length === 0 && (
        <p>{items.length === 0 ? 'No Items yet.' : 'No Items match your search.'}</p>
      )}
      {groups.map(({ category, items: categoryItems }) => (
        <ItemGroup key={category.id} heading={category.name} items={categoryItems} onSetState={handleSetState} />
      ))}
      {uncategorisedItems.length > 0 && (
        <ItemGroup heading="Uncategorised" items={uncategorisedItems} onSetState={handleSetState} />
      )}
      <Fab symbol={AddIcon} label="Add Item" onClick={() => setDialogOpen(true)} />
      <ItemDialog
        open={dialogOpen}
        categories={categories}
        shops={shops}
        onSave={(input) => createItem(db, input)}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  )
}

interface ItemGroupProps {
  heading: string
  items: ItemRecord[]
  onSetState: (item: ItemRecord, state: core.State) => Promise<void>
}

function ItemGroup({ heading, items, onSetState }: ItemGroupProps) {
  return (
    <div>
      <h3>{heading}</h3>
      <ul>
        {items.map((item) => (
          // TODO[#137]: open the Item dialog on row tap.
          <ListRow
            key={item.id}
            headline={item.name}
            supporting={[item.brandNote, item.necessity].filter((part) => part !== undefined).join(' · ')}
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
