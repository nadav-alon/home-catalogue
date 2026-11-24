import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { core, recipes } from 'data-platform'

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
  collection.mockClear()
  query.mockClear()
  orderBy.mockClear()
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

describe('Ingredient classification', () => {
  const recipe: recipes.Recipe = {
    title: 'Pad Thai',
    ingredients: [
      { name: 'Noodles', itemId: core.itemId('noodles') },
      { name: 'Salt', assumed: true },
      { name: 'Sriracha' },
      { name: 'Honey', bought: true },
    ],
    prepSteps: [],
    steps: [],
  }

  it('linkedItemIds lists the linked Items only', async () => {
    const { linkedItemIds } = await import('./recipes.ts')
    expect(linkedItemIds(recipe)).toEqual([core.itemId('noodles')])
  })

  it('unlinkedIngredientNames lists neither linked nor Assumed Ingredients', async () => {
    const { unlinkedIngredientNames } = await import('./recipes.ts')
    expect(unlinkedIngredientNames(recipe)).toEqual(['Sriracha', 'Honey'])
  })

  it('unlinkedIngredientNames names an Ingredient once however many times the Recipe lists it', async () => {
    const { unlinkedIngredientNames } = await import('./recipes.ts')
    const salty = { ...recipe, ingredients: [{ name: 'Salt' }, { name: 'Honey' }, { name: 'Salt' }] }
    expect(unlinkedIngredientNames(salty)).toEqual(['Salt', 'Honey'])
  })
})

describe('itemIdsNeededBy', () => {
  const recipe = (id: string, over: object): import('./recipes.ts').RecipeRecord => ({
    id: recipes.recipeId(id),
    title: id,
    ingredients: [],
    prepSteps: [],
    steps: [],
    ...over,
  })

  it('names the Items a Wanted Recipe links, not those of an unwanted Recipe or an unlinked Ingredient', async () => {
    const { itemIdsNeededBy } = await import('./recipes.ts')
    const needed = itemIdsNeededBy([
      recipe('bread', { wanted: true, ingredients: [{ name: 'Flour', itemId: 'flour' }, { name: 'Salt', assumed: true }, { name: 'Saffron' }] }),
      recipe('soup', { ingredients: [{ name: 'Leek', itemId: 'leek' }] }),
    ])
    expect([...needed]).toEqual(['flour'])
  })
})
