import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import { cleaning, grocery, medicine, pharmacy } from '../catalogue/testFixtures.ts'
import { pendingItemsByShop } from './shopGroups.ts'

describe('pendingItemsByShop', () => {
  it('groups pending Items under their resolved Shop, in Shop order', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
    }
    const soap: ItemRecord = {
      id: core.itemId('soap'),
      name: 'Dish soap',
      state: 'running low',
      categoryId: cleaning.id,
      necessity: 'important',
    }

    const { groups, unresolvedCount } = pendingItemsByShop([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(groups).toEqual([
      { shop: pharmacy, items: [bandages] },
      { shop: grocery, items: [soap] },
    ])
    expect(unresolvedCount).toBe(0)
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'out',
      categoryId: medicine.id,
      necessity: 'essential',
      shopId: grocery.id,
    }

    const { groups } = pendingItemsByShop([bandages], [medicine], [pharmacy, grocery])

    expect(groups).toEqual([{ shop: grocery, items: [bandages] }])
  })

  it('leaves out a Shop with no pending Items', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy, grocery]).groups).toEqual([])
  })

  it('leaves out an Item that is enough', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }

    expect(pendingItemsByShop([bandages], [medicine], [pharmacy]).groups).toEqual([])
  })

  it('leaves out an Item with no resolved Shop, and counts it as unresolved', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }

    const { groups, unresolvedCount } = pendingItemsByShop([orphan], [medicine], [pharmacy])

    expect(groups).toEqual([])
    expect(unresolvedCount).toBe(1)
  })

  it('leaves out an Item whose resolved Shop has no record, without counting it as unresolved', () => {
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
    }

    const { groups, unresolvedCount } = pendingItemsByShop([seeds], [garden], [pharmacy])

    expect(groups).toEqual([])
    expect(unresolvedCount).toBe(0)
  })
})
