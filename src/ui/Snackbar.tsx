import { useEffect, useState } from 'preact/hooks'
import { Button } from './Button.tsx'
import { milliseconds } from './milliseconds.ts'
import './Snackbar.css'

export interface SnackbarMessage {
  /** What happened, for example `Deleted Bandages`. */
  text: string
  /** An optional button beside the text, for example Undo. Pressing it runs `onAction` and dismisses the snackbar. */
  action?: { label: string; onAction: () => void }
}

/** How long a snackbar stays before it disappears on its own. */
const snackbarDurationMs = milliseconds(6000)

type Listener = (current: SnackbarMessage | null) => void

let current: SnackbarMessage | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<Listener>()

function publish(next: SnackbarMessage | null): void {
  clearTimeout(timer)
  current = next
  for (const listener of listeners) listener(current)
}

/** Shows `message` in the app's one snackbar, from any screen. */
export function showSnackbar(message: SnackbarMessage): void {
  publish(message)
  timer = setTimeout(() => dismiss(message), snackbarDurationMs)
}

/** Dismisses the snackbar if `message` is still the one showing. */
function dismiss(message: SnackbarMessage): void {
  if (current === message) publish(null)
}

/** Notifies `listener` immediately, then on every change, with the current message or `null`. Returns the unsubscribe function. */
function watchSnackbar(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Renders the current snackbar, if any. Mount it once, app-wide: the `role="status"` region stays
 * in the document while empty so that screen readers announce a message when it appears.
 *
 * Mounted inside `App`, so a message shown from the setup and sign-in screens, which `Root` renders
 * outside it, is not displayed.
 */
export function SnackbarHost() {
  const [message, setMessage] = useState<SnackbarMessage | null>(null)

  useEffect(() => watchSnackbar(setMessage), [])

  return (
    <div class="ui-snackbar" role="status">
      {message && <p class="ui-snackbar__text">{message.text}</p>}
      {message?.action && (
        <Button
          variant="text"
          onClick={() => {
            dismiss(message)
            message.action?.onAction()
          }}
        >
          {message.action.label}
        </Button>
      )}
    </div>
  )
}

/** Clears the snackbar and its timer; for tests, which share this module-level state. */
export function resetSnackbar(): void {
  publish(null)
}
