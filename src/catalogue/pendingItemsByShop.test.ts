import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import type { CategoryRecord } from './categories.ts'
import type { ItemRecord } from './items.ts'
import type { ShopRecord } from './shops.ts'
import { groupPendingItemsByShop } from './pendingItemsByShop.ts'

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

function item(id: string, overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: core.itemId(id),
    name: id,
    state: 'out',
    categoryId: medicine.id,
    necessity: 'essential',
    ...overrides,
  }
}

describe('groupPendingItemsByShop', () => {
  it('groups pending Items under their resolved Shop, in Shop order', () => {
    const bandages = item('bandages')
    const soap = item('soap', { state: 'running low', categoryId: cleaning.id })

    const { groups, unresolved } = groupPendingItemsByShop(
      [soap, bandages],
      [medicine, cleaning],
      [pharmacy, grocery],
    )

    expect(groups).toEqual([
      { shop: pharmacy, items: [bandages] },
      { shop: grocery, items: [soap] },
    ])
    expect(unresolved).toEqual([])
  })

  it('groups an Item under its own Shop override instead of its Category default', () => {
    const bandages = item('bandages', { shopId: grocery.id })

    expect(groupPendingItemsByShop([bandages], [medicine], [pharmacy, grocery]).groups).toEqual([
      { shop: grocery, items: [bandages] },
    ])
  })

  it('leaves out a Shop with no pending Items and an Item that is enough', () => {
    const bandages = item('bandages', { state: 'enough' })

    expect(groupPendingItemsByShop([bandages], [medicine], [pharmacy, grocery])).toEqual({
      groups: [],
      unresolved: [],
    })
  })

  it('returns an Item with no resolved Shop as unresolved', () => {
    const tape = item('tape', { categoryId: catalogue.categoryId('uncategorised') })

    expect(groupPendingItemsByShop([tape], [], [pharmacy])).toEqual({ groups: [], unresolved: [tape] })
  })

  it('returns an Item whose resolved Shop is not in shops as unresolved', () => {
    const bandages = item('bandages')

    expect(groupPendingItemsByShop([bandages], [medicine], [grocery])).toEqual({
      groups: [],
      unresolved: [bandages],
    })
  })
})
