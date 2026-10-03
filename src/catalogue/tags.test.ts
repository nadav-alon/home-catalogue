import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
/** Mirrors both overloads used in tags.ts: `doc(collectionRef)` generates an id; `doc(db, path, id)` targets one. */
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

describe('watchTags', () => {
  it('subscribes ordered by name and maps snapshots to TagRecords, leaving out soft-deleted and invalid ones', async () => {
    const { watchTags } = await import('./tags.ts')
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

    watchTags(fakeDb, callback)

    expect(query).toHaveBeenCalledWith({ path: catalogue.TAGS_COLLECTION }, { kind: 'orderBy', field: 'name' })
    expect(callback).toHaveBeenCalledWith([{ id: 'cooking', name: 'cooking' }])
  })
})

describe('findTagByName', () => {
  it('finds the Tag ignoring case and surrounding spaces', async () => {
    const { findTagByName } = await import('./tags.ts')
    const sweet = { id: catalogue.tagId('sweet'), name: 'sweet' }

    expect(findTagByName([sweet], ' Sweet ')).toBe(sweet)
    expect(findTagByName([sweet], 'savoury')).toBeUndefined()
  })
})

describe('createTag', () => {
  it('writes the trimmed Tag and its name reservation in one batch', async () => {
    const { createTag } = await import('./tags.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createTag(fakeDb, '  Sweet ')

    expect(batchSet).toHaveBeenNthCalledWith(1, { path: catalogue.TAGS_COLLECTION, id: 'generated-id' }, { name: 'Sweet' })
    expect(batchSet).toHaveBeenNthCalledWith(
      2,
      { path: catalogue.TAG_NAMES_COLLECTION, id: 'sweet' },
      { tagId: 'generated-id' },
    )
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('rejects a blank name without writing', async () => {
    const { createTag } = await import('./tags.ts')

    await expect(createTag(fakeDb, '   ')).rejects.toThrow()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('resolves with the new Tag id once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createTag } = await import('./tags.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(createTag(fakeDb, 'sweet')).resolves.toBe('generated-id')
  })

  it('reports a batch the server rejects', async () => {
    const { createTag } = await import('./tags.ts')
    const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })
    batchCommit.mockRejectedValueOnce(new Error('denied'))

    await createTag(fakeDb, 'sweet')
    await Promise.resolve()

    expect(latest.join()).toContain('new Tag sweet')
  })
})

describe('renameTag', () => {
  const sweet = { id: catalogue.tagId('sweet-id'), name: 'sweet' }
  const savoury = { id: catalogue.tagId('savoury-id'), name: 'savoury' }

  it('writes the trimmed name and moves the name reservation in one batch', async () => {
    const { renameTag } = await import('./tags.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await renameTag(fakeDb, sweet, '  Sugary ', [sweet, savoury])

    expect(batchUpdate).toHaveBeenCalledWith({ path: catalogue.TAGS_COLLECTION, id: 'sweet-id' }, { name: 'Sugary' })
    expect(batchDelete).toHaveBeenCalledWith({ path: catalogue.TAG_NAMES_COLLECTION, id: 'sweet' })
    expect(batchSet).toHaveBeenCalledWith({ path: catalogue.TAG_NAMES_COLLECTION, id: 'sugary' }, { tagId: 'sweet-id' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('keeps the reservation when only the case or spacing changes', async () => {
    const { renameTag } = await import('./tags.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await renameTag(fakeDb, sweet, ' Sweet', [sweet, savoury])

    expect(batchUpdate).toHaveBeenCalledWith({ path: catalogue.TAGS_COLLECTION, id: 'sweet-id' }, { name: 'Sweet' })
    expect(batchDelete).not.toHaveBeenCalled()
    expect(batchSet).not.toHaveBeenCalled()
  })

  it("refuses another live Tag's name, ignoring case and surrounding spaces, without writing", async () => {
    const { renameTag, TAG_NAME_TAKEN_MESSAGE } = await import('./tags.ts')

    await expect(renameTag(fakeDb, sweet, ' SAVOURY ', [sweet, savoury])).rejects.toThrow(TAG_NAME_TAKEN_MESSAGE)
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('rejects a blank name without writing', async () => {
    const { renameTag } = await import('./tags.ts')

    await expect(renameTag(fakeDb, sweet, '  ', [sweet])).rejects.toThrow()
    expect(batchCommit).not.toHaveBeenCalled()
  })
})

describe('deleteTag and restoreTag', () => {
  const sweet = { id: catalogue.tagId('sweet-id'), name: 'Sweet' }
  const tagRef = { path: catalogue.TAGS_COLLECTION, id: 'sweet-id' }
  const reservationRef = { path: catalogue.TAG_NAMES_COLLECTION, id: 'sweet' }

  it('soft-deletes the Tag and releases its name reservation in one batch', async () => {
    const { deleteTag } = await import('./tags.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await deleteTag(fakeDb, sweet)

    expect(batchUpdate).toHaveBeenCalledWith(tagRef, { deletedAt: 'SERVER_TS' })
    expect(batchDelete).toHaveBeenCalledWith(reservationRef)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('restores the Tag and takes its name reservation again in one batch', async () => {
    const { restoreTag } = await import('./tags.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await restoreTag(fakeDb, sweet, [])

    expect(batchUpdate).toHaveBeenCalledWith(tagRef, { deletedAt: 'DELETE_FIELD' })
    expect(batchSet).toHaveBeenCalledWith(reservationRef, { tagId: 'sweet-id' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('refuses to restore onto a name a live Tag has taken, and reports it', async () => {
    const { restoreTag } = await import('./tags.ts')
    const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })

    await restoreTag(fakeDb, sweet, [{ id: catalogue.tagId('other-id'), name: 'sweet' }])

    expect(batchCommit).not.toHaveBeenCalled()
    expect(latest.join()).toContain('Could not restore Sweet')
  })
})
