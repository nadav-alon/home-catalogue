import { describe, expect, it } from 'vitest'
import { core } from 'data-platform'
import type { ItemRecord } from '../catalogue/items.ts'
import { bandages, pharmacy } from '../catalogue/testFixtures.ts'
import { shopDeepLink } from './calendarDeepLink.ts'
import { exportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

const outBandages: ItemRecord = { ...bandages, state: 'out' }

describe('shopDeepLink', () => {
  it('builds a Google Calendar TEMPLATE render link for the Shop and its pending Items', () => {
    const group: ShopGroup = { shop: pharmacy, items: [outBandages] }

    const link = shopDeepLink(group, exportDate('2026-03-05'))
    const url = new URL(link)

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Pharmacy')
    expect(url.searchParams.get('dates')).toBe('20260305/20260306')
    expect(url.searchParams.get('details')).toBe('Bandages')
  })

  it('lists every pending Item name in the details', () => {
    const soap: ItemRecord = { ...outBandages, id: core.itemId('soap'), name: 'Dish soap' }
    const group: ShopGroup = { shop: pharmacy, items: [outBandages, soap] }

    const link = shopDeepLink(group, exportDate('2026-03-05'))

    expect(new URL(link).searchParams.get('details')).toBe('Bandages\nDish soap')
  })
})
