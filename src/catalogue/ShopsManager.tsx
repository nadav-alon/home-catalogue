import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import { createShop, deleteShop, renameShop, watchShops, ShopInUseError, type ShopRecord } from './shops.ts'

const SETTINGS = route('/settings')

export interface ShopsManagerProps {
  db: Firestore
}

export function ShopsManager({ db }: ShopsManagerProps) {
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ShopRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchShops(db, setShops), [db])

  async function handleCreate(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newName.trim()
    if (trimmedName.length === 0) {
      setError('A Shop needs a name.')
      return
    }
    try {
      await createShop(db, trimmedName)
      setNewName('')
      setError(null)
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Shop')
    }
  }

  async function handleRename(shop: ShopRecord, name: string) {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setError('A Shop needs a name.')
      return
    }
    try {
      await renameShop(db, shop, trimmedName)
      setError(null)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename Shop')
    }
  }

  async function handleDelete(shop: ShopRecord) {
    try {
      await deleteShop(db, shop)
      setError(null)
      setEditing(null)
    } catch (err) {
      setError(err instanceof ShopInUseError ? err.message : 'Could not delete Shop')
    }
  }

  return (
    <section>
      <TopAppBarActions>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarActions>
      <h2>Shops</h2>
      {error !== null && <p role="alert">{error}</p>}
      <ul>
        {shops.map((shop) => (
          <ListRow
            key={shop.id}
            headline={shop.name}
            control={
              <Button
                variant="text"
                aria-label={`Edit ${shop.name}`}
                onClick={() => {
                  setEditName(shop.name)
                  setEditing(shop)
                }}
              >
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Fab symbol={AddIcon} label="Add Shop" onClick={() => setAdding(true)} />
      <Dialog open={adding} title="Add Shop" onClose={() => setAdding(false)}>
        <form onSubmit={handleCreate}>
          <TextField label="New Shop name" value={newName} onInput={(event) => setNewName(event.currentTarget.value)} />
          <Button type="submit">Add</Button>
        </form>
      </Dialog>
      <Dialog open={editing !== null} title="Edit Shop" onClose={() => setEditing(null)}>
        {editing !== null && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleRename(editing, editName)
            }}
          >
            <TextField label="Shop name" value={editName} onInput={(event) => setEditName(event.currentTarget.value)} />
            <Button type="submit">Rename</Button>
            <Button variant="text" onClick={() => void handleDelete(editing)}>
              Delete
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  )
}
