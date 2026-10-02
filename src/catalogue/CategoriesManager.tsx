import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import type { catalogue } from 'data-platform'
import {
  changeCategoryDefaultShop,
  createCategory,
  deleteCategory,
  renameCategory,
  restoreCategory,
  validateCategoryDraft,
  watchCategories,
  CategoryInUseError,
  type CategoryDraft,
  type CategoryRecord,
} from './categories.ts'
import { createShop, shopName, watchShops, type ShopRecord } from './shops.ts'
import { BLANK_NAME_MESSAGE } from './ShopsManager.tsx'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { Select } from '../ui/Select.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

export interface CategoriesManagerProps {
  db: Firestore
}

const EMPTY_DRAFT: CategoryDraft = { name: '', shopId: '' }
/** The Shop picker's value for "+ New Shop"; never a Shop id. */
const NEW_SHOP = '+new'

interface CategoryFieldsProps {
  nameLabel: string
  draft: CategoryDraft
  shops: ShopRecord[]
  onChange: (update: (draft: CategoryDraft) => CategoryDraft) => void
  onCreateShop: (name: string) => Promise<catalogue.ShopId>
}

/** The name and default Shop fields; the Shop picker's "+ New Shop" asks for a name, creates the Shop and selects it, leaving the rest of the draft as it was. */
function CategoryFields({ nameLabel, draft, shops, onChange, onCreateShop }: CategoryFieldsProps) {
  const shopId = shops.some((shop) => shop.id === draft.shopId) ? draft.shopId : ''
  /** The "+ New Shop" prompt's name: `null` while it is closed. */
  const [newShopName, setNewShopName] = useState<string | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)

  function closeShopPrompt() {
    setNewShopName(null)
    setShopError(null)
  }

  function handleShopChange(event: JSX.TargetedEvent<HTMLSelectElement>) {
    const { value } = event.currentTarget
    if (value === NEW_SHOP) {
      setNewShopName((current) => current ?? '')
    } else {
      onChange((current) => ({ ...current, shopId: value }))
      closeShopPrompt()
    }
  }

  /** Enter in the prompt's field creates the Shop instead of submitting the Category form around it. */
  function handleShopPromptKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    void handleCreateShop()
  }

  async function handleCreateShop() {
    if (newShopName === null) return
    const trimmedName = newShopName.trim()
    if (trimmedName.length === 0) return setShopError(BLANK_NAME_MESSAGE)
    try {
      const createdId = await onCreateShop(trimmedName)
      onChange((current) => ({ ...current, shopId: createdId }))
      closeShopPrompt()
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Could not add Shop')
    }
  }

  return (
    <>
      <TextField
        label={nameLabel}
        value={draft.name}
        onInput={(event) => onChange((current) => ({ ...current, name: event.currentTarget.value }))}
      />
      <Select
        label="Default Shop"
        value={newShopName === null ? shopId : NEW_SHOP}
        onChange={handleShopChange}
      >
        <option value="" disabled>
          Choose a Shop
        </option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
        <option value={NEW_SHOP}>+ New Shop</option>
      </Select>
      {newShopName !== null && (
        <div onKeyDown={handleShopPromptKeyDown}>
          {shopError !== null && <p role="alert">{shopError}</p>}
          <TextField label="New Shop name" value={newShopName} onInput={(event) => setNewShopName(event.currentTarget.value)} />
          <DialogActions>
            <Button variant="text" onClick={closeShopPrompt}>
              Cancel new Shop
            </Button>
            <Button onClick={handleCreateShop}>Create Shop</Button>
          </DialogActions>
        </div>
      )}
    </>
  )
}

export function CategoriesManager({ db }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  // Undo outlives the render that deleted the Category, so it reads the Shops as they are when it is pressed.
  const shopsRef = useRef(shops)
  shopsRef.current = shops
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CategoryRecord | null>(null)
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_DRAFT)
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
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  const handleCreateShop = (name: string) => createShop(db, name)

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const valid = validateCategoryDraft(draft, shops)
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
    const valid = validateCategoryDraft(draft, shops)
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

  /** deleteCategory resolves once queued, so the dialog closes at once even offline; Undo restores the Category. */
  async function handleDelete(category: CategoryRecord) {
    setError(null)
    try {
      await deleteCategory(db, category)
    } catch (err) {
      if (!(err instanceof CategoryInUseError)) throw err
      setError(err.message)
      return
    }
    closeDialogs()
    showSnackbar({
      text: `Deleted ${category.name}`,
      action: { label: 'Undo', onAction: () => void restoreCategory(db, category, shopsRef.current) },
    })
  }

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
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
      <Dialog open={adding} title="Add Category" onClose={closeDialogs} closable>
        {adding && (
          <form class={DIALOG_FORM_CLASS} onSubmit={handleCreate}>
            {error !== null && <p role="alert">{error}</p>}
            <CategoryFields nameLabel="New Category name" draft={draft} shops={shops} onChange={setDraft} onCreateShop={handleCreateShop} />
            <DialogActions>
              <Button variant="text" onClick={closeDialogs}>
                Cancel
              </Button>
              <Button type="submit">Add</Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
      <Dialog open={editing !== null} title="Edit Category" onClose={closeDialogs} closable>
        {editing !== null && (
          <form
            class={DIALOG_FORM_CLASS}
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave(editing)
            }}
          >
            {error !== null && <p role="alert">{error}</p>}
            <CategoryFields nameLabel="Category name" draft={draft} shops={shops} onChange={setDraft} onCreateShop={handleCreateShop} />
            <DialogActions
              destructive={
                <Button variant="text" onClick={() => void handleDelete(editing)}>
                  Delete
                </Button>
              }
            >
              <Button variant="text" onClick={closeDialogs}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
    </section>
  )
}
