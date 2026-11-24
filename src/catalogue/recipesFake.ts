import type { RecipeRecord, WatchRecipes } from './recipes.ts'

/**
 * An in-memory stand-in for {@link WatchRecipes}: a screen takes `fake.watch` where it would take
 * `watchRecipes`. A subscriber is told the current Recipes at once, and again on every
 * {@link FakeRecipes.set}; an unsubscribed callback is never called again.
 */
export interface FakeRecipes {
  watch: WatchRecipes
  /** Replaces the Recipes and notifies every live subscriber. */
  set(recipes: RecipeRecord[]): void
}

export function fakeRecipes(initial: RecipeRecord[] = []): FakeRecipes {
  let current = initial
  const subscribers = new Set<(recipes: RecipeRecord[]) => void>()
  return {
    watch: (_db, callback) => {
      subscribers.add(callback)
      callback(current)
      return () => {
        subscribers.delete(callback)
      }
    },
    set(recipes) {
      current = recipes
      for (const subscriber of [...subscribers]) subscriber(current)
    },
  }
}
