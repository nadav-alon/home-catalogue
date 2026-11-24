import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { recipes } from 'data-platform'

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
  vi.spyOn(console, 'error').mockImplementation(() => {})
  onSnapshot.mockReset()
})

describe('watchRecipes', () => {
  it('subscribes ordered by title and emits each live Recipe with its Ingredients, wanted and bought', async () => {
    const { watchRecipes } = await import('./recipes.ts')
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    const ingredients = [
      { name: 'Flour', itemId: 'flour' },
      { name: 'Salt', assumed: true },
      { name: 'Saffron', bought: true },
    ]
    onSnapshot.mockImplementation((_q: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          {
            id: 'bread',
            data: () => ({ title: 'Bread', ingredients, prepSteps: [], steps: [], wanted: true }),
          },
        ],
      })
      return unsubscribe
    })

    const stop = watchRecipes(fakeDb, callback)

    expect(collection).toHaveBeenCalledWith(fakeDb, recipes.RECIPES_COLLECTION)
    expect(orderBy).toHaveBeenCalledWith('title')
    expect(callback).toHaveBeenCalledWith([
      { id: recipes.recipeId('bread'), title: 'Bread', ingredients, prepSteps: [], steps: [], wanted: true },
    ])
    expect(stop).toBe(unsubscribe)
  })

  it('leaves soft-deleted Recipes out and skips invalid documents', async () => {
    const { watchRecipes } = await import('./recipes.ts')
    const callback = vi.fn()
    const live = { title: 'Soup', ingredients: [], prepSteps: [], steps: [] }
    onSnapshot.mockImplementation((_q: unknown, cb: (snapshot: unknown) => void) => {
      cb({
        docs: [
          { id: 'old', data: () => ({ ...live, title: 'Old', deletedAt: { seconds: 1, nanoseconds: 0 } }) },
          { id: 'broken', data: () => ({ title: '' }) },
          { id: 'soup', data: () => live },
        ],
      })
      return vi.fn()
    })

    watchRecipes(fakeDb, callback)

    expect(callback).toHaveBeenCalledWith([{ id: recipes.recipeId('soup'), ...live }])
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('re-emits when the snapshot changes', async () => {
    const { watchRecipes } = await import('./recipes.ts')
    const callback = vi.fn()
    let push: (snapshot: unknown) => void = () => {}
    onSnapshot.mockImplementation((_q: unknown, cb: (snapshot: unknown) => void) => {
      push = cb
      return vi.fn()
    })
    watchRecipes(fakeDb, callback)

    push({ docs: [] })
    push({ docs: [{ id: 'a', data: () => ({ title: 'A', ingredients: [], prepSteps: [], steps: [] }) }] })

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1]?.[0]).toHaveLength(1)
  })
})
