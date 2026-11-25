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

/** The Recipe `recipeId` names among `all` with the ids of the Items it links; undefined when nothing is chosen or the Recipe is gone. */
export function chosenRecipe(
  all: readonly RecipeRecord[],
  recipeId: RecipeRecord['id'] | undefined,
): { recipe: RecipeRecord; itemIds: ReadonlySet<core.ItemId> } | undefined {
  const recipe = all.find((candidate) => candidate.id === recipeId)
  return recipe === undefined ? undefined : { recipe, itemIds: new Set(linkedItemIds(recipe)) }
}

/** Whether `ingredient` is Unlinked: neither linked to an Item nor Assumed. */
function isUnlinked(ingredient: recipes.Recipe['ingredients'][number]): boolean {
  return ingredient.itemId === undefined && ingredient.assumed !== true
}

/** The distinct names of `recipe`'s Unlinked Ingredients: those neither linked to an Item nor Assumed. */
export function unlinkedIngredientNames(recipe: recipes.Recipe): string[] {
  const names = recipe.ingredients.flatMap((ingredient) => (isUnlinked(ingredient) ? [ingredient.name] : []))
  return [...new Set(names)]
}

/** The 0-based positions in `recipe.ingredients` of the Unlinked Ingredients named `name`, in order. */
export function unlinkedPositions(recipe: recipes.Recipe, name: string): number[] {
  return recipe.ingredients.flatMap((ingredient, position) => (isUnlinked(ingredient) && ingredient.name === name ? [position] : []))
}

/** The ids of the Items a Wanted Recipe among `recipes` links an Ingredient to; an Unlinked or assumed Ingredient names none. */
export function itemIdsNeededBy(recipes: readonly RecipeRecord[]): Set<core.ItemId> {
  return new Set(wantedRecipesByItem(recipes).keys())
}

/** The Wanted Recipes among `recipes` that link an Ingredient to each Item, in the order given; an Item no Wanted Recipe links has no entry. */
export function wantedRecipesByItem(recipes: readonly RecipeRecord[]): Map<core.ItemId, RecipeRecord[]> {
  const byItem = new Map<core.ItemId, RecipeRecord[]>()
  for (const recipe of recipes) {
    if (recipe.wanted !== true) continue
    for (const itemId of new Set(linkedItemIds(recipe))) byItem.set(itemId, [...(byItem.get(itemId) ?? []), recipe])
  }
  return byItem
}

/** An Unlinked Ingredient of a Wanted Recipe that is not yet Bought: one Recipe row of the Shopping list. */
export interface RecipeRow {
  recipe: RecipeRecord
  /** The Ingredient's 0-based position in `recipe.ingredients`, the position `setIngredientBought` takes. */
  position: number
  name: string
}

/** The Recipe rows of the Wanted Recipes among `recipes`, in Recipe then Ingredient order; linked, Assumed and Bought Ingredients give none. */
export function recipeRowsOf(recipes: readonly RecipeRecord[]): RecipeRow[] {
  return recipes.flatMap((recipe) =>
    recipe.wanted !== true
      ? []
      : recipe.ingredients.flatMap((ingredient, position) =>
          isUnlinked(ingredient) && ingredient.bought !== true
            ? [{ recipe, position, name: ingredient.name }]
            : [],
        ),
  )
}

/** The most Recipes a row names one by one; any more collapse into the first Recipe's chip, "for <A> +n". */
const MAX_NAMED_RECIPES = 2

/** The chips, keyed by Recipe id, for the Wanted Recipes `recipes` that need a row: one "for <title>" each, or "for <first> +n" (n the other Recipes) past {@link MAX_NAMED_RECIPES}. */
export function recipeChipLabels(recipes: readonly RecipeRecord[]): { key: RecipeRecord['id']; label: string }[] {
  if (recipes.length <= MAX_NAMED_RECIPES) return recipes.map((recipe) => ({ key: recipe.id, label: `for ${recipe.title}` }))
  const first = recipes[0]!
  return [{ key: first.id, label: `for ${first.title} +${recipes.length - 1}` }]
}
