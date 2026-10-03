import { catalogue, core } from 'data-platform'

const ROUTES = ['/list', '/items', '/settings', '/settings/shops', '/settings/categories', '/settings/tags', '/settings/members'] as const

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
const CATEGORY_KEY = 'category'
const SHOP_KEY = 'shop'

/** The value of the `key` query on the hash; undefined when there is none or it is empty. */
function queryValueOf(hash: string, key: string): string | undefined {
  const [, query] = hashParts(hash)
  return new URLSearchParams(query).get(key) || undefined
}

/**
 * `path` with `params` as its query. Each value is written as `encodeURIComponent` does, except that the separator
 * between the ids of the `item` value stays a literal comma, so the hash reads `item=a,b`.
 */
function hashWithQuery(path: string, params: URLSearchParams): string {
  const query = [...params]
    .map(([key, value]) => {
      const written =
        key === ITEM_KEY ? value.split(ITEM_ID_SEPARATOR).map(encodeURIComponent).join(ITEM_ID_SEPARATOR) : encodeURIComponent(value)
      return `${encodeURIComponent(key)}=${written}`
    })
    .join('&')
  return query === '' ? `#${path}` : `#${path}?${query}`
}

/**
 * The Item ids an `item=<id>[,<id>…]` query on the hash names, in order; empty when there is none.
 * Says nothing about whether an Item with that id exists.
 */
export function itemIdsOf(hash: string): core.ItemId[] {
  const listed = queryValueOf(hash, ITEM_KEY) ?? ''
  return listed.split(ITEM_ID_SEPARATOR).filter(core.isItemId)
}

/** The URL hash that names `value`. */
export function hashOf(value: Route): string {
  return `#${value}`
}

/** The URL hash of the Items screen filtered to `ids`; the unfiltered Items screen's when there are none. */
export function itemsHashOf(ids: readonly core.ItemId[]): string {
  const params = new URLSearchParams()
  if (ids.length > 0) params.set(ITEM_KEY, ids.join(ITEM_ID_SEPARATOR))
  return hashWithQuery(route('/items'), params)
}

/** The Category a `category=<id>` query on the hash names; undefined when there is none. Says nothing about whether it exists. */
export function categoryIdOf(hash: string): catalogue.CategoryId | undefined {
  const id = queryValueOf(hash, CATEGORY_KEY)
  return id !== undefined && catalogue.isCategoryId(id) ? id : undefined
}

/** The Shop a `shop=<id>` query on the hash names; undefined when there is none. Says nothing about whether it exists. */
export function shopIdOf(hash: string): catalogue.ShopId | undefined {
  const id = queryValueOf(hash, SHOP_KEY)
  return id !== undefined && catalogue.isShopId(id) ? id : undefined
}

/** The Category and Shop an Items screen is narrowed to; undefined for each that is not. */
export interface CategoryAndShop {
  categoryId: catalogue.CategoryId | undefined
  shopId: catalogue.ShopId | undefined
}

/** `hash` with its Category and Shop filters set to those given (cleared when undefined); every other query is kept. */
export function withCategoryAndShop(hash: string, filter: CategoryAndShop): string {
  const [path, query] = hashParts(hash)
  const params = new URLSearchParams(query)
  for (const [key, id] of [[CATEGORY_KEY, filter.categoryId], [SHOP_KEY, filter.shopId]] as const) {
    if (id === undefined) params.delete(key)
    else params.set(key, id)
  }
  return hashWithQuery(path, params)
}
