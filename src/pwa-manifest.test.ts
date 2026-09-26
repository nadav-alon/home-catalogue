import { describe, expect, it } from 'vitest'
import { manifest } from './pwa-manifest'

describe('manifest', () => {
  it('is installable as a standalone app', () => {
    expect(manifest.name).toBe('Home Catalogue')
    expect(manifest.display).toBe('standalone')
  })

  it('carries the icon sizes Chrome requires for installability', () => {
    const sizes = manifest.icons?.map((icon) => icon.sizes)

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })
})
