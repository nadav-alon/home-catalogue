import { afterEach, describe, expect, it, vi } from 'vitest'
import { firebaseWebConfig } from './webConfig.ts'

const initializeApp = vi.fn((_config: unknown) => ({ name: 'fake-app' }))
const deleteApp = vi.fn((_app: unknown) => Promise.resolve())
const initializeFirestore = vi.fn((_app: unknown, _settings: unknown) => ({ type: 'fake-firestore' }))
const persistentLocalCache = vi.fn(() => ({ kind: 'persistent' }))
const memoryLocalCache = vi.fn(() => ({ kind: 'memory' }))
const initLocalAuth = vi.fn((_app: unknown) => ({ type: 'fake-auth' }))
const terminate = vi.fn((_db: unknown) => Promise.resolve())
const connectLocal = vi.fn((_app: unknown) => undefined)

vi.mock('firebase/app', () => ({
  initializeApp: (config: unknown) => initializeApp(config),
  deleteApp: (app: unknown) => deleteApp(app),
}))

vi.mock('data-platform/local', () => ({
  connectLocal: (app: unknown) => connectLocal(app),
  initLocalAuth: (app: unknown) => initLocalAuth(app),
  LOCAL_PROJECT_ID: 'demo-data-platform-local',
}))

vi.mock('firebase/firestore', () => ({
  initializeFirestore: (app: unknown, settings: unknown) => initializeFirestore(app, settings),
  persistentLocalCache: () => persistentLocalCache(),
  memoryLocalCache: () => memoryLocalCache(),
  terminate: (db: unknown) => terminate(db),
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

describe('terminateFirebase', () => {
  it('terminates Firestore before deleting the app', async () => {
    const { initFirebase, terminateFirebase } = await import('./client.ts')
    const client = initFirebase(config)
    const calls: string[] = []
    terminate.mockImplementationOnce(async (_db: unknown) => {
      calls.push('terminate')
    })
    deleteApp.mockImplementationOnce(async (_app: unknown) => {
      calls.push('deleteApp')
    })

    await terminateFirebase(client)

    expect(terminate).toHaveBeenCalledWith(client.db)
    expect(deleteApp).toHaveBeenCalledWith(client.app)
    expect(calls).toEqual(['terminate', 'deleteApp'])
  })
})

describe('initFirebase in ux mode', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('points the app at the local emulators after creating Firestore', async () => {
    vi.stubEnv('MODE', 'ux')
    const { initFirebase } = await import('./client.ts')
    const fakeApp = { name: 'fake-app' }
    initializeApp.mockReturnValueOnce(fakeApp)
    connectLocal.mockClear()
    initializeFirestore.mockClear()

    initFirebase(config)

    expect(connectLocal).toHaveBeenCalledWith(fakeApp)
    expect(initializeFirestore.mock.invocationCallOrder[0]).toBeLessThan(connectLocal.mock.invocationCallOrder[0])
  })

  it('keeps the Firestore cache in memory and creates Auth through initLocalAuth, before connecting', async () => {
    vi.stubEnv('MODE', 'ux')
    const { initFirebase } = await import('./client.ts')
    const fakeApp = { name: 'fake-app' }
    initializeApp.mockReturnValueOnce(fakeApp)
    connectLocal.mockClear()
    initializeFirestore.mockClear()
    initLocalAuth.mockClear()
    persistentLocalCache.mockClear()

    initFirebase(config)

    expect(initializeFirestore).toHaveBeenCalledWith(fakeApp, { localCache: { kind: 'memory' } })
    expect(persistentLocalCache).not.toHaveBeenCalled()
    expect(initLocalAuth).toHaveBeenCalledWith(fakeApp)
    expect(initLocalAuth.mock.invocationCallOrder[0]).toBeLessThan(connectLocal.mock.invocationCallOrder[0])
  })

  it('creates no local Auth and never connects to the emulators outside ux mode', async () => {
    const { initFirebase } = await import('./client.ts')
    connectLocal.mockClear()
    initLocalAuth.mockClear()

    initFirebase(config)

    expect(connectLocal).not.toHaveBeenCalled()
    expect(initLocalAuth).not.toHaveBeenCalled()
  })
})
