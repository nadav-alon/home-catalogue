import type { ComponentChildren } from 'preact'
import { useEffect, useId, useRef } from 'preact/hooks'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  /** Accessible name and visible heading. */
  title: string
  /** Called on Escape, on browser back, and if the browser closes the dialog itself; the caller decides by setting `open`. */
  onClose: () => void
  /** Extra class for the `<dialog>`, for a dialog that departs from the shared layout. */
  class?: string
  children: ComponentChildren
}

const historyMarker = 'ui-dialog'

/** Set while a `history.back()` issued here has not yet produced its `popstate`. */
let pendingBack: Promise<void> | null = null

function popEntry() {
  const settled: Promise<void> = new Promise((resolve) => {
    window.addEventListener(
      'popstate',
      () => {
        if (pendingBack === settled) pendingBack = null
        resolve()
      },
      { once: true },
    )
  })
  pendingBack = settled
  history.back()
}

/** Runs `run` at once, or once the `history.back()` a closing Dialog issued has landed, so a history entry pushed by `run` is not undone by that pending traversal. */
export function afterPendingPop(run: () => void): void {
  if (pendingBack) void pendingBack.then(run)
  else run()
}

/**
 * A native modal `<dialog>`: the browser traps focus and inerts the page behind it. Opening pushes a
 * history entry so back closes it; the entry is popped again when the caller closes it another way.
 * Each dialog tags its entry with its own id and only pops an entry it still owns, and a dialog
 * opening while another's pop is in flight waits for that pop to land before pushing its own entry.
 */
export function Dialog({ open, title, onClose, class: className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const entryId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
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
    if (pendingBack) void pendingBack.then(push)
    else push()
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
      onClose={() => {
        if (openRef.current) onClose()
      }}
    >
      <h2 class="ui-dialog__title" id={titleId}>
        {title}
      </h2>
      {children}
    </dialog>
  )
}
