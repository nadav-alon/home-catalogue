import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import type { CategoryRecord } from '../catalogue/categories.ts'
import { bandages, cleaning, grocery, medicine, pharmacy } from '../catalogue/testFixtures.ts'
import type { StoreRecord } from '../catalogue/stores.ts'
import { pendingItemsByShop } from './shopGroups.ts'

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

    const { groups, unresolvedCount } = pendingItemsByShop([outBandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(groups).toEqual([
      { shop: pharmacy, items: [outBandages] },
      { shop: grocery, items: [soap] },
    ])
    expect(unresolvedCount).toBe(0)
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandagesAtGrocery: ItemRecord = { ...bandages, state: 'out', shopId: grocery.id }

    const { groups } = pendingItemsByShop([bandagesAtGrocery], [medicine], [pharmacy, grocery])

    expect(groups).toEqual([{ shop: grocery, items: [bandagesAtGrocery] }])
  })

  it('leaves out a Shop with no pending Items', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy, grocery]).groups).toEqual([])
  })

  it('leaves out an Item that is enough', () => {
    expect(pendingItemsByShop([{ ...bandages, state: 'enough' }], [medicine], [pharmacy]).groups).toEqual([])
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

    const { groups, unresolvedCount } = pendingItemsByShop([orphan], [medicine], [pharmacy])

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

    const { groups, unresolvedCount } = pendingItemsByShop([seeds], [garden], [pharmacy])

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

    const { groups } = pendingItemsByShop([milk, rice], [cleaning], [grocery], new Map([[grocery.id, store]]))

    expect(groups).toEqual([{ shop: grocery, items: [rice, milk] }])
  })
})
