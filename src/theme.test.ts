import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { colourRolesCss } from 'household-ui/ui/colourRoles.ts'
import { themeColor } from './theme.ts'

describe('theme.css', () => {
  it('is the household-ui output for themeColor, so changing the seed is one edit plus `npm run theme`', () => {
    expect(readFileSync('src/theme.css', 'utf8')).toBe(colourRolesCss(themeColor))
  })
})
