import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'
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

vi.mock('./invites.ts', () => ({
  watchInvites: (db: unknown, cb: unknown) => watchInvites(db, cb),
}))

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
})

afterEach(() => {
  resetHash()
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
      <MembersScreen db={fakeDb} />
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
})
