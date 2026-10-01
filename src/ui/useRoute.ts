import { useEffect, useMemo, useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { afterPendingPop } from './pendingPop.ts'
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

/**
 * Shows the Items screen filtered to `ids` by pushing a history entry; unfiltered when there are none.
 * A Dialog closed earlier in the same tick has its history pop issued, and landed, before the push, so that pop
 * cannot move back from the new entry. The push is always asynchronous: the hash never changes before this returns.
 */
export function navigateToItems(ids: readonly core.ItemId[]): void {
  // A Dialog closed in this tick issues its pop when Preact commits the re-render that closes it, which Preact queues
  // on a microtask, so the wait starts one microtask later; a deferred debounceRendering (timeout, rAF) would need a
  // longer one.
  void Promise.resolve().then(() =>
    afterPendingPop(() => {
      window.location.hash = itemsHashOf(ids)
    }),
  )
}
