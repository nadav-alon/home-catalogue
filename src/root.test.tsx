import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Root } from './root.tsx'
import { saveFirebaseConfig } from './firebase/configStorage.ts'
import { deviceTransferUrl } from './firebase/deviceTransfer.ts'
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

const readDeployedPlatformVersion = vi.fn()
vi.mock('./platform/readDeployedPlatformVersion.ts', () => ({
  readDeployedPlatformVersion: (db: unknown) => readDeployedPlatformVersion(db),
}))

const checkPlatform = vi.fn()
vi.mock('data-platform', () => ({
  core: { checkPlatform: (deployed: unknown) => checkPlatform(deployed) },
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

function hashOf(url: string): string {
  return url.slice(url.indexOf('#'))
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
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
  readDeployedPlatformVersion.mockReset()
  readDeployedPlatformVersion.mockResolvedValue('deployed-version')
  checkPlatform.mockReset()
  checkPlatform.mockReturnValue('ok')
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

  it('checks the deployed platform version against the connected client', async () => {
    saveFirebaseConfig(validConfig)

    render(<Root />)

    await screen.findByRole('heading', { name: 'Home Catalogue' })
    await waitFor(() => expect(checkPlatform).toHaveBeenCalledWith('deployed-version'))
    expect(readDeployedPlatformVersion).toHaveBeenCalledWith(fakeClient.db)
  })

  it('does not read the platform version before sign-in', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return vi.fn()
    })
    saveFirebaseConfig(validConfig)

    render(<Root />)

    await screen.findByRole('heading', { name: 'Sign in' })
    expect(readDeployedPlatformVersion).not.toHaveBeenCalled()
  })

  it('shows no banner once checkPlatform resolves ok', async () => {
    saveFirebaseConfig(validConfig)

    render(<Root />)

    await screen.findByRole('heading', { name: 'Home Catalogue' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a blocking banner once checkPlatform resolves outdated', async () => {
    checkPlatform.mockReturnValue('outdated')
    saveFirebaseConfig(validConfig)

    render(<Root />)

    expect(await screen.findByRole('alert')).toHaveTextContent('update your platform deploy')
  })

  it('shows a blocking banner once checkPlatform resolves missing', async () => {
    checkPlatform.mockReturnValue('missing')
    saveFirebaseConfig(validConfig)

    render(<Root />)

    expect(await screen.findByRole('alert')).toHaveTextContent('update your platform deploy')
  })
})

describe('Root with a device transfer fragment in the URL', () => {
  it('saves a valid fragment, strips it from the URL, and proceeds to sign-in', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return vi.fn()
    })
    history.replaceState(null, '', '/' + hashOf(deviceTransferUrl(validConfig)))

    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('home-catalogue:firebase-config')!)).toEqual(validConfig)
    expect(location.hash).toBe('')
  })

  it('ignores a truncated fragment, showing the error on the setup screen, without saving', () => {
    const truncated = hashOf(deviceTransferUrl(validConfig)).slice(0, -10)
    history.replaceState(null, '', '/' + truncated)

    render(<Root />)

    expect(screen.getByRole('heading', { name: 'Set up Home Catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/truncated or corrupted/)
    expect(localStorage.getItem('home-catalogue:firebase-config')).toBeNull()
    expect(location.hash).toBe('')
  })

  it('asks before replacing a different stored config, and keeps the old one when declined', async () => {
    saveFirebaseConfig(validConfig)
    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    history.replaceState(null, '', '/' + hashOf(deviceTransferUrl(otherConfig)))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(confirmSpy).toHaveBeenCalled()
    expect(initFirebase).toHaveBeenCalledWith(validConfig)
    expect(JSON.parse(localStorage.getItem('home-catalogue:firebase-config')!)).toEqual(validConfig)
    expect(location.hash).toBe('')
  })

  it('replaces the stored config when the user confirms', async () => {
    saveFirebaseConfig(validConfig)
    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    history.replaceState(null, '', '/' + hashOf(deviceTransferUrl(otherConfig)))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(initFirebase).toHaveBeenCalledWith(otherConfig)
    expect(JSON.parse(localStorage.getItem('home-catalogue:firebase-config')!)).toEqual(otherConfig)
  })

  it('treats a fragment matching the already-stored config as a no-op, without asking', async () => {
    saveFirebaseConfig(validConfig)
    history.replaceState(null, '', '/' + hashOf(deviceTransferUrl(validConfig)))
    const confirmSpy = vi.spyOn(window, 'confirm')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(initFirebase).toHaveBeenCalledWith(validConfig)
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(location.hash).toBe('')
  })
})
