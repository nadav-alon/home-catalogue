import { useEffect, useState } from 'preact/hooks'

export interface SnackbarMessage {
  /** What happened, for example `Deleted Bandages`. */
  text: string
}

type Listener = (current: SnackbarMessage | null) => void

let current: SnackbarMessage | null = null
const listeners = new Set<Listener>()

function publish(next: SnackbarMessage | null): void {
  current = next
  for (const listener of listeners) listener(current)
}

/** Shows `message` in the app's one snackbar, from any screen. */
export function showSnackbar(message: SnackbarMessage): void {
  publish(message)
}

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
 */
export function SnackbarHost() {
  const [message, setMessage] = useState<SnackbarMessage | null>(null)

  useEffect(() => watchSnackbar(setMessage), [])

  return (
    <div class="ui-snackbar" role="status">
      {message && <p class="ui-snackbar__text">{message.text}</p>}
    </div>
  )
}
