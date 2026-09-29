import { describe, expect, it } from 'vitest'
import { manifest } from './pwa-manifest'
import { themeColor } from './theme'

const purposesOf = (purpose?: string | string[]) => (Array.isArray(purpose) ? purpose : purpose?.split(' ') ?? [])

describe('manifest', () => {
  it('is installable as a standalone app', () => {
    expect(manifest.name).toBe('Home Catalogue')
    expect(manifest.display).toBe('standalone')
  })

  it('takes theme_color from the seed colour', () => {
    expect(themeColor).toBe('#e8590c')
    expect(manifest.theme_color).toBe(themeColor)
  })

  it('carries the icon sizes Chrome requires for installability', () => {
    const sizes = manifest.icons
      ?.filter((icon) => purposesOf(icon.purpose).length === 0 || purposesOf(icon.purpose).includes('any'))
      .map((icon) => icon.sizes)

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('declares a maskable icon at an installable size', () => {
    const maskableSizes = manifest.icons
      ?.filter((icon) => purposesOf(icon.purpose).includes('maskable'))
      .map((icon) => icon.sizes)
    const hasMaskable = maskableSizes?.some((size) => size === '192x192' || size === '512x512')

    expect(hasMaskable).toBe(true)
  })
})
