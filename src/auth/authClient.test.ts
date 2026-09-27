import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FirebaseApp } from 'firebase/app'

const getAuth = vi.fn((_app: unknown) => ({ name: 'fake-auth' }))
const signInWithPopup = vi.fn()
const signOut = vi.fn()
const onAuthStateChanged = vi.fn()

class FakeGoogleAuthProvider {}

vi.mock('firebase/auth', () => ({
  getAuth: (app: unknown) => getAuth(app),
  GoogleAuthProvider: FakeGoogleAuthProvider,
  signInWithPopup: (auth: unknown, provider: unknown) => signInWithPopup(auth, provider),
  signOut: (auth: unknown) => signOut(auth),
  onAuthStateChanged: (auth: unknown, cb: unknown) => onAuthStateChanged(auth, cb),
}))

const fakeApp = { name: 'fake-app' } as unknown as FirebaseApp

beforeEach(() => {
  getAuth.mockClear()
  signInWithPopup.mockReset()
  signOut.mockReset()
  onAuthStateChanged.mockReset()
})

describe('signInWithGoogle', () => {
  it('opens the popup on the app auth instance and returns the signed-in user', async () => {
    const { signInWithGoogle } = await import('./authClient.ts')
    signInWithPopup.mockResolvedValueOnce({ user: { uid: 'user-1', email: 'owner@example.com' } })

    const user = await signInWithGoogle(fakeApp)

    expect(getAuth).toHaveBeenCalledWith(fakeApp)
    expect(signInWithPopup.mock.calls[0]?.[1]).toBeInstanceOf(FakeGoogleAuthProvider)
    expect(user).toEqual({ uid: 'user-1', email: 'owner@example.com' })
  })

  it('rejects a signed-in user with no email', async () => {
    const { signInWithGoogle } = await import('./authClient.ts')
    signInWithPopup.mockResolvedValueOnce({ user: { uid: 'user-1', email: null } })

    await expect(signInWithGoogle(fakeApp)).rejects.toThrow('user-1')
  })
})

describe('signOutUser', () => {
  it('signs out of the app auth instance', async () => {
    const { signOutUser } = await import('./authClient.ts')
    signOut.mockResolvedValueOnce(undefined)

    await signOutUser(fakeApp)

    expect(getAuth).toHaveBeenCalledWith(fakeApp)
    expect(signOut).toHaveBeenCalledWith({ name: 'fake-auth' })
  })
})

describe('watchAuthState', () => {
  it('notifies the callback with the signed-in user', async () => {
    const unsubscribe = vi.fn()
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      cb({ uid: 'user-1', email: 'owner@example.com' })
      return unsubscribe
    })
    const { watchAuthState } = await import('./authClient.ts')
    const callback = vi.fn()

    const stop = watchAuthState(fakeApp, callback)

    expect(callback).toHaveBeenCalledWith({ uid: 'user-1', email: 'owner@example.com' })
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('notifies the callback with null when signed out', async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      cb(null)
      return vi.fn()
    })
    const { watchAuthState } = await import('./authClient.ts')
    const callback = vi.fn()

    watchAuthState(fakeApp, callback)

    expect(callback).toHaveBeenCalledWith(null)
  })
})
