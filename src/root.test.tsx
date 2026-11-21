import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Root } from './root.tsx'
import {
  FIREBASE_CONFIG_STORAGE_KEY,
  firebaseWebConfig,
  getStoredFirebaseWebConfig,
  saveFirebaseWebConfig,
  type AuthUser,
} from 'data-platform/client'
import { householdTransferUrl } from './firebase/householdTransferUrl.ts'
import { uxWiring } from './firebase/uxMode.ts'
import { resetHash } from './testing/hash.ts'

// These tests are about the Firebase config lifecycle, not auth, so the auth gate is
// stubbed as an already-signed-in member throughout.
const member: AuthUser = { uid: 'owner-uid', email: 'owner@example.com' } as unknown as AuthUser
const onAuthChange = vi.fn()
const signOut = vi.fn()
const householdExists = vi.fn()
const isHouseholdMember = vi.fn()
const initFirebase = vi.fn()
const terminateFirebase = vi.fn()
vi.mock('data-platform/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('data-platform/client')>()),
  initFirebase: (...args: unknown[]) => initFirebase(...args),
  terminateFirebase: (client: unknown) => terminateFirebase(client),
  authClient: (app: unknown) => ({
    onAuthChange: (cb: (user: AuthUser | null) => void) => onAuthChange(app, cb),
    signIn: vi.fn(),
    signOut: () => signOut(app),
  }),
  householdExists: (db: unknown) => householdExists(db),
  isHouseholdMember: (db: unknown, uid: unknown) => isHouseholdMember(db, uid),
  claimHousehold: vi.fn(),
  joinFromInvite: vi.fn().mockResolvedValue(false),
}))

vi.mock('./catalogue/stores.ts', () => ({
  watchStores: () => vi.fn(),
}))
vi.mock('./catalogue/shops.ts', () => ({
  watchShops: () => vi.fn(),
}))
vi.mock('./catalogue/aisles.ts', () => ({
  watchAisles: () => vi.fn(),
}))
vi.mock('./catalogue/stores.ts', () => ({
  watchStores: () => vi.fn(),
}))
vi.mock('./catalogue/tags.ts', () => ({
  watchTags: () => vi.fn(),
}))
vi.mock('./catalogue/categories.ts', () => ({
  watchCategories: () => vi.fn(),
}))
vi.mock('./catalogue/items.ts', () => ({
  watchItems: () => vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
}))

const readDeployedPlatformVersion = vi.fn()
vi.mock('./platform/readDeployedPlatformVersion.ts', () => ({
  readDeployedPlatformVersion: (db: unknown) => readDeployedPlatformVersion(db),
}))

const checkPlatform = vi.fn()
// Keep the real catalogue/core exports (the managers read catalogue during render); only
// checkPlatform is stubbed, so the platform-version tests control its result (a test may also
// delegate it to the real one).
vi.mock('data-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('data-platform')>()
  return {
    ...actual,
    core: { ...actual.core, checkPlatform: (deployed: unknown) => checkPlatform(deployed) },
  }
})

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

/** Settings is chosen by the URL, so the hash is set before rendering: the router reads it on mount. */
function startOnSettings() {
  window.location.hash = '#/settings'
}

async function resetFromSettings() {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  fireEvent.click(await screen.findByRole('button', { name: 'Reset Firebase configuration' }))
}

function startSignedOut() {
  onAuthChange.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
    cb(null)
    return vi.fn()
  })
}

function startAsNonMember() {
  isHouseholdMember.mockResolvedValue(false)
}

/** The pre-sign-in cards offer Reset; `cardHeading` is the card each test expects to be showing. */
async function clickResetOn(cardHeading: string, confirmed: boolean) {
  await screen.findByRole('heading', { name: cardHeading })
  vi.spyOn(window, 'confirm').mockReturnValue(confirmed)
  fireEvent.click(screen.getByRole('button', { name: 'Reset Firebase configuration' }))
}

afterEach(async () => {
  vi.restoreAllMocks()
  await resetHash()
})

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  initFirebase.mockClear()
  initFirebase.mockReturnValue(fakeClient)
  terminateFirebase.mockClear()
  terminateFirebase.mockResolvedValue(undefined)
  onAuthChange.mockReset()
  onAuthChange.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
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

    expect(screen.getByRole('heading', { name: 'Set up' })).toBeInTheDocument()
    expect(initFirebase).not.toHaveBeenCalled()
  })

  it('initialises Firebase and shows the app once config is stored', async () => {
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    expect(initFirebase).toHaveBeenCalledWith(validConfig, { local: undefined })
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('moves a config stored under the old key to the platform-wide key on first load', async () => {
    localStorage.setItem('home-catalogue:firebase-config', JSON.stringify(validConfig))

    render(<Root />)

    expect(initFirebase).toHaveBeenCalledWith(validConfig, { local: undefined })
    expect(getStoredFirebaseWebConfig()).toEqual(validConfig)
    expect(localStorage.getItem('home-catalogue:firebase-config')).toBeNull()
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('shows the app after the setup screen submits a valid config', async () => {
    render(<Root />)

    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify(validConfig) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(initFirebase).toHaveBeenCalledWith(validConfig, { local: undefined })
  })

  it('returns to the setup screen and clears storage when reset', async () => {
    saveFirebaseWebConfig(validConfig)
    startOnSettings()
    render(<Root />)

    await resetFromSettings()

    expect(await screen.findByRole('heading', { name: 'Set up' })).toBeInTheDocument()
    expect(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)).toBeNull()
    expect(terminateFirebase).toHaveBeenCalledWith(fakeClient)
  })

  it('tears down the previous client before initialising a new one after reset', async () => {
    saveFirebaseWebConfig(validConfig)
    startOnSettings()
    render(<Root />)

    await resetFromSettings()
    await screen.findByRole('heading', { name: 'Set up' })

    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    fireEvent.input(screen.getByLabelText('Firebase web config'), {
      target: { value: JSON.stringify(otherConfig) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(terminateFirebase).toHaveBeenCalledWith(fakeClient)
    expect(initFirebase).toHaveBeenLastCalledWith(otherConfig, { local: undefined })
  })

  it.each([
    ['signed-out', 'Sign in', startSignedOut],
    ['non-member', 'Not a member', startAsNonMember],
  ])('resets from the %s card: back to Setup, config cleared, client terminated', async (_card, heading, start) => {
    start()
    saveFirebaseWebConfig(validConfig)
    render(<Root />)

    await clickResetOn(heading, true)

    expect(await screen.findByRole('heading', { name: 'Set up' })).toBeInTheDocument()
    expect(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)).toBeNull()
    expect(terminateFirebase).toHaveBeenCalledWith(fakeClient)
  })

  it.each([
    ['signed-out', 'Sign in', startSignedOut],
    ['non-member', 'Not a member', startAsNonMember],
  ])('keeps the config and the %s card when the confirm is cancelled', async (_card, heading, start) => {
    start()
    saveFirebaseWebConfig(validConfig)
    render(<Root />)

    await clickResetOn(heading, false)

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)!)).toEqual(validConfig)
    expect(terminateFirebase).not.toHaveBeenCalled()
  })

  it('offers Reset to a member only in Settings, and signs out the connected client from Settings, and nowhere else', async () => {
    saveFirebaseWebConfig(validConfig)
    const { unmount } = render(<Root />)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset Firebase configuration' })).toBeNull()
    unmount()

    startOnSettings()
    render(<Root />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledWith(fakeClient.app)
  })

  it('checks the deployed platform version against the connected client', async () => {
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() => expect(checkPlatform).toHaveBeenCalledWith('deployed-version'))
    expect(readDeployedPlatformVersion).toHaveBeenCalledWith(fakeClient.db)
  })

  it('does not read the platform version before sign-in', async () => {
    onAuthChange.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return vi.fn()
    })
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    await screen.findByRole('heading', { name: 'Sign in' })
    expect(readDeployedPlatformVersion).not.toHaveBeenCalled()
  })

  it('shows no banner once checkPlatform resolves ok', async () => {
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a blocking banner once checkPlatform resolves outdated', async () => {
    checkPlatform.mockReturnValue('outdated')
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    expect(await screen.findByRole('alert')).toHaveTextContent('update your platform deploy')
  })

  it('shows a blocking banner once checkPlatform resolves missing', async () => {
    checkPlatform.mockReturnValue('missing')
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    expect(await screen.findByRole('alert')).toHaveTextContent('update your platform deploy')
  })
})

describe('Root with a device transfer fragment in the URL', () => {
  it('saves a valid fragment, strips it from the URL, and proceeds to sign-in', async () => {
    onAuthChange.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return vi.fn()
    })
    history.replaceState(null, '', '/' + hashOf(householdTransferUrl(validConfig)))

    render(<Root />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)!)).toEqual(validConfig)
    expect(location.hash).toBe('')
  })

  it('ignores a truncated fragment, showing the error on the setup screen, without saving', () => {
    const truncated = hashOf(householdTransferUrl(validConfig)).slice(0, -10)
    history.replaceState(null, '', '/' + truncated)

    render(<Root />)

    expect(screen.getByRole('heading', { name: 'Set up' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/truncated or corrupted/)
    expect(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)).toBeNull()
    expect(location.hash).toBe('')
  })

  it('asks before replacing a different stored config, and keeps the old one when declined', async () => {
    saveFirebaseWebConfig(validConfig)
    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    history.replaceState(null, '', '/' + hashOf(householdTransferUrl(otherConfig)))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Root />)

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(confirmSpy).toHaveBeenCalled()
    expect(initFirebase).toHaveBeenCalledWith(validConfig, { local: undefined })
    expect(JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)!)).toEqual(validConfig)
    expect(location.hash).toBe('')
  })

  it('replaces the stored config when the user confirms', async () => {
    saveFirebaseWebConfig(validConfig)
    const otherConfig = firebaseWebConfig({ ...validConfig, projectId: 'other-household' })
    history.replaceState(null, '', '/' + hashOf(householdTransferUrl(otherConfig)))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Root />)

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(initFirebase).toHaveBeenCalledWith(otherConfig, { local: undefined })
    expect(JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY)!)).toEqual(otherConfig)
  })

  it('treats a fragment matching the already-stored config as a no-op, without asking', async () => {
    saveFirebaseWebConfig(validConfig)
    history.replaceState(null, '', '/' + hashOf(householdTransferUrl(validConfig)))
    const confirmSpy = vi.spyOn(window, 'confirm')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    render(<Root />)

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(initFirebase).toHaveBeenCalledWith(validConfig, { local: undefined })
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(location.hash).toBe('')
  })
})

describe('Root in ux mode', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('skips setup and initialises Firebase from the demo config, ignoring a stored one', async () => {
    vi.stubEnv('MODE', 'ux')
    saveFirebaseWebConfig(validConfig)

    render(<Root />)

    expect(initFirebase).toHaveBeenCalledWith(uxWiring()!.config, { local: uxWiring()!.local })
    expect(screen.queryByRole('heading', { name: 'Set up' })).not.toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('shows no platform banner in ux mode when the deployed version is this release’s PLATFORM_VERSION', async () => {
    const actual = await vi.importActual<typeof import('data-platform')>('data-platform')
    vi.stubEnv('MODE', 'ux')
    readDeployedPlatformVersion.mockResolvedValue(actual.core.PLATFORM_VERSION)
    checkPlatform.mockImplementation(actual.core.checkPlatform)

    render(<Root />)

    await waitFor(() => expect(checkPlatform).toHaveBeenCalledWith(actual.core.PLATFORM_VERSION))
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
