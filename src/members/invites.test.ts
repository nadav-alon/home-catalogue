import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { watchInvites } from './invites.ts'

let listener: (snapshot: unknown) => void
const unsubscribe = vi.fn()
const collection = vi.fn((_db: unknown, path: string) => ({ path }))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  onSnapshot: (_ref: unknown, cb: (snapshot: unknown) => void) => {
    listener = cb
    return unsubscribe
  },
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const invitedAt = { seconds: 0, nanoseconds: 0, toMillis: () => 0 }

function inviteDocs(...entries: [id: string, data: unknown][]) {
  return { docs: entries.map(([id, data]) => ({ id, data: () => data })) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('watchInvites', () => {
  it('reads the invites collection and lists each invited email, in order', () => {
    const callback = vi.fn()
    watchInvites(fakeDb, callback)

    listener(inviteDocs(['b@example.com', { invitedAt }], ['a@example.com', { invitedAt }]))

    expect(collection).toHaveBeenCalledWith(fakeDb, 'invites')
    expect(callback).toHaveBeenLastCalledWith([core.email('a@example.com'), core.email('b@example.com')])
  })

  it('lists nothing when there are no invites', () => {
    const callback = vi.fn()
    watchInvites(fakeDb, callback)

    listener(inviteDocs())

    expect(callback).toHaveBeenLastCalledWith([])
  })

  it('skips an invalid invite document', () => {
    const callback = vi.fn()
    watchInvites(fakeDb, callback)

    listener(inviteDocs(['not-an-email', { invitedAt }], ['a@example.com', {}], ['b@example.com', { invitedAt }]))

    expect(callback).toHaveBeenLastCalledWith([core.email('b@example.com')])
  })

  it('returns the unsubscribe function', () => {
    expect(watchInvites(fakeDb, vi.fn())).toBe(unsubscribe)
  })
})
