import type { CategoryRecord } from '../catalogue/categories.ts'
import { isPending, resolvedShopId, type ItemRecord } from '../catalogue/items.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

export interface ShopGroup {
  shop: ShopRecord
  items: ItemRecord[]
}

/**
 * Every Shop with at least one pending Item, in `shops` order. An Item with no resolved Shop has
 * no Shop of its own to name a Calendar event after, so it is left out here (unlike the Shopping
 * list's own "Unknown Shop" bucket, which is a display-only affordance).
 */
export function pendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
): ShopGroup[] {
  const pendingItems = items.filter((item) => isPending(item.state))
  return shops.flatMap((shop) => {
    const shopItems = pendingItems.filter((item) => {
      const category = categories.find((candidate) => candidate.id === item.categoryId)
      return resolvedShopId(item, category) === shop.id
    })
    return shopItems.length > 0 ? [{ shop, items: shopItems }] : []
  })
}
