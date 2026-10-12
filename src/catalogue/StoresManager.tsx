import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { TextField } from '../ui/TextField.tsx'
import { createStore, renameStore, restoreStore, softDeleteStore, type StoreRecord } from './stores.ts'
import type { ShopRecord } from './shops.ts'

export const BLANK_STORE_NAME_MESSAGE = 'A Store needs a name.'

interface StoreDialogProps {
  db: Firestore
  shopId: catalogue.ShopId
  /** The Store being edited; undefined when adding a new one under `shopId`. */
  store?: StoreRecord
  onClose: () => void
}

/** Owns its draft name and error, so each opening starts from the Store's name at that moment; mount it only while open. */
function StoreDialog({ db, shopId, store, onClose }: StoreDialogProps) {
  const [name, setName] = useState(store?.name ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length === 0) return setError(BLANK_STORE_NAME_MESSAGE)
    try {
      if (store === undefined) await createStore(db, shopId, trimmedName)
      else await renameStore(db, store, trimmedName)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Store')
    }
  }

  async function handleDelete(target: StoreRecord) {
    try {
      await softDeleteStore(db, target)
      showSnackbar({
        text: `Deleted ${target.name}`,
        action: { label: 'Undo', onAction: () => void restoreStore(db, target) },
      })
      onClose()
    } catch {
      setError('Could not delete Store')
    }
  }

  return (
    <Dialog open title={store === undefined ? 'Add Store' : 'Edit Store'} onClose={onClose} hasUnsavedEdits={name !== (store?.name ?? '')} closable>
      <form class={DIALOG_FORM_CLASS} onSubmit={(event) => void handleSubmit(event)}>
        {error !== null && <p role="alert">{error}</p>}
        <TextField label="Store name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
        <DialogActions
          destructive={
            store === undefined ? undefined : (
              <Button variant="text" onClick={() => void handleDelete(store)}>
                Delete
              </Button>
            )
          }
        >
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{store === undefined ? 'Add' : 'Rename'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export interface ShopStoresProps {
  db: Firestore
  shop: ShopRecord
  /** The live Stores under `shop`. */
  stores: readonly StoreRecord[]
}

/** The Stores under one Shop with their add and edit dialogs; a list item to render inside the Shops list. */
export function ShopStores({ db, shop, stores }: ShopStoresProps) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<StoreRecord | null>(null)

  return (
    <li>
      <ul aria-label={`Stores of ${shop.name}`}>
        {stores.map((store) => (
          <ListRow
            key={store.id}
            headline={store.name}
            control={
              <Button variant="text" aria-label={`Edit ${store.name}`} onClick={() => setEditing(store)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Button variant="text" aria-label={`Add Store to ${shop.name}`} onClick={() => setAdding(true)}>
        Add Store
      </Button>
      {adding && <StoreDialog db={db} shopId={shop.id} onClose={() => setAdding(false)} />}
      {editing !== null && <StoreDialog db={db} shopId={shop.id} store={editing} onClose={() => setEditing(null)} />}
    </li>
  )
}
