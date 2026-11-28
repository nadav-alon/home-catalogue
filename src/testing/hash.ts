import { nextTask } from './nextTask.ts'

/** Test-only: clears the URL hash and lets the router's `hashchange` listeners settle. For `afterEach`. */
export async function resetHash(): Promise<void> {
  window.location.hash = ''
  await nextTask()
}

/** Test-only: runs `action` and resolves once the `hashchange` it causes has fired. Call inside `act`'s async callback or await it there. */
export async function untilHashChange(action: () => void): Promise<void> {
  const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }))
  action()
  await changed
}
