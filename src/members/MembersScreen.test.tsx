import { fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'
import { MembersScreen } from './MembersScreen.tsx'
import type { MemberRecord } from './members.ts'

const watchMembers = vi.fn()

vi.mock('./members.ts', () => ({
  watchMembers: (db: unknown, cb: unknown) => watchMembers(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const unsubscribe = vi.fn()

beforeEach(() => {
  watchMembers.mockReset().mockReturnValue(unsubscribe)
  unsubscribe.mockClear()
})

afterEach(resetHash)

function renderScreen(members: MemberRecord[] = []) {
  watchMembers.mockImplementation((_db, cb: (members: MemberRecord[]) => void) => {
    cb(members)
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
      { uid: core.uid('u1'), email: core.email('a@example.com'), isOwner: true },
      { uid: core.uid('u2'), email: core.email('b@example.com'), isOwner: false },
    ])

    const [owner, member] = screen.getAllByRole('listitem')
    expect(owner).toHaveTextContent('a@example.com')
    expect(owner).toHaveTextContent('Owner')
    expect(member).toHaveTextContent('b@example.com')
    expect(member).not.toHaveTextContent('Owner')
  })

  it('stops watching when it closes', () => {
    renderScreen().unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
