import { collection, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore'
import { recipes, type core } from 'data-platform'

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
export function watchRecipes(db: Firestore, callback: (recipes: RecipeRecord[]) => void): () => void {
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

watchRecipes satisfies WatchRecipes

/** The ids of the Items `recipe`'s Ingredients link; Assumed and Unlinked Ingredients contribute none. */
export function linkedItemIds(recipe: recipes.Recipe): core.ItemId[] {
  return recipe.ingredients.flatMap((ingredient) => (ingredient.itemId === undefined ? [] : [ingredient.itemId]))
}

/** The distinct names of `recipe`'s Unlinked Ingredients: those neither linked to an Item nor Assumed. */
export function unlinkedIngredientNames(recipe: recipes.Recipe): string[] {
  const names = recipe.ingredients.flatMap((ingredient) =>
    ingredient.itemId === undefined && ingredient.assumed !== true ? [ingredient.name] : [],
  )
  return [...new Set(names)]
}

/** The ids of the Items a Wanted Recipe among `recipes` links an Ingredient to; an Unlinked or assumed Ingredient names none. */
export function itemIdsNeededBy(recipes: readonly RecipeRecord[]): Set<core.ItemId> {
  const needed = new Set<core.ItemId>()
  for (const recipe of recipes) {
    if (recipe.wanted !== true) continue
    for (const ingredient of recipe.ingredients) if (ingredient.itemId !== undefined) needed.add(ingredient.itemId)
  }
  return needed
}
