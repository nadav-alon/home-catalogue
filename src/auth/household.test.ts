import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { core } from 'data-platform'

const doc = vi.fn((_db: unknown, path: string) => ({ path }))
const getDoc = vi.fn()
const writeBatch = vi.fn()
const serverTimestamp = vi.fn(() => ({ kind: 'server-timestamp' }))

vi.mock('firebase/firestore', () => ({
  doc: (db: unknown, path: string) => doc(db, path),
  getDoc: (ref: unknown) => getDoc(ref),
  writeBatch: (db: unknown) => writeBatch(db),
  serverTimestamp: () => serverTimestamp(),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const uid = core.uid('user-1')
const email = core.email('owner@example.com')

beforeEach(() => {
  doc.mockClear()
  getDoc.mockReset()
  writeBatch.mockReset()
  serverTimestamp.mockClear()
})

describe('householdExists', () => {
  it('reads meta/household', async () => {
    const { householdExists } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => true })

    await expect(householdExists(fakeDb)).resolves.toBe(true)
    expect(doc).toHaveBeenCalledWith(fakeDb, 'meta/household')
  })

  it('returns false when nothing has claimed it yet', async () => {
    const { householdExists } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(householdExists(fakeDb)).resolves.toBe(false)
  })
})

describe('isHouseholdMember', () => {
  it('reads the member doc for the given uid', async () => {
    const { isHouseholdMember } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => true })

    await expect(isHouseholdMember(fakeDb, uid)).resolves.toBe(true)
    expect(doc).toHaveBeenCalledWith(fakeDb, `members/${uid}`)
  })

  it('returns false for a non-member', async () => {
    const { isHouseholdMember } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(isHouseholdMember(fakeDb, uid)).resolves.toBe(false)
  })
})

describe('claimHousehold', () => {
  it('writes meta/household and the members doc in one batch', async () => {
    const { claimHousehold } = await import('./household.ts')
    const set = vi.fn()
    const commit = vi.fn().mockResolvedValue(undefined)
    writeBatch.mockReturnValueOnce({ set, commit })

    await claimHousehold(fakeDb, uid, email)

    expect(writeBatch).toHaveBeenCalledWith(fakeDb)
    expect(set).toHaveBeenCalledWith({ path: 'meta/household' }, { owner: uid })
    expect(set).toHaveBeenCalledWith(
      { path: `members/${uid}` },
      { email, addedAt: { kind: 'server-timestamp' } },
    )
    expect(commit).toHaveBeenCalledOnce()
  })
})

describe('joinFromInvite', () => {
  const invitee = core.email('Guest@Example.com')

  it('creates the members doc and deletes the invite in one batch', async () => {
    const { joinFromInvite } = await import('./household.ts')
    const set = vi.fn()
    const del = vi.fn()
    const commit = vi.fn().mockResolvedValue(undefined)
    getDoc.mockResolvedValueOnce({ exists: () => true })
    writeBatch.mockReturnValueOnce({ set, delete: del, commit })

    await expect(joinFromInvite(fakeDb, uid, invitee)).resolves.toBe(true)

    expect(doc).toHaveBeenCalledWith(fakeDb, 'invites/guest@example.com')
    expect(set).toHaveBeenCalledWith(
      { path: `members/${uid}` },
      { email: invitee, addedAt: { kind: 'server-timestamp' } },
    )
    expect(del).toHaveBeenCalledWith({ path: 'invites/guest@example.com' })
    expect(commit).toHaveBeenCalledOnce()
  })

  it('does nothing and returns false when there is no invite', async () => {
    const { joinFromInvite } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(joinFromInvite(fakeDb, uid, invitee)).resolves.toBe(false)
    expect(writeBatch).not.toHaveBeenCalled()
  })

  it('returns false when the rules refuse the join', async () => {
    const { joinFromInvite } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => true })
    writeBatch.mockReturnValueOnce({
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue(new FirebaseError('permission-denied', 'denied')),
    })

    await expect(joinFromInvite(fakeDb, uid, invitee)).resolves.toBe(false)
  })

  it('rejects on a failure that is not a refusal', async () => {
    const { joinFromInvite } = await import('./household.ts')
    getDoc.mockResolvedValueOnce({ exists: () => true })
    writeBatch.mockReturnValueOnce({
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue(new FirebaseError('unavailable', 'offline')),
    })

    await expect(joinFromInvite(fakeDb, uid, invitee)).rejects.toThrow('offline')
  })
})
