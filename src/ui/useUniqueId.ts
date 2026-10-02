import { useState } from 'preact/hooks'

let nextId = 0

/**
 * An element id no other mounted element shares. Preact's `useId` derives ids from a counter on the
 * render root, which a component mounted later (a dialog's form) can restart, repeating ids the page already uses.
 */
export function useUniqueId(): string {
  return useState(() => `ui-${(nextId += 1)}`)[0]
}
