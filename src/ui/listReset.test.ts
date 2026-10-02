import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { read } from '../testing/css.ts'

const primitiveStylesheets = readdirSync('src/ui').filter((name) => /^[A-Z]\w*\.css$/.test(name))

describe('list reset', () => {
  it('is one global rule that drops the default indent and bullets of every list', () => {
    expect(read('src/ui/base.css')).toMatch(/(^|\n)ul,\s*ol\s*{(?=[^}]*margin: 0)(?=[^}]*padding: 0)(?=[^}]*list-style: none)[^}]*}/)
  })

  it.each(primitiveStylesheets)('%s does not put list-style back or restate the reset', (name) => {
    expect(read(`src/ui/${name}`)).not.toMatch(/list-style/)
  })

  it('ListRow content is not inset from the heading by inline padding', () => {
    const css = read('src/ui/ListRow.css')
    for (const selector of ['.ui-list-row', '.ui-list-row__label', '.ui-list-row__link']) {
      const blocks = [...css.matchAll(/(?:^|\n)([^{}]+){([^}]*)}/g)]
        .filter(([, selectors]) => selectors.split(',').some((s) => s.trim() === selector))
        .map(([, , body]) => body)
      expect(blocks).not.toHaveLength(0)
      for (const block of blocks) expect(block).not.toMatch(/padding:[^;]*var\(--md-sys-spacing-4\)/)
    }
  })
})
