import { beforeEach, describe, expect, it } from 'vitest'
import { FIREBASE_CONFIG_STORAGE_KEY, firebaseWebConfig, getStoredFirebaseWebConfig } from 'data-platform/client'
import { migrateLegacyFirebaseConfig } from './legacyConfig.ts'

const LEGACY_KEY = 'home-catalogue:firebase-config'

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

beforeEach(() => {
  localStorage.clear()
})

describe('migrateLegacyFirebaseConfig', () => {
  it('moves a config under the old key to the platform-wide key and removes the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(config))

    migrateLegacyFirebaseConfig()

    expect(getStoredFirebaseWebConfig()).toEqual(config)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('keeps a config already under the platform-wide key, and still removes the old key', () => {
    const other = firebaseWebConfig({ ...config, projectId: 'other' })
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(other))
    localStorage.setItem(LEGACY_KEY, JSON.stringify(config))

    migrateLegacyFirebaseConfig()

    expect(getStoredFirebaseWebConfig()).toEqual(other)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('drops an old value that is no longer a valid config', () => {
    localStorage.setItem(LEGACY_KEY, '{"apiKey": "only-this-field"}')

    migrateLegacyFirebaseConfig()

    expect(getStoredFirebaseWebConfig()).toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('does nothing when no old key is stored', () => {
    migrateLegacyFirebaseConfig()

    expect(localStorage.length).toBe(0)
  })
})
