import type { core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import type { RecipeRecord, RecipeRow } from '../catalogue/recipes.ts'
import type { ShoppingListGroup } from '../catalogue/shoppingListGroups.ts'

/** The Wanted Recipes each Item is needed by, named in its "(for <Recipe>)" chips. */
export type RecipesByItem = ReadonlyMap<core.ItemId, readonly RecipeRecord[]>

/** One Calendar event's worth of the Shopping list: a group's Items, then its Recipe rows. */
export interface ExportGroup {
  /** The group's name: a Shop's name, or "Not in the Catalogue"; the event is titled with it. */
  groupName: string
  items: ItemRecord[]
  /** The Recipe rows, exported after the Items. */
  recipeRows: RecipeRow[]
}

export interface ShoppingListEvents {
  groups: ExportGroup[]
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
 * The Shopping list's `listGroups` as Calendar events, one per group with an Item or a Recipe row, in the order the
 * list shows them. An Item with no resolved Shop has no Shop of its own to name a Calendar event after, so the
 * list's "Unknown Shop" group is left out of `groups` (it is a display-only affordance) and its Items counted in
 * `unresolvedCount` instead. That includes an Item whose resolved Shop has no record in `shops`.
 */
export function shoppingListEvents(listGroups: readonly ShoppingListGroup[]): ShoppingListEvents {
  const unknown = listGroups.find((group) => group.kind === 'unknown-shop')
  return {
    groups: listGroups
      .filter((group) => group !== unknown)
      .map(({ name, items, recipeRows }) => ({ groupName: name, items, recipeRows })),
    unresolvedCount: unknown?.items.length ?? 0,
    nothingToBuy: listGroups.length === 0,
  }
}
