import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core } from 'data-platform'
import { reportWriteRejection } from '../catalogue/writeRejections.ts'
import { createInvite, inviteKey, revokeInvite, watchInvites } from './invites.ts'

let listener: (snapshot: unknown) => void
const unsubscribe = vi.fn()
const collection = vi.fn((_db: unknown, path: string) => ({ path }))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => 'server-timestamp',
  deleteDoc: (ref: unknown) => deleteDoc(ref),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  onSnapshot: (_ref: unknown, cb: (snapshot: unknown) => void) => {
    listener = cb
    return unsubscribe
  },
}))

const setDoc = vi.fn()
const deleteDoc = vi.fn()

vi.mock('../catalogue/writeRejections.ts', () => ({ reportWriteRejection: vi.fn() }))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const invitedAt = { seconds: 0, nanoseconds: 0, toMillis: () => 0 }

function inviteDocs(...entries: [id: string, data: unknown][]) {
  return { docs: entries.map(([id, data]) => ({ id, data: () => data })) }
}

beforeEach(() => {
  setDoc.mockReset().mockResolvedValue(undefined)
  deleteDoc.mockReset().mockResolvedValue(undefined)
  vi.mocked(reportWriteRejection).mockClear()
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

describe('inviteKey', () => {
  it('trims and lowercases an address', () => {
    expect(inviteKey('  New@Example.com ')).toBe('new@example.com')
  })

  it('is null for something that is not an email', () => {
    expect(inviteKey('nope')).toBeNull()
  })
})

describe('createInvite', () => {
  it('writes invites/{email} stamped with the server time', async () => {
    await createInvite(fakeDb, core.email('a@example.com'))

    expect(setDoc).toHaveBeenCalledWith({ path: 'invites/a@example.com' }, { invitedAt: 'server-timestamp' })
  })

  it('reports a write the rules refuse', async () => {
    const refusal = new Error('denied')
    setDoc.mockRejectedValue(refusal)

    await createInvite(fakeDb, core.email('a@example.com'))
    await Promise.resolve()

    expect(reportWriteRejection).toHaveBeenCalledWith('invite for a@example.com', refusal)
  })
})

describe('revokeInvite', () => {
  it('deletes invites/{email}', async () => {
    await revokeInvite(fakeDb, core.email('a@example.com'))

    expect(deleteDoc).toHaveBeenCalledWith({ path: 'invites/a@example.com' })
  })

  it('reports a delete the rules refuse', async () => {
    const refusal = new Error('denied')
    deleteDoc.mockRejectedValue(refusal)

    await revokeInvite(fakeDb, core.email('a@example.com'))
    await Promise.resolve()

    expect(reportWriteRejection).toHaveBeenCalledWith('revoke of invite for a@example.com', refusal)
  })
})
