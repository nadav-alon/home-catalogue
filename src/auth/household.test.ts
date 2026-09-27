import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
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
