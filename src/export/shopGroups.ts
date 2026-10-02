import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import { groupPendingItemsByShop, type PendingShopGroup } from '../catalogue/pendingItemsByShop.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

export type ShopGroup = PendingShopGroup

export interface PendingItemGroups {
  groups: ShopGroup[]
  /** Pending Items left out of `groups`: no Shop, or a Shop with no record in `shops`, to name a Calendar event after. */
  unresolvedCount: number
  /**
   * Whether no Item is pending at all, the Items listed under "Unknown Shop" included (no Shop, or a Shop
   * with no record in `shops`). Unlike `groups`,
   * this matches the Shopping list's own "Nothing to buy" empty state.
   */
  nothingToBuy: boolean
}

/**
 * Every Shop with at least one pending Item, in `shops` order. An Item with no resolved Shop has
 * no Shop of its own to name a Calendar event after, so it is left out of `groups` (unlike the
 * Shopping list's own "Unknown Shop" bucket, which is a display-only affordance) and counted in
 * `unresolvedCount` instead. So is an Item whose resolved Shop has no record in `shops`.
 */
export function pendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
): PendingItemGroups {
  const { groups, unresolved } = groupPendingItemsByShop(items, categories, shops)
  return { groups, unresolvedCount: unresolved.length, nothingToBuy: groups.length === 0 && unresolved.length === 0 }
}
