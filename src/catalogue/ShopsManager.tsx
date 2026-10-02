import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import {
  createShop,
  deleteShop,
  renameShop,
  restoreShop,
  watchShops,
  ShopInUseError,
  type ShopRecord,
} from './shops.ts'

const SETTINGS = route('/settings')

export interface ShopsManagerProps {
  db: Firestore
}

const BLANK_NAME_MESSAGE = 'A Shop needs a name.'

interface AddShopDialogProps {
  db: Firestore
  onClose: () => void
}

/** Owns its draft name and error, so each opening starts blank; mount it only while open. */
function AddShopDialog({ db, onClose }: AddShopDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setError(BLANK_NAME_MESSAGE)
      return
    }
    try {
      await createShop(db, trimmedName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Shop')
    }
  }

  return (
    <Dialog open title="Add Shop" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error !== null && <p role="alert">{error}</p>}
        <TextField label="New Shop name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Add</Button>
      </form>
    </Dialog>
  )
}

interface EditShopDialogProps {
  db: Firestore
  shop: ShopRecord
  onClose: () => void
}

/** Owns its draft name and error, so each opening starts from the Shop's current name; mount it only while open. */
function EditShopDialog({ db, shop, onClose }: EditShopDialogProps) {
  const [name, setName] = useState(shop.name)
  const [error, setError] = useState<string | null>(null)

  async function handleRename(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setError(BLANK_NAME_MESSAGE)
      return
    }
    try {
      await renameShop(db, shop, trimmedName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename Shop')
    }
  }

  async function handleDelete() {
    try {
      await deleteShop(db, shop)
      showSnackbar({
        text: `Deleted ${shop.name}`,
        action: { label: 'Undo', onAction: () => void restoreShop(db, shop) },
      })
      onClose()
    } catch (err) {
      setError(err instanceof ShopInUseError ? err.message : 'Could not delete Shop')
    }
  }

  return (
    <Dialog open title="Edit Shop" onClose={onClose}>
      <form onSubmit={handleRename}>
        {error !== null && <p role="alert">{error}</p>}
        <TextField label="Shop name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
        <Button type="submit">Rename</Button>
        <Button variant="text" onClick={() => void handleDelete()}>
          Delete
        </Button>
      </form>
    </Dialog>
  )
}

export function ShopsManager({ db }: ShopsManagerProps) {
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ShopRecord | null>(null)

  useEffect(() => watchShops(db, setShops), [db])

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <h2>Shops</h2>
      <ul>
        {shops.map((shop) => (
          <ListRow
            key={shop.id}
            headline={shop.name}
            control={
              <Button variant="text" aria-label={`Edit ${shop.name}`} onClick={() => setEditing(shop)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Fab symbol={AddIcon} label="Add Shop" onClick={() => setAdding(true)} />
      {adding && <AddShopDialog db={db} onClose={() => setAdding(false)} />}
      {editing !== null && <EditShopDialog db={db} shop={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}
