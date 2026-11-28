import { describe, expect, it } from 'vitest'
import { declaration, tokenUsage } from '../testing/css.ts'

const sheet = 'src/catalogue/ItemsManager.css'
const banner = '.items-manager__unlinked'

describe('the unlinked Ingredients banner stylesheet', () => {
  it('sits on a container role with its on-colour and a shape corner', () => {
    expect(declaration(sheet, banner, 'background')).toBe('var(--md-sys-color-secondary-container)')
    expect(declaration(sheet, banner, 'color')).toBe('var(--md-sys-color-on-secondary-container)')
    expect(declaration(sheet, banner, 'border-radius')).toBe('var(--md-sys-shape-corner-medium)')
    expect(declaration(sheet, banner, 'padding')).toBeDefined()
  })

  it('keeps clear of the chip rows above and the Item groups below', () => {
    expect(declaration(sheet, banner, 'margin-block')).toBe('var(--md-sys-spacing-4)')
  })

  it('uses only defined tokens', () => {
    expect(tokenUsage(sheet).undefinedTokens).toEqual([])
  })
})
