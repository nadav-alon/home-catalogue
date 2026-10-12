import { beforeEach, describe, expect, it } from 'vitest'
import { catalogue } from 'data-platform'
import { getChosenStoreIds, getSortByAisle, saveChosenStoreIds, saveSortByAisle, storesToSortBy } from './aisleSort.ts'
import type { AisleRecord } from './aisles.ts'
import type { StoreRecord } from './stores.ts'
import { grocery, pharmacy } from './testFixtures.ts'

beforeEach(() => {
  localStorage.clear()
})

function store(id: string, shop = grocery): StoreRecord {
  return { id: catalogue.storeId(id), name: id, shopId: shop.id, aisleOrder: [] }
}

describe('getSortByAisle', () => {
  it('is off when nothing is stored', () => {
    expect(getSortByAisle()).toBe(false)
  })

  it('returns what was saved', () => {
    saveSortByAisle(true)
    expect(getSortByAisle()).toBe(true)
    saveSortByAisle(false)
    expect(getSortByAisle()).toBe(false)
  })
})

describe('getChosenStoreIds', () => {
  it('is empty when nothing is stored', () => {
    expect(getChosenStoreIds().size).toBe(0)
  })

  it('returns what was saved', () => {
    saveChosenStoreIds(new Map([[grocery.id, catalogue.storeId('shufersal')]]))
    expect([...getChosenStoreIds()]).toEqual([[grocery.id, 'shufersal']])
  })

  it.each(['not json', '[1]', '"x"', '{"grocery":1}'])('is empty when the stored value is %s', (raw) => {
    localStorage.setItem('home-catalogue:chosen-stores', raw)
    expect(getChosenStoreIds().size).toBe(0)
  })
})

describe('storesToSortBy', () => {
  const osher = store('osher')
  const shufersal = store('shufersal')
  const none = new Map<catalogue.ShopId, catalogue.StoreId>()

  it('is empty when the toggle is off', () => {
    expect(storesToSortBy(false, [grocery], [osher], [], none).size).toBe(0)
  })

  it('uses the only Store of a Shop', () => {
    expect(storesToSortBy(true, [grocery], [osher], [], none).get(grocery.id)?.id).toBe(osher.id)
  })

  it('leaves out a Shop with no Store', () => {
    expect(storesToSortBy(true, [grocery, pharmacy], [osher], [], none).has(pharmacy.id)).toBe(false)
  })

  it('uses the chosen Store of a Shop with several, else the first', () => {
    const chosen = new Map([[grocery.id, shufersal.id]])
    expect(storesToSortBy(true, [grocery], [osher, shufersal], [], chosen).get(grocery.id)?.id).toBe(shufersal.id)
    expect(storesToSortBy(true, [grocery], [osher, shufersal], [], none).get(grocery.id)?.id).toBe(osher.id)
    expect(storesToSortBy(true, [grocery], [osher], [], chosen).get(grocery.id)?.id).toBe(osher.id)
  })

  it("narrows a Store's aisle order to the live Aisles", () => {
    const live = { id: catalogue.aisleId('live'), name: 'Live' } as AisleRecord
    const placing = { ...osher, aisleOrder: [catalogue.aisleId('deleted'), live.id] }
    expect(storesToSortBy(true, [grocery], [placing], [live], none).get(grocery.id)?.aisleOrder).toEqual([live.id])
  })
})
