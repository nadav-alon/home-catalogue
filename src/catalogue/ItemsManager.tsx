import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { createItem, setItemState, watchItems, type ItemInput, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { ScanEntry } from '../scan/ScanEntry.tsx'
import { watchShops, type ShopRecord } from './shops.ts'
import { ListRow } from '../ui/ListRow.tsx'
import { SegmentedButton } from '../ui/SegmentedButton.tsx'
import { TextField } from '../ui/TextField.tsx'

export interface ItemsManagerProps {
  db: Firestore
}

const NO_SHOP_OVERRIDE = ''

interface ItemFormValues {
  name: string
  brandNote: string
  categoryId: string
  necessity: string
  shopId: string
}

function parseItemFormValues(values: ItemFormValues): { input: ItemInput } | { error: string } {
  const trimmedName = values.name.trim()
  if (trimmedName.length === 0) {
    return { error: 'An Item needs a name.' }
  }
  if (!catalogue.isCategoryId(values.categoryId)) {
    return { error: 'Choose a Category.' }
  }
  const necessity = catalogue.necessitySchema.safeParse(values.necessity)
  if (!necessity.success) {
    return { error: 'Choose a Necessity.' }
  }
  const trimmedBrandNote = values.brandNote.trim()
  return {
    input: {
      name: trimmedName,
      brandNote: trimmedBrandNote.length === 0 ? undefined : trimmedBrandNote,
      categoryId: values.categoryId,
      necessity: necessity.data,
      shopId: catalogue.isShopId(values.shopId) ? values.shopId : undefined,
    },
  }
}

export function ItemsManager({ db }: ItemsManagerProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [newName, setNewName] = useState('')
  const [newBrandNote, setNewBrandNote] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newNecessity, setNewNecessity] = useState('')
  const [newShopId, setNewShopId] = useState(NO_SHOP_OVERRIDE)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseItemFormValues({
      name: newName,
      brandNote: newBrandNote,
      categoryId: newCategoryId,
      necessity: newNecessity,
      shopId: newShopId,
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    try {
      await createItem(db, result.input)
      setNewName('')
      setNewBrandNote('')
      setNewCategoryId('')
      setNewNecessity('')
      setNewShopId(NO_SHOP_OVERRIDE)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Item')
    }
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
  const visibleItems = items.filter((item) => item.name.toLowerCase().includes(needle))
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
      {visibleItems.length === 0 && (
        <p>{items.length === 0 ? 'No Items yet.' : 'No Items match your search.'}</p>
      )}
      {groups.map(({ category, items: categoryItems }) => (
        <ItemGroup key={category.id} heading={category.name} items={categoryItems} onSetState={handleSetState} />
      ))}
      {uncategorisedItems.length > 0 && (
        <ItemGroup heading="Uncategorised" items={uncategorisedItems} onSetState={handleSetState} />
      )}
      <form onSubmit={handleCreate}>
        <label htmlFor="new-item-name">New Item name</label>
        <input id="new-item-name" value={newName} onInput={(event) => setNewName(event.currentTarget.value)} />

        <label htmlFor="new-item-brand-note">Brand note</label>
        <input
          id="new-item-brand-note"
          value={newBrandNote}
          onInput={(event) => setNewBrandNote(event.currentTarget.value)}
        />

        <label htmlFor="new-item-category">Category</label>
        <select
          id="new-item-category"
          value={newCategoryId}
          onChange={(event) => setNewCategoryId(event.currentTarget.value)}
        >
          <option value="">Choose a Category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="new-item-necessity">Necessity</label>
        <select
          id="new-item-necessity"
          value={newNecessity}
          onChange={(event) => setNewNecessity(event.currentTarget.value)}
        >
          <option value="">Choose a Necessity</option>
          {catalogue.necessitySchema.options.map((necessity) => (
            <option key={necessity} value={necessity}>
              {necessity}
            </option>
          ))}
        </select>

        <label htmlFor="new-item-shop">Shop override</label>
        <select id="new-item-shop" value={newShopId} onChange={(event) => setNewShopId(event.currentTarget.value)}>
          <option value={NO_SHOP_OVERRIDE}>Use Category default</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>

        <button type="submit">Add Item</button>
      </form>
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
