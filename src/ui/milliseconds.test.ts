import { describe, expect, it } from 'vitest'
import { isMilliseconds, milliseconds } from './milliseconds.ts'

describe('milliseconds', () => {
  it('accepts whole non-negative numbers', () => {
    expect(isMilliseconds(0)).toBe(true)
    expect(milliseconds(6000)).toBe(6000)
  })

  it('rejects fractions, negatives and non-finite numbers, naming the value', () => {
    for (const bad of [1.5, -1, Number.NaN, Infinity]) expect(isMilliseconds(bad)).toBe(false)
    expect(() => milliseconds(-5)).toThrow('-5')
  })
})
