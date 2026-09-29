import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { read } from '../testing/css.ts'

const primitiveStylesheets = readdirSync('src/ui').filter((name) => /^[A-Z]\w*\.css$/.test(name))

describe('focus ring', () => {
  it('is drawn by one global :focus-visible rule that covers every native control', () => {
    expect(read('src/ui/base.css')).toMatch(/(^|\n):focus-visible\s*{[^}]*outline: 2px solid var\(--md-sys-color-primary\)/)
  })

  it.each(primitiveStylesheets)('%s does not remove it', (name) => {
    expect(read(`src/ui/${name}`)).not.toMatch(/outline\s*:\s*(none|0)/)
  })
})
