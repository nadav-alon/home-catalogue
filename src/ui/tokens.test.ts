import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { colourRoleNames, colourRoleProperty } from './colourRoles.ts'

const read = (name: string) => readFileSync(`src/ui/${name}`, 'utf8')
const defined = new Set(
  [read('theme.css'), read('tokens.css')].flatMap((css) => [...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])),
)

describe('design tokens', () => {
  it('define type, spacing, shape and elevation scales', () => {
    for (const prefix of ['typescale', 'spacing', 'shape', 'elevation']) {
      expect([...defined].some((p) => p.startsWith(`--md-sys-${prefix}`))).toBe(true)
    }
  })

  it('base styles paint the body and the focus ring from defined tokens', () => {
    const base = read('base.css')
    expect(base).toMatch(/body\s*{[^}]*background: var\(--md-sys-color-background\)/)
    expect(base).toMatch(/:focus-visible\s*{[^}]*outline:/)
    for (const [, property] of read('base.css').matchAll(/var\((--[\w-]+)\)/g)) {
      expect(defined, property).toContain(property)
    }
  })

  it('elevation shadows use a defined colour role', () => {
    expect(defined).toContain(colourRoleProperty(colourRoleNames.find((r) => r === 'shadow')!))
  })
})
