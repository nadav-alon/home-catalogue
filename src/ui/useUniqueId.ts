import { useState } from 'preact/hooks'

let nextId = 0

/**
 * An element id no other mounted element shares. Preact's `useId` can restart its sequence for a subtree
 * mounted after a re-render (a dialog's form), repeating ids the page already uses.
 */
export function useUniqueId(): string {
  return useState(() => `ui-${(nextId += 1)}`)[0]
}
