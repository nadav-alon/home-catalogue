import { describe, expect, it } from 'vitest'
import { parseUxScenario } from './uxArgs.ts'

describe('parseUxScenario', () => {
  it('defaults to owner-with-items', () => {
    expect(parseUxScenario([])).toBe('owner-with-items')
  })

  it('reads --scenario <name> and --scenario=<name>', () => {
    expect(parseUxScenario(['--scenario', 'empty'])).toBe('empty')
    expect(parseUxScenario(['--scenario=invited-member'])).toBe('invited-member')
  })

  it('fails an unknown name with the known list', () => {
    expect(() => parseUxScenario(['--scenario', 'nope'])).toThrow(
      /Unknown scenario "nope"; known scenarios: .*owner-with-items/,
    )
  })

  it('fails a missing name or a stray argument with usage', () => {
    expect(() => parseUxScenario(['--scenario'])).toThrow(/Usage/)
    expect(() => parseUxScenario(['--other'])).toThrow(/Usage/)
  })
})
