import { describe, expect, it } from 'vitest'
import config from './vite.config'

describe('vite config', () => {
  it('serves the app from the GitHub Pages repo path', () => {
    expect(config.base).toBe('/home-catalogue/')
  })
})
