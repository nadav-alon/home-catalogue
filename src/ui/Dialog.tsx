import type { ComponentChildren } from 'preact'
import { useId, useLayoutEffect, useRef } from 'preact/hooks'
import { afterPendingPop, popEntry } from './pendingPop.ts'
import { IconButton } from './IconButton.tsx'
import CloseIcon from '~icons/material-symbols/close'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  /** Accessible name and visible heading. */
  title: string
  /** Called on Escape, on a tap of the backdrop, on browser back, and if the browser closes the dialog itself; the caller decides by setting `open`. */
  onClose: () => void
  /** Extra class for the `<dialog>`, for a dialog that departs from the shared layout. */
  class?: string
  /** Puts a Close icon button in the title row that asks to close like Escape does. */
  closable?: boolean
  children: ComponentChildren
}

const historyMarker = 'ui-dialog'

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
export function Dialog({ open, title, onClose, class: className, closable, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const entryId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const openRef = useRef(open)
  openRef.current = open
  const pressedBackdropRef = useRef(false)

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
    const onPopState = () => {
      if (!ownsEntry()) poppedByBack = true
      onCloseRef.current()
    }
    const push = () => {
      if (cancelled) return
      history.pushState({ [historyMarker]: entryId }, '')
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
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        pressedBackdropRef.current = isBackdropPoint(event)
      }}
      onClick={(event) => {
        // A drag that starts inside the box and ends outside it still clicks the dialog element, so a tap only closes
        // when the press and the release both landed on the backdrop.
        const pressedBackdrop = pressedBackdropRef.current
        pressedBackdropRef.current = false
        if (pressedBackdrop && isBackdropPoint(event)) onClose()
      }}
      onClose={() => {
        if (openRef.current) onClose()
      }}
    >
      <div class="ui-dialog__header">
        <h2 class="ui-dialog__title" id={titleId}>
          {title}
        </h2>
        {closable && <IconButton symbol={CloseIcon} label="Close" onClick={onClose} />}
      </div>
      {children}
    </dialog>
  )
}
