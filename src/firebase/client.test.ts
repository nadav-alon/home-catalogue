import { describe, expect, it, vi } from 'vitest'
import { firebaseWebConfig } from './webConfig.ts'

const initializeApp = vi.fn((_config: unknown) => ({ name: 'fake-app' }))
const initializeFirestore = vi.fn((_app: unknown, _settings: unknown) => ({ type: 'fake-firestore' }))
const persistentLocalCache = vi.fn(() => ({ kind: 'persistent' }))

vi.mock('firebase/app', () => ({
  initializeApp: (config: unknown) => initializeApp(config),
}))

vi.mock('firebase/firestore', () => ({
  initializeFirestore: (app: unknown, settings: unknown) => initializeFirestore(app, settings),
  persistentLocalCache: () => persistentLocalCache(),
}))

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

describe('initFirebase', () => {
  it('initialises the app from the stored config', async () => {
    const { initFirebase } = await import('./client.ts')

    initFirebase(config)

    expect(initializeApp).toHaveBeenCalledWith(config)
  })

  it('initialises Firestore with a persistent local cache', async () => {
    const { initFirebase } = await import('./client.ts')
    const fakeApp = { name: 'fake-app' }
    const fakeCache = { kind: 'persistent' }
    initializeApp.mockReturnValueOnce(fakeApp)
    persistentLocalCache.mockReturnValueOnce(fakeCache)

    initFirebase(config)

    expect(initializeFirestore).toHaveBeenCalledWith(fakeApp, { localCache: fakeCache })
  })

  it('returns the initialised app and db', async () => {
    const { initFirebase } = await import('./client.ts')
    const fakeApp = { name: 'fake-app' }
    const fakeDb = { type: 'fake-firestore' }
    initializeApp.mockReturnValueOnce(fakeApp)
    initializeFirestore.mockReturnValueOnce(fakeDb)

    expect(initFirebase(config)).toEqual({ app: fakeApp, db: fakeDb })
  })
})
