import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { createItem, watchItems, type ItemRecord } from './items.ts'
import { watchCategories, type CategoryRecord } from './categories.ts'
import { watchShops, type ShopRecord } from './shops.ts'

export interface ItemsManagerProps {
  db: Firestore
}

const NO_SHOP_OVERRIDE = ''

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

  function shopName(shopId: catalogue.ShopId): string {
    return shops.find((shop) => shop.id === shopId)?.name ?? shopId
  }

  function resolvedShopName(item: ItemRecord, category: CategoryRecord): string {
    return shopName(catalogue.resolveShop(item, category))
  }

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newName.trim()
    if (trimmedName.length === 0) {
      setError('An Item needs a name.')
      return
    }
    if (!catalogue.isCategoryId(newCategoryId)) {
      setError('Choose a Category.')
      return
    }
    const necessity = catalogue.necessitySchema.safeParse(newNecessity)
    if (!necessity.success) {
      setError('Choose a Necessity.')
      return
    }
    const trimmedBrandNote = newBrandNote.trim()
    try {
      await createItem(db, {
        name: trimmedName,
        brandNote: trimmedBrandNote.length === 0 ? undefined : trimmedBrandNote,
        categoryId: newCategoryId,
        necessity: necessity.data,
        shopId: catalogue.isShopId(newShopId) ? newShopId : undefined,
      })
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

  const groups = categories
    .map((category) => ({ category, items: items.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)

  return (
    <section>
      <h2>Items</h2>
      {error !== null && <p role="alert">{error}</p>}
      {groups.map(({ category, items: categoryItems }) => (
        <div key={category.id}>
          <h3>{category.name}</h3>
          <ul>
            {categoryItems.map((item) => (
              <ItemRow key={item.id} item={item} resolvedShopName={resolvedShopName(item, category)} />
            ))}
          </ul>
        </div>
      ))}
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
  resolvedShopName: string
}

function ItemRow({ item, resolvedShopName }: ItemRowProps) {
  return (
    <li>
      <span>{item.name}</span>
      {item.brandNote !== undefined && <span>{item.brandNote}</span>}
      <span>{item.necessity}</span>
      <span>Shop: {resolvedShopName}</span>
    </li>
  )
}
