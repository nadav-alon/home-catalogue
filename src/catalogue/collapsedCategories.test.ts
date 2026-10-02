import { beforeEach, describe, expect, it } from 'vitest'
import { getCollapsedGroups, saveCollapsedGroups } from './collapsedCategories.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('getCollapsedGroups', () => {
  it('is empty when nothing is stored', () => {
    expect(getCollapsedGroups().size).toBe(0)
  })

  it('returns what was saved', () => {
    saveCollapsedGroups(new Set(['medicine', '/uncategorised']))

    expect([...getCollapsedGroups()]).toEqual(['medicine', '/uncategorised'])
  })

  it.each(['not json', '{"a":1}', '"medicine"'])('is empty when the stored value is %s', (raw) => {
    localStorage.setItem('home-catalogue:collapsed-categories', raw)

    expect(getCollapsedGroups().size).toBe(0)
  })

  it('ignores stored entries that are not strings', () => {
    localStorage.setItem('home-catalogue:collapsed-categories', '["medicine", 3, null]')

    expect([...getCollapsedGroups()]).toEqual(['medicine'])
  })
})
