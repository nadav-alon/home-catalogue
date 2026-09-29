import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import type { ShopRecord } from '../catalogue/shops.ts'
import { pendingItemsByShop } from './shopGroups.ts'

const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy', referenceCount: 1 }
const grocery: ShopRecord = { id: catalogue.shopId('grocery'), name: 'Grocery', referenceCount: 1 }
const medicine: CategoryRecord = {
  id: catalogue.categoryId('medicine'),
  name: 'Medicine',
  defaultShopId: pharmacy.id,
  referenceCount: 1,
}
const cleaning: CategoryRecord = {
  id: catalogue.categoryId('cleaning'),
  name: 'Cleaning',
  defaultShopId: grocery.id,
  referenceCount: 1,
}

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

    const groups = pendingItemsByShop([bandages, soap], [medicine, cleaning], [pharmacy, grocery])

    expect(groups).toEqual([
      { shop: pharmacy, items: [bandages] },
      { shop: grocery, items: [soap] },
    ])
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

    const groups = pendingItemsByShop([bandages], [medicine], [pharmacy, grocery])

    expect(groups).toEqual([{ shop: grocery, items: [bandages] }])
  })

  it('leaves out a Shop with no pending Items', () => {
    expect(pendingItemsByShop([], [medicine], [pharmacy, grocery])).toEqual([])
  })

  it('leaves out an Item that is enough', () => {
    const bandages: ItemRecord = {
      id: core.itemId('bandages'),
      name: 'Bandages',
      state: 'enough',
      categoryId: medicine.id,
      necessity: 'essential',
    }

    expect(pendingItemsByShop([bandages], [medicine], [pharmacy])).toEqual([])
  })

  it('leaves out an Item with no resolved Shop', () => {
    const orphan: ItemRecord = {
      id: core.itemId('orphan'),
      name: 'Mystery item',
      state: 'out',
      categoryId: catalogue.categoryId('deleted-category'),
      necessity: 'important',
    }

    expect(pendingItemsByShop([orphan], [medicine], [pharmacy])).toEqual([])
  })
})
