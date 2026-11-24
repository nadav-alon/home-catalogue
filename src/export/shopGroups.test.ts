import { describe, expect, it } from 'vitest'
import { catalogue, core, recipes } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import type { CategoryRecord } from '../catalogue/categories.ts'
import { bandages, cleaning, grocery, medicine, pharmacy } from '../catalogue/testFixtures.ts'
import type { StoreRecord } from '../catalogue/stores.ts'
import type { RecipeRecord } from '../catalogue/recipes.ts'
import { pendingItemsByShop } from './shopGroups.ts'

/** A Wanted Recipe titled Party with `ingredients`. */
function wantedRecipe(ingredients: RecipeRecord['ingredients']): RecipeRecord {
  return { id: recipes.recipeId('party'), title: 'Party', ingredients, prepSteps: [], steps: [], wanted: true }
}

describe('pendingItemsByShop', () => {
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

    const { groups, unresolvedCount } = pendingItemsByShop([outBandages, soap], [medicine, cleaning], [pharmacy, grocery], new Map(), [], undefined)

    expect(groups).toEqual([
      { name: pharmacy.name, items: [outBandages], neededBy: new Map(), recipeRows: [] },
      { name: grocery.name, items: [soap], neededBy: new Map(), recipeRows: [] },
    ])
    expect(unresolvedCount).toBe(0)
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandagesAtGrocery: ItemRecord = { ...bandages, state: 'out', shopId: grocery.id }

    const { groups } = pendingItemsByShop([bandagesAtGrocery], [medicine], [pharmacy, grocery], new Map(), [], undefined)

    expect(groups).toEqual([{ name: grocery.name, items: [bandagesAtGrocery], neededBy: new Map(), recipeRows: [] }])
  })

  it('leaves out a Shop with no pending Items', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy, grocery], new Map(), [], undefined).groups).toEqual([])
  })

  it('leaves out an Item that is enough', () => {
    expect(pendingItemsByShop([{ ...bandages, state: 'enough' }], [medicine], [pharmacy], new Map(), [], undefined).groups).toEqual([])
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

    const { groups, unresolvedCount } = pendingItemsByShop([orphan], [medicine], [pharmacy], new Map(), [], undefined)

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

    const { groups, unresolvedCount } = pendingItemsByShop([seeds], [garden], [pharmacy], new Map(), [], undefined)

    expect(groups).toEqual([])
    expect(unresolvedCount).toBe(1)
  })
})

describe('pendingItemsByShop with a chosen Store', () => {
  it("lists a Shop's Items in the Store's aisle order, as the Shopping list shows them", () => {
    const aisleA = catalogue.aisleId('a')
    const aisleB = catalogue.aisleId('b')
    const rice: ItemRecord = { ...bandages, id: core.itemId('rice'), name: 'Rice', state: 'out', categoryId: cleaning.id, aisleId: aisleA }
    const milk: ItemRecord = { ...bandages, id: core.itemId('milk'), name: 'Milk', state: 'out', categoryId: cleaning.id, aisleId: aisleB }
    const store: StoreRecord = { id: catalogue.storeId('osher'), name: 'Osher Ad', shopId: grocery.id, aisleOrder: [aisleA, aisleB] }

    const { groups } = pendingItemsByShop([milk, rice], [cleaning], [grocery], new Map([[grocery.id, store]]), [], undefined)

    expect(groups).toEqual([{ name: grocery.name, items: [rice, milk], neededBy: new Map(), recipeRows: [] }])
  })
})

describe('pendingItemsByShop with optional Items', () => {
  const candles = { ...bandages, id: core.itemId('candles'), name: 'Candles', necessity: 'optional' as const }

  it('exports an optional Item only while a Wanted Recipe needs it', () => {
    expect(pendingItemsByShop([{ ...candles, state: 'out' }], [medicine], [pharmacy], new Map(), [], undefined)).toMatchObject({ groups: [], nothingToBuy: true })
    const { groups } = pendingItemsByShop([{ ...candles, state: 'out' }], [medicine], [pharmacy], new Map(), [wantedRecipe([{ name: 'Candles', itemId: candles.id }])], undefined)
    expect(groups.flatMap((group) => group.items.map((item) => item.name))).toEqual(['Candles'])
  })
})

describe('pendingItemsByShop with Recipes', () => {
  const party = wantedRecipe([{ name: 'Bandages', itemId: bandages.id }, { name: 'Balloons' }])
  const out = { ...bandages, state: 'out' as const }

  it('puts Recipe rows after the Items of the Shop for Recipe Ingredients', () => {
    const { groups } = pendingItemsByShop([out], [medicine], [pharmacy, grocery], new Map(), [party], grocery.id)

    expect(groups.map((group) => [group.name, group.items.map((item) => item.name), group.recipeRows.map((row) => row.name)])).toEqual([
      ['Pharmacy', ['Bandages'], []],
      ['Grocery', [], ['Balloons']],
    ])
    expect(groups[0]!.neededBy.get(bandages.id)).toEqual([party])
  })

  it("exports Recipe rows in the Recipe Shop's event after its Items", () => {
    const { groups } = pendingItemsByShop([out], [medicine], [pharmacy], new Map(), [party], pharmacy.id)

    expect(groups.map((group) => [group.name, group.items.length, group.recipeRows.length])).toEqual([['Pharmacy', 1, 1]])
  })

  it('puts Recipe rows in a "Not in the Catalogue" event, last, when no Shop is set', () => {
    const { groups } = pendingItemsByShop([out], [medicine], [pharmacy], new Map(), [party], undefined)

    expect(groups.map((group) => [group.name, group.recipeRows.length])).toEqual([['Pharmacy', 0], ['Not in the Catalogue', 1]])
  })

  it('waits for the Shop for Recipe Ingredients before using the fallback event', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy], new Map(), [party], null).groups.map((group) => group.name)).toEqual([])
  })

  it('leaves Recipe rows out of unresolvedCount and counts them for nothingToBuy', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy], new Map(), [party], undefined)).toMatchObject({ unresolvedCount: 0, nothingToBuy: false })
  })
})
