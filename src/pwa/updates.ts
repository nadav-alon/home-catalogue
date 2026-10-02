import { registerSW } from 'virtual:pwa-register'

let started = false
let announced = 0
const listeners = new Set<() => void>()

/** Registers the service worker once, at startup, so it does not depend on any component mounting. */
export function startUpdateWatch(): void {
  if (started) return
  started = true
  registerSW({
    onNeedReload: () => {
      announced += 1
      listeners.forEach((listener) => listener())
    },
  })
}

/** How many times a newer build has taken over while the app was open; each is a new notice. */
export const announcedUpdates = () => announced

/** Calls `listener` on every new announcement; returns the unsubscribe. */
export function watchUpdates(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test-only: forgets the registration and announcements so the next `startUpdateWatch` registers afresh. */
export function resetUpdateWatch(): void {
  started = false
  announced = 0
  listeners.clear()
}
