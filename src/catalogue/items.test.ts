import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
const query = vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }))
const orderBy = vi.fn((field: string) => ({ kind: 'orderBy', field }))
const onSnapshot = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  collection.mockClear()
  query.mockClear()
  orderBy.mockClear()
  onSnapshot.mockReset()
})

describe('watchItems', () => {
  it('joins core Items with their catalogue CatalogueItem, ordered by name', async () => {
    const { watchItems } = await import('./items.ts')
    const callback = vi.fn()
    const unsubscribeItems = vi.fn()
    const unsubscribeCatalogueItems = vi.fn()
    let itemsCallback: ((snapshot: unknown) => void) | undefined
    let catalogueItemsCallback: ((snapshot: unknown) => void) | undefined

    onSnapshot.mockImplementation((snapshotQuery: { ref?: { path: string } }, cb: (snapshot: unknown) => void) => {
      if (snapshotQuery.ref !== undefined) {
        itemsCallback = cb
        return unsubscribeItems
      }
      catalogueItemsCallback = cb
      return unsubscribeCatalogueItems
    })

    const unsubscribe = watchItems(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, core.ITEMS_COLLECTION)
    expect(collection).toHaveBeenCalledWith(fakeDb, catalogue.CATALOGUE_ITEMS_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('name')

    itemsCallback?.({ docs: [{ id: 'dish-soap', data: () => ({ name: 'Dish soap', state: 'enough' }) }] })
    expect(callback).not.toHaveBeenCalled()

    catalogueItemsCallback?.({
      docs: [{ id: 'dish-soap', data: () => ({ categoryId: 'cleaning', necessity: 'essential' }) }],
    })

    expect(callback).toHaveBeenCalledWith([
      { id: 'dish-soap', name: 'Dish soap', state: 'enough', categoryId: 'cleaning', necessity: 'essential' },
    ])

    unsubscribe()
    expect(unsubscribeItems).toHaveBeenCalled()
    expect(unsubscribeCatalogueItems).toHaveBeenCalled()
  })

  it('leaves out an Item missing its catalogue CatalogueItem half', async () => {
    const { watchItems } = await import('./items.ts')
    const callback = vi.fn()
    let itemsCallback: ((snapshot: unknown) => void) | undefined
    let catalogueItemsCallback: ((snapshot: unknown) => void) | undefined

    onSnapshot.mockImplementation((snapshotQuery: { ref?: { path: string } }, cb: (snapshot: unknown) => void) => {
      if (snapshotQuery.ref !== undefined) {
        itemsCallback = cb
        return vi.fn()
      }
      catalogueItemsCallback = cb
      return vi.fn()
    })

    watchItems(fakeDb, callback)

    itemsCallback?.({
      docs: [
        { id: 'dish-soap', data: () => ({ name: 'Dish soap', state: 'enough' }) },
        { id: 'orphan', data: () => ({ name: 'Orphan', state: 'enough' }) },
      ],
    })
    catalogueItemsCallback?.({
      docs: [{ id: 'dish-soap', data: () => ({ categoryId: 'cleaning', necessity: 'essential' }) }],
    })

    expect(callback).toHaveBeenCalledWith([
      { id: 'dish-soap', name: 'Dish soap', state: 'enough', categoryId: 'cleaning', necessity: 'essential' },
    ])
  })

  it('skips a document that fails its schema instead of trusting the cast', async () => {
    const { watchItems } = await import('./items.ts')
    const callback = vi.fn()
    let itemsCallback: ((snapshot: unknown) => void) | undefined
    let catalogueItemsCallback: ((snapshot: unknown) => void) | undefined

    onSnapshot.mockImplementation((snapshotQuery: { ref?: { path: string } }, cb: (snapshot: unknown) => void) => {
      if (snapshotQuery.ref !== undefined) {
        itemsCallback = cb
        return vi.fn()
      }
      catalogueItemsCallback = cb
      return vi.fn()
    })

    watchItems(fakeDb, callback)

    itemsCallback?.({
      docs: [
        { id: 'invalid', data: () => ({ name: 'Dish soap', state: 'almost gone' }) },
        { id: 'dish-soap', data: () => ({ name: 'Dish soap', state: 'enough' }) },
      ],
    })
    catalogueItemsCallback?.({
      docs: [{ id: 'dish-soap', data: () => ({ categoryId: 'cleaning', necessity: 'essential' }) }],
    })

    expect(callback).toHaveBeenCalledWith([
      { id: 'dish-soap', name: 'Dish soap', state: 'enough', categoryId: 'cleaning', necessity: 'essential' },
    ])
  })
})
