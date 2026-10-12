import { useEffect, useState } from 'preact/hooks'
import { Fragment, type JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { TextField } from '../ui/TextField.tsx'
import ArrowDownwardIcon from '~icons/material-symbols/arrow-downward'
import ArrowUpwardIcon from '~icons/material-symbols/arrow-upward'
import { watchAisles, type AisleRecord } from './aisles.ts'
import { arrangeAisles, createStore, moveAisle, renameStore, restoreStore, setAisleOrder, softDeleteStore, type StoreRecord } from './stores.ts'
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

interface AisleOrderDialogProps {
  db: Firestore
  /** The Store as watchStores last reported it, so the list follows the saved order. */
  store: StoreRecord
  onClose: () => void
}

/**
 * Lists every live Aisle in the Store's order, the ones the order has not reached last under a
 * "Not yet placed" divider. A row moves by dragging or by its move up and move down buttons; every
 * move saves the order at once, so the dialog has nothing to confirm.
 */
function AisleOrderDialog({ db, store, onClose }: AisleOrderDialogProps) {
  const [aisles, setAisles] = useState<AisleRecord[]>([])
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  useEffect(() => watchAisles(db, setAisles), [db])

  const arranged = arrangeAisles(aisles, store.aisleOrder)
  const rows = [...arranged.placed, ...arranged.unplaced]

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= rows.length) return
    void setAisleOrder(db, store, moveAisle(arranged, from, to))
  }

  return (
    <Dialog open title={`${store.name} aisle order`} onClose={onClose} closable>
      <ul>
        {rows.map((aisle, index) => {
          const unplaced = index >= arranged.placed.length
          return (
            <Fragment key={aisle.id}>
              {index === arranged.placed.length && <li>Not yet placed</li>}
              <li
                draggable
                aria-label={unplaced ? `${aisle.name}, not yet placed` : aisle.name}
                onDragStart={() => setDragFrom(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragFrom !== null) move(dragFrom, index)
                  setDragFrom(null)
                }}
              >
                <span>{aisle.name}</span>
                <IconButton symbol={ArrowUpwardIcon} label={`Move ${aisle.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)} />
                <IconButton symbol={ArrowDownwardIcon} label={`Move ${aisle.name} down`} disabled={index === rows.length - 1} onClick={() => move(index, index + 1)} />
              </li>
            </Fragment>
          )
        })}
      </ul>
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
  const [ordering, setOrdering] = useState<StoreRecord | null>(null)
  const liveOrdering = ordering === null ? undefined : stores.find((store) => store.id === ordering.id)

  return (
    <li>
      <ul aria-label={`Stores of ${shop.name}`}>
        {stores.map((store) => (
          <ListRow
            key={store.id}
            headline={store.name}
            trailing={
              <Button variant="text" aria-label={`Order aisles of ${store.name}`} onClick={() => setOrdering(store)}>
                Aisles
              </Button>
            }
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
      {liveOrdering !== undefined && <AisleOrderDialog db={db} store={liveOrdering} onClose={() => setOrdering(null)} />}
    </li>
  )
}
