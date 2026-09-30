import type { Route } from '../ui/route.ts'

const TITLES: Record<Route, string> = {
  '/list': 'Shopping list',
  '/items': 'Items',
  '/settings': 'Settings',
  '/settings/shops': 'Shops',
  '/settings/categories': 'Categories',
  '/settings/members': 'Members',
}

/** The name of a route: the top app bar's title on it, and its label in the NavBar where it is a destination. */
export function titleOf(value: Route): string {
  return TITLES[value]
}
