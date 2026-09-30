import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { catalogue } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
/** Mirrors both overloads used in categories.ts: `doc(collectionRef)` generates an id; `doc(db, path, id)` targets one. */
const doc = vi.fn((...args: unknown[]) => {
  if (args.length === 1) {
    const ref = args[0] as { path: string }
    return { path: ref.path, id: 'generated-id' }
  }
  const [, path, id] = args as [unknown, string, string]
  return { path, id }
})
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()
const updateDoc = vi.fn()
const deleteDoc = vi.fn()
const serverTimestamp = vi.fn(() => ({ kind: 'serverTimestamp' }))
const increment = vi.fn((n: number) => ({ kind: 'increment', delta: n }))
const batchSet = vi.fn()
const batchUpdate = vi.fn()
const batchDelete = vi.fn()
const batchCommit = vi.fn()
const writeBatch = vi.fn((_db: unknown) => ({
  set: batchSet,
  update: batchUpdate,
  delete: batchDelete,
  commit: batchCommit,
}))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (...args: unknown[]) => doc(...args),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
  deleteDoc: (ref: unknown) => deleteDoc(ref),
  increment: (n: number) => increment(n),
  serverTimestamp: () => serverTimestamp(),
  writeBatch: (db: unknown) => writeBatch(db),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

/** Starts from an empty banner state and returns the messages currently shown. */
async function rejections() {
  const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
  resetWriteRejections()
  let latest: string[] = []
  watchWriteRejections((list) => {
    latest = list.map((rejection) => rejection.message)
  })
  return () => latest
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  collection.mockClear()
  doc.mockClear()
  query.mockClear()
  orderBy.mockClear()
  onSnapshot.mockReset()
  updateDoc.mockReset()
  deleteDoc.mockReset()
  increment.mockClear()
  batchSet.mockReset()
  batchUpdate.mockReset()
  batchDelete.mockReset()
  batchCommit.mockReset()
  writeBatch.mockClear()
})

describe('watchCategories', () => {
  it('subscribes ordered by name and maps snapshots to CategoryRecords', async () => {
    const { watchCategories } = await import('./categories.ts')
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'medicine', data: () => ({ name: 'Medicine', defaultShopId: 'pharmacy', referenceCount: 0 }) },
        ],
      })
      return unsubscribe
    })

    const unsub = watchCategories(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.CATEGORIES_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')
    expect(callback).toHaveBeenCalledWith([
      { id: 'medicine', name: 'Medicine', defaultShopId: 'pharmacy', referenceCount: 0 },
    ])
    expect(unsub).toBe(unsubscribe)
  })

  it('leaves out a Category that carries deletedAt', async () => {
    const { watchCategories } = await import('./categories.ts')
    const callback = vi.fn()
    const cleaning = { name: 'Cleaning', defaultShopId: 'pharmacy', referenceCount: 1 }
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'gone', data: () => ({ ...cleaning, deletedAt: { seconds: 1, nanoseconds: 0 } }) },
          { id: 'kept', data: () => cleaning },
        ],
      })
      return vi.fn()
    })

    watchCategories(fakeDb, callback)

    expect(callback.mock.lastCall?.[0].map((record: { id: string }) => record.id)).toEqual(['kept'])
  })

  it('skips a document that fails categorySchema instead of trusting the cast', async () => {
    const { watchCategories } = await import('./categories.ts')
    const callback = vi.fn()
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'invalid', data: () => ({ name: 'Medicine', defaultShopId: '' }) },
          {
            id: 'medicine',
            data: () => ({ name: 'Medicine', defaultShopId: 'pharmacy', referenceCount: 0 }),
          },
        ],
      })
      return vi.fn()
    })

    watchCategories(fakeDb, callback)

    expect(callback).toHaveBeenCalledWith([
      { id: 'medicine', name: 'Medicine', defaultShopId: 'pharmacy', referenceCount: 0 },
    ])
  })
})

describe('createCategory', () => {
  it('validates the name and default Shop, and writes a new Category that starts unreferenced', async () => {
    const { createCategory } = await import('./categories.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createCategory(fakeDb, 'Medicine', catalogue.shopId('pharmacy'))

    expect(doc).toHaveBeenCalledWith({ path: catalogue.CATEGORIES_COLLECTION })
    expect(batchSet).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'generated-id' },
      { name: 'Medicine', defaultShopId: 'pharmacy', referenceCount: 0 },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
    expect(batchCommit).toHaveBeenCalled()
  })

  it('rejects an empty name without writing', async () => {
    const { createCategory } = await import('./categories.ts')

    await expect(createCategory(fakeDb, '', catalogue.shopId('pharmacy'))).rejects.toThrow()
    expect(batchSet).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('rejects an empty default Shop id without writing', async () => {
    const { createCategory } = await import('./categories.ts')
    const emptyShopId = '' as unknown as catalogue.ShopId

    await expect(createCategory(fakeDb, 'Medicine', emptyShopId)).rejects.toThrow()
    expect(batchSet).not.toHaveBeenCalled()
  })

  it('resolves with the new Category id once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createCategory } = await import('./categories.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(createCategory(fakeDb, 'Medicine', catalogue.shopId('pharmacy'))).resolves.toBe('generated-id')
  })
})

describe('renameCategory', () => {
  const medicine = {
    id: catalogue.categoryId('medicine'),
    name: 'Medicine',
    defaultShopId: catalogue.shopId('pharmacy'),
    referenceCount: 0,
  }

  it('validates the new name and updates it', async () => {
    const { renameCategory } = await import('./categories.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await renameCategory(fakeDb, medicine, 'Medicine & First aid')

    expect(doc).toHaveBeenCalledWith(fakeDb, catalogue.CATEGORIES_COLLECTION, 'medicine')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'medicine' },
      { name: 'Medicine & First aid' },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { renameCategory } = await import('./categories.ts')

    await expect(renameCategory(fakeDb, medicine, '')).rejects.toThrow()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('resolves once the write is queued, without waiting for Firestore to acknowledge it', async () => {
    const { renameCategory } = await import('./categories.ts')
    updateDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(
      renameCategory(fakeDb, medicine, 'Medicine & First aid'),
    ).resolves.toBeUndefined()
  })
})

describe('changeCategoryDefaultShop', () => {
  const medicine = {
    id: catalogue.categoryId('medicine'),
    name: 'Medicine',
    defaultShopId: catalogue.shopId('pharmacy'),
    referenceCount: 0,
  }
  const grocery = catalogue.shopId('grocery')

  it('points the Category at the new Shop and moves one reference between the two Shops in one batch', async () => {
    const { changeCategoryDefaultShop } = await import('./categories.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await changeCategoryDefaultShop(fakeDb, medicine, grocery)

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'medicine' },
      { defaultShopId: 'grocery' },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { referenceCount: { kind: 'increment', delta: -1 } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'grocery' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
    expect(batchCommit).toHaveBeenCalledOnce()
  })

  it('writes nothing when the Shop is unchanged', async () => {
    const { changeCategoryDefaultShop } = await import('./categories.ts')

    await changeCategoryDefaultShop(fakeDb, medicine, medicine.defaultShopId)

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('reports to the write-rejection banner when the server rejects the batch', async () => {
    const { changeCategoryDefaultShop } = await import('./categories.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await changeCategoryDefaultShop(fakeDb, medicine, grocery)
    await Promise.resolve()

    expect(latest()).toEqual(["Could not save change of Category Medicine's default Shop"])
  })
})

describe('deleteCategory', () => {
  const medicine = {
    id: catalogue.categoryId('medicine'),
    name: 'Medicine',
    defaultShopId: catalogue.shopId('pharmacy'),
    referenceCount: 0,
  }

  it("soft-deletes a Category and drops its default Shop's reference in one batch", async () => {
    const { deleteCategory } = await import('./categories.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await deleteCategory(fakeDb, medicine)

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'medicine' },
      { deletedAt: { kind: 'serverTimestamp' } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { referenceCount: { kind: 'increment', delta: -1 } },
    )
    expect(batchDelete).not.toHaveBeenCalled()
    expect(batchCommit).toHaveBeenCalled()
  })

  it('resolves once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { deleteCategory } = await import('./categories.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(deleteCategory(fakeDb, medicine)).resolves.toBeUndefined()
  })

  it('refuses with CategoryInUseError and writes nothing while the cached referenceCount is above 0', async () => {
    const { deleteCategory, CategoryInUseError } = await import('./categories.ts')

    await expect(deleteCategory(fakeDb, { ...medicine, referenceCount: 1 })).rejects.toBeInstanceOf(CategoryInUseError)
    expect(writeBatch).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('reports to the write-rejection banner when the rules refuse the batch', async () => {
    const { deleteCategory } = await import('./categories.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new FirebaseError('permission-denied', 'Missing or insufficient permissions.'))

    await deleteCategory(fakeDb, medicine)
    await vi.waitFor(() => expect(latest()).toEqual(['Could not save deleted Category Medicine']))
  })
})

describe('a queued Category write the server rejects', () => {
  it('reports a new Category by name', async () => {
    const { createCategory } = await import('./categories.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await createCategory(fakeDb, 'Medicine', catalogue.shopId('pharmacy'))
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save new Category Medicine'])
  })

  it('reports a rename by its old and new name', async () => {
    const { renameCategory } = await import('./categories.ts')
    const latest = await rejections()
    const medicine = {
      id: catalogue.categoryId('medicine'),
      name: 'Medicine',
      defaultShopId: catalogue.shopId('pharmacy'),
      referenceCount: 0,
    }
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await renameCategory(fakeDb, medicine, 'Meds')
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save rename of Category Medicine to Meds'])
  })
})
