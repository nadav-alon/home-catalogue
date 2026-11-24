import { describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { recipes } from 'data-platform'
import { fakeRecipes } from './recipesFake.ts'
import type { RecipeRecord } from './recipes.ts'

const db = {} as Firestore
const bread: RecipeRecord = {
  id: recipes.recipeId('bread'),
  title: 'Bread',
  ingredients: [],
  prepSteps: [],
  steps: [],
}

describe('fakeRecipes', () => {
  it('tells a subscriber the current Recipes at once and on every set', () => {
    const fake = fakeRecipes([bread])
    const callback = vi.fn()
    fake.watch(db, callback)
    fake.set([{ ...bread, wanted: true }])
    expect(callback.mock.calls).toEqual([[[bread]], [[{ ...bread, wanted: true }]]])
  })

  it('stops notifying after unsubscribe', () => {
    const fake = fakeRecipes()
    const callback = vi.fn()
    fake.watch(db, callback)()
    fake.set([bread])
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
