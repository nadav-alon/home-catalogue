import type { ComponentChildren } from 'preact'
import { useEffect, useId, useRef } from 'preact/hooks'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  /** Accessible name and visible heading. */
  title: string
  /** Called on Escape and on browser back; the caller decides by setting `open`. */
  onClose: () => void
  children: ComponentChildren
}

const historyMarker = 'ui-dialog'

/**
 * A native modal `<dialog>`: the browser traps focus and inerts the page behind it. Opening pushes a
 * history entry so back closes it; the entry is popped again when the caller closes it another way.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    dialog.showModal()
    history.pushState({ [historyMarker]: true }, '')
    let poppedByBack = false
    const onPopState = () => {
      poppedByBack = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      if (dialog.open) dialog.close()
      if (!poppedByBack) history.back()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      class="ui-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 class="ui-dialog__title" id={titleId}>
        {title}
      </h2>
      {children}
    </dialog>
  )
}
