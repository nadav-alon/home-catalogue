import { describe, expect, it } from 'vitest'
import { colourRoleProperty } from './colourRoles.ts'
import { defined, read } from '../testing/css.ts'

describe('design tokens', () => {
  it('define type, spacing, shape and elevation scales', () => {
    for (const prefix of ['typescale', 'spacing', 'shape', 'elevation']) {
      expect([...defined].some((p) => p.startsWith(`--md-sys-${prefix}`))).toBe(true)
    }
  })

  it('base styles paint the body and the focus ring from defined tokens', () => {
    const base = read('src/ui/base.css')
    expect(base).toMatch(/body\s*{[^}]*background: var\(--md-sys-color-background\)/)
    expect(base).toMatch(/:focus-visible\s*{[^}]*outline:/)
    for (const [, property] of base.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(defined, property).toContain(property)
    }
  })

  it('elevation shadows use a defined colour role', () => {
    expect(defined).toContain(colourRoleProperty('shadow'))
  })
})
