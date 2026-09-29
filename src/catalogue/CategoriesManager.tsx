import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import {
  createCategory,
  deleteCategory,
  renameCategory,
  watchCategories,
  CategoryInUseError,
  type CategoryRecord,
} from './categories.ts'
import { shopName, watchShops, type ShopRecord } from './shops.ts'

export interface CategoriesManagerProps {
  db: Firestore
}

export function CategoriesManager({ db }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [newName, setNewName] = useState('')
  const [newShopId, setNewShopId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newName.trim()
    if (trimmedName.length === 0) {
      setError('A Category needs a name.')
      return
    }
    if (!catalogue.isShopId(newShopId)) {
      setError('Choose a default Shop.')
      return
    }
    try {
      await createCategory(db, trimmedName, newShopId)
      setNewName('')
      setNewShopId('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Category')
    }
  }

  async function handleRename(category: CategoryRecord, name: string) {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setError('A Category needs a name.')
      return
    }
    try {
      await renameCategory(db, category.id, trimmedName)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename Category')
    }
  }

  async function handleDelete(category: CategoryRecord) {
    try {
      await deleteCategory(db, category.id)
      setError(null)
    } catch (err) {
      setError(err instanceof CategoryInUseError ? err.message : 'Could not delete Category')
    }
  }

  return (
    <section>
      <h2>Categories</h2>
      {error !== null && <p role="alert">{error}</p>}
      <ul>
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            defaultShopName={shopName(shops, category.defaultShopId)}
            onRename={(name) => void handleRename(category, name)}
            onDelete={() => void handleDelete(category)}
          />
        ))}
      </ul>
      <form onSubmit={handleCreate}>
        <label htmlFor="new-category-name">New Category name</label>
        <input
          id="new-category-name"
          value={newName}
          onInput={(event) => setNewName(event.currentTarget.value)}
        />
        <label htmlFor="new-category-shop">Default Shop</label>
        <select
          id="new-category-shop"
          value={newShopId}
          onChange={(event) => setNewShopId(event.currentTarget.value)}
        >
          <option value="">Choose a Shop</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
        <button type="submit">Add Category</button>
      </form>
    </section>
  )
}

interface CategoryRowProps {
  category: CategoryRecord
  defaultShopName: string
  onRename: (name: string) => void
  onDelete: () => void
}

function CategoryRow({ category, defaultShopName, onRename, onDelete }: CategoryRowProps) {
  const [name, setName] = useState(category.name)

  useEffect(() => setName(category.name), [category.name])

  return (
    <li>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onRename(name)
        }}
      >
        <label htmlFor={`category-name-${category.id}`}>Rename {category.name}</label>
        <input
          id={`category-name-${category.id}`}
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <button type="submit">Rename</button>
      </form>
      <span>Default: {defaultShopName}</span>
      <button type="button" onClick={onDelete}>
        Delete {category.name}
      </button>
    </li>
  )
}
