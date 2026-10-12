import { catalogue } from 'data-platform'
import type { ShopRecord } from './shops.ts'
import type { StoreRecord } from './stores.ts'

const TOGGLE_KEY = 'home-catalogue:sort-by-aisle'
const CHOSEN_STORES_KEY = 'home-catalogue:chosen-stores'

/** Whether this device sorts the Shopping list by aisle order; off if nothing is stored, the stored value is unreadable, or storage is unavailable. */
export function getSortByAisle(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Remembers on this device whether the Shopping list sorts by aisle order; does nothing if storage is unavailable or full. */
export function saveSortByAisle(on: boolean): void {
  try {
    localStorage.setItem(TOGGLE_KEY, String(on))
  } catch {
    // The toggle is a convenience; losing it must not break the screen.
  }
}

/** The Store this device chose per Shop; empty if none are stored, the stored value is unreadable, or storage is unavailable. */
export function getChosenStoreIds(): ReadonlyMap<catalogue.ShopId, catalogue.StoreId> {
  try {
    const raw = localStorage.getItem(CHOSEN_STORES_KEY)
    if (raw === null) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map()
    return new Map(
      Object.entries(parsed).flatMap(([shop, store]) =>
        typeof store === 'string' && catalogue.isShopId(shop) && catalogue.isStoreId(store) ? [[shop, store] as const] : [],
      ),
    )
  } catch {
    return new Map()
  }
}

/** Remembers the Store chosen per Shop on this device; does nothing if storage is unavailable or full. */
export function saveChosenStoreIds(chosen: ReadonlyMap<catalogue.ShopId, catalogue.StoreId>): void {
  try {
    localStorage.setItem(CHOSEN_STORES_KEY, JSON.stringify(Object.fromEntries(chosen)))
  } catch {
    // The choice is a convenience; losing it must not break the screen.
  }
}

/** The live Stores under `shop`, in the order of `stores`. */
export function storesOfShop(stores: readonly StoreRecord[], shop: ShopRecord): StoreRecord[] {
  return stores.filter((store) => store.shopId === shop.id)
}

/**
 * The Store each Shop's group is sorted by. A Shop with one Store uses it; with several, the one in
 * `chosen` if it is still among them, else the first. A Shop with no Store is absent, so its group
 * keeps plain name order. Empty when `sortByAisle` is off.
 */
export function storesToSortBy(
  sortByAisle: boolean,
  shops: readonly ShopRecord[],
  stores: readonly StoreRecord[],
  chosen: ReadonlyMap<catalogue.ShopId, catalogue.StoreId>,
): ReadonlyMap<catalogue.ShopId, StoreRecord> {
  if (!sortByAisle) return new Map()
  return new Map(
    shops.flatMap((shop) => {
      const options = storesOfShop(stores, shop)
      const store = options.find((option) => option.id === chosen.get(shop.id)) ?? options[0]
      return store === undefined ? [] : [[shop.id, store] as const]
    }),
  )
}
