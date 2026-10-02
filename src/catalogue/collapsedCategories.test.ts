import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogue } from 'data-platform'
import { getCollapsedGroups, saveCollapsedGroups, UNCATEGORISED } from './collapsedCategories.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  localStorage.clear()
})

describe('getCollapsedGroups', () => {
  it('is empty when nothing is stored', () => {
    expect(getCollapsedGroups().size).toBe(0)
  })

  it('returns what was saved', () => {
    saveCollapsedGroups(new Set([catalogue.categoryId('medicine'), UNCATEGORISED]))

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

  it('is empty when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(getCollapsedGroups().size).toBe(0)
  })
})

describe('saveCollapsedGroups', () => {
  it('does nothing when writing storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => saveCollapsedGroups(new Set([UNCATEGORISED]))).not.toThrow()
  })
})
