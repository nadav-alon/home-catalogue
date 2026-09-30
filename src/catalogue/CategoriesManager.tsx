import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import {
  changeCategoryShop,
  createCategory,
  deleteCategory,
  renameCategory,
  watchCategories,
  CategoryInUseError,
  type CategoryRecord,
} from './categories.ts'
import { shopName, watchShops, type ShopRecord } from './shops.ts'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { Select } from '../ui/Select.tsx'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

export interface CategoriesManagerProps {
  db: Firestore
}

export function CategoriesManager({ db }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CategoryRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [editShopId, setEditShopId] = useState('')
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
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Category')
    }
  }

  async function handleSave(category: CategoryRecord) {
    const trimmedName = editName.trim()
    if (trimmedName.length === 0) {
      setError('A Category needs a name.')
      return
    }
    if (!catalogue.isShopId(editShopId)) {
      setError('Choose a default Shop.')
      return
    }
    try {
      if (trimmedName !== category.name) await renameCategory(db, category, trimmedName)
      await changeCategoryShop(db, category, editShopId)
      setError(null)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Category')
    }
  }

  async function handleDelete(category: CategoryRecord) {
    try {
      await deleteCategory(db, category)
      setError(null)
      setEditing(null)
    } catch (err) {
      setError(err instanceof CategoryInUseError ? err.message : 'Could not delete Category')
    }
  }

  return (
    <section>
      <TopAppBarActions>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarActions>
      {error !== null && <p role="alert">{error}</p>}
      <ul>
        {categories.map((category) => (
          <ListRow
            key={category.id}
            headline={category.name}
            supporting={shopName(shops, category.defaultShopId)}
            control={
              <Button
                variant="text"
                aria-label={`Edit ${category.name}`}
                onClick={() => {
                  setEditName(category.name)
                  setEditShopId(category.defaultShopId)
                  setEditing(category)
                }}
              >
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Fab symbol={AddIcon} label="Add Category" onClick={() => setAdding(true)} />
      <Dialog open={adding} title="Add Category" onClose={() => setAdding(false)}>
        {adding && (
          <form onSubmit={handleCreate}>
            <TextField
              label="New Category name"
              value={newName}
              onInput={(event) => setNewName(event.currentTarget.value)}
            />
            <Select
              label="Default Shop"
              value={newShopId}
              onChange={(event) => setNewShopId(event.currentTarget.value)}
            >
              <option value="">Choose a Shop</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Add</Button>
          </form>
        )}
      </Dialog>
      <Dialog open={editing !== null} title="Edit Category" onClose={() => setEditing(null)}>
        {editing !== null && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave(editing)
            }}
          >
            <TextField
              label="Category name"
              value={editName}
              onInput={(event) => setEditName(event.currentTarget.value)}
            />
            <Select
              label="Default Shop"
              value={editShopId}
              onChange={(event) => setEditShopId(event.currentTarget.value)}
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Save</Button>
            <Button variant="text" onClick={() => void handleDelete(editing)}>
              Delete
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  )
}
