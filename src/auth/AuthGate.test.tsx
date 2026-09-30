import { fireEvent, render, screen } from '@testing-library/preact'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGate } from './AuthGate.tsx'
import type { FirebaseClient } from '../firebase/client.ts'
import type { AuthUser } from './authClient.ts'

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
vi.mock('./household.ts', () => ({
  householdExists: (db: unknown) => householdExists(db),
  isHouseholdMember: (db: unknown, uid: unknown) => isHouseholdMember(db, uid),
  claimHousehold: (db: unknown, uid: unknown, email: unknown) => claimHousehold(db, uid, email),
}))

const fakeClient = { app: 'fake-app', db: 'fake-db' } as unknown as FirebaseClient
const user: AuthUser = { uid: 'user-1', email: 'owner@example.com' } as unknown as AuthUser
const unsubscribe = vi.fn()

beforeEach(() => {
  signInWithGoogle.mockReset()
  signOutUser.mockReset().mockResolvedValue(undefined)
  watchAuthState.mockReset()
  householdExists.mockReset()
  isHouseholdMember.mockReset()
  claimHousehold.mockReset().mockResolvedValue(undefined)
  unsubscribe.mockClear()
})

describe('AuthGate', () => {
  it('shows a Google sign-in button when signed out', () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return unsubscribe
    })

    render(
      <AuthGate client={fakeClient}>
        <p>App content</p>
      </AuthGate>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signInWithGoogle).toHaveBeenCalledWith('fake-app')
  })

  it('offers to claim the household when meta/household does not exist', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient}>
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
      <AuthGate client={fakeClient}>
        <p>App content</p>
      </AuthGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Claim household' }))

    expect(claimHousehold).toHaveBeenCalledWith('fake-db', 'user-1', 'owner@example.com')
    expect(await screen.findByText('App content')).toBeInTheDocument()
  })

  it('shows a non-member screen with the signed-in email and a sign-out button', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(false)

    render(
      <AuthGate client={fakeClient}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('You are not a member of this household.')).toBeInTheDocument()
    expect(screen.getByText('owner@example.com', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOutUser).toHaveBeenCalledWith('fake-app')
  })

  it('shows the app for a member, without a sign-out button', async () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(user)
      return unsubscribe
    })
    householdExists.mockResolvedValue(true)
    isHouseholdMember.mockResolvedValue(true)

    render(
      <AuthGate client={fakeClient}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByText('App content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('unsubscribes from auth state on unmount', () => {
    watchAuthState.mockImplementation((_app: unknown, cb: (user: AuthUser | null) => void) => {
      cb(null)
      return unsubscribe
    })

    const { unmount } = render(
      <AuthGate client={fakeClient}>
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
      <AuthGate client={fakeClient}>
        <p>App content</p>
      </AuthGate>,
    )

    expect(await screen.findByRole('button', { name: button })).toHaveClass('ui-button')
    expect(screen.getByText('Home Catalogue')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
