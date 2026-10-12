import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
/** Mirrors both overloads used in aisles.ts: `doc(collectionRef)` generates an id; `doc(db, path, id)` targets one. */
const doc = vi.fn((...args: unknown[]) => {
  if (args.length === 1) return { path: (args[0] as { path: string }).path, id: 'generated-id' }
  const [, path, id] = args as [unknown, string, string]
  return { path, id }
})
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()
const batchSet = vi.fn()
const batchUpdate = vi.fn()
const batchDelete = vi.fn()
const batchCommit = vi.fn()
const writeBatch = vi.fn((_db: unknown) => ({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit }))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (...args: unknown[]) => doc(...args),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  serverTimestamp: () => 'SERVER_TS',
  deleteField: () => 'DELETE_FIELD',
  writeBatch: (db: unknown) => writeBatch(db),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  collection.mockClear()
  doc.mockClear()
  onSnapshot.mockReset()
  batchSet.mockReset()
  batchUpdate.mockReset()
  batchDelete.mockReset()
  batchCommit.mockReset()
  writeBatch.mockClear()
})

describe('watchAisles', () => {
  it('subscribes ordered by name and maps snapshots to AisleRecords, leaving out soft-deleted and invalid ones', async () => {
    const { watchAisles } = await import('./aisles.ts')
    const callback = vi.fn()
    onSnapshot.mockImplementation((_q: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'cooking', data: () => ({ name: 'cooking' }) },
          { id: 'old', data: () => ({ name: 'old', deletedAt: new Date() }) },
          { id: 'broken', data: () => ({ name: 5 }) },
        ],
      })
      return vi.fn()
    })

    watchAisles(fakeDb, callback)

    expect(query).toHaveBeenCalledWith({ path: catalogue.AISLES_COLLECTION }, { kind: 'orderBy', field: 'name' })
    expect(callback).toHaveBeenCalledWith([{ id: 'cooking', name: 'cooking' }])
  })
})

describe('findAisleByName', () => {
  it('finds the Aisle ignoring case and surrounding spaces', async () => {
    const { findAisleByName } = await import('./aisles.ts')
    const sweet = { id: catalogue.aisleId('sweet'), name: 'sweet' }

    expect(findAisleByName([sweet], ' Sweet ')).toBe(sweet)
    expect(findAisleByName([sweet], 'savoury')).toBeUndefined()
  })
})

describe('createAisle', () => {
  it('writes the trimmed Aisle and its name reservation in one batch', async () => {
    const { createAisle } = await import('./aisles.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createAisle(fakeDb, '  Sweet ')

    expect(batchSet).toHaveBeenNthCalledWith(1, { path: catalogue.AISLES_COLLECTION, id: 'generated-id' }, { name: 'Sweet' })
    expect(batchSet).toHaveBeenNthCalledWith(
      2,
      { path: catalogue.AISLE_NAMES_COLLECTION, id: 'sweet' },
      { aisleId: 'generated-id' },
    )
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('rejects a blank name without writing', async () => {
    const { createAisle } = await import('./aisles.ts')

    await expect(createAisle(fakeDb, '   ')).rejects.toThrow()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('resolves with the new Aisle id once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createAisle } = await import('./aisles.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(createAisle(fakeDb, 'sweet')).resolves.toBe('generated-id')
  })

  it('reports a batch the server rejects', async () => {
    const { createAisle } = await import('./aisles.ts')
    const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })
    batchCommit.mockRejectedValueOnce(new Error('denied'))

    await createAisle(fakeDb, 'sweet')
    await Promise.resolve()

    expect(latest.join()).toContain('new Aisle sweet')
  })
})

describe('renameAisle', () => {
  const sweet = { id: catalogue.aisleId('sweet-id'), name: 'sweet' }
  const savoury = { id: catalogue.aisleId('savoury-id'), name: 'savoury' }

  it('writes the trimmed name and moves the name reservation in one batch', async () => {
    const { renameAisle } = await import('./aisles.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await renameAisle(fakeDb, sweet, '  Sugary ', [sweet, savoury])

    expect(batchUpdate).toHaveBeenCalledWith({ path: catalogue.AISLES_COLLECTION, id: 'sweet-id' }, { name: 'Sugary' })
    expect(batchDelete).toHaveBeenCalledWith({ path: catalogue.AISLE_NAMES_COLLECTION, id: 'sweet' })
    expect(batchSet).toHaveBeenCalledWith({ path: catalogue.AISLE_NAMES_COLLECTION, id: 'sugary' }, { aisleId: 'sweet-id' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('keeps the reservation when only the case or spacing changes', async () => {
    const { renameAisle } = await import('./aisles.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await renameAisle(fakeDb, sweet, ' Sweet', [sweet, savoury])

    expect(batchUpdate).toHaveBeenCalledWith({ path: catalogue.AISLES_COLLECTION, id: 'sweet-id' }, { name: 'Sweet' })
    expect(batchDelete).not.toHaveBeenCalled()
    expect(batchSet).not.toHaveBeenCalled()
  })

  it("refuses another live Aisle's name, ignoring case and surrounding spaces, without writing", async () => {
    const { renameAisle, AisleNameTakenError } = await import('./aisles.ts')

    await expect(renameAisle(fakeDb, sweet, ' SAVOURY ', [sweet, savoury])).rejects.toThrow(AisleNameTakenError)
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('rejects a blank name without writing', async () => {
    const { renameAisle } = await import('./aisles.ts')

    await expect(renameAisle(fakeDb, sweet, '  ', [sweet])).rejects.toThrow()
    expect(batchCommit).not.toHaveBeenCalled()
  })
})

describe('softDeleteAisle and restoreAisle', () => {
  const sweet = { id: catalogue.aisleId('sweet-id'), name: 'Sweet' }
  const aisleRef = { path: catalogue.AISLES_COLLECTION, id: 'sweet-id' }
  const reservationRef = { path: catalogue.AISLE_NAMES_COLLECTION, id: 'sweet' }

  it('soft-deletes the Aisle and releases its name reservation in one batch', async () => {
    const { softDeleteAisle } = await import('./aisles.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await softDeleteAisle(fakeDb, sweet)

    expect(batchUpdate).toHaveBeenCalledWith(aisleRef, { deletedAt: 'SERVER_TS' })
    expect(batchDelete).toHaveBeenCalledWith(reservationRef)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('restores the Aisle and takes its name reservation again in one batch', async () => {
    const { restoreAisle } = await import('./aisles.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await restoreAisle(fakeDb, sweet, [])

    expect(batchUpdate).toHaveBeenCalledWith(aisleRef, { deletedAt: 'DELETE_FIELD' })
    expect(batchSet).toHaveBeenCalledWith(reservationRef, { aisleId: 'sweet-id' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('refuses to restore onto a name a live Aisle has taken, and reports it', async () => {
    const { restoreAisle } = await import('./aisles.ts')
    const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })

    await restoreAisle(fakeDb, sweet, [{ id: catalogue.aisleId('other-id'), name: 'sweet' }])

    expect(batchCommit).not.toHaveBeenCalled()
    expect(latest.join()).toContain('Could not restore Sweet')
  })
})
