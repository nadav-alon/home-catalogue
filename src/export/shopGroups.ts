import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import { groupPendingItemsByShop } from '../catalogue/pendingItemsByShop.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

export interface ShopGroup {
  shop: ShopRecord
  items: ItemRecord[]
}

export interface PendingItemGroups {
  groups: ShopGroup[]
  /** Pending Items left out of `groups`: no resolved Shop to name a Calendar event after. */
  unresolvedCount: number
}

/**
 * Every Shop with at least one pending Item, in `shops` order. An Item with no resolved Shop has
 * no Shop of its own to name a Calendar event after, so it is left out of `groups` (unlike the
 * Shopping list's own "Unknown Shop" bucket, which is a display-only affordance) and counted in
 * `unresolvedCount` instead.
 */
export function pendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
): PendingItemGroups {
  const { groups, unresolved } = groupPendingItemsByShop(items, categories, shops)
  return { groups, unresolvedCount: unresolved.length }
}
