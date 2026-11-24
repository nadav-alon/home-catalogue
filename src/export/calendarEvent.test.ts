import { describe, expect, it } from 'vitest'
import { core, recipes } from 'data-platform'
import type { RecipeRecord } from '../catalogue/recipes.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import { bandages, pharmacy } from '../catalogue/testFixtures.ts'
import { buildShopEvent } from './calendarEvent.ts'
import { exportDate } from './exportDate.ts'
import type { ShopGroup } from './shopGroups.ts'

function recipe(title: string): RecipeRecord {
  return { id: recipes.recipeId(title), title, ingredients: [], prepSteps: [], steps: [], wanted: true }
}

function item(overrides: Partial<ItemRecord>): ItemRecord {
  return { ...bandages, state: 'out', ...overrides }
}

describe('buildShopEvent', () => {
  it('is an all-day event on the picked date, named after the Shop', () => {
    const group: ShopGroup = { name: pharmacy.name, items: [item({})], neededBy: new Map(), recipeRows: [] }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.summary).toBe('Pharmacy')
    expect(event.start).toEqual({ date: '2026-03-05' })
    expect(event.end).toEqual({ date: '2026-03-06' })
  })

  it('lists every pending Item name in the description', () => {
    const group: ShopGroup = {
      name: pharmacy.name,
      neededBy: new Map(),
      recipeRows: [],
      items: [item({ name: 'Bandages' }), item({ id: core.itemId('soap'), name: 'Dish soap' })],
    }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.description).toBe('Bandages\nDish soap')
  })

  it('writes "(for <Recipe>)" after an Item a Wanted Recipe needs, as the list shows it', () => {
    const soap = item({ id: core.itemId('soap'), name: 'Dish soap' })
    const group: ShopGroup = { name: pharmacy.name, items: [item({ name: 'Bandages' }), soap], neededBy: new Map([[soap.id, [recipe('Party')]]]), recipeRows: [] }

    expect(buildShopEvent(group, exportDate('2026-03-05')).description).toBe('Bandages\nDish soap (for Party)')
  })

  it('writes the same collapsed chips as the list when many Recipes need an Item', () => {
    const group: ShopGroup = { name: pharmacy.name, items: [item({ name: 'Bandages' })], neededBy: new Map([[bandages.id, [recipe('A'), recipe('B'), recipe('C')]]]), recipeRows: [] }

    expect(buildShopEvent(group, exportDate('2026-03-05')).description).toBe('Bandages (for A +2)')
  })

  it('lists Recipe rows after the Items, each with its Recipe chip', () => {
    const party = recipe('Party')
    const group: ShopGroup = { name: pharmacy.name, items: [item({ name: 'Bandages' })], neededBy: new Map(), recipeRows: [{ recipe: party, position: 0, name: 'Balloons' }] }

    expect(buildShopEvent(group, exportDate('2026-03-05')).description).toBe('Bandages\nBalloons (for Party)')
  })

  it('carries no reminder for a group of only Recipe rows', () => {
    const group: ShopGroup = { name: 'Not in the Catalogue', items: [], neededBy: new Map(), recipeRows: [{ recipe: recipe('Party'), position: 0, name: 'Balloons' }] }

    expect(buildShopEvent(group, exportDate('2026-03-05'))).toMatchObject({ summary: 'Not in the Catalogue', reminders: { overrides: [] } })
  })

  it('carries a same-day popup reminder when an Item is at alert now', () => {
    const group: ShopGroup = { name: pharmacy.name, items: [item({ necessity: 'essential', state: 'out' })], neededBy: new Map(), recipeRows: [] }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] })
  })

  it('carries no reminder for an optional Item at any State', () => {
    const group: ShopGroup = {
      name: pharmacy.name,
      neededBy: new Map(),
      recipeRows: [],
      items: [
        item({ necessity: 'optional', state: 'enough' }),
        item({ necessity: 'optional', state: 'running low' }),
        item({ necessity: 'optional', state: 'out' }),
      ],
    }

    const event = buildShopEvent(group, exportDate('2026-03-05'))

    expect(event.reminders).toEqual({ useDefault: false, overrides: [] })
  })
})
