import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { useUniqueId } from './useUniqueId.ts'
import { afterPendingPop, popEntry } from './pendingPop.ts'
import { IconButton } from './IconButton.tsx'
import CloseIcon from '~icons/material-symbols/close'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  /** Accessible name and visible heading. */
  title: string
  /** Called on Escape, on a tap of the backdrop, on the Close button, on browser back, and if the browser closes the dialog itself; the caller decides by setting `open`. With `hasUnsavedEdits` set, it is only called once the user confirms discarding them. */
  onClose: () => void
  /** Extra class for the `<dialog>`, for a dialog that departs from the shared layout. */
  class?: string
  /** Content holds edits that closing would lose: every way of closing first asks to confirm discarding them, and only calls `onClose` when confirmed. */
  hasUnsavedEdits?: boolean
  /** Puts a Close icon button in the title row that asks to close like Escape does. */
  closable?: boolean
  children: ComponentChildren
}

const historyMarker = 'ui-dialog'
const discardPrompt = 'Discard your unsaved changes?'

/** The backdrop belongs to the dialog element, so a pointer event on it targets the dialog itself, as does one on its padding: only a point outside the box is the backdrop. */
function isBackdropPoint(event: MouseEvent & { currentTarget: HTMLDialogElement }) {
  if (event.target !== event.currentTarget) return false
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
}

/**
 * A native modal `<dialog>`: the browser traps focus and inerts the page behind it. Opening pushes a
 * history entry so back closes it; the entry is popped again when the caller closes it another way.
 * Each dialog tags its entry with its own id and only pops an entry it still owns, and a dialog
 * opening while another's pop is in flight waits for that pop to land before pushing its own entry.
 */
export function Dialog({ open, title, onClose, class: className, closable, hasUnsavedEdits, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useUniqueId()
  const entryId = useUniqueId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const openRef = useRef(open)
  openRef.current = open
  const unsavedRef = useRef(hasUnsavedEdits)
  unsavedRef.current = hasUnsavedEdits
  const pressedBackdropRef = useRef(false)

  /** Whether closing may go ahead: always without unsaved edits, otherwise once the user confirms discarding them. */
  const confirmsDiscard = () => !unsavedRef.current || confirm(discardPrompt)

  /** Asks to close, first confirming the discard when the content holds unsaved edits. */
  const requestClose = () => {
    if (confirmsDiscard()) onCloseRef.current()
  }

  // A layout effect, so closing issues the pop in the same commit as the render that closed it, not after paint: a navigation
  // that follows the close at once (a resolved lookup) must already find the pop pending.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    dialog.showModal()
    let cancelled = false
    let pushed = false
    let poppedByBack = false
    const ownsEntry = () => history.state?.[historyMarker] === entryId
    const pushEntry = () => history.pushState({ [historyMarker]: entryId }, '')
    const onPopState = () => {
      const droppedEntry = !ownsEntry()
      if (!confirmsDiscard()) {
        // Back already left the entry; put it back so the next back reaches the dialog again, not the screen behind it.
        if (droppedEntry) pushEntry()
        return
      }
      if (droppedEntry) poppedByBack = true
      onCloseRef.current()
    }
    const push = () => {
      if (cancelled) return
      pushEntry()
      pushed = true
      window.addEventListener('popstate', onPopState)
    }
    afterPendingPop(push)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPopState)
      if (dialog.open) dialog.close()
      if (pushed && !poppedByBack && ownsEntry()) popEntry()
    }
  }, [open, entryId])

  return (
    <dialog
      ref={ref}
      class={className ? `ui-dialog ${className}` : 'ui-dialog'}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Uncancelable, the browser closes the dialog regardless and the close handler asks.
        if (!event.cancelable) return
        event.preventDefault()
        requestClose()
      }}
      onMouseDown={(event) => {
        pressedBackdropRef.current = isBackdropPoint(event)
      }}
      onClick={(event) => {
        // A drag that starts inside the box and ends outside it still clicks the dialog element, so a tap only closes
        // when the press and the release both landed on the backdrop.
        const pressedBackdrop = pressedBackdropRef.current
        pressedBackdropRef.current = false
        if (pressedBackdrop && isBackdropPoint(event)) requestClose()
      }}
      onClose={(event) => {
        if (!openRef.current) return
        // The browser has already closed it (a second Escape or the Android back gesture cannot be cancelled), so declining reopens it.
        if (confirmsDiscard()) onCloseRef.current()
        else if (!event.currentTarget.open) event.currentTarget.showModal()
      }}
    >
      <div class="ui-dialog__header">
        <h2 class="ui-dialog__title" id={titleId}>
          {title}
        </h2>
        {closable && <IconButton symbol={CloseIcon} label="Close" onClick={requestClose} />}
      </div>
      {children}
    </dialog>
  )
}
