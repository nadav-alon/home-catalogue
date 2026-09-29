import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { createShop, deleteShop, renameShop, watchShops, ShopInUseError, type ShopRecord } from './shops.ts'

export interface ShopsManagerProps {
  db: Firestore
}

export function ShopsManager({ db }: ShopsManagerProps) {
  const [shops, setShops] = useState<ShopRecord[]>([])
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
      await renameShop(db, shop.id, trimmedName)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename Shop')
    }
  }

  async function handleDelete(shop: ShopRecord) {
    try {
      await deleteShop(db, shop.id)
      setError(null)
    } catch (err) {
      setError(err instanceof ShopInUseError ? err.message : 'Could not delete Shop')
    }
  }

  return (
    <section>
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
      <form onSubmit={handleCreate}>
        <label htmlFor="new-shop-name">New Shop name</label>
        <input id="new-shop-name" value={newName} onInput={(event) => setNewName(event.currentTarget.value)} />
        <button type="submit">Add Shop</button>
      </form>
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
