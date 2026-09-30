import { fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'
import { MembersScreen } from './MembersScreen.tsx'
import type { MemberRecord } from './members.ts'

const watchMembers = vi.fn()
const watchInvites = vi.fn()

vi.mock('./members.ts', () => ({
  watchMembers: (db: unknown, cb: unknown) => watchMembers(db, cb),

}))

vi.mock('./invites.ts', () => ({
  watchInvites: (db: unknown, cb: unknown) => watchInvites(db, cb),
}))

const addedAt = { seconds: 0, nanoseconds: 0, toMillis: () => 0 }
const fakeDb = { name: 'fake-db' } as unknown as Firestore
const unsubscribe = vi.fn()

beforeEach(() => {
  watchMembers.mockReset().mockReturnValue(unsubscribe)
  watchInvites.mockReset().mockReturnValue(unsubscribe)
  unsubscribe.mockClear()
})

afterEach(resetHash)

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
      { uid: core.uid('u1'), email: core.email('a@example.com'), addedAt, isOwner: true },
      { uid: core.uid('u2'), email: core.email('b@example.com'), addedAt, isOwner: false },
    ])

    const [owner, member] = screen.getAllByRole('listitem')
    expect(owner).toHaveTextContent('a@example.com')
    expect(owner).toHaveTextContent('Owner')
    expect(member).toHaveTextContent('b@example.com')
    expect(member).not.toHaveTextContent('Owner')
  })

  it('lists every pending invite by email, apart from the Members', () => {
    renderScreen(
      [{ uid: core.uid('u1'), email: core.email('a@example.com'), addedAt, isOwner: true }],
      [core.email('c@example.com')],
    )

    const pending = screen.getByRole('list', { name: 'Pending invites' })
    expect(within(pending).getAllByRole('listitem')).toHaveLength(1)
    expect(pending).toHaveTextContent('c@example.com')
    expect(pending).not.toHaveTextContent('a@example.com')
  })

  it('stops watching when it closes', () => {
    renderScreen().unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})
