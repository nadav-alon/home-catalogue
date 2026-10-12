import { useEffect, useRef, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { JSX } from 'preact'
import { AISLE_NAME_TAKEN_MESSAGE, createAisle, findAisleByName, softDeleteAisle, renameAisle, restoreAisle, AisleNameTakenError, watchAisles, type AisleRecord } from './aisles.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { Fab } from '../ui/Fab.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { TextField } from '../ui/TextField.tsx'
import { showSnackbar } from '../ui/Snackbar.tsx'
import { navigate } from '../ui/useRoute.ts'
import AddIcon from '~icons/material-symbols/add'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

export const BLANK_AISLE_NAME_MESSAGE = 'A Aisle needs a name.'

interface AddAisleDialogProps {
  db: Firestore
  aisles: readonly AisleRecord[]
  onClose: () => void
}

/** Owns its draft name and error, so each opening starts blank; mount it only while open. */
function AddAisleDialog({ db, aisles, onClose }: AddAisleDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** createAisle resolves once queued, so the dialog closes at once even offline. */
  async function handleSubmit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim().length === 0) return setError(BLANK_AISLE_NAME_MESSAGE)
    if (findAisleByName(aisles, name) !== undefined) return setError(AISLE_NAME_TAKEN_MESSAGE)
    try {
      await createAisle(db, name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add Aisle')
    }
  }

  return (
    <Dialog open title="Add Aisle" onClose={onClose} hasUnsavedEdits={name !== ''} closable>
      <form class={DIALOG_FORM_CLASS} onSubmit={(event) => void handleSubmit(event)}>
        <TextField
          label="New Aisle name"
          value={name}
          error={error ?? undefined}
          onInput={(event) => {
            setName(event.currentTarget.value)
            setError(null)
          }}
        />
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

export interface AislesManagerProps {
  db: Firestore
}

/** The Aisles sub-page of Settings: every live Aisle, used by an Item or not. */
export function AislesManager({ db }: AislesManagerProps) {
  const [aisles, setAisles] = useState<AisleRecord[]>([])
  // Undo outlives the render that deleted the Aisle, so it reads the Aisles as they are when it is pressed.
  const aislesRef = useRef(aisles)
  aislesRef.current = aisles
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AisleRecord | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchAisles(db, setAisles), [db])

  function openEdit(aisle: AisleRecord) {
    setName(aisle.name)
    setError(null)
    setEditing(aisle)
  }

  function closeDialog() {
    setEditing(null)
    setName('')
    setError(null)
  }

  /** renameAisle resolves once queued, so the dialog closes at once even offline. */
  async function handleSave(event: JSX.TargetedEvent<HTMLFormElement>, aisle: AisleRecord) {
    event.preventDefault()
    if (name.trim().length === 0) return setError(BLANK_AISLE_NAME_MESSAGE)
    try {
      await renameAisle(db, aisle, name, aisles)
      closeDialog()
    } catch (err) {
      setError(err instanceof AisleNameTakenError ? err.message : 'Could not save Aisle')
    }
  }

  /** softDeleteAisle resolves once queued, so the dialog closes at once even offline; Undo restores the Aisle, and the Items that carried it show it again because they kept its id. */
  async function handleDelete(aisle: AisleRecord) {
    await softDeleteAisle(db, aisle)
    closeDialog()
    showSnackbar({
      text: `Deleted ${aisle.name}`,
      action: { label: 'Undo', onAction: () => void restoreAisle(db, aisle, aislesRef.current) },
    })
  }

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <ul>
        {aisles.map((aisle) => (
          <ListRow
            key={aisle.id}
            headline={aisle.name}
            control={
              <Button variant="text" aria-label={`Edit ${aisle.name}`} onClick={() => openEdit(aisle)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Dialog open={editing !== null} title="Edit Aisle" onClose={closeDialog} hasUnsavedEdits={editing !== null && name !== editing.name} closable>
        {editing !== null && (
          <form class={DIALOG_FORM_CLASS} onSubmit={(event) => void handleSave(event, editing)}>
            <TextField
              label="Aisle name"
              value={name}
              error={error ?? undefined}
              onInput={(event) => {
                setName(event.currentTarget.value)
                setError(null)
              }}
            />
            <DialogActions
              destructive={
                <Button variant="text" onClick={() => void handleDelete(editing)}>
                  Delete
                </Button>
              }
            >
              <Button variant="text" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
      <Fab symbol={AddIcon} label="Add Aisle" onClick={() => setAdding(true)} />
      {adding && <AddAisleDialog db={db} aisles={aisles} onClose={() => setAdding(false)} />}
    </section>
  )
}
