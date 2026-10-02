import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import { useUniqueId } from '../ui/useUniqueId.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'
import {
  createShop,
  deleteShop,
  isShopInUse,
  renameShop,
  restoreShop,
  watchShops,
  SHOP_IN_USE_MESSAGE,
  type ShopRecord,
} from './shops.ts'

const SETTINGS = route('/settings')

export interface ShopsManagerProps {
  db: Firestore
}

export const BLANK_NAME_MESSAGE = 'A Shop needs a name.'
export const SHOP_DELETED_MESSAGE = 'This Shop was deleted.'

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
    <Dialog open title="Add Shop" onClose={onClose} closable>
      <form class={DIALOG_FORM_CLASS} onSubmit={handleSubmit}>
        {error !== null && <p role="alert">{error}</p>}
        <TextField label="New Shop name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

interface EditShopDialogProps {
  db: Firestore
  /** The Shop as it was when the dialog opened; seeds the draft name. */
  opened: ShopRecord
  /** The Shop as watchShops last reported it; drives everything that must stay current. Undefined once it has left the live list. */
  live: ShopRecord | undefined
  onClose: () => void
}

/** Owns its draft name and error, so each opening starts from the Shop's name at that moment; mount it only while open. */
function EditShopDialog({ db, opened, live, onClose }: EditShopDialogProps) {
  const shop = live ?? opened
  const deletingHere = useRef(false)
  const [name, setName] = useState(opened.name)
  const inUseNoteId = useUniqueId()
  const [error, setError] = useState<string | null>(null)

  // A Shop leaving the live list that this dialog did not delete itself was deleted elsewhere.
  // watchShops also drops documents that fail validation, so absence can occasionally mean "invalid" rather than "deleted";
  // the dialog cannot show such a Shop either way, so the notice is best-effort wording, not proof of deletion.
  useEffect(() => {
    if (live !== undefined || deletingHere.current) return
    showSnackbar({ text: SHOP_DELETED_MESSAGE })
    onClose()
  }, [live, onClose])

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

  const inUse = isShopInUse(shop)

  async function handleDelete() {
    deletingHere.current = true
    try {
      await deleteShop(db, shop)
      showSnackbar({
        text: `Deleted ${shop.name}`,
        action: { label: 'Undo', onAction: () => void restoreShop(db, shop) },
      })
      onClose()
    } catch {
      deletingHere.current = false
      setError('Could not delete Shop')
    }
  }

  return (
    <Dialog open title="Edit Shop" onClose={onClose} closable>
      <form class={DIALOG_FORM_CLASS} onSubmit={handleRename}>
        {error !== null && <p role="alert">{error}</p>}
        <TextField label="Shop name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
        {inUse && <p id={inUseNoteId}>{SHOP_IN_USE_MESSAGE}</p>}
        <DialogActions
          destructive={
            <Button
              variant="text"
              disabled={inUse}
              aria-describedby={inUse ? inUseNoteId : undefined}
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          }
        >
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Rename</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function ShopsManager({ db }: ShopsManagerProps) {
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState<ShopRecord | null>(null)

  useEffect(() => watchShops(db, setShops), [db])

  const live = opened === null ? undefined : shops.find((shop) => shop.id === opened.id)

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <ul>
        {shops.map((shop) => (
          <ListRow
            key={shop.id}
            headline={shop.name}
            control={
              <Button variant="text" aria-label={`Edit ${shop.name}`} onClick={() => setOpened(shop)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Fab symbol={AddIcon} label="Add Shop" onClick={() => setAdding(true)} />
      {adding && <AddShopDialog db={db} onClose={() => setAdding(false)} />}
      {opened !== null && (
        <EditShopDialog db={db} opened={opened} live={live} onClose={() => setOpened(null)} />
      )}
    </section>
  )
}
