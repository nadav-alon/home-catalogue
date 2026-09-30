import { useEffect, useMemo, useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { DEFAULT_ROUTE, hashOf, itemIdsOf, itemsHashOf, routeIn, routeOf, type Route } from './route.ts'

/** Rewrites a hash that does not name a route to the default route's hash, replacing the history entry (and keeping its state) rather than pushing one. */
function normaliseHash(): void {
  if (routeIn(window.location.hash)) return
  window.history.replaceState(window.history.state, '', hashOf(DEFAULT_ROUTE))
}

/** The current URL hash, re-read whenever it changes; while mounted, it always names a route. */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onHashChange = () => {
      normaliseHash()
      setHash(window.location.hash)
    }
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

/** The current route, re-read whenever the URL hash changes; while mounted, the URL always names it. */
export function useRoute(): Route {
  return routeOf(useHash())
}

/** The Item ids the current URL hash's `item` query names, re-read whenever the hash changes; empty when there is none. */
export function useItemIds(): core.ItemId[] {
  const hash = useHash()
  return useMemo(() => itemIdsOf(hash), [hash])
}

/** Shows `value` by pushing a history entry, so back returns to the previous route; a no-op when `value` is already shown. */
export function navigate(value: Route): void {
  window.location.hash = hashOf(value)
}

/** Shows the Items screen filtered to `ids` by pushing a history entry; unfiltered when there are none. */
export function navigateToItems(ids: readonly core.ItemId[]): void {
  window.location.hash = itemsHashOf(ids)
}
