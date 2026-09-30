import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'
import type { ItemRecord } from './items.ts'
import { bandages, bandagesWithBarcodes } from './testFixtures.ts'

const collection = vi.fn((_db: unknown, path: string) => ({ path }))
/** Mirrors both overloads used in items.ts: `doc(collectionRef)` generates an id; `doc(db, path, id)` targets one. */
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
const batchSet = vi.fn()
const batchUpdate = vi.fn()
const batchCommit = vi.fn()
const writeBatch = vi.fn((_db: unknown) => ({ set: batchSet, update: batchUpdate, commit: batchCommit }))
const deleteField = vi.fn(() => ({ kind: 'deleteField' }))
const serverTimestamp = vi.fn(() => ({ kind: 'serverTimestamp' }))
const increment = vi.fn((n: number) => ({ kind: 'increment', delta: n }))
const where = vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }))
const getDocs = vi.fn()
const getDoc = vi.fn()
const updateDoc = vi.fn()
const arrayRemove = vi.fn((...values: unknown[]) => ({ kind: 'arrayRemove', values }))
const arrayUnion = vi.fn((...values: unknown[]) => ({ kind: 'arrayUnion', values }))

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (...args: unknown[]) => doc(...args),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  writeBatch: (db: unknown) => writeBatch(db),
  deleteField: () => deleteField(),
  serverTimestamp: () => serverTimestamp(),
  increment: (n: number) => increment(n),
  where: (field: string, op: string, value: unknown) => where(field, op, value),
  getDocs: (q: unknown) => getDocs(q),
  getDoc: (ref: unknown) => getDoc(ref),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
  arrayUnion: (...values: unknown[]) => arrayUnion(...values),
  arrayRemove: (...values: unknown[]) => arrayRemove(...values),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore

beforeEach(() => {
  collection.mockClear()
  doc.mockClear()
  query.mockClear()
  orderBy.mockClear()
  onSnapshot.mockReset()
  batchSet.mockReset()
  batchUpdate.mockReset()
  batchCommit.mockReset()
  writeBatch.mockClear()
  deleteField.mockClear()
  serverTimestamp.mockClear()
  increment.mockClear()
  where.mockClear()
  getDocs.mockReset()
  getDoc.mockReset()
  updateDoc.mockReset()
  arrayUnion.mockClear()
  arrayRemove.mockClear()
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

const deletedAt = { seconds: 1, nanoseconds: 0 }

describe('watchItems with soft-deleted Items', () => {
  /** Feeds `watchItems` one core snapshot and one catalogue snapshot, returning what it emitted last. */
  async function emitted(coreDocs: Record<string, object>, catalogueDocs: Record<string, object>) {
    const { watchItems } = await import('./items.ts')
    const callback = vi.fn()
    onSnapshot.mockImplementation(
      (source: { path?: string; ref?: { path: string } }, cb: (snapshot: unknown) => void) => {
        const path = source.ref?.path ?? source.path
        const docs = path === core.ITEMS_COLLECTION ? coreDocs : catalogueDocs
        cb({ docs: Object.entries(docs).map(([id, data]) => ({ id, data: () => data })) })
        return vi.fn()
      },
    )
    watchItems(fakeDb, callback)
    return callback.mock.lastCall?.[0] as ItemRecord[]
  }

  const live = { name: 'Sponge', state: 'out' }
  const liveCatalogue = { categoryId: 'cleaning', necessity: 'essential' }

  it('leaves out an Item whose core doc carries deletedAt', async () => {
    const records = await emitted(
      { 'dish-soap': { name: 'Dish soap', state: 'enough', deletedAt }, sponge: live },
      { 'dish-soap': liveCatalogue, sponge: liveCatalogue },
    )

    expect(records.map((record) => record.id)).toEqual(['sponge'])
  })

  it('leaves out an Item whose catalogue doc carries deletedAt', async () => {
    const records = await emitted(
      { 'dish-soap': { name: 'Dish soap', state: 'enough' }, sponge: live },
      { 'dish-soap': { ...liveCatalogue, deletedAt }, sponge: liveCatalogue },
    )

    expect(records.map((record) => record.id)).toEqual(['sponge'])
  })
})

describe('createItem', () => {
  it('writes the Barcode the new Item carries into its core doc', async () => {
    const { createItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createItem(fakeDb, {
      name: 'Dish soap',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
      barcode: core.barcode('12345678'),
    })

    expect(batchSet).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'generated-id' },
      { name: 'Dish soap', state: 'enough', barcodes: ['12345678'] },
    )
  })

  it('writes the core Item and catalogue CatalogueItem docs as one batch, starting at State enough', async () => {
    const { createItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createItem(fakeDb, {
      name: 'Dish soap',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
    })

    expect(doc).toHaveBeenCalledWith({ path: core.ITEMS_COLLECTION })
    expect(batchSet).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'generated-id' },
      { name: 'Dish soap', state: 'enough' },
    )
    expect(batchSet).toHaveBeenCalledWith(
      { path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'generated-id' },
      { categoryId: 'cleaning', necessity: 'essential' },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'cleaning' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
    expect(batchUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: catalogue.SHOPS_COLLECTION }),
      expect.anything(),
    )
    expect(batchCommit).toHaveBeenCalled()
  })

  it('includes an optional brand note and Shop override when given, bumping the Shop too', async () => {
    const { createItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await createItem(fakeDb, {
      name: 'Dish soap',
      brandNote: 'the green one',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: catalogue.shopId('grocery'),
    })

    expect(batchSet).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'generated-id' },
      { name: 'Dish soap', brandNote: 'the green one', state: 'enough' },
    )
    expect(batchSet).toHaveBeenCalledWith(
      { path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'generated-id' },
      { categoryId: 'cleaning', necessity: 'essential', shopId: 'grocery' },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'cleaning' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'grocery' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { createItem } = await import('./items.ts')

    await expect(
      createItem(fakeDb, {
        name: '',
        categoryId: catalogue.categoryId('cleaning'),
        necessity: catalogue.necessitySchema.parse('essential'),
      }),
    ).rejects.toThrow()
    expect(batchSet).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('rejects an empty Category id without writing', async () => {
    const { createItem } = await import('./items.ts')
    const emptyCategoryId = '' as unknown as catalogue.CategoryId

    await expect(
      createItem(fakeDb, {
        name: 'Dish soap',
        categoryId: emptyCategoryId,
        necessity: catalogue.necessitySchema.parse('essential'),
      }),
    ).rejects.toThrow()
    expect(batchSet).not.toHaveBeenCalled()
  })

  it('resolves once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { createItem } = await import('./items.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(
      createItem(fakeDb, {
        name: 'Dish soap',
        categoryId: catalogue.categoryId('cleaning'),
        necessity: catalogue.necessitySchema.parse('essential'),
      }),
    ).resolves.toBeUndefined()
  })
})

describe('updateItem', () => {
  const dishSoap: ItemRecord = {
    id: core.itemId('dish-soap'),
    name: 'Dish soap',
    state: 'enough',
    categoryId: catalogue.categoryId('cleaning'),
    necessity: 'essential',
    shopId: catalogue.shopId('grocery'),
  }

  it('updates the core Item and catalogue CatalogueItem docs as one batch, leaving State untouched', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: 'Dish soap',
      brandNote: 'the green one',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: catalogue.shopId('grocery'),
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
      { name: 'Dish soap', brandNote: 'the green one' },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' },
      { categoryId: 'cleaning', necessity: 'essential', shopId: 'grocery' },
    )
    expect(batchCommit).toHaveBeenCalled()
  })

  it('removes the removed barcodes from the core Item in the same batch, leaving its other barcodes', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: 'Dish soap',
      categoryId: dishSoap.categoryId,
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: dishSoap.shopId,
      removedBarcodes: [core.barcode('12345678')],
    })

    expect(arrayRemove).toHaveBeenCalledWith('12345678')
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
      expect.objectContaining({ barcodes: { kind: 'arrayRemove', values: ['12345678'] } }),
    )
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('leaves every referenceCount untouched when the Category and Shop override are unchanged', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: 'Dish soap (large)',
      categoryId: dishSoap.categoryId,
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: dishSoap.shopId,
    })

    expect(batchUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: catalogue.CATEGORIES_COLLECTION }),
      expect.anything(),
    )
    expect(batchUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: catalogue.SHOPS_COLLECTION }),
      expect.anything(),
    )
  })

  it('moves the Category referenceCount by one each way when the Category changes', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: dishSoap.name,
      categoryId: catalogue.categoryId('kitchen'),
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: dishSoap.shopId,
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'cleaning' },
      { referenceCount: { kind: 'increment', delta: -1 } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATEGORIES_COLLECTION, id: 'kitchen' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
  })

  it('moves the Shop referenceCount by one each way when the Shop override changes', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: dishSoap.name,
      categoryId: dishSoap.categoryId,
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: catalogue.shopId('pharmacy'),
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'grocery' },
      { referenceCount: { kind: 'increment', delta: -1 } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
  })

  it('bumps only the new Shop when adding a Shop override that had none before', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)
    const noOverride: ItemRecord = { ...dishSoap, shopId: undefined }

    await updateItem(fakeDb, noOverride, {
      name: noOverride.name,
      categoryId: noOverride.categoryId,
      necessity: catalogue.necessitySchema.parse('essential'),
      shopId: catalogue.shopId('pharmacy'),
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'pharmacy' },
      { referenceCount: { kind: 'increment', delta: 1 } },
    )
    expect(batchUpdate).toHaveBeenCalledTimes(3)
  })

  it('drops only the old Shop when clearing a Shop override', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: dishSoap.name,
      categoryId: dishSoap.categoryId,
      necessity: catalogue.necessitySchema.parse('essential'),
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.SHOPS_COLLECTION, id: 'grocery' },
      { referenceCount: { kind: 'increment', delta: -1 } },
    )
    expect(batchUpdate).toHaveBeenCalledTimes(3)
  })

  it('clears the brand note and Shop override when they are omitted', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, dishSoap, {
      name: 'Dish soap',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
    })

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
      { name: 'Dish soap', brandNote: { kind: 'deleteField' } },
    )
    expect(batchUpdate).toHaveBeenCalledWith(
      { path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' },
      { categoryId: 'cleaning', necessity: 'essential', shopId: { kind: 'deleteField' } },
    )
  })

  it('rejects an empty name without writing', async () => {
    const { updateItem } = await import('./items.ts')

    await expect(
      updateItem(fakeDb, dishSoap, {
        name: '',
        categoryId: catalogue.categoryId('cleaning'),
        necessity: catalogue.necessitySchema.parse('essential'),
      }),
    ).rejects.toThrow()
    expect(batchUpdate).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('resolves once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(
      updateItem(fakeDb, dishSoap, {
        name: 'Dish soap',
        categoryId: catalogue.categoryId('cleaning'),
        necessity: catalogue.necessitySchema.parse('essential'),
        shopId: catalogue.shopId('grocery'),
      }),
    ).resolves.toBeUndefined()
  })
})

describe('setItemState', () => {
  it('updates the Item and appends a timestamped stateHistory entry as one batch', async () => {
    const { setItemState } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await setItemState(fakeDb, { id: core.itemId('dish-soap'), name: 'Dish soap' }, 'out')

    expect(collection).toHaveBeenCalledWith(fakeDb, 'items/dish-soap/stateHistory')
    expect(batchUpdate).toHaveBeenCalledWith({ path: core.ITEMS_COLLECTION, id: 'dish-soap' }, { state: 'out' })
    expect(batchSet).toHaveBeenCalledWith(
      { path: 'items/dish-soap/stateHistory', id: 'generated-id' },
      { state: 'out', at: { kind: 'serverTimestamp' } },
    )
    expect(batchCommit).toHaveBeenCalled()
  })

  it('rejects a State outside the enum without writing', async () => {
    const { setItemState } = await import('./items.ts')
    const invalidState = 'almost gone' as unknown as core.State

    await expect(setItemState(fakeDb, { id: core.itemId('dish-soap'), name: 'Dish soap' }, invalidState)).rejects.toThrow()
    expect(batchUpdate).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('resolves once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { setItemState } = await import('./items.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(setItemState(fakeDb, { id: core.itemId('dish-soap'), name: 'Dish soap' }, 'out')).resolves.toBeUndefined()
  })
})

describe('a queued Item write the server rejects', () => {
  const dishSoap: ItemRecord = {
    id: core.itemId('dish-soap'),
    name: 'Dish soap',
    state: 'enough',
    categoryId: catalogue.categoryId('cleaning'),
    necessity: 'essential',
  }

  async function rejections() {
    const { watchWriteRejections } = await import('./writeRejections.ts')
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })
    return () => latest
  }

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { resetWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
  })

  it('reports the State change by Item name', async () => {
    const { setItemState } = await import('./items.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await setItemState(fakeDb, dishSoap, 'out')
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save State change for Dish soap'])
  })

  it('reports a deleted Item by name', async () => {
    const { softDeleteItem } = await import('./items.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await softDeleteItem(fakeDb, { ...dishSoap, categoryId: catalogue.categoryId('cleaning') })
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save deleted Item Dish soap'])
  })

  it('reports a restored Item by name', async () => {
    const { restoreItem } = await import('./items.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await restoreItem(fakeDb, { ...dishSoap, categoryId: catalogue.categoryId('cleaning') })
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save restored Item Dish soap'])
  })

  it('reports a new Item by name', async () => {
    const { createItem } = await import('./items.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await createItem(fakeDb, {
      name: 'Dish soap',
      categoryId: catalogue.categoryId('cleaning'),
      necessity: catalogue.necessitySchema.parse('essential'),
    })
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save new Item Dish soap'])
  })

  it('reports an edit by the Item name it started from', async () => {
    const { updateItem } = await import('./items.ts')
    const latest = await rejections()
    batchCommit.mockRejectedValueOnce(new Error('permission-denied'))

    await updateItem(fakeDb, dishSoap, {
      name: 'Washing-up liquid',
      categoryId: dishSoap.categoryId,
      necessity: dishSoap.necessity,
    })
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save changes to Dish soap'])
  })
})

describe('itemsWithBarcode', () => {
  const tape: ItemRecord = { ...bandages, id: core.itemId('tape'), name: 'Tape', barcodes: [core.barcode('12345678')] }

  it('returns every Item carrying the barcode, leaving the others', async () => {
    const { itemsWithBarcode } = await import('./items.ts')

    expect(itemsWithBarcode([bandages, bandagesWithBarcodes, tape], core.barcode('12345678'))).toEqual([
      bandagesWithBarcodes,
      tape,
    ])
  })

  it('returns an empty list when no Item carries the barcode', async () => {
    const { itemsWithBarcode } = await import('./items.ts')

    expect(itemsWithBarcode([bandages, bandagesWithBarcodes], core.barcode('4006381333931'))).toEqual([])
  })
})

describe('findDeletedItemByBarcode', () => {
  const coreDoc = (id: string, extra: object = {}) => ({
    id,
    data: () => ({ name: 'Dish soap', state: 'enough', barcodes: ['12345678'], deletedAt, ...extra }),
  })
  const catalogueDoc = { exists: () => true, data: () => ({ categoryId: 'cleaning', necessity: 'essential', deletedAt }) }

  it('returns the deleted Item joined with its catalogue doc', async () => {
    const { findDeletedItemByBarcode } = await import('./items.ts')
    getDocs.mockResolvedValueOnce({ docs: [coreDoc('dish-soap')] })
    getDoc.mockResolvedValueOnce(catalogueDoc)

    const found = await findDeletedItemByBarcode(fakeDb, core.barcode('12345678'))

    expect(where).toHaveBeenCalledWith('barcodes', 'array-contains', '12345678')
    expect(getDoc).toHaveBeenCalledWith({ path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' })
    expect(found).toEqual({
      id: 'dish-soap',
      name: 'Dish soap',
      state: 'enough',
      barcodes: ['12345678'],
      deletedAt,
      categoryId: 'cleaning',
      necessity: 'essential',
    })
  })

  it('picks the most recently deleted Item when several hold the barcode', async () => {
    const { findDeletedItemByBarcode } = await import('./items.ts')
    getDocs.mockResolvedValueOnce({
      docs: [
        coreDoc('old-soap', { deletedAt: { seconds: 1, nanoseconds: 0 } }),
        coreDoc('new-soap', { deletedAt: { seconds: 5, nanoseconds: 0 } }),
        coreDoc('mid-soap', { deletedAt: { seconds: 3, nanoseconds: 0 } }),
      ],
    })
    getDoc.mockResolvedValue(catalogueDoc)

    expect((await findDeletedItemByBarcode(fakeDb, core.barcode('12345678')))?.id).toBe('new-soap')
  })

  it('ignores a live Item', async () => {
    const { findDeletedItemByBarcode } = await import('./items.ts')
    getDocs.mockResolvedValueOnce({ docs: [coreDoc('dish-soap', { deletedAt: undefined })] })

    expect(await findDeletedItemByBarcode(fakeDb, core.barcode('12345678'))).toBeUndefined()
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('is undefined when no Item carries the barcode', async () => {
    const { findDeletedItemByBarcode } = await import('./items.ts')
    getDocs.mockResolvedValueOnce({ docs: [] })

    expect(await findDeletedItemByBarcode(fakeDb, core.barcode('12345678'))).toBeUndefined()
  })

  it('skips an Item whose catalogue doc is missing', async () => {
    const { findDeletedItemByBarcode } = await import('./items.ts')
    getDocs.mockResolvedValueOnce({ docs: [coreDoc('dish-soap')] })
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined })

    expect(await findDeletedItemByBarcode(fakeDb, core.barcode('12345678'))).toBeUndefined()
  })
})

describe('attachBarcode', () => {
  const dishSoap = { id: core.itemId('dish-soap'), name: 'Dish soap' }

  it('writes the barcode to the Item with arrayUnion', async () => {
    const { attachBarcode } = await import('./items.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await attachBarcode(fakeDb, dishSoap, '12345678')

    expect(arrayUnion).toHaveBeenCalledWith('12345678')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
      { barcodes: { kind: 'arrayUnion', values: ['12345678'] } },
    )
  })

  it('rejects a non-GTIN before writing', async () => {
    const { attachBarcode } = await import('./items.ts')

    await expect(attachBarcode(fakeDb, dishSoap, '12345')).rejects.toThrow('Not a Barcode: "12345"')
    await expect(attachBarcode(fakeDb, dishSoap, '1234567A')).rejects.toThrow('Not a Barcode: "1234567A"')

    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('does not wait for the server, so a caller offline is not left waiting', async () => {
    const { attachBarcode } = await import('./items.ts')
    updateDoc.mockReturnValueOnce(new Promise(() => {}))

    await attachBarcode(fakeDb, dishSoap, '12345678')
  })
})

describe('removeBarcode', () => {
  const dishSoap = { id: core.itemId('dish-soap'), name: 'Dish soap' }

  it('writes the removal of that barcode to the Item with arrayRemove', async () => {
    const { removeBarcode } = await import('./items.ts')
    updateDoc.mockResolvedValueOnce(undefined)

    await removeBarcode(fakeDb, dishSoap, core.barcode('12345678'))

    expect(arrayRemove).toHaveBeenCalledWith('12345678')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
      { barcodes: { kind: 'arrayRemove', values: ['12345678'] } },
    )
  })
})

describe('barcode write rejections', () => {
  const dishSoap = { id: core.itemId('dish-soap'), name: 'Dish soap' }

  async function rejections() {
    const { watchWriteRejections } = await import('./writeRejections.ts')
    let latest: string[] = []
    watchWriteRejections((list) => {
      latest = list.map((rejection) => rejection.message)
    })
    return () => latest
  }

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { resetWriteRejections } = await import('./writeRejections.ts')
    resetWriteRejections()
  })

  it('reports an attach the server rejects', async () => {
    const { attachBarcode } = await import('./items.ts')
    const latest = await rejections()
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await attachBarcode(fakeDb, dishSoap, '12345678')
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save barcode change for Dish soap'])
  })

  it('reports a removal the server rejects', async () => {
    const { removeBarcode } = await import('./items.ts')
    const latest = await rejections()
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await removeBarcode(fakeDb, dishSoap, core.barcode('12345678'))
    await Promise.resolve()

    expect(latest()).toEqual(['Could not save barcode removal for Dish soap'])
  })
})

describe('softDeleteItem and restoreItem', () => {
  const dishSoap: ItemRecord = {
    id: core.itemId('dish-soap'),
    name: 'Dish soap',
    state: 'enough',
    categoryId: catalogue.categoryId('cleaning'),
    necessity: 'essential',
    shopId: catalogue.shopId('grocery'),
  }

  it('soft-deletes both docs and lowers the Category and Shop counts in one batch, leaving stateHistory alone', async () => {
    const { softDeleteItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await softDeleteItem(fakeDb, dishSoap)

    const stamp = { kind: 'serverTimestamp' }
    expect(batchUpdate.mock.calls).toEqual([
      [{ path: core.ITEMS_COLLECTION, id: 'dish-soap' }, { deletedAt: stamp }],
      [{ path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' }, { deletedAt: stamp }],
      [{ path: catalogue.CATEGORIES_COLLECTION, id: 'cleaning' }, { referenceCount: { kind: 'increment', delta: -1 } }],
      [{ path: catalogue.SHOPS_COLLECTION, id: 'grocery' }, { referenceCount: { kind: 'increment', delta: -1 } }],
    ])
    expect(batchSet).not.toHaveBeenCalled()
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('leaves Shop counts alone for an Item without a Shop override', async () => {
    const { softDeleteItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await softDeleteItem(fakeDb, { ...dishSoap, shopId: undefined })

    expect(batchUpdate).toHaveBeenCalledTimes(3)
  })

  it('restores with an edit in one batch, raising the counts of the Category and Shop it names', async () => {
    const { restoreItemWithEdit } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await restoreItemWithEdit(fakeDb, dishSoap, {
      name: 'Dish soap',
      categoryId: catalogue.categoryId('kitchen'),
      necessity: catalogue.necessitySchema.parse('important'),
      shopId: catalogue.shopId('market'),
      removedBarcodes: [core.barcode('12345678')],
    })

    const cleared = { kind: 'deleteField' }
    expect(batchUpdate.mock.calls).toEqual([
      [
        { path: core.ITEMS_COLLECTION, id: 'dish-soap' },
        {
          deletedAt: cleared,
          name: 'Dish soap',
          brandNote: cleared,
          barcodes: { kind: 'arrayRemove', values: ['12345678'] },
        },
      ],
      [
        { path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' },
        { deletedAt: cleared, categoryId: 'kitchen', necessity: 'important', shopId: 'market' },
      ],
      [{ path: catalogue.CATEGORIES_COLLECTION, id: 'kitchen' }, { referenceCount: { kind: 'increment', delta: 1 } }],
      [{ path: catalogue.SHOPS_COLLECTION, id: 'market' }, { referenceCount: { kind: 'increment', delta: 1 } }],
    ])
    expect(JSON.stringify(batchUpdate.mock.calls)).not.toContain('stateHistory')
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('restores by clearing deletedAt and raising the counts back', async () => {
    const { restoreItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await restoreItem(fakeDb, dishSoap)

    const cleared = { kind: 'deleteField' }
    expect(batchUpdate.mock.calls).toEqual([
      [{ path: core.ITEMS_COLLECTION, id: 'dish-soap' }, { deletedAt: cleared }],
      [{ path: catalogue.CATALOGUE_ITEMS_COLLECTION, id: 'dish-soap' }, { deletedAt: cleared }],
      [{ path: catalogue.CATEGORIES_COLLECTION, id: 'cleaning' }, { referenceCount: { kind: 'increment', delta: 1 } }],
      [{ path: catalogue.SHOPS_COLLECTION, id: 'grocery' }, { referenceCount: { kind: 'increment', delta: 1 } }],
    ])
    expect(JSON.stringify(batchUpdate.mock.calls)).not.toContain('stateHistory')
  })
})
