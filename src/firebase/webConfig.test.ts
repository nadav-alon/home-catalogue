import { describe, expect, it } from 'vitest'
import {
  firebaseWebConfig,
  InvalidFirebaseWebConfigError,
  isFirebaseWebConfig,
  parseFirebaseWebConfigJson,
} from './webConfig.ts'

const validConfig = {
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
}

describe('isFirebaseWebConfig', () => {
  it('accepts a config carrying every required field', () => {
    expect(isFirebaseWebConfig(validConfig)).toBe(true)
  })

  it.each([null, undefined, 'a string', 42, [], {}])('rejects %p', (value) => {
    expect(isFirebaseWebConfig(value)).toBe(false)
  })

  it('rejects a config missing a required field', () => {
    const { apiKey: _apiKey, ...rest } = validConfig
    expect(isFirebaseWebConfig(rest)).toBe(false)
  })

  it('rejects a config with an empty required field', () => {
    expect(isFirebaseWebConfig({ ...validConfig, projectId: '' })).toBe(false)
  })
})

describe('firebaseWebConfig', () => {
  it('returns a config that already satisfies the shape', () => {
    expect(firebaseWebConfig(validConfig)).toEqual(validConfig)
  })

  it('throws InvalidFirebaseWebConfigError naming the missing fields', () => {
    const { apiKey: _apiKey, projectId: _projectId, ...rest } = validConfig
    expect(() => firebaseWebConfig(rest)).toThrow(InvalidFirebaseWebConfigError)
    expect(() => firebaseWebConfig(rest)).toThrow(/apiKey.*projectId/)
  })
})

describe('parseFirebaseWebConfigJson', () => {
  it('parses valid JSON into a validated config', () => {
    expect(parseFirebaseWebConfigJson(JSON.stringify(validConfig))).toEqual(validConfig)
  })

  it('rejects text that is not valid JSON', () => {
    expect(() => parseFirebaseWebConfigJson('not json')).toThrow(InvalidFirebaseWebConfigError)
  })

  it('rejects valid JSON that is missing required fields', () => {
    expect(() => parseFirebaseWebConfigJson('{"apiKey": "x"}')).toThrow(InvalidFirebaseWebConfigError)
  })
})
