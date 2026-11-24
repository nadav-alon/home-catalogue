import type { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import type { ItemRecord } from './items.ts'
import { groupPendingItemsByShop } from './pendingItemsByShop.ts'
import { itemIdsNeededBy, recipeRowsOf, type RecipeRecord, type RecipeRow } from './recipes.ts'
import { UNKNOWN_SHOP_NAME, type ShopRecord } from './shops.ts'
import type { SortingStores } from './aisleSort.ts'

/** One group of the Shopping list: a Shop's Items then its Recipe rows, or one of the two groups with no Shop. */
export interface ShoppingListGroup {
  key: string
  /** Set for a resolved Shop, whose group can be sorted by one of its Stores; unset for {@link UNKNOWN_SHOP_NAME} and {@link NOT_IN_CATALOGUE_NAME}. */
  shop?: ShopRecord
  name: string
  items: ItemRecord[]
  /** The Recipe rows, listed after the Items. */
  recipeRows: RecipeRow[]
}

/** The name of the final group holding Recipe rows when no Shop for Recipe Ingredients is set. */
export const NOT_IN_CATALOGUE_NAME = 'Not in the Catalogue'

/**
 * The groups the Shopping list shows, in order: each Shop with something to buy in `shops` order (its Recipe rows
 * after its Items when it is the Shop for Recipe Ingredients), then {@link UNKNOWN_SHOP_NAME} for Items with no
 * resolvable Shop, then {@link NOT_IN_CATALOGUE_NAME} for the Recipe rows when none is set.
 * `recipeShopId` is `null` until the Shop for Recipe Ingredients setting and the Shops have loaded, so the
 * fallback group is not shown early; `undefined` means none is set.
 */
export function shoppingListGroups(
  items: ItemRecord[],
  categories: CategoryRecord[],
  shops: ShopRecord[],
  sortingStores: SortingStores,
  recipes: readonly RecipeRecord[],
  recipeShopId: catalogue.ShopId | undefined | null,
): ShoppingListGroup[] {
  const neededItemIds: ReadonlySet<core.ItemId> = itemIdsNeededBy(recipes)
  const { groups: shopGroups, unresolved } = groupPendingItemsByShop(items, categories, shops, sortingStores, neededItemIds)
  const recipeRows = recipeRowsOf(recipes)
  const recipeShop = shops.find((shop) => shop.id === recipeShopId)
  const groups: ShoppingListGroup[] = shops.flatMap((shop) => {
    const shopItems = shopGroups.find((group) => group.shop.id === shop.id)?.items ?? []
    const shopRecipeRows = shop.id === recipeShop?.id ? recipeRows : []
    return shopItems.length === 0 && shopRecipeRows.length === 0 ? [] : [{ key: shop.id, shop, name: shop.name, items: shopItems, recipeRows: shopRecipeRows }]
  })
  if (unresolved.length > 0) groups.push({ key: UNKNOWN_SHOP_NAME, name: UNKNOWN_SHOP_NAME, items: unresolved, recipeRows: [] })
  if (recipeShop === undefined && recipeRows.length > 0 && recipeShopId !== null) groups.push({ key: NOT_IN_CATALOGUE_NAME, name: NOT_IN_CATALOGUE_NAME, items: [], recipeRows })
  return groups
}

/** `groups` keeping only the Items in `itemIds` and the Recipe rows of `recipeId`, dropping groups left empty; order is unchanged. */
export function narrowedToRecipe(
  groups: readonly ShoppingListGroup[],
  recipeId: RecipeRecord['id'],
  itemIds: ReadonlySet<core.ItemId>,
): ShoppingListGroup[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => itemIds.has(item.id))
    const recipeRows = group.recipeRows.filter((row) => row.recipe.id === recipeId)
    return items.length === 0 && recipeRows.length === 0 ? [] : [{ ...group, items, recipeRows }]
  })
}
