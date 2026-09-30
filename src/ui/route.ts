import { core } from 'data-platform'

const ROUTES = ['/list', '/items', '/settings', '/settings/shops', '/settings/categories'] as const

/** A place the app can show: the path after `#` in the URL hash. A closed set, so it can be switched over exhaustively. */
export type Route = (typeof ROUTES)[number]

export function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value)
}

export function route(value: string): Route {
  if (!isRoute(value)) throw new Error(`Not a route: ${JSON.stringify(value)}`)
  return value
}

/** Where an empty or unrecognised hash lands: the Shopping list. */
export const DEFAULT_ROUTE: Route = route('/list')

/** The route a URL hash names; undefined when the hash is empty or names no route. */
export function routeIn(hash: string): Route | undefined {
  const [path] = hashParts(hash)
  return isRoute(path) ? path : undefined
}

/** The route a URL hash names; the default route when the hash is empty or unknown. */
export function routeOf(hash: string): Route {
  return routeIn(hash) ?? DEFAULT_ROUTE
}

/** The path and the query string (without its `?`) of a URL hash. */
function hashParts(hash: string): [path: string, query: string] {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  const at = body.indexOf('?')
  return at === -1 ? [body, ''] : [body.slice(0, at), body.slice(at + 1)]
}

/** The query key, and the separator between ids, of the Items screen's Item filter. */
const ITEM_KEY = 'item'
const ITEM_ID_SEPARATOR = ','

/**
 * The Item ids an `item=<id>[,<id>…]` query on the hash names, in order; empty when there is none.
 * Says nothing about whether an Item with that id exists.
 */
export function itemIdsOf(hash: string): core.ItemId[] {
  const [, query] = hashParts(hash)
  const listed = new URLSearchParams(query).get(ITEM_KEY) ?? ''
  return listed
    .split(ITEM_ID_SEPARATOR)
    .filter((id) => id.length > 0)
    .map((id) => core.itemId(id))
}

/** The URL hash that names `value`. */
export function hashOf(value: Route): string {
  return `#${value}`
}

/** The URL hash of the Items screen filtered to `ids`; the unfiltered Items screen's when there are none. */
export function itemsHashOf(ids: readonly core.ItemId[]): string {
  const items = hashOf(route('/items'))
  return ids.length === 0 ? items : `${items}?${ITEM_KEY}=${ids.join(ITEM_ID_SEPARATOR)}`
}
