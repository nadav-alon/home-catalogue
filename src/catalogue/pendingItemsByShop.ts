import type { catalogue } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import { isPending, resolvedShopId, type ItemRecord } from './items.ts'
import type { ShopRecord } from './shops.ts'

export interface PendingShopGroup {
  shop: ShopRecord
  items: ItemRecord[]
}

export interface PendingItemsByShop {
  /** Every Shop with at least one pending Item, in `shops` order. */
  groups: PendingShopGroup[]
  /** Pending Items with no resolved Shop, or whose resolved Shop is not in `shops`. */
  unresolved: ItemRecord[]
}

/**
 * Groups pending Items by resolved Shop. An Item whose Shop cannot be resolved to a record in
 * `shops` is not dropped: it is returned in `unresolved`, so each caller decides how to treat it.
 */
export function groupPendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
): PendingItemsByShop {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const knownShopIds = new Set(shops.map((shop) => shop.id))
  const itemsByShopId = new Map<catalogue.ShopId, ItemRecord[]>()
  const unresolved: ItemRecord[] = []

  for (const item of items) {
    if (!isPending(item.state)) continue
    const shopId = resolvedShopId(item, categoriesById.get(item.categoryId))
    if (shopId === undefined || !knownShopIds.has(shopId)) {
      unresolved.push(item)
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

  return { groups, unresolved }
}
