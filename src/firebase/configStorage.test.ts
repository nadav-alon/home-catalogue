import { beforeEach, describe, expect, it } from 'vitest'
import { firebaseWebConfig } from './webConfig.ts'
import { clearFirebaseConfig, getStoredFirebaseConfig, saveFirebaseConfig } from './configStorage.ts'

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

describe('getStoredFirebaseConfig', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredFirebaseConfig()).toBeNull()
  })

  it('returns the config after it has been stored', () => {
    saveFirebaseConfig(config)
    expect(getStoredFirebaseConfig()).toEqual(config)
  })

  it('returns null when the stored value is no longer a valid config', () => {
    localStorage.setItem('home-catalogue:firebase-config', '{"apiKey": "only-this-field"}')
    expect(getStoredFirebaseConfig()).toBeNull()
  })

  it('returns null after the config has been cleared', () => {
    saveFirebaseConfig(config)
    clearFirebaseConfig()
    expect(getStoredFirebaseConfig()).toBeNull()
  })
})
