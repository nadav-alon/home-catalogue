import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(`src/ui/${name}`, 'utf8')
const primitiveStylesheets = readdirSync('src/ui').filter((name) => /^[A-Z]\w*\.css$/.test(name))

describe('focus ring', () => {
  it('is drawn by one global :focus-visible rule that covers every native control', () => {
    expect(read('base.css')).toMatch(/(^|\n):focus-visible\s*{[^}]*outline: 2px solid var\(--md-sys-color-primary\)/)
  })

  it.each(primitiveStylesheets)('%s does not remove it', (name) => {
    expect(read(name)).not.toMatch(/outline\s*:\s*(none|0)/)
  })

  it('covers every primitive stylesheet', () => {
    expect(primitiveStylesheets.length).toBeGreaterThanOrEqual(8)
  })
})
