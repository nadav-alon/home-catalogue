import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename Shop')
    }
  }

  async function handleDelete(shop: ShopRecord) {
    try {
      await deleteShop(db, shop)
      setError(null)
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
          <ShopRow
            key={shop.id}
            shop={shop}
            onRename={(name) => void handleRename(shop, name)}
            onDelete={() => void handleDelete(shop)}
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
    </section>
  )
}

interface ShopRowProps {
  shop: ShopRecord
  onRename: (name: string) => void
  onDelete: () => void
}

function ShopRow({ shop, onRename, onDelete }: ShopRowProps) {
  const [name, setName] = useState(shop.name)

  useEffect(() => setName(shop.name), [shop.name])

  return (
    <li>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onRename(name)
        }}
      >
        <label htmlFor={`shop-name-${shop.id}`}>Rename {shop.name}</label>
        <input id={`shop-name-${shop.id}`} value={name} onInput={(event) => setName(event.currentTarget.value)} />
        <button type="submit">Rename</button>
      </form>
      <button type="button" onClick={onDelete}>
        Delete {shop.name}
      </button>
    </li>
  )
}
