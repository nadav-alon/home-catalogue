import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import { wantedRecipesByItem, type RecipeRecord, type RecipeRow } from '../catalogue/recipes.ts'
import { shoppingListGroups } from '../catalogue/shoppingListGroups.ts'
import type { catalogue, core } from 'data-platform'
import type { ShopRecord } from '../catalogue/shops.ts'
import type { SortingStores } from '../catalogue/aisleSort.ts'

/** One Calendar event's worth of the Shopping list: a group's Items, then its Recipe rows. */
export interface ShopGroup {
  /** The Shop's name, or "Not in the Catalogue"; the event is titled with it. */
  name: string
  items: ItemRecord[]
  /** The Wanted Recipes each Item is needed by, named in its "(for <Recipe>)" chips. */
  neededBy: ReadonlyMap<core.ItemId, readonly RecipeRecord[]>
  /** The Recipe rows, exported after the Items. */
  recipeRows: RecipeRow[]
}

export interface PendingItemGroups {
  groups: ShopGroup[]
  /** Pending Items left out of `groups`: no Shop, or a Shop with no record in `shops`, to name a Calendar event after. */
  unresolvedCount: number
  /**
   * Whether the Shopping list has nothing to show at all, the Items listed under "Unknown Shop" included (no Shop, or a Shop
   * with no record in `shops`). Unlike `groups`,
   * this matches the Shopping list's own "Nothing to buy" empty state.
   */
  nothingToBuy: boolean
}

/**
 * The Shopping list as Calendar events, one per group with an Item or a Recipe row, in the order the list shows:
 * `shops` order, then "Not in the Catalogue" for Recipe rows when no `recipeShopId` is set. An Item with no resolved
 * Shop has no Shop of its own to name a Calendar event after, so it is left out of `groups` (unlike the Shopping
 * list's own "Unknown Shop" bucket, which is a display-only affordance) and counted in `unresolvedCount` instead.
 * So is an Item whose resolved Shop has no record in `shops`.
 * Each group's Items are in the order the Shopping list shows them: pass the Stores the list sorts
 * by as `sortingStores`, none when it is not sorted by aisle. `recipes` is the Shopping list's: an optional
 * Item is exported only while a Wanted Recipe needs it, and each Item and Recipe row names the Wanted Recipes that need it.
 * `recipeShopId` is `null` until it has loaded; `undefined` when none is set.
 */
export function pendingItemsByShop(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
  sortingStores: SortingStores,
  recipes: readonly RecipeRecord[],
  recipeShopId: catalogue.ShopId | undefined | null,
): PendingItemGroups {
  const all = shoppingListGroups(items, categories, shops, sortingStores, recipes, recipeShopId)
  const neededBy = wantedRecipesByItem(recipes)
  const unknown = all.find((group) => group.kind === 'unknown-shop')
  const groups = all.filter((group) => group !== unknown)
  return {
    groups: groups.map(({ name, items: groupItems, recipeRows }) => ({ name, items: groupItems, neededBy, recipeRows })),
    unresolvedCount: unknown?.items.length ?? 0,
    nothingToBuy: all.length === 0,
  }
}
