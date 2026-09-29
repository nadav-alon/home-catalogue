const ROUTES = ['/list', '/items', '/settings', '/settings/shops', '/settings/categories'] as const

/** A place the app can show: the path after `#` in the URL hash. A closed set, so it can be switched over exhaustively. */
export type Route = (typeof ROUTES)[number]

export function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value)
}

export function route(value: string): Route {
  if (!isRoute(value)) throw new Error(`Not a route: ${value}`)
  return value
}

/** Where an empty or unrecognised hash lands: the Shopping list. */
export const DEFAULT_ROUTE: Route = route('/list')

/** The route a URL hash names; the default route when the hash is empty or unknown. */
export function routeOf(hash: string): Route {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  return isRoute(path) ? path : DEFAULT_ROUTE
}

/** The URL hash that names `value`. */
export function hashOf(value: Route): string {
  return `#${value}`
}
