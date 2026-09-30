import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import {
  changeCategoryDefaultShop,
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

interface Draft {
  name: string
  shopId: string
}

const EMPTY_DRAFT: Draft = { name: '', shopId: '' }

/** The trimmed name and the default Shop, or the message to show; the Shop must be one currently in `shops`. */
function validateDraft(
  draft: Draft,
  shops: ShopRecord[],
): { name: string; shopId: catalogue.ShopId } | { error: string } {
  const name = draft.name.trim()
  if (name.length === 0) return { error: 'A Category needs a name.' }
  const shop = shops.find((candidate) => candidate.id === draft.shopId)
  if (shop === undefined || !catalogue.isShopId(shop.id)) return { error: 'Choose a default Shop.' }
  return { name, shopId: shop.id }
}

interface CategoryFieldsProps {
  nameLabel: string
  draft: Draft
  shops: ShopRecord[]
  onChange: (draft: Draft) => void
}

function CategoryFields({ nameLabel, draft, shops, onChange }: CategoryFieldsProps) {
  const shopId = shops.some((shop) => shop.id === draft.shopId) ? draft.shopId : ''
  return (
    <>
      <TextField
        label={nameLabel}
        value={draft.name}
        onInput={(event) => onChange({ ...draft, name: event.currentTarget.value })}
      />
      <Select
        label="Default Shop"
        value={shopId}
        onChange={(event) => onChange({ ...draft, shopId: event.currentTarget.value })}
      >
        <option value="" disabled>
          Choose a Shop
        </option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </Select>
    </>
  )
}

export function CategoriesManager({ db }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CategoryRecord | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  function openAdd() {
    setDraft(EMPTY_DRAFT)
    setError(null)
    setAdding(true)
  }

  function openEdit(category: CategoryRecord) {
    setDraft({ name: category.name, shopId: category.defaultShopId })
    setError(null)
    setEditing(category)
  }

  function closeDialogs() {
    setAdding(false)
    setEditing(null)
    setDeleting(false)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const valid = validateDraft(draft, shops)
    if ('error' in valid) {
      setError(valid.error)
      return
    }
    try {
      await createCategory(db, valid.name, valid.shopId)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Category')
    }
  }

  async function handleSave(category: CategoryRecord) {
    const valid = validateDraft(draft, shops)
    if ('error' in valid) {
      setError(valid.error)
      return
    }
    try {
      if (valid.name !== category.name) await renameCategory(db, category, valid.name)
      await changeCategoryDefaultShop(db, category, valid.shopId)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Category')
    }
  }

  /** Deleting waits for the server to confirm, so it can surface the rules refusal; `deleting` covers that wait. */
  async function handleDelete(category: CategoryRecord) {
    setError(null)
    setDeleting(true)
    try {
      await deleteCategory(db, category)
      closeDialogs()
    } catch (err) {
      setDeleting(false)
      setError(err instanceof CategoryInUseError ? err.message : 'Could not delete Category')
    }
  }

  return (
    <section>
      <TopAppBarActions>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarActions>
      <ul>
        {categories.map((category) => (
          <ListRow
            key={category.id}
            headline={category.name}
            supporting={shopName(shops, category.defaultShopId)}
            control={
              <Button variant="text" aria-label={`Edit ${category.name}`} onClick={() => openEdit(category)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Fab symbol={AddIcon} label="Add Category" onClick={openAdd} />
      <Dialog open={adding} title="Add Category" onClose={closeDialogs}>
        {adding && (
          <form onSubmit={handleCreate}>
            {error !== null && <p role="alert">{error}</p>}
            <CategoryFields nameLabel="New Category name" draft={draft} shops={shops} onChange={setDraft} />
            <Button type="submit">Add</Button>
          </form>
        )}
      </Dialog>
      <Dialog open={editing !== null} title="Edit Category" onClose={closeDialogs}>
        {editing !== null && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave(editing)
            }}
          >
            {error !== null && <p role="alert">{error}</p>}
            <CategoryFields nameLabel="Category name" draft={draft} shops={shops} onChange={setDraft} />
            <Button type="submit" disabled={deleting}>
              Save
            </Button>
            <Button variant="text" disabled={deleting} onClick={() => void handleDelete(editing)}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  )
}
