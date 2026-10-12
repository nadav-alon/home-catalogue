import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { pharmacy } from './testFixtures.ts'
import type { StoreRecord } from './stores.ts'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
const doc = vi.fn((first: unknown, path?: string, id?: string) => ({ path: path ?? (first as { path: string }).path, id: id ?? 'new-id' }))
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()
const serverTimestamp = vi.fn(() => ({ kind: 'serverTimestamp' }))
const deleteField = vi.fn(() => ({ kind: 'deleteField' }))
const setDoc = vi.fn()
const updateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (first: unknown, path?: string, id?: string) => doc(first, path, id),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  serverTimestamp: () => serverTimestamp(),
  deleteField: () => deleteField(),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const osherAd: StoreRecord = { id: catalogue.storeId('osher-ad'), name: 'Osher Ad', shopId: pharmacy.id, aisleOrder: [] }
const dairy = catalogue.aisleId('dairy')
const bakery = catalogue.aisleId('bakery')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  collection.mockClear()
  doc.mockClear()
  onSnapshot.mockReset()
  setDoc.mockReset()
  updateDoc.mockReset()
})

describe('watchStores', () => {
  it('subscribes ordered by name, leaving out soft-deleted and invalid documents', async () => {
    const { watchStores } = await import('./stores.ts')
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    onSnapshot.mockImplementation((_q: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'gone', data: () => ({ name: 'Gone', shopId: 'pharmacy', deletedAt: { seconds: 1, nanoseconds: 0 } }) },
          { id: 'invalid', data: () => ({ name: '' }) },
          { id: 'osher-ad', data: () => ({ name: 'Osher Ad', shopId: 'pharmacy', aisleOrder: [] }) },
        ],
      })
      return unsubscribe
    })

    const unsub = watchStores(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.STORES_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')
    expect(callback).toHaveBeenCalledWith([osherAd])
    expect(unsub).toBe(unsubscribe)
  })
})

describe('createStore', () => {
  it('writes a new Store under the Shop with an empty aisle order and resolves once queued', async () => {
    const { createStore } = await import('./stores.ts')
    setDoc.mockReturnValueOnce(new Promise(() => {}))

    const id = await createStore(fakeDb, pharmacy.id, 'Osher Ad')

    expect(setDoc).toHaveBeenCalledWith(
      { path: catalogue.STORES_COLLECTION, id: 'new-id' },
      { name: 'Osher Ad', shopId: pharmacy.id, aisleOrder: [] },
    )
    expect(id).toBe('new-id')
  })

  it('rejects an empty name without writing', async () => {
    const { createStore } = await import('./stores.ts')

    await expect(createStore(fakeDb, pharmacy.id, '')).rejects.toThrow()
    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('renameStore, softDeleteStore and restoreStore', () => {
  it('update the Store document', async () => {
    const { renameStore, softDeleteStore, restoreStore } = await import('./stores.ts')
    updateDoc.mockResolvedValue(undefined)

    await renameStore(fakeDb, osherAd, 'Rami Levy')
    await softDeleteStore(fakeDb, osherAd)
    await restoreStore(fakeDb, osherAd)

    const target = { path: catalogue.STORES_COLLECTION, id: 'osher-ad' }
    expect(updateDoc).toHaveBeenNthCalledWith(1, target, { name: 'Rami Levy' })
    expect(updateDoc).toHaveBeenNthCalledWith(2, target, { deletedAt: { kind: 'serverTimestamp' } })
    expect(updateDoc).toHaveBeenNthCalledWith(3, target, { deletedAt: { kind: 'deleteField' } })
  })

  it('rejects a blank rename without writing', async () => {
    const { renameStore } = await import('./stores.ts')

    await expect(renameStore(fakeDb, osherAd, '')).rejects.toThrow()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('reports a write the server rejects', async () => {
    const { softDeleteStore } = await import('./stores.ts')
    const { resetWriteRejections, watchWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
    let latest: string[] = []
    watchWriteRejections((list) => (latest = list.map((rejection) => rejection.message)))
    updateDoc.mockRejectedValueOnce(new Error('denied'))

    await softDeleteStore(fakeDb, osherAd)
    await vi.waitFor(() => expect(latest).toEqual(['Could not save deleted Store Osher Ad']))
  })
})

describe('setAisleOrder', () => {
  it('writes the whole order as given', async () => {
    const { setAisleOrder } = await import('./stores.ts')
    updateDoc.mockResolvedValue(undefined)

    await setAisleOrder(fakeDb, osherAd, [bakery, dairy])

    expect(updateDoc).toHaveBeenCalledWith({ path: catalogue.STORES_COLLECTION, id: 'osher-ad' }, { aisleOrder: [bakery, dairy] })
  })
})
