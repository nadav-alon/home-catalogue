import { act, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { AuthGate } from './AuthGate.tsx'
import type { FirebaseClient } from '../firebase/client.ts'
import type { AuthUser } from './authClient.ts'

const setGateState = vi.fn()
vi.mock('preact/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('preact/hooks')>()
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      const [value, set] = actual.useState(initial)
      return [value, (next: unknown) => (setGateState(next), set(next as never))] as const
    },
  }
})

const signInWithGoogle = vi.fn()
const signOutUser = vi.fn()
const watchAuthState = vi.fn()
vi.mock('./authClient.ts', () => ({
  signInWithGoogle: (app: unknown) => signInWithGoogle(app),
  signOutUser: (app: unknown) => signOutUser(app),
  watchAuthState: (app: unknown, cb: unknown) => watchAuthState(app, cb),
}))

const householdExists = vi.fn()
const isHouseholdMember = vi.fn()
const claimHousehold = vi.fn()
const joinFromInvite = vi.fn()
vi.mock('./household.ts', () => ({
  householdExists: (db: unknown) => householdExists(db),
  isHouseholdMember: (db: unknown, uid: unknown) => isHouseholdMember(db, uid),
  claimHousehold: (db: unknown, uid: unknown, email: unknown) => claimHousehold(db, uid, email),
  joinFromInvite: (db: unknown, uid: unknown, email: unknown) => joinFromInvite(db, uid, email),
}))

const fakeClient = { app: 'fake-app', db: 'fake-db' } as unknown as FirebaseClient
const user: AuthUser = { uid: 'user-1', email: 'owner@example.com' } as unknown as AuthUser
const unsubscribe = vi.fn()
const onResetConfig = vi.fn()

beforeEach(() => {
  signInWithGoogle.mockReset()
  signOutUser.mockReset().mockResolvedValue(undefined)
  watchAuthState.mockReset()
  householdExists.mockReset()
  isHouseholdMember.mockReset()
  claimHousehold.mockReset().mockResolvedValue(undefined)
  joinFromInvite.mockReset().mockResolvedValue(false)
  unsubscribe.mockClear()
  setGateState.mockReset()
  onResetConfig.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Clicks Reset twice, declining the confirm first and accepting it second: only the second may reach `onResetConfig`. */
function expectResetOnlyAfterConfirm(reset: HTMLElement) {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)

  fireEvent.click(reset)
  expect(confirmSpy).toHaveBeenCalledTimes(1)
  expect(onResetConfig).not.toHaveBeenCalled()

  fireEvent.click(reset)
  expect(onResetConfig).toHaveBeenCalledTimes(1)
}

/** A promise the test settles by hand, to hold a lookup pending while auth state moves on. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Captures the callback `watchAuthState` is given, so a test can report auth changes after render. */
function captureAuthCallback() {
  let report!: (user: AuthUser | null) => void
  watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
    report = cb
    return unsubscribe
  })
  return (next: AuthUser | null) => act(() => report(next))
}

/** Runs `settleLookup` (resolving or rejecting a deferred), then lets the gate's pending promise callbacks run. */
async function settle(settleLookup: () => void) {
  await act(async () => {
    settleLookup()
    await new Promise((done) => setTimeout(done, 0))
  })
}

describe('AuthGate', () => {
  it('shows a Google sign-in button when signed out', () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return unsubscribe
    })

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signInWithGoogle).toHaveBeenCalledWith('fake-app')
  })

  it('offers Reset Firebase configuration on the signed-out card, only after the user confirms', () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return unsubscribe
    })

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    const reset = screen.getByRole('button', { name: 'Reset Firebase configuration' })

    expectResetOnlyAfterConfirm(reset)
  })

  it('offers to claim the household when meta/household does not exist', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByRole('button', { name: 'Claim household' })).toBeInTheDocument()
    expect(isHouseholdMember).not.toHaveBeenCalled()
  })

  it('claims the household in one write and then shows the app', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Claim household' }))

    expect(claimHousehold).toHaveBeenCalledWith('fake-db', 'user-1', 'owner@example.com')
    expect(await screen.findByText('App content')).toBeInTheDocument()
  })

  it('joins an invited user as a member on sign-in and shows the app', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)
    joinFromInvite.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('App content')).toBeInTheDocument()
    expect(joinFromInvite).toHaveBeenCalledWith('fake-db', 'user-1', 'owner@example.com')
  })

  it('does not look for an invite when already a member', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('App content')).toBeInTheDocument()
    expect(joinFromInvite).not.toHaveBeenCalled()
  })

  it('shows a non-member screen with the signed-in email and a sign-out button', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('You are not a member of this household.')).toBeInTheDocument()
    expect(screen.getByText('owner@example.com', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOutUser).toHaveBeenCalledWith('fake-app')
  })

  it.each([
    ['householdExists', () => householdExists.mockRejectedValue(new Error('unavailable'))],
    ['isHouseholdMember', () => isHouseholdMember.mockRejectedValue(new Error('unavailable'))],
    ['joinFromInvite', () => joinFromInvite.mockRejectedValue(new Error('unavailable'))],
  ])('shows an error card instead of a blank screen when %s rejects', async (_name, fail) => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)
    fail()

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText("Couldn't reach your Household")).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it.each([
    ['householdExists', () => householdExists.mockRejectedValue(new FirebaseError('permission-denied', 'refused'))],
    ['isHouseholdMember', () => isHouseholdMember.mockRejectedValue(new FirebaseError('permission-denied', 'refused'))],
    ['joinFromInvite', () => joinFromInvite.mockRejectedValue(new FirebaseError('permission-denied', 'refused'))],
  ])('shows the non-member card, not the error card, when %s is refused by the rules', async (_name, fail) => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)
    fail()

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('You are not a member of this household.')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't reach your Household")).not.toBeInTheDocument()
  })

  it('brings the error card back when Retry rejects again', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockRejectedValue(new Error('unavailable'))

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText("Couldn't reach your Household")).toBeInTheDocument()
    expect(householdExists).toHaveBeenCalledTimes(2)
  })

  it('runs the resolution again on Retry and lands a now-reachable member in the app', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('App content')).toBeInTheDocument()
    expect(householdExists).toHaveBeenCalledTimes(2)
  })

  it('offers Sign out and, after confirming, Reset Firebase configuration on the error card', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockRejectedValue(new Error('unavailable'))

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(signOutUser).toHaveBeenCalledWith('fake-app')

    expectResetOnlyAfterConfirm(screen.getByRole('button', { name: 'Reset Firebase configuration' }))
  })

  it('offers Reset Firebase configuration on the non-member card, only after the user confirms', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    const reset = await screen.findByRole('button', { name: 'Reset Firebase configuration' })

    expectResetOnlyAfterConfirm(reset)
  })

  it('shows the app for a member, without a sign-out button', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('App content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('keeps the Sign in card when a pending lookup resolves as member after auth reports signed out', async () => {
    const reportAuth = captureAuthCallback()
    const exists = deferred<boolean>()
    householdExists.mockReturnValue(exists.promise)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    reportAuth(null)
    await settle(() => exists.resolve(true))

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it('keeps the Sign in card when a pending lookup rejects after auth reports signed out', async () => {
    const reportAuth = captureAuthCallback()
    const exists = deferred<boolean>()
    householdExists.mockReturnValue(exists.promise)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    reportAuth(null)
    await settle(() => exists.reject(new Error('unavailable')))

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't reach your Household")).not.toBeInTheDocument()
  })

  it("lets the newer user's lookup decide the state when an older user's lookup settles after it", async () => {
    const reportAuth = captureAuthCallback()
    const secondUser = { uid: 'user-2', email: 'guest@example.com' } as unknown as AuthUser
    const firstLookup = deferred<boolean>()
    householdExists.mockReturnValueOnce(firstLookup.promise).mockResolvedValueOnce(true)
    isHouseholdMember.mockImplementation(async (_db: unknown, uid: string) => uid === secondUser.uid)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    reportAuth(secondUser)
    expect(await screen.findByText('App content')).toBeInTheDocument()
    await settle(() => firstLookup.resolve(true))

    expect(screen.getByText('App content')).toBeInTheDocument()
    expect(screen.queryByText('You are not a member of this household.')).not.toBeInTheDocument()
  })

  it('keeps the Sign in card when a lookup started by Retry settles after auth reports signed out', async () => {
    const reportAuth = captureAuthCallback()
    const retried = deferred<boolean>()
    householdExists.mockRejectedValueOnce(new Error('unavailable')).mockReturnValueOnce(retried.promise)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    reportAuth(null)
    await settle(() => retried.resolve(true))

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it('sets no state when the gate unmounts while a lookup is pending', async () => {
    const reportAuth = captureAuthCallback()
    const exists = deferred<boolean>()
    householdExists.mockReturnValue(exists.promise)
    isHouseholdMember.mockResolvedValue(true)

    const { unmount } = render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    unmount()
    setGateState.mockClear()
    await settle(() => exists.resolve(true))

    expect(setGateState).not.toHaveBeenCalled()
  })

  it('keeps the Sign in card when a pending claim resolves after auth reports signed out', async () => {
    const reportAuth = captureAuthCallback()
    const claim = deferred<void>()
    householdExists.mockResolvedValue(false)
    claimHousehold.mockReturnValue(claim.promise)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    fireEvent.click(await screen.findByRole('button', { name: 'Claim household' }))
    reportAuth(null)
    await settle(() => claim.resolve())

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it("lets the newer user's lookup decide the state when an earlier user's claim resolves after it", async () => {
    const reportAuth = captureAuthCallback()
    const secondUser = { uid: 'user-2', email: 'guest@example.com' } as unknown as AuthUser
    const claim = deferred<void>()
    householdExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    isHouseholdMember.mockResolvedValue(false)
    claimHousehold.mockReturnValue(claim.promise)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    fireEvent.click(await screen.findByRole('button', { name: 'Claim household' }))
    reportAuth(secondUser)
    expect(await screen.findByText('You are not a member of this household.')).toBeInTheDocument()
    await settle(() => claim.resolve())

    expect(screen.getByText('You are not a member of this household.')).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it('sets no state when the gate unmounts while a claim is pending', async () => {
    const reportAuth = captureAuthCallback()
    const claim = deferred<void>()
    householdExists.mockResolvedValue(false)
    claimHousehold.mockReturnValue(claim.promise)

    const { unmount } = render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    reportAuth(user)
    fireEvent.click(await screen.findByRole('button', { name: 'Claim household' }))
    unmount()
    setGateState.mockClear()
    await settle(() => claim.resolve())

    expect(setGateState).not.toHaveBeenCalled()
  })

  it('unsubscribes from auth state on unmount', () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return unsubscribe
    })

    const { unmount } = render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )
    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})

describe('AuthGate styling', () => {
  it.each([
    ['signed out', null, undefined, 'Sign in with Google'],
    ['claimable', user, false, 'Claim household'],
    ['not a member', user, true, 'Sign out'],
  ] as const)('shows the %s screen as a card under the app name with a primitive button', async (_name, who, exists, button) => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(who)
      return unsubscribe
    })
    householdExists.mockResolvedValue(exists)
    isHouseholdMember.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient} onResetConfig={onResetConfig}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByRole('button', { name: button })).toHaveClass('ui-button')
    expect(screen.getByText('Home Catalogue')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
