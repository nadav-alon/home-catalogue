import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import type { ShopRecord } from '../catalogue/shops.ts'
import { buildShopEvent } from './calendarEvent.ts'
import { exportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

const pharmacy: ShopRecord = { id: catalogue.shopId('pharmacy'), name: 'Pharmacy', referenceCount: 1 }

function item(overrides: Partial<ItemRecord>): ItemRecord {
  return {
    id: core.itemId('bandages'),
    name: 'Bandages',
    state: 'out',
    categoryId: catalogue.categoryId('medicine'),
    necessity: 'essential',
    ...overrides,
  }
}

describe('buildShopEvent', () => {
  it('is an all-day event on the picked date, named after the Shop', () => {
    const group: ShopGroup = { shop: pharmacy, items: [item({})] }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.summary).toBe('Pharmacy')
    expect(event.start).toEqual({ date: '2026-03-05' })
    expect(event.end).toEqual({ date: '2026-03-06' })
  })

  it('lists every pending Item name in the description', () => {
    const group: ShopGroup = {
      shop: pharmacy,
      items: [item({ id: core.itemId('bandages'), name: 'Bandages' }), item({ id: core.itemId('soap'), name: 'Dish soap' })],
    }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.description).toBe('Bandages\nDish soap')
  })

  it('carries a same-day popup reminder when an Item is at alert now', () => {
    const group: ShopGroup = { shop: pharmacy, items: [item({ necessity: 'essential', state: 'out' })] }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] })
  })

  it('carries no reminder when no Item is at alert now', () => {
    const group: ShopGroup = { shop: pharmacy, items: [item({ necessity: 'optional', state: 'running low' })] }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.reminders).toEqual({ useDefault: false, overrides: [] })
  })
})
