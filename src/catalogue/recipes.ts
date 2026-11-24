import { collection, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore'
import { recipes } from 'data-platform'

/**
 * A live Recipe with its id. Each Ingredient is linked (`itemId`), assumed (`assumed`), or an
 * Unlinked Ingredient (neither); its position in `ingredients` is the position the platform's
 * `setIngredientBought` takes. `wanted` is `true` for a Wanted Recipe and absent otherwise.
 */
export interface RecipeRecord extends recipes.Recipe {
  id: recipes.RecipeId
}

/** The shape of {@link watchRecipes}, so a screen can take {@link watchRecipes} or a fake. */
export type WatchRecipes = (db: Firestore, callback: (recipes: RecipeRecord[]) => void) => () => void

/**
 * Notifies `callback` with every Recipe that isn't soft-deleted (`deletedAt` unset), ordered by title,
 * and again on every change. Reads through the shared Firestore cache, so it works offline like the
 * Items do. A document failing {@link recipes.recipeSchema} is skipped and logged rather than
 * breaking the whole list. Returns the unsubscribe function.
 */
export const watchRecipes: WatchRecipes = (db, callback) => {
  const recipesQuery = query(collection(db, recipes.RECIPES_COLLECTION), orderBy('title'))
  return onSnapshot(recipesQuery, (snapshot) => {
    callback(
      snapshot.docs.flatMap((snapshotDoc) => {
        const parsed = recipes.recipeSchema.safeParse(snapshotDoc.data())
        if (!parsed.success) {
          console.error(`Skipping invalid Recipe document ${snapshotDoc.id}`, parsed.error)
          return []
        }
        if (parsed.data.deletedAt !== undefined) return []
        return [{ id: recipes.recipeId(snapshotDoc.id), ...parsed.data }]
      }),
    )
  })
}
