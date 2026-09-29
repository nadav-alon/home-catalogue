import { readFileSync } from 'node:fs'
import { themeColor } from '../theme.ts'
import { describe, expect, it } from 'vitest'
import { colourRoleNames, colourRoleProperty, colourRolesCss, seedColour } from './colourRoles.ts'

const seed = seedColour('#2563eb')

function block(css: string, opener: string): string {
  const start = css.indexOf(opener)
  return css.slice(start, css.indexOf('\n}', start))
}

describe('colourRolesCss', () => {
  const css = colourRolesCss(seed)
  const light = block(css, ':root {')
  const dark = block(css, '@media (prefers-color-scheme: dark)')

  it('declares every role for light and for dark', () => {
    for (const role of colourRoleNames) {
      const property = colourRoleProperty(role)
      expect(light).toContain(`${property}: #`)
      expect(dark).toContain(`${property}: #`)
    }
    expect(colourRoleNames).toHaveLength(49)
  })

  it('gives dark different values from light', () => {
    expect(dark).not.toContain(light.split('\n').find((l) => l.includes('--md-sys-color-surface:'))!)
  })

  it('regenerates every role from a different seed', () => {
    const other = colourRolesCss(seedColour('#16a34a'))
    expect(other).not.toContain('--md-sys-color-primary: #4b5c92')
    expect(css).toContain('--md-sys-color-primary: #4b5c92')
  })

  it('rejects a seed that is not #rrggbb', () => {
    expect(() => seedColour('blue')).toThrow('blue')
  })
})

describe('theme.css', () => {
  it('is the output for themeColor, so changing the seed is one edit plus `npm run theme`', () => {
    const committed = readFileSync('src/ui/theme.css', 'utf8')
    expect(committed).toBe(colourRolesCss(themeColor))
  })
})
