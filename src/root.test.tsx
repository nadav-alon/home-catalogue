import { fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Root } from './root.tsx'
import { saveFirebaseConfig } from './firebase/configStorage.ts'
import { firebaseWebConfig } from './firebase/webConfig.ts'
import type { AuthUser } from './auth/authClient.ts'

const initFirebase = vi.fn()
const terminateFirebase = vi.fn()
vi.mock('./firebase/client.ts', () => ({
  initFirebase: (config: unknown) => initFirebase(config),
  terminateFirebase: (client: unknown) => terminateFirebase(client),
}))

// These tests are about the Firebase config lifecycle, not auth, so the auth gate is
// stubbed as an already-signed-in member throughout.
const member: AuthUser = { uid: 'owner-uid', email: 'owner@example.com' } as unknown as AuthUser
const watchAuthState = vi.fn()
vi.mock('./auth/authClient.ts', () => ({
  watchAuthState: (app: unknown, cb: (user: AuthUser | null) => void) => watchAuthState(app, cb),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
}))

const householdExists = vi.fn()
const isHouseholdMember = vi.fn()
vi.mock('./auth/household.ts', () => ({
  householdExists: (db: unknown) => householdExists(db),
  isHouseholdMember: (db: unknown, uid: unknown) => isHouseholdMember(db, uid),
  claimHousehold: vi.fn(),
}))

vi.mock('./catalogue/shops.ts', () => ({
  watchShops: () => vi.fn(),
}))
vi.mock('./catalogue/categories.ts', () => ({
  watchCategories: () => vi.fn(),
}))

const validConfig = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

const fakeClient = { app: 'fake-app', db: 'fake-db' }

beforeEach(() => {
  localStorage.clear()
  initFirebase.mockClear()
  initFirebase.mockReturnValue(fakeClient)
  terminateFirebase.mockClear()
  terminateFirebase.mockResolvedValue(undefined)
  watchAuthState.mockReset()
  watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
    cb(member)
    return vi.fn()
  })
  householdExists.mockReset().mockResolvedValue(true)
  isHouseholdMember.mockReset().mockResolvedValue(true)
})

describe('Root', () => {
  it('shows the setup screen when no config is stored', () => {
    render(<Root />)

    expect(screen.getByRole('heading', { name: 'Set up Home Catalogue' })).toBeInTheDocument()
    expect(initFirebase).not.toHaveBeenCalled()
  })

  it('initialises Firebase and shows the app once config is stored', async () => {
    saveFirebaseConfig(validConfig)

    render(<Root />)

    expect(initFirebase).toHaveBeenCalledWith(validConfig)
    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
  })

  it('shows the app after the setup screen submits a valid config', async () => {
    render(<Root />)

    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify(validConfig) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(initFirebase).toHaveBeenCalledWith(validConfig)
  })

  it('returns to the setup screen and clears storage when reset', async () => {
    saveFirebaseConfig(validConfig)
    render(<Root />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset Firebase configuration' }))

    expect(await screen.findByRole('heading', { name: 'Set up Home Catalogue' })).toBeInTheDocument()
    expect(localStorage.getItem('home-catalogue:firebase-config')).toBeNull()
    expect(terminateFirebase).toHaveBeenCalledWith(fakeClient)
  })

  it('tears down the previous client before initialising a new one after reset', async () => {
    saveFirebaseConfig(validConfig)
    render(<Root />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset Firebase configuration' }))
    await screen.findByRole('heading', { name: 'Set up Home Catalogue' })

    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify(otherConfig) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(terminateFirebase).toHaveBeenCalledWith(fakeClient)
    expect(initFirebase).toHaveBeenLastCalledWith(otherConfig)
  })
})
