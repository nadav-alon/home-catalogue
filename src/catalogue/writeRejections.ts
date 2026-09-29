
export interface WriteRejection {
  id: string
  message: string
}

type Listener = (rejections: WriteRejection[]) => void

let rejections: WriteRejection[] = []
let nextId = 0
const listeners = new Set<Listener>()

function publish() {
  for (const listener of listeners) listener(rejections)
}

/**
 * Tells the user that `what` (for example `State change for Bandages`) could not be saved. Every
 * catalogue write module reports here when a queued write is rejected on sync, since by then the
 * caller has already returned and the optimistic local write has been rolled back.
 * Also logs `err`.
 */
export function reportWriteRejection(what: string, err: unknown): void {
  show(`Could not save ${what}`, err)
}

/**
 * Shows `message` in the same banner, followed by the readable cause from `err`, and logs `err`.
 * For failures that are not a rejected queued write, such as the Export falling back to deep links.
 */
export function reportFailure(message: string, err: unknown): void {
  show(err instanceof Error && err.message.length > 0 ? `${message}: ${err.message}` : message, err)
}

function show(message: string, err: unknown): void {
  console.error(message, err)
  nextId += 1
  rejections = [...rejections, { id: `write-rejection-${nextId}`, message }]
  publish()
}

export function dismissWriteRejection(id: string): void {
  rejections = rejections.filter((rejection) => rejection.id !== id)
  publish()
}

/** Notifies `listener` immediately, then on every change, with the rejections not yet dismissed. Returns the unsubscribe function. */
export function watchWriteRejections(listener: Listener): () => void {
  listeners.add(listener)
  listener(rejections)
  return () => {
    listeners.delete(listener)
  }
}

/** Clears every rejection; for tests, which share this module-level state. */
export function resetWriteRejections(): void {
  rejections = []
  publish()
}
