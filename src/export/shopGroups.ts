import type { catalogue } from 'data-platform'
import type { CategoryRecord } from '../catalogue/categories.ts'
import { isPending, resolvedShopId, type ItemRecord } from '../catalogue/items.ts'
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
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const itemsByShopId = new Map<catalogue.ShopId, ItemRecord[]>()
  let unresolvedCount = 0

  for (const item of items) {
    if (!isPending(item.state)) continue
    const shopId = resolvedShopId(item, categoriesById.get(item.categoryId))
    if (shopId === undefined) {
      unresolvedCount++
      continue
    }
    const bucket = itemsByShopId.get(shopId)
    if (bucket !== undefined) bucket.push(item)
    else itemsByShopId.set(shopId, [item])
  }

  const groups = shops.flatMap((shop) => {
    const shopItems = itemsByShopId.get(shop.id)
    return shopItems !== undefined ? [{ shop, items: shopItems }] : []
  })

  return { groups, unresolvedCount }
}
