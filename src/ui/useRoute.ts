import { useEffect, useMemo, useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { afterPendingPop } from 'household-ui/ui/pendingPop.ts'
import { addItemHandoffOf, categoryIdOf, DEFAULT_ROUTE, hashOf, itemIdsOf, itemsHashOf, routeIn, routeOf, recipeIdOf, shopIdOf, withItemsFilter, returnUrlWithItem, withoutAddItemHandoff, type AddItemHandoff, type ItemsFilter, type ReturnUrl, type Route } from './route.ts'

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

/** The Category, Shop and Recipe the current URL hash's `category`, `shop` and `recipe` queries name, re-read whenever the hash changes. */
export function useItemsFilter(): ItemsFilter {
  const hash = useHash()
  const categoryId = categoryIdOf(hash)
  const shopId = shopIdOf(hash)
  const recipeId = recipeIdOf(hash)
  return useMemo(() => ({ categoryId, shopId, recipeId }), [categoryId, shopId, recipeId])
}

/** Sets the Category, Shop and Recipe filters on the current hash by pushing a history entry, so back returns to the previous filter. */
export function setItemsFilter(filter: ItemsFilter): void {
  window.location.hash = withItemsFilter(window.location.hash, filter)
}

/** Shows the Items screen narrowed to `filter` alone, dropping any scanned Item filter, by pushing a history entry. */
export function navigateToItemsFilter(filter: ItemsFilter): void {
  window.location.hash = withItemsFilter(itemsHashOf([]), filter)
}

/** Shows `value` by pushing a history entry, so back returns to the previous route; a no-op when `value` is already shown. */
export function navigate(value: Route): void {
  window.location.hash = hashOf(value)
}

/**
 * Shows the Items screen filtered to `ids` by pushing a history entry; unfiltered when there are none.
 * The Category, Shop and Recipe filters on the current hash are kept, so a scan narrows them by AND like dismissing the scan does.
 * A Dialog closed earlier in the same tick has its history pop issued, and landed, before the push, so that pop
 * cannot move back from the new entry. The push is always asynchronous: the hash never changes before this returns.
 */
export function navigateToItems(ids: readonly core.ItemId[]): void {
  // A Dialog closed in this tick issues its pop when Preact commits the re-render that closes it, which Preact queues
  // on a microtask, so the wait starts one microtask later; a deferred debounceRendering (timeout, rAF) would need a
  // longer one.
  void Promise.resolve().then(() =>
    afterPendingPop(() => {
      window.location.hash = withItemsFilter(itemsHashOf(ids), {
        categoryId: categoryIdOf(window.location.hash),
        shopId: shopIdOf(window.location.hash),
        recipeId: recipeIdOf(window.location.hash),
      })
    }),
  )
}

/** The add-Item hand-off the current URL hash asks for, re-read whenever the hash changes; undefined when there is none. */
export function useAddItemHandoff(): AddItemHandoff | undefined {
  const hash = useHash()
  const { name, returnUrl } = addItemHandoffOf(hash, window.location.origin) ?? {}
  return useMemo(() => (name === undefined ? undefined : { name, returnUrl }), [name, returnUrl])
}

/**
 * Drops the add-Item hand-off from the current hash without a history entry, so a reload does not ask for it again.
 * `replaceState` fires no `hashchange`, so one is dispatched for the `useHash` subscribers to see the cleaned hash.
 */
export function clearAddItemHandoff(): void {
  const oldURL = window.location.href
  window.history.replaceState(window.history.state, '', withoutAddItemHandoff(window.location.hash))
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
}

/** Leaves the app for `url`, with the new Item's id appended when there is one; the hand-off is dropped first so Back does not reopen it. */
export function leaveTo(url: ReturnUrl, id?: core.ItemId): void {
  clearAddItemHandoff()
  window.location.assign(id === undefined ? url : returnUrlWithItem(url, id))
}
