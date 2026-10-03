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
const batchCommit = vi.fn()
const writeBatch = vi.fn((_db: unknown) => ({ set: batchSet, commit: batchCommit }))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (...args: unknown[]) => doc(...args),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  writeBatch: (db: unknown) => writeBatch(db),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  collection.mockClear()
  doc.mockClear()
  onSnapshot.mockReset()
  batchSet.mockReset()
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
