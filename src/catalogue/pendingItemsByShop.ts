import type { catalogue } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import { isPending, resolvedShopId, type ItemRecord } from './items.ts'
import type { ShopRecord } from './shops.ts'
import type { StoreRecord } from './stores.ts'

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
 * Puts `items` in the walking order of `store`'s Aisles, Items sharing an Aisle by name. An Item with
 * no Aisle, or one the Store has not placed, goes at the bottom, by name.
 */
function sortByAisleOrder(items: ItemRecord[], store: StoreRecord): ItemRecord[] {
  const rank = (item: ItemRecord) => {
    const place = item.aisleId === undefined ? -1 : store.aisleOrder.indexOf(item.aisleId)
    return place === -1 ? store.aisleOrder.length : place
  }
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/**
 * Groups pending Items by resolved Shop. An Item whose Shop cannot be resolved to a record in
 * `shops` is not dropped: it is returned in `unresolved`, so each caller decides how to treat it.
 * A Shop with a Store in `chosenStores` has its group sorted by that Store's aisle order; any other
 * group, and `unresolved`, keeps the order of `items`.
 */
export function groupPendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
  chosenStores: ReadonlyMap<catalogue.ShopId, StoreRecord> = new Map(),
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
    if (shopItems === undefined) return []
    const store = chosenStores.get(shop.id)
    return [{ shop, items: store === undefined ? shopItems : sortByAisleOrder(shopItems, store) }]
  })

  return { groups, unresolved }
}
