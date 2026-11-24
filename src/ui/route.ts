import { catalogue, core, recipes } from 'data-platform'

const ROUTES = ['/list', '/items', '/settings', '/settings/shops', '/settings/categories', '/settings/tags', '/settings/aisles', '/settings/members'] as const

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
const RECIPE_KEY = 'recipe'

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

/** The Recipe a `recipe=<id>` query on the hash names; undefined when there is none. Says nothing about whether it exists. */
export function recipeIdOf(hash: string): recipes.RecipeId | undefined {
  const id = queryValueOf(hash, RECIPE_KEY)
  return id !== undefined && recipes.isRecipeId(id) ? id : undefined
}

/** The Category, Shop and Recipe an Items screen is narrowed to; undefined for each that is not. */
export interface ItemsFilter {
  categoryId: catalogue.CategoryId | undefined
  shopId: catalogue.ShopId | undefined
  recipeId: recipes.RecipeId | undefined
}

/** `hash` with its Category, Shop and Recipe filters set to those given (cleared when undefined); every other query is kept. */
export function withItemsFilter(hash: string, filter: ItemsFilter): string {
  const [path, query] = hashParts(hash)
  const params = new URLSearchParams(query)
  for (const [key, id] of [[CATEGORY_KEY, filter.categoryId], [SHOP_KEY, filter.shopId], [RECIPE_KEY, filter.recipeId]] as const) {
    if (id === undefined) params.delete(key)
    else params.set(key, id)
  }
  return hashWithQuery(path, params)
}

/** `hash` with its `recipe` query set to `id` (cleared when undefined); every other query is kept. */
export function withRecipeId(hash: string, id: recipes.RecipeId | undefined): string {
  const [path, query] = hashParts(hash)
  const params = new URLSearchParams(query)
  if (id === undefined) params.delete(RECIPE_KEY)
  else params.set(RECIPE_KEY, id)
  return hashWithQuery(path, params)
}

const ADD_KEY = 'add'
const RETURN_KEY = 'return'
const ITEM_ID_KEY = 'itemId'

declare const returnUrlBrand: unique symbol

/** An absolute URL on the catalogue's own origin, which an add-Item hand-off may send the user back to. */
export type ReturnUrl = string & { readonly [returnUrlBrand]: true }

/** Whether `value` is an absolute URL whose origin is `origin`. */
export function isReturnUrl(value: string, origin: string): value is ReturnUrl {
  try {
    return new URL(value).origin === origin
  } catch {
    return false
  }
}

/** The constructor: narrows, or throws naming the offending value. */
export function returnUrl(value: string, origin: string): ReturnUrl {
  if (!isReturnUrl(value, origin)) throw new Error(`Not a ReturnUrl on ${origin}: ${JSON.stringify(value)}`)
  return value
}

/** A request, carried by the URL hash, to add an Item named `name` and then hand the user back to `returnUrl`. */
export interface AddItemHandoff {
  name: string
  /** Where to go once the dialog closes; undefined when the link carried none, or one off the catalogue's origin. */
  returnUrl: ReturnUrl | undefined
}

/** `value` resolved against `origin` (so a relative one is read as on it), as a ReturnUrl; undefined when it lands elsewhere. */
function resolveReturnUrl(value: string, origin: string): ReturnUrl | undefined {
  try {
    const resolved = new URL(value, origin).href
    return isReturnUrl(resolved, origin) ? resolved : undefined
  } catch {
    return undefined
  }
}

/**
 * The add-Item hand-off an `add=<name>[&return=<url>]` query on the hash asks for; undefined when there is no name.
 * A `return` URL not on `origin` is dropped, so the link cannot be used as an open redirect.
 */
export function addItemHandoffOf(hash: string, origin: string): AddItemHandoff | undefined {
  const name = queryValueOf(hash, ADD_KEY)?.trim()
  if (!name) return undefined
  const requested = queryValueOf(hash, RETURN_KEY)
  return { name, returnUrl: requested === undefined ? undefined : resolveReturnUrl(requested, origin) }
}

/** `url` with the new Item's id appended as its `itemId` query. */
export function returnUrlWithItem(url: ReturnUrl, id: core.ItemId): string {
  const target = new URL(url)
  target.searchParams.set(ITEM_ID_KEY, id)
  return target.toString()
}

/** `hash` without its add-Item hand-off queries; every other query is kept. */
export function withoutAddItemHandoff(hash: string): string {
  const [path, query] = hashParts(hash)
  const params = new URLSearchParams(query)
  params.delete(ADD_KEY)
  params.delete(RETURN_KEY)
  return hashWithQuery(path, params)
}
