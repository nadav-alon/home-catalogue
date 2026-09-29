import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
const doc = vi.fn((_db: unknown, path: string, id: string) => ({ path, id }))
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()
const addDoc = vi.fn()
const updateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (db: unknown, path: string, id: string) => doc(db, path, id),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
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
      cb({ docs: [{ id: 'pharmacy', data: () => ({ name: 'Pharmacy' }) }] })
      return unsubscribe
    })

    const unsub = watchShops(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')
    expect(callback).toHaveBeenCalledWith([{ id: 'pharmacy', name: 'Pharmacy' }])
    expect(unsub).toBe(unsubscribe)
  })
})

describe('createShop', () => {
  it('validates the name and writes a new Shop', async () => {
    const { createShop } = await import('./shops.ts')
    addDoc.mockResolvedValueOnce({ id: 'new-id' })

    await createShop(fakeDb, 'Pharmacy')

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION)
    expect(addDoc).toHaveBeenCalledWith({ path: catalogue.SHOPS_COLLECTION }, { name: 'Pharmacy' })
  })

  it('rejects an empty name without writing', async () => {
    const { createShop } = await import('./shops.ts')

    await expect(createShop(fakeDb, '')).rejects.toThrow()
    expect(addDoc).not.toHaveBeenCalled()
  })
})

describe('renameShop', () => {
  it('validates the new name and updates it', async () => {
    const { renameShop } = await import('./shops.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await renameShop(fakeDb, catalogue.shopId('pharmacy'), 'Pharmacy & Health')

    expect(doc).toHaveBeenCalledWith(fakeDb, catalogue.SHOPS_COLLECTION, 'pharmacy')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { name: 'Pharmacy & Health' },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { renameShop } = await import('./shops.ts')

    await expect(renameShop(fakeDb, catalogue.shopId('pharmacy'), '')).rejects.toThrow()
    expect(updateDoc).not.toHaveBeenCalled()
  })
})
