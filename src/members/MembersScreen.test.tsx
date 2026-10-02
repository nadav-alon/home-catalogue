import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { firebaseWebConfig } from '../firebase/webConfig.ts'
import { deviceTransferUrl } from '../firebase/deviceTransfer.ts'
import { resetHash } from '../testing/hash.ts'
import { createInvite, revokeInvite } from './invites.ts'
import { resetSnackbar, SnackbarHost } from '../ui/Snackbar.tsx'
import { MembersScreen } from './MembersScreen.tsx'
import type { MemberRecord } from './members.ts'

const watchMembers = vi.fn()
const watchInvites = vi.fn()
const currentUserUid = vi.fn()
const removeMember = vi.fn()
const reportFailure = vi.fn()

vi.mock('./members.ts', () => ({
  watchMembers: (db: unknown, cb: unknown) => watchMembers(db, cb),
  removeMember: (db: unknown, uid: unknown) => removeMember(db, uid),
}))

vi.mock('../auth/authClient.ts', () => ({
  currentUserUid: (app: unknown) => currentUserUid(app),
}))

vi.mock('../catalogue/writeRejections.ts', () => ({
  reportFailure: (message: unknown, err: unknown) => reportFailure(message, err),
}))

vi.mock('./invites.ts', async (importOriginal) => ({
  inviteKey: (await importOriginal<typeof import('./invites.ts')>()).inviteKey,
  watchInvites: (db: unknown, cb: unknown) => watchInvites(db, cb),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}))

const config = firebaseWebConfig({
  apiKey: 'AIzaSyDOCAbC123dEf456GhI789jKl012-MnO',
  authDomain: 'household.firebaseapp.com',
  projectId: 'household',
  storageBucket: 'household.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
})

const addedAt = { seconds: 0, nanoseconds: 0, toMillis: () => 0 }
const owner: MemberRecord = { uid: core.uid('u1'), email: core.email('a@example.com'), addedAt, isOwner: true }
const member: MemberRecord = { uid: core.uid('u2'), email: core.email('b@example.com'), addedAt, isOwner: false }
const other: MemberRecord = { uid: core.uid('u3'), email: core.email('c@example.com'), addedAt, isOwner: false }
const fakeApp = { name: 'fake-app' }
const fakeDb = { name: 'fake-db', app: fakeApp } as unknown as Firestore
const unsubscribe = vi.fn()

beforeEach(() => {
  watchMembers.mockReset().mockReturnValue(unsubscribe)
  watchInvites.mockReset().mockReturnValue(unsubscribe)
  unsubscribe.mockClear()
  removeMember.mockReset().mockResolvedValue(undefined)
  reportFailure.mockReset()
  currentUserUid.mockReset().mockReturnValue(core.uid('u1'))
  vi.mocked(createInvite).mockReset().mockResolvedValue(undefined)
  vi.mocked(revokeInvite).mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  resetSnackbar()
  resetHash()
  Reflect.deleteProperty(navigator, 'share')
  vi.restoreAllMocks()
})

function renderScreen(members: MemberRecord[] = [], invites: core.Email[] = []) {
  watchMembers.mockImplementation((_db, cb: (members: MemberRecord[]) => void) => {
    cb(members)
    return unsubscribe
  })
  watchInvites.mockImplementation((_db, cb: (emails: core.Email[]) => void) => {
    cb(invites)
    return unsubscribe
  })
  return render(
    <TopAppBar title="Members">
      <MembersScreen db={fakeDb} config={config} />
      <SnackbarHost />
    </TopAppBar>,
  )
}

describe('MembersScreen', () => {
  it('goes back to Settings', () => {
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every Member by email, marking the Owner', () => {
    renderScreen([
      owner,
      member,
    ])

    const [ownerRow, memberRow] = screen.getAllByRole('listitem')
    expect(ownerRow).toHaveTextContent('a@example.com')
    expect(ownerRow).toHaveTextContent('Owner')
    expect(memberRow).toHaveTextContent('b@example.com')
    expect(memberRow).not.toHaveTextContent('Owner')
  })

  it('lists every pending invite by email, apart from the Members', () => {
    renderScreen(
      [owner],
      [core.email('c@example.com')],
    )

    const pending = screen.getByRole('list', { name: 'Pending invites' })
    expect(within(pending).getAllByRole('listitem')).toHaveLength(1)
    expect(pending).toHaveTextContent('c@example.com')
    expect(pending).not.toHaveTextContent('a@example.com')
  })

  it('tags the signed-in Member\'s row "you" and no other', () => {
    currentUserUid.mockReturnValue(core.uid('u2'))
    renderScreen([owner, member])

    const [ownerRow, memberRow] = screen.getAllByRole('listitem')
    expect(memberRow).toHaveTextContent('you')
    expect(ownerRow).not.toHaveTextContent('you')
  })

  it('tags the signed-in Owner as both Owner and "you"', () => {
    renderScreen([owner, member])

    const [ownerRow, memberRow] = screen.getAllByRole('listitem')
    expect(ownerRow).toHaveTextContent('Owner')
    expect(ownerRow).toHaveTextContent('you')
    expect(memberRow).not.toHaveTextContent('you')
  })

  it('lists the Owner first even when their email sorts after the Members\'', () => {
    renderScreen([member, other, { ...owner, email: core.email('z@example.com') }])

    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('z@example.com'),
      expect.stringContaining('b@example.com'),
      expect.stringContaining('c@example.com'),
    ])
  })

  it('says so when no invites are pending', () => {
    renderScreen([owner])

    expect(screen.getByText('No pending invites.')).toBeInTheDocument()
  })

  it('renders no Pending invites list beside the empty-state line', () => {
    renderScreen([owner])

    expect(screen.queryByRole('list', { name: 'Pending invites' })).not.toBeInTheDocument()
  })

  it('does not say no invites are pending before the first snapshot arrives', () => {
    watchMembers.mockImplementation((_db, cb: (members: MemberRecord[]) => void) => {
      cb([owner])
      return unsubscribe
    })
    render(
      <TopAppBar title="Members">
        <MembersScreen db={fakeDb} config={config} />
      </TopAppBar>,
    )

    expect(screen.queryByText('No pending invites.')).not.toBeInTheDocument()
  })

  it('does not say no invites are pending when some are', () => {
    renderScreen([owner], [core.email('c@example.com')])

    expect(screen.queryByText('No pending invites.')).not.toBeInTheDocument()
  })

  it('offers the Owner Remove on every Member but their own', () => {
    renderScreen([
      owner,
      member,
      other,
    ])

    expect(screen.getAllByRole('button', { name: /^Remove / }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Remove b@example.com',
      'Remove c@example.com',
    ])
    expect(currentUserUid).toHaveBeenCalledWith(fakeApp)
  })

  it('offers a non-Owner Member no Remove', () => {
    currentUserUid.mockReturnValue(core.uid('u2'))
    renderScreen([
      owner,
      member,
      other,
    ])

    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('removes a Member only after the Owner confirms, and the row goes when the watch reports it', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderScreen([owner, member])
    const remove = screen.getByRole('button', { name: 'Remove b@example.com' })

    fireEvent.click(remove)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(removeMember).not.toHaveBeenCalled()

    fireEvent.click(remove)
    expect(removeMember).toHaveBeenCalledWith(fakeDb, member.uid)

    const publish = watchMembers.mock.calls[0][1] as (members: MemberRecord[]) => void
    act(() => publish([owner]))
    expect(screen.queryByText('b@example.com')).toBeNull()
  })

  it('reports a failed removal instead of dropping it', async () => {
    const failure = new Error('permission-denied')
    removeMember.mockRejectedValue(failure)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen([
      owner,
      member,
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Remove b@example.com' }))

    await waitFor(() => expect(reportFailure).toHaveBeenCalledWith('Could not remove b@example.com', failure))
  })

  it('offers no Remove when no Member is flagged Owner', () => {
    renderScreen([
      { ...owner, isOwner: false },
      member,
    ])

    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('stops watching when it closes', () => {
    renderScreen().unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  describe('inviting', () => {
    function invite(email: string) {
      fireEvent.input(screen.getByLabelText('Invite by email'), { target: { value: email } })
      fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    }

    it('lets the Owner invite an email, lowercased', async () => {
      renderScreen([owner, member])

      invite('  New@Example.com ')

      await waitFor(() => expect(createInvite).toHaveBeenCalledWith(fakeDb, 'new@example.com'))
      expect(screen.getByLabelText('Invite by email')).toHaveValue('')
    })

    it('confirms the invite in a snackbar', async () => {
      renderScreen([owner, member])

      invite('New@Example.com')

      expect(await screen.findByRole('status')).toHaveTextContent('Invited new@example.com')
    })

    it('shows no snackbar when the email is refused', async () => {
      renderScreen([owner, member])

      invite('B@example.com')

      await screen.findByRole('alert')
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('refuses an email that is already a Member, on the field', async () => {
      renderScreen([owner, member])

      invite('B@example.com')

      expect(await screen.findByRole('alert')).toHaveTextContent('That email is already a Member.')
      expect(screen.getByLabelText('Invite by email')).toHaveAccessibleDescription('That email is already a Member.')
      expect(createInvite).not.toHaveBeenCalled()
    })

    it('clears a refusal once the user types again', async () => {
      renderScreen([owner, member])
      invite('B@example.com')
      await screen.findByRole('alert')

      fireEvent.input(screen.getByLabelText('Invite by email'), { target: { value: 'new@example.com' } })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('refuses an email that is already invited, on the field', async () => {
      renderScreen([owner], [core.email('c@example.com')])

      invite('c@example.com')

      expect(await screen.findByRole('alert')).toHaveTextContent('That email is already invited.')
      expect(createInvite).not.toHaveBeenCalled()
    })

    it('refuses something that is not an email, on the field', async () => {
      renderScreen([owner])

      invite('nope')

      expect(await screen.findByRole('alert')).toHaveTextContent('Enter a Google email address.')
      expect(createInvite).not.toHaveBeenCalled()
    })

    it('shows a non-Owner Member no invite controls', () => {
      currentUserUid.mockReturnValue(member.uid)
      renderScreen([owner, member])

      expect(screen.queryByLabelText('Invite by email')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    })
  })

  describe('sharing', () => {
    const invites = [core.email('c@example.com')]
    const shareButton = () => screen.getByRole('button', { name: 'Share invite for c@example.com' })

    it('opens the share sheet with the #config link', async () => {
      const share = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', { value: share, configurable: true })
      renderScreen([owner], invites)

      fireEvent.click(shareButton())

      await waitFor(() =>
        expect(share).toHaveBeenCalledWith({
          text: `Join the household on Home Catalogue: ${deviceTransferUrl(config)}`,
        }),
      )
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('shows the QR code where the share sheet is missing', async () => {
      renderScreen([owner], invites)

      fireEvent.click(shareButton())

      expect(await screen.findByRole('img', { name: /c@example\.com/ })).toBeInTheDocument()
    })

    it('closes the QR code', async () => {
      renderScreen([owner], invites)
      fireEvent.click(shareButton())
      await screen.findByRole('img', { name: /c@example\.com/ })

      fireEvent.click(screen.getByRole('button', { name: 'Close QR code' }))

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Close QR code' })).not.toBeInTheDocument()
    })

    it('drops the QR code of an invite when it is revoked', async () => {
      renderScreen([owner], invites)
      fireEvent.click(shareButton())
      await screen.findByRole('img', { name: /c@example\.com/ })

      fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for c@example.com' }))

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('does not fall back to the QR code when the user dismisses the share sheet', async () => {
      const share = vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError'))
      Object.defineProperty(navigator, 'share', { value: share, configurable: true })
      renderScreen([owner], invites)

      fireEvent.click(shareButton())

      await waitFor(() => expect(share).toHaveBeenCalled())
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('shows a non-Owner Member no share control', () => {
      currentUserUid.mockReturnValue(member.uid)
      renderScreen([owner, member], invites)

      expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument()
    })
  })

  describe('revoking', () => {
    it('lets the Owner revoke a pending invite', () => {
      renderScreen([owner], [core.email('c@example.com')])

      fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for c@example.com' }))

      expect(revokeInvite).toHaveBeenCalledWith(fakeDb, 'c@example.com')
    })

    it('confirms the revocation in a snackbar', async () => {
      renderScreen([owner], [core.email('c@example.com')])

      fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for c@example.com' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Revoked invite for c@example.com')
    })

    it('shows a non-Owner Member no revoke control', () => {
      currentUserUid.mockReturnValue(member.uid)
      renderScreen([owner, member], [core.email('c@example.com')])

      expect(screen.queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument()
    })
  })
})
