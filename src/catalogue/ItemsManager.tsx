import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import { createItem, setItemState, updateItem, watchItems, type ItemInput, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { shopName, UNKNOWN_SHOP_NAME, watchShops, type ShopRecord } from './shops.ts'

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

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  function resolveShopName(item: ItemRecord, category: CategoryRecord | undefined): string {
    const shopId = category !== undefined ? catalogue.resolveShop(item, category) : item.shopId
    return shopId !== undefined ? shopName(shops, shopId) : UNKNOWN_SHOP_NAME
  }

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
      await setItemState(db, item.id, state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update State')
    }
  }

  async function handleUpdate(item: ItemRecord, values: ItemFormValues) {
    const result = parseItemFormValues(values)
    if ('error' in result) {
      setError(result.error)
      return
    }
    try {
      await updateItem(db, item.id, result.input)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update Item')
    }
  }

  const groups = categories
    .map((category) => ({ category, items: items.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)
  const uncategorisedItems = items.filter(
    (item) => !categories.some((category) => category.id === item.categoryId),
  )

  return (
    <section>
      <h2>Items</h2>
      {error !== null && <p role="alert">{error}</p>}
      {groups.map(({ category, items: categoryItems }) => (
        <div key={category.id}>
          <h3>{category.name}</h3>
          <ul>
            {categoryItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categories={categories}
                shops={shops}
                resolvedShopName={resolveShopName(item, category)}
                onSetState={(state) => void handleSetState(item, state)}
                onUpdate={(values) => void handleUpdate(item, values)}
              />
            ))}
          </ul>
        </div>
      ))}
      {uncategorisedItems.length > 0 && (
        <div>
          <h3>Uncategorised</h3>
          <ul>
            {uncategorisedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categories={categories}
                shops={shops}
                resolvedShopName={resolveShopName(item, undefined)}
                onSetState={(state) => void handleSetState(item, state)}
                onUpdate={(values) => void handleUpdate(item, values)}
              />
            ))}
          </ul>
        </div>
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

interface ItemRowProps {
  item: ItemRecord
  categories: CategoryRecord[]
  shops: ShopRecord[]
  resolvedShopName: string
  onSetState: (state: core.State) => void
  onUpdate: (values: ItemFormValues) => void
}

function ItemRow({ item, categories, shops, resolvedShopName, onSetState, onUpdate }: ItemRowProps) {
  const [name, setName] = useState(item.name)
  const [brandNote, setBrandNote] = useState(item.brandNote ?? '')
  const [categoryId, setCategoryId] = useState<string>(item.categoryId)
  const [necessity, setNecessity] = useState<string>(item.necessity)
  const [shopId, setShopId] = useState<string>(item.shopId ?? NO_SHOP_OVERRIDE)

  useEffect(() => {
    setName(item.name)
    setBrandNote(item.brandNote ?? '')
    setCategoryId(item.categoryId)
    setNecessity(item.necessity)
    setShopId(item.shopId ?? NO_SHOP_OVERRIDE)
  }, [item.name, item.brandNote, item.categoryId, item.necessity, item.shopId])

  return (
    <li>
      <span>{item.name}</span>
      {item.brandNote !== undefined && <span>{item.brandNote}</span>}
      <span>{item.necessity}</span>
      <span>Shop: {resolvedShopName}</span>
      <div role="group" aria-label={`State for ${item.name}`}>
        {core.stateSchema.options.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={item.state === state}
            disabled={item.state === state}
            onClick={() => onSetState(state)}
          >
            {state}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onUpdate({ name, brandNote, categoryId, necessity, shopId })
        }}
      >
        <label htmlFor={`item-name-${item.id}`}>Edit {item.name}</label>
        <input id={`item-name-${item.id}`} value={name} onInput={(event) => setName(event.currentTarget.value)} />

        <label htmlFor={`item-brand-note-${item.id}`}>Brand note for {item.name}</label>
        <input
          id={`item-brand-note-${item.id}`}
          value={brandNote}
          onInput={(event) => setBrandNote(event.currentTarget.value)}
        />

        <label htmlFor={`item-category-${item.id}`}>Category for {item.name}</label>
        <select
          id={`item-category-${item.id}`}
          value={categoryId}
          onChange={(event) => setCategoryId(event.currentTarget.value)}
        >
          {!categories.some((category) => category.id === categoryId) && (
            <option value={categoryId}>Unknown Category</option>
          )}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor={`item-necessity-${item.id}`}>Necessity for {item.name}</label>
        <select
          id={`item-necessity-${item.id}`}
          value={necessity}
          onChange={(event) => setNecessity(event.currentTarget.value)}
        >
          {catalogue.necessitySchema.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label htmlFor={`item-shop-${item.id}`}>Shop override for {item.name}</label>
        <select id={`item-shop-${item.id}`} value={shopId} onChange={(event) => setShopId(event.currentTarget.value)}>
          <option value={NO_SHOP_OVERRIDE}>Use Category default</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>

        <button type="submit">Save {item.name}</button>
      </form>
    </li>
  )
}
