import type { CategoryRecord } from '../catalogue/categories.ts'
import { resolvedShopId, type ItemRecord } from '../catalogue/items.ts'
import { groupPendingItemsByShop, type PendingShopGroup } from '../catalogue/pendingItemsByShop.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

export type ShopGroup = PendingShopGroup

export interface PendingItemGroups {
  groups: ShopGroup[]
  /** Pending Items left out of `groups`: no resolved Shop to name a Calendar event after. */
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
 * `unresolvedCount` instead. An Item whose resolved Shop has no record in `shops` is left out of
 * `groups` too, but is not counted.
 */
export function pendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
): PendingItemGroups {
  const { groups, unresolved } = groupPendingItemsByShop(items, categories, shops)
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const unresolvedCount = unresolved.filter(
    (item) => resolvedShopId(item, categoriesById.get(item.categoryId)) === undefined,
  ).length
  return { groups, unresolvedCount, nothingToBuy: groups.length === 0 && unresolved.length === 0 }
}
