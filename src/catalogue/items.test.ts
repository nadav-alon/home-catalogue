import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue, core } from 'data-platform'

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

vi.mock('firebase/firestore', () => ({
  collection: (db: unknown, path: string) => collection(db, path),
  doc: (...args: unknown[]) => doc(...args),
  query: (ref: unknown, ...constraints: unknown[]) => query(ref, ...constraints),
  orderBy: (field: string) => orderBy(field),
  onSnapshot: (q: unknown, cb: unknown) => onSnapshot(q, cb),
  writeBatch: (db: unknown) => writeBatch(db),
  deleteField: () => deleteField(),
  serverTimestamp: () => serverTimestamp(),
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

describe('createItem', () => {
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
    expect(batchCommit).toHaveBeenCalled()
  })

  it('includes an optional brand note and Shop override when given', async () => {
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
  it('updates the core Item and catalogue CatalogueItem docs as one batch, leaving State untouched', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, core.itemId('dish-soap'), {
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

  it('clears the brand note and Shop override when they are omitted', async () => {
    const { updateItem } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await updateItem(fakeDb, core.itemId('dish-soap'), {
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
      updateItem(fakeDb, core.itemId('dish-soap'), {
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
      updateItem(fakeDb, core.itemId('dish-soap'), {
        name: 'Dish soap',
        categoryId: catalogue.categoryId('cleaning'),
        necessity: catalogue.necessitySchema.parse('essential'),
      }),
    ).resolves.toBeUndefined()
  })
})

describe('setItemState', () => {
  it('updates the Item and appends a timestamped stateHistory entry as one batch', async () => {
    const { setItemState } = await import('./items.ts')
    batchCommit.mockResolvedValueOnce(undefined)

    await setItemState(fakeDb, core.itemId('dish-soap'), 'out')

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

    await expect(setItemState(fakeDb, core.itemId('dish-soap'), invalidState)).rejects.toThrow()
    expect(batchUpdate).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('resolves once the batch is queued, without waiting for Firestore to acknowledge it', async () => {
    const { setItemState } = await import('./items.ts')
    batchCommit.mockReturnValueOnce(new Promise(() => {}))

    await expect(setItemState(fakeDb, core.itemId('dish-soap'), 'out')).resolves.toBeUndefined()
  })
})
