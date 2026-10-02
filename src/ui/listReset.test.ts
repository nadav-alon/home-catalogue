import { describe, expect, it } from 'vitest'
import { read } from '../testing/css.ts'

describe('list reset', () => {
  it('is one global rule that drops the default indent and bullets of every list', () => {
    expect(read('src/ui/base.css')).toMatch(/(^|\n)ul,\s*ol\s*{(?=[^}]*margin: 0)(?=[^}]*padding: 0)(?=[^}]*list-style: none)[^}]*}/)
  })
})
