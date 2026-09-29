import { describe, expect, it } from 'vitest'
import { alertLevel, hasAlertNow } from './alert.ts'

describe('alertLevel', () => {
  it('never alerts an enough Item, regardless of Necessity', () => {
    expect(alertLevel('essential', 'enough')).toBeUndefined()
    expect(alertLevel('important', 'enough')).toBeUndefined()
    expect(alertLevel('optional', 'enough')).toBeUndefined()
  })

  it('alerts an essential Item now at running low and at out', () => {
    expect(alertLevel('essential', 'running low')).toBe('now')
    expect(alertLevel('essential', 'out')).toBe('now')
  })

  it('alerts an important Item soon at running low, now at out', () => {
    expect(alertLevel('important', 'running low')).toBe('soon')
    expect(alertLevel('important', 'out')).toBe('now')
  })

  it('alerts an optional Item only at out, and only soon', () => {
    expect(alertLevel('optional', 'running low')).toBeUndefined()
    expect(alertLevel('optional', 'out')).toBe('soon')
  })
})

describe('hasAlertNow', () => {
  it('is true when any Item is at alert now', () => {
    expect(
      hasAlertNow([
        { necessity: 'optional', state: 'out' },
        { necessity: 'essential', state: 'out' },
      ]),
    ).toBe(true)
  })

  it('is false when every Item is below alert now', () => {
    expect(
      hasAlertNow([
        { necessity: 'optional', state: 'out' },
        { necessity: 'important', state: 'running low' },
      ]),
    ).toBe(false)
  })

  it('is false for an empty list', () => {
    expect(hasAlertNow([])).toBe(false)
  })
})
