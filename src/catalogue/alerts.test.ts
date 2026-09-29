import { describe, expect, it } from 'vitest'
import { catalogue, core } from 'data-platform'
import { alertLevel, type AlertLevel } from './alerts.ts'

const expected: Record<catalogue.Necessity, Record<core.State, AlertLevel>> = {
  essential: { enough: 'none', 'running low': 'now', out: 'now' },
  important: { enough: 'none', 'running low': 'soon', out: 'now' },
  optional: { enough: 'none', 'running low': 'none', out: 'soon' },
}

describe('alertLevel', () => {
  for (const necessity of catalogue.necessitySchema.options) {
    for (const state of core.stateSchema.options) {
      it(`is ${expected[necessity][state]} for ${necessity} × ${state}`, () => {
        expect(alertLevel(necessity, state)).toBe(expected[necessity][state])
      })
    }
  }
})
