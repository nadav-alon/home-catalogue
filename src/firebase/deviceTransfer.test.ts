import { describe, expect, it } from 'vitest'
import { firebaseWebConfig } from './webConfig.ts'
import { deviceTransferUrl, parseConfigFragment, sameFirebaseConfig } from './deviceTransfer.ts'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

function hashOf(url: string): string {
  return url.slice(url.indexOf('#'))
}

describe('deviceTransferUrl / parseConfigFragment round trip', () => {
  it('decodes back to the source config', () => {
    const url = deviceTransferUrl(config)

    expect(parseConfigFragment(hashOf(url))).toEqual(config)
  })

  it('carries the current page URL, minus any prior fragment', () => {
    const url = deviceTransferUrl(config)

    expect(url).toMatch(/^http:\/\/localhost:3000\/#config=/)
  })
})

describe('parseConfigFragment', () => {
  it('returns null when the hash carries no config fragment', () => {
    expect(parseConfigFragment('')).toBeNull()
    expect(parseConfigFragment('#other=1')).toBeNull()
  })

  it('throws on a truncated fragment', () => {
    const url = deviceTransferUrl(config)
    const truncated = hashOf(url).slice(0, -10)

    expect(() => parseConfigFragment(truncated)).toThrow(/truncated or corrupted/)
  })

  it('throws on a fragment that decodes to something other than JSON', () => {
    expect(() => parseConfigFragment('#config=not-base64!!!')).toThrow(/truncated or corrupted/)
  })

  it('throws on a fragment that decodes to an incomplete config', () => {
    const incomplete = Buffer.from(JSON.stringify({ apiKey: 'only-this-field' }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(() => parseConfigFragment(`#config=${incomplete}`)).toThrow(/missing or has empty fields/)
  })
})

describe('sameFirebaseConfig', () => {
  it('is true for an identical config', () => {
    expect(sameFirebaseConfig(config, config)).toBe(true)
  })

  it('is true regardless of key order', () => {
    const reordered = firebaseWebConfig(
      Object.fromEntries(Object.entries(config).reverse()) as unknown as Record<string, string>,
    )

    expect(sameFirebaseConfig(config, reordered)).toBe(true)
  })

  it('is false when a field differs', () => {
    const other = firebaseWebConfig({ ...config, projectId: 'other-household' })

    expect(sameFirebaseConfig(config, other)).toBe(false)
  })
})
