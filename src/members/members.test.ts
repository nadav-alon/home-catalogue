import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { removeMember, watchMembers } from './members.ts'

type Listener = (snapshot: unknown) => void
const deleteDoc = vi.hoisted(() => vi.fn())
const listeners = new Map<string, Listener>()
const unsubscribes = new Map<string, ReturnType<typeof vi.fn>>()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: (ref: unknown) => deleteDoc(ref),
  onSnapshot: (ref: { path: string }, listener: Listener) => {
    listeners.set(ref.path, listener)
    const unsubscribe = vi.fn()
    unsubscribes.set(ref.path, unsubscribe)
    return unsubscribe
  },
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const addedAt = { seconds: 0, nanoseconds: 0, toMillis: () => 0 }

function memberDocs(...entries: [id: string, data: unknown][]) {
  return { docs: entries.map(([id, data]) => ({ id, data: () => data })) }
}

function household(owner: string) {
  return { data: () => ({ owner }) }
}

beforeEach(() => {
  listeners.clear()
  unsubscribes.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('watchMembers', () => {
  it('lists every Member by email, flagging the Owner', () => {
    const callback = vi.fn()
    watchMembers(fakeDb, callback)

    listeners.get('members')!(
      memberDocs(
        ['u2', { email: 'b@example.com', addedAt }],
        ['u1', { email: 'a@example.com', addedAt }],
      ),
    )
    listeners.get('meta/household')!(household('u1'))

    expect(callback).toHaveBeenLastCalledWith([
      { uid: core.uid('u1'), email: core.email('a@example.com'), addedAt, isOwner: true },
      { uid: core.uid('u2'), email: core.email('b@example.com'), addedAt, isOwner: false },
    ])
  })

  it('says nothing until both the Members and the Household have arrived', () => {
    const callback = vi.fn()
    watchMembers(fakeDb, callback)

    listeners.get('members')!(memberDocs(['u1', { email: 'a@example.com', addedAt }]))

    expect(callback).not.toHaveBeenCalled()
  })

  it('skips an invalid Member document', () => {
    const callback = vi.fn()
    watchMembers(fakeDb, callback)

    listeners.get('members')!(memberDocs(['u1', { email: 'nope' }], ['u2', { email: 'b@example.com', addedAt }]))
    listeners.get('meta/household')!(household('u2'))

    expect(callback).toHaveBeenLastCalledWith([
      { uid: core.uid('u2'), email: core.email('b@example.com'), addedAt, isOwner: true },
    ])
  })

  it('skips a Member document keyed by something that is not a Uid', () => {
    const callback = vi.fn()
    watchMembers(fakeDb, callback)

    listeners.get('members')!(memberDocs(['', { email: 'a@example.com', addedAt }], ['u2', { email: 'b@example.com', addedAt }]))
    listeners.get('meta/household')!(household('u2'))

    expect(callback).toHaveBeenLastCalledWith([
      { uid: core.uid('u2'), email: core.email('b@example.com'), addedAt, isOwner: true },
    ])
  })

  it('lists every Member, none flagged Owner, when the Household document is invalid', () => {
    const callback = vi.fn()
    watchMembers(fakeDb, callback)

    listeners.get('members')!(memberDocs(['u1', { email: 'a@example.com', addedAt }]))
    listeners.get('meta/household')!({ data: () => ({}) })

    expect(callback).toHaveBeenLastCalledWith([
      { uid: core.uid('u1'), email: core.email('a@example.com'), addedAt, isOwner: false },
    ])
  })

  it('stops both subscriptions when unsubscribed', () => {
    const stop = watchMembers(fakeDb, vi.fn())

    stop()

    expect(unsubscribes.get('members')).toHaveBeenCalledTimes(1)
    expect(unsubscribes.get('meta/household')).toHaveBeenCalledTimes(1)
  })
})

describe('removeMember', () => {
  it('deletes the Member document', async () => {
    deleteDoc.mockResolvedValue(undefined)

    await removeMember(fakeDb, core.uid('u2'))

    expect(deleteDoc).toHaveBeenCalledWith({ path: core.memberDocPath(core.uid('u2')) })
  })

  it('rejects when the rules refuse', async () => {
    deleteDoc.mockRejectedValue(new Error('permission-denied'))

    await expect(removeMember(fakeDb, core.uid('u2'))).rejects.toThrow('permission-denied')
  })
})
