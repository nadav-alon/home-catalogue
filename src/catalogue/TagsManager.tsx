import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import type { JSX } from 'preact'
import { renameTag, watchTags, type TagRecord } from './tags.ts'
import { TopAppBarNavigation } from '../shell/TopAppBar.tsx'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { route } from '../ui/route.ts'
import { TextField } from '../ui/TextField.tsx'
import { navigate } from '../ui/useRoute.ts'
import ArrowBackIcon from '~icons/material-symbols/arrow-back'

const SETTINGS = route('/settings')

export interface TagsManagerProps {
  db: Firestore
}

/** The Tags sub-page of Settings: every live Tag, used by an Item or not. */
export function TagsManager({ db }: TagsManagerProps) {
  const [tags, setTags] = useState<TagRecord[]>([])
  const [editing, setEditing] = useState<TagRecord | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchTags(db, setTags), [db])

  function openEdit(tag: TagRecord) {
    setName(tag.name)
    setError(null)
    setEditing(tag)
  }

  function closeDialog() {
    setEditing(null)
    setName('')
    setError(null)
  }

  /** renameTag resolves once queued, so the dialog closes at once even offline. */
  async function handleSave(event: JSX.TargetedEvent<HTMLFormElement>, tag: TagRecord) {
    event.preventDefault()
    try {
      await renameTag(db, tag, name, tags)
      closeDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Tag')
    }
  }

  return (
    <section>
      <TopAppBarNavigation>
        <IconButton symbol={ArrowBackIcon} label="Back to Settings" onClick={() => navigate(SETTINGS)} />
      </TopAppBarNavigation>
      <ul>
        {tags.map((tag) => (
          <ListRow
            key={tag.id}
            headline={tag.name}
            control={
              <Button variant="text" aria-label={`Edit ${tag.name}`} onClick={() => openEdit(tag)}>
                Edit
              </Button>
            }
          />
        ))}
      </ul>
      <Dialog open={editing !== null} title="Edit Tag" onClose={closeDialog} closable>
        {editing !== null && (
          <form class={DIALOG_FORM_CLASS} onSubmit={(event) => void handleSave(event, editing)}>
            <TextField
              label="Tag name"
              value={name}
              error={error ?? undefined}
              onInput={(event) => {
                setName(event.currentTarget.value)
                setError(null)
              }}
            />
            <DialogActions>
              <Button variant="text" onClick={closeDialog}>
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
