import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { catalogue } from 'data-platform'
import { pharmacy } from './testFixtures.ts'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
const doc = vi.fn((_db: unknown, path: string, id: string) => ({ path, id }))
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()
const serverTimestamp = vi.fn(() => ({ kind: 'serverTimestamp' }))
const deleteField = vi.fn(() => ({ kind: 'deleteField' }))
const addDoc = vi.fn()
const updateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (db: unknown, path: string, id: string) => doc(db, path, id),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  serverTimestamp: () => serverTimestamp(),
  deleteField: () => deleteField(),
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
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
  addDoc.mockReset()
  updateDoc.mockReset()
})

describe('watchShops', () => {
  it('subscribes ordered by name and maps snapshots to ShopRecords', async () => {
    const { watchShops } = await import('./shops.ts')
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({ docs: [{ id: 'pharmacy', data: () => ({ name: 'Pharmacy', referenceCount: 0 }) }] })
      return unsubscribe
    })

    const unsub = watchShops(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')
    expect(callback).toHaveBeenCalledWith([pharmacy])
    expect(unsub).toBe(unsubscribe)
  })

  it('leaves out a Shop that carries deletedAt', async () => {
    const { watchShops } = await import('./shops.ts')
    const callback = vi.fn()
    const pharmacy = { name: 'Pharmacy', referenceCount: 0 }
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'gone', data: () => ({ ...pharmacy, deletedAt: { seconds: 1, nanoseconds: 0 } }) },
          { id: 'kept', data: () => pharmacy },
        ],
      })
      return vi.fn()
    })

    watchShops(fakeDb, callback)

    expect(callback.mock.lastCall?.[0].map((record: { id: string }) => record.id)).toEqual(['kept'])
  })

  it('skips a document that fails shopSchema instead of trusting the cast', async () => {
    const { watchShops } = await import('./shops.ts')
    const callback = vi.fn()
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'invalid', data: () => ({ name: '' }) },
          { id: 'pharmacy', data: () => ({ name: 'Pharmacy', referenceCount: 0 }) },
        ],
      })
      return vi.fn()
    })

    watchShops(fakeDb, callback)

    expect(callback).toHaveBeenCalledWith([pharmacy])
  })
})

describe('createShop', () => {
  it('validates the name and writes a new Shop that starts unreferenced', async () => {
    const { createShop } = await import('./shops.ts')
    addDoc.mockResolvedValueOnce({ id: 'new-id' })

    await createShop(fakeDb, 'Pharmacy')

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION)
    expect(addDoc).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION },
      { name: 'Pharmacy', referenceCount: 0 },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { createShop } = await import('./shops.ts')

    await expect(createShop(fakeDb, '')).rejects.toThrow()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('resolves once the write is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createShop } = await import('./shops.ts')
    addDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(createShop(fakeDb, 'Pharmacy')).resolves.toBeUndefined()
  })
})

describe('renameShop', () => {
  it('validates the new name and updates it', async () => {
    const { renameShop } = await import('./shops.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await renameShop(fakeDb, pharmacy, 'Pharmacy & Health')

    expect(doc).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION, 'pharmacy')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { name: 'Pharmacy & Health' },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { renameShop } = await import('./shops.ts')

    await expect(renameShop(fakeDb, pharmacy, '')).rejects.toThrow()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('resolves once the write is queued, without waiting for Firestore to acknowledge it', async () => {
    const { renameShop } = await import('./shops.ts')
    updateDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(renameShop(fakeDb, pharmacy, 'Pharmacy & Health')).resolves.toBeUndefined()
  })
})

describe('deleteShop', () => {
  it('soft-deletes a Shop by stamping deletedAt with the server time', async () => {
    const { deleteShop } = await import('./shops.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await deleteShop(fakeDb, pharmacy)

    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { deletedAt: { kind: 'serverTimestamp' } },
    )
  })

  it('refuses with ShopInUseError and writes nothing while the Shop is referenced', async () => {
    const { deleteShop, ShopInUseError } = await import('./shops.ts')

    await expect(deleteShop(fakeDb, { ...pharmacy, referenceCount: 1 })).rejects.toBeInstanceOf(ShopInUseError)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('resolves without waiting for Firestore to acknowledge the write', async () => {
    const { deleteShop } = await import('./shops.ts')
    updateDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(deleteShop(fakeDb, pharmacy)).resolves.toBeUndefined()
  })

  it('reports to the write-rejection banner when the write is later rejected', async () => {
    const { deleteShop } = await import('./shops.ts')
    const latest = await rejections()
    updateDoc.mockRejectedValueOnce(new FirebaseError('permission-denied', 'Missing or insufficient permissions.'))

    await expect(deleteShop(fakeDb, pharmacy)).resolves.toBeUndefined()
    await vi.waitFor(() => expect(latest()).toEqual(['Could not save deleted Shop Pharmacy']))
  })
})

describe('restoreShop', () => {
  it('clears deletedAt', async () => {
    const { restoreShop } = await import('./shops.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await restoreShop(fakeDb, pharmacy)

    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { deletedAt: { kind: 'deleteField' } },
    )
  })

  it('reports to the write-rejection banner when the write is later rejected', async () => {
    const { restoreShop } = await import('./shops.ts')
    const latest = await rejections()
    updateDoc.mockRejectedValueOnce(new Error('offline'))

    await expect(restoreShop(fakeDb, pharmacy)).resolves.toBeUndefined()
    await vi.waitFor(() => expect(latest()).toEqual(['Could not save restored Shop Pharmacy']))
  })
})

describe('a queued Shop write the server rejects', () => {
  it('reports a new Shop by name', async () => {
    const { createShop } = await import('./shops.ts')
    const latest = await rejections()
    addDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await createShop(fakeDb, 'Pharmacy')
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save new Shop Pharmacy'])
  })

  it('reports a rename by its old and new name', async () => {
    const { renameShop } = await import('./shops.ts')
    const latest = await rejections()
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await renameShop(fakeDb, pharmacy, 'Chemist')
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save rename of Shop Pharmacy to Chemist'])
  })
})

describe('shopName', () => {
  it("returns the Shop's name when it is in the list", async () => {
    const { shopName } = await import('./shops.ts')

    expect(shopName([pharmacy], pharmacy.id)).toBe('Pharmacy')
  })

  it('falls back to "Unknown Shop" instead of the raw id when the Shop is missing', async () => {
    const { shopName } = await import('./shops.ts')

    expect(shopName([], catalogue.shopId('pharmacy'))).toBe('Unknown Shop')
  })
})
