import { describe, expect, it } from 'vitest'
import { catalogue, core, recipes } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import type { CategoryRecord } from '../catalogue/categories.ts'
import { bandages, cleaning, grocery, medicine, pharmacy } from '../catalogue/testFixtures.ts'
import type { StoreRecord } from '../catalogue/stores.ts'
import { wantedRecipesByItem, type RecipeRecord } from '../catalogue/recipes.ts'
import { shoppingListGroups } from '../catalogue/shoppingListGroups.ts'
import type { SortingStores } from '../catalogue/aisleSort.ts'
import type { ShopRecord } from '../catalogue/shops.ts'
import { buildShopEvent } from './calendarEvent.ts'
import { exportDate } from './exportDate.ts'
import { shoppingListEvents } from './shopGroups.ts'

/** The events for the Shopping list over these inputs. */
function eventsOf(items: ItemRecord[], categories: CategoryRecord[], shops: ShopRecord[], sortingStores: SortingStores, recipes: RecipeRecord[], recipeShopId: catalogue.ShopId | undefined | null) {
  return shoppingListEvents(shoppingListGroups(items, categories, shops, sortingStores, recipes, recipeShopId))
}

/** A Wanted Recipe titled Party with `ingredients`. */
function wantedRecipe(ingredients: RecipeRecord['ingredients']): RecipeRecord {
  return { id: recipes.recipeId('party'), title: 'Party', ingredients, prepSteps: [], steps: [], wanted: true }
}

describe('shoppingListEvents', () => {
  it('groups pending Items under their resolved Shop, in Shop order', () => {
    const outBandages: ItemRecord = { ...bandages, state: 'out' }
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
      tagIds: [],
    }

    const { groups, unresolvedCount } = eventsOf([outBandages, soap], [medicine, cleaning], [pharmacy, grocery], new Map(), [], undefined)

    expect(groups).toEqual([
      { groupName: pharmacy.name, items: [outBandages], recipeRows: [] },
      { groupName: grocery.name, items: [soap], recipeRows: [] },
    ])
    expect(unresolvedCount).toBe(0)
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandagesAtGrocery: ItemRecord = { ...bandages, state: 'out', shopId: grocery.id }

    const { groups } = eventsOf([bandagesAtGrocery], [medicine], [pharmacy, grocery], new Map(), [], undefined)

    expect(groups).toEqual([{ groupName: grocery.name, items: [bandagesAtGrocery], recipeRows: [] }])
  })

  it('leaves out a Shop with no pending Items', () => {
    expect(eventsOf([], [medicine], [pharmacy, grocery], new Map(), [], undefined).groups).toEqual([])
  })

  it('leaves out an Item that is enough', () => {
    expect(eventsOf([{ ...bandages, state: 'enough' }], [medicine], [pharmacy], new Map(), [], undefined).groups).toEqual([])
  })

  it('leaves out an Item with no resolved Shop, and counts it as unresolved', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
      tagIds: [],
    }

    const { groups, unresolvedCount } = eventsOf([orphan], [medicine], [pharmacy], new Map(), [], undefined)

    expect(groups).toEqual([])
    expect(unresolvedCount).toBe(1)
  })

  it('leaves out an Item whose resolved Shop has no record, counting it as unresolved', () => {
    const garden: CategoryRecord = {
      ...medicine,
      id: catalogue.categoryId('garden'),
      name: 'Garden',
      defaultShopId: catalogue.shopId('deleted-shop'),
    }
    const seeds: ItemRecord = {
      id: core.itemId('seeds'),
      name: 'Seeds',
      state: 'out',
      categoryId: garden.id,
      necessity: 'important',
      tagIds: [],
    }

    const { groups, unresolvedCount } = eventsOf([seeds], [garden], [pharmacy], new Map(), [], undefined)

    expect(groups).toEqual([])
    expect(unresolvedCount).toBe(1)
  })
})

describe('shoppingListEvents with a chosen Store', () => {
  it("lists a Shop's Items in the Store's aisle order, as the Shopping list shows them", () => {
    const aisleA = catalogue.aisleId('a')
    const aisleB = catalogue.aisleId('b')
    const rice: ItemRecord = { ...bandages, id: core.itemId('rice'), name: 'Rice', state: 'out', categoryId: cleaning.id, aisleId: aisleA }
    const milk: ItemRecord = { ...bandages, id: core.itemId('milk'), name: 'Milk', state: 'out', categoryId: cleaning.id, aisleId: aisleB }
    const store: StoreRecord = { id: catalogue.storeId('osher'), name: 'Osher Ad', shopId: grocery.id, aisleOrder: [aisleA, aisleB] }

    const { groups } = eventsOf([milk, rice], [cleaning], [grocery], new Map([[grocery.id, store]]), [], undefined)

    expect(groups).toEqual([{ groupName: grocery.name, items: [rice, milk], recipeRows: [] }])
  })

  it("writes chipped Items in aisle order, then the Recipe rows, in one event", () => {
    const aisleA = catalogue.aisleId('a')
    const aisleB = catalogue.aisleId('b')
    const rice: ItemRecord = { ...bandages, id: core.itemId('rice'), name: 'Rice', state: 'out', categoryId: cleaning.id, aisleId: aisleA }
    const milk: ItemRecord = { ...bandages, id: core.itemId('milk'), name: 'Milk', state: 'out', categoryId: cleaning.id, aisleId: aisleB }
    const store: StoreRecord = { id: catalogue.storeId('osher'), name: 'Osher Ad', shopId: grocery.id, aisleOrder: [aisleA, aisleB] }
    const party = wantedRecipe([{ name: 'Milk', itemId: milk.id }, { name: 'Rice', itemId: rice.id }, { name: 'Balloons' }])

    const { groups } = eventsOf([milk, rice], [cleaning], [grocery], new Map([[grocery.id, store]]), [party], grocery.id)

    expect(buildShopEvent(groups[0]!, wantedRecipesByItem([party]), exportDate('2026-03-05')).description).toBe('Rice (for Party)\nMilk (for Party)\nBalloons (for Party)')
  })
})

describe('shoppingListEvents with optional Items', () => {
  const candles = { ...bandages, id: core.itemId('candles'), name: 'Candles', necessity: 'optional' as const }

  it('exports an optional Item only while a Wanted Recipe needs it', () => {
    expect(eventsOf([{ ...candles, state: 'out' }], [medicine], [pharmacy], new Map(), [], undefined)).toMatchObject({ groups: [], nothingToBuy: true })
    const { groups } = eventsOf([{ ...candles, state: 'out' }], [medicine], [pharmacy], new Map(), [wantedRecipe([{ name: 'Candles', itemId: candles.id }])], undefined)
    expect(groups.flatMap((group) => group.items.map((item) => item.name))).toEqual(['Candles'])
  })
})

describe('shoppingListEvents with Recipes', () => {
  const party = wantedRecipe([{ name: 'Bandages', itemId: bandages.id }, { name: 'Balloons' }])
  const out = { ...bandages, state: 'out' as const }

  it('puts Recipe rows after the Items of the Shop for Recipe Ingredients', () => {
    const { groups } = eventsOf([out], [medicine], [pharmacy, grocery], new Map(), [party], grocery.id)

    expect(groups.map((group) => [group.groupName, group.items.map((item) => item.name), group.recipeRows.map((row) => row.name)])).toEqual([
      ['Pharmacy', ['Bandages'], []],
      ['Grocery', [], ['Balloons']],
    ])
  })

  it("exports Recipe rows in the Recipe Shop's event after its Items", () => {
    const { groups } = eventsOf([out], [medicine], [pharmacy], new Map(), [party], pharmacy.id)

    expect(groups.map((group) => [group.groupName, group.items.length, group.recipeRows.length])).toEqual([['Pharmacy', 1, 1]])
  })

  it('puts Recipe rows in a "Not in the Catalogue" event, last, when no Shop is set', () => {
    const { groups } = eventsOf([out], [medicine], [pharmacy], new Map(), [party], undefined)

    expect(groups.map((group) => [group.groupName, group.recipeRows.length])).toEqual([['Pharmacy', 0], ['Not in the Catalogue', 1]])
  })

  it('waits for the Shop for Recipe Ingredients before using the fallback event', () => {
    expect(eventsOf([], [medicine], [pharmacy], new Map(), [party], null).groups.map((group) => group.groupName)).toEqual([])
  })

  it('leaves Recipe rows out of unresolvedCount and counts them for nothingToBuy', () => {
    expect(eventsOf([], [medicine], [pharmacy], new Map(), [party], undefined)).toMatchObject({ unresolvedCount: 0, nothingToBuy: false })
  })
})
