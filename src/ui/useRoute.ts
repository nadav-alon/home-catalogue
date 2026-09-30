import { useEffect, useMemo, useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { DEFAULT_ROUTE, hashOf, itemIdsOf, routeIn, routeOf, type Route } from './route.ts'

/** Rewrites a hash that does not name a route to the default route's hash, replacing the history entry (and keeping its state) rather than pushing one. Returns the route the hash now names. */
function normaliseHash(): Route {
  const named = routeIn(window.location.hash)
  if (named) return named
  window.history.replaceState(window.history.state, '', hashOf(DEFAULT_ROUTE))
  return DEFAULT_ROUTE
}

/** The current route, re-read whenever the URL hash changes; while mounted, the URL always names it. */
export function useRoute(): Route {
  const [current, setCurrent] = useState(() => routeOf(window.location.hash))
  useEffect(() => {
    setCurrent(normaliseHash())
    const onHashChange = () => setCurrent(normaliseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return current
}

/** The Item ids the current URL hash's `item` query names, re-read whenever the hash changes; empty when there is none. */
export function useItemIds(): core.ItemId[] {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return useMemo(() => itemIdsOf(hash), [hash])
}

/** Shows `value` by pushing a history entry, so back returns to the previous route; a no-op when `value` is already shown. */
export function navigate(value: Route): void {
  window.location.hash = hashOf(value)
}
