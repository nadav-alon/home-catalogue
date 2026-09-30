import { useEffect, useState } from 'preact/hooks'
import { DEFAULT_ROUTE, hashOf, routeOf, type Route } from './route.ts'

/** Rewrites a hash that does not name a route to the default route's hash, replacing the history entry rather than pushing one. */
function normaliseHash(): void {
  const hash = window.location.hash
  if (hash !== hashOf(routeOf(hash))) {
    window.history.replaceState(null, '', hashOf(DEFAULT_ROUTE))
  }
}

/** The current route, re-read whenever the URL hash changes; the URL always names it. */
export function useRoute(): Route {
  const [current, setCurrent] = useState(() => routeOf(window.location.hash))
  useEffect(() => {
    normaliseHash()
    const onHashChange = () => setCurrent(routeOf(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return current
}

/** Shows `value` by pushing a history entry, so back returns to the previous route; a no-op when `value` is already shown. */
export function navigate(value: Route): void {
  window.location.hash = hashOf(value)
}
