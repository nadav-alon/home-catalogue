import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
const doc = vi.fn((_db: unknown, path: string, id: string) => ({ path, id }))
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const where = vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }))
const limit = vi.fn((count: number) => ({ kind: 'limit', count }))
const onSnapshot = vi.fn()
const addDoc = vi.fn()
const updateDoc = vi.fn()
const deleteDoc = vi.fn()
const getDocs = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (db: unknown, path: string, id: string) => doc(db, path, id),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  where: (field: string, op: string, value: unknown) => where(field, op, value),
  limit: (count: number) => limit(count),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
  deleteDoc: (ref: unknown) => deleteDoc(ref),
  getDocs: (q: unknown) => getDocs(q),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  collection.mockClear()
  doc.mockClear()
  query.mockClear()
  orderBy.mockClear()
  where.mockClear()
  limit.mockClear()
  onSnapshot.mockReset()
  addDoc.mockReset()
  updateDoc.mockReset()
  deleteDoc.mockReset()
  getDocs.mockReset()
})

describe('watchCategories', () => {
  it('subscribes ordered by name and maps snapshots to CategoryRecords', async () => {
    const { watchCategories } = await import('./categories.ts')
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    onSnapshot.mockImplementation((_snapshotQuery: unknown, cb: (snapshot: unknown) => void) => {
      cb({ docs: [{ id: 'medicine', data: () => ({ name: 'Medicine', defaultShopId: 'pharmacy' }) }] })
      return unsubscribe
    })

    const unsub = watchCategories(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.CATEGORIES_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')
    expect(callback).toHaveBeenCalledWith([{ id: 'medicine', name: 'Medicine', defaultShopId: 'pharmacy' }])
    expect(unsub).toBe(unsubscribe)
  })
})

describe('createCategory', () => {
  it('validates the name and default Shop, and writes a new Category', async () => {
    const { createCategory } = await import('./categories.ts')
    addDoc.mockResolvedValueOnce({ id: 'new-id' })

    await createCategory(fakeDb, 'Medicine', catalogue.shopId('pharmacy'))

    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.CATEGORIES_COLLECTION)
    expect(addDoc).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION },
      { name: 'Medicine', defaultShopId: 'pharmacy' },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { createCategory } = await import('./categories.ts')

    await expect(createCategory(fakeDb, '', catalogue.shopId('pharmacy'))).rejects.toThrow()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('rejects an empty default Shop id without writing', async () => {
    const { createCategory } = await import('./categories.ts')
    const emptyShopId = '' as unknown as catalogue.ShopId

    await expect(createCategory(fakeDb, 'Medicine', emptyShopId)).rejects.toThrow()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('resolves once the write is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createCategory } = await import('./categories.ts')
    addDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(createCategory(fakeDb, 'Medicine', catalogue.shopId('pharmacy'))).resolves.toBeUndefined()
  })
})

describe('renameCategory', () => {
  it('validates the new name and updates it', async () => {
    const { renameCategory } = await import('./categories.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await renameCategory(fakeDb, catalogue.categoryId('medicine'), 'Medicine & First aid')

    expect(doc).toHaveBeenCalledWith(fakeDb, catalogue.CATEGORIES_COLLECTION, 'medicine')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'medicine' },
      { name: 'Medicine & First aid' },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { renameCategory } = await import('./categories.ts')

    await expect(renameCategory(fakeDb, catalogue.categoryId('medicine'), '')).rejects.toThrow()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('resolves once the write is queued, without waiting for Firestore to acknowledge it', async () => {
    const { renameCategory } = await import('./categories.ts')
    updateDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(
      renameCategory(fakeDb, catalogue.categoryId('medicine'), 'Medicine & First aid'),
    ).resolves.toBeUndefined()
  })
})

describe('deleteCategory', () => {
  it('deletes a Category no Item belongs to', async () => {
    const { deleteCategory } = await import('./categories.ts')
    getDocs.mockResolvedValueOnce({ empty: true })
    deleteDoc.mockResolvedValueOnce(undefined)

    await deleteCategory(fakeDb, catalogue.categoryId('medicine'))

    expect(where).toHaveBeenCalledWith('categoryId', '==', 'medicine')
    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.CATALOGUE_ITEMS_COLLECTION)
    expect(deleteDoc).toHaveBeenCalledWith({ path: catalogue.CATEGORIES_COLLECTION, id: 'medicine' })
  })

  it('resolves once the delete is queued, without waiting for Firestore to acknowledge it', async () => {
    const { deleteCategory } = await import('./categories.ts')
    getDocs.mockResolvedValueOnce({ empty: true })
    deleteDoc.mockReturnValueOnce(new Promise(() => {}))

    await expect(deleteCategory(fakeDb, catalogue.categoryId('medicine'))).resolves.toBeUndefined()
  })

  it('refuses with CategoryInUseError while an Item still belongs to it, without deleting', async () => {
    const { deleteCategory, CategoryInUseError } = await import('./categories.ts')
    getDocs.mockResolvedValueOnce({ empty: false })

    await expect(deleteCategory(fakeDb, catalogue.categoryId('medicine'))).rejects.toBeInstanceOf(
      CategoryInUseError,
    )
    expect(deleteDoc).not.toHaveBeenCalled()
  })
})
