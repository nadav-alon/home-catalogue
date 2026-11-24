import { FilterChip } from 'household-ui/ui/FilterChip.tsx'
import type { RecipeRecord } from './recipes.ts'
import './RecipeFilter.css'

export interface RecipeFilterProps {
  recipes: readonly RecipeRecord[]
  /** The Recipe the list is narrowed to; undefined when it is not narrowed. */
  selectedId: RecipeRecord['id'] | undefined
  /** Called with the Recipe a pressed chip asks for, or undefined when the selected one is pressed again. */
  onChange: (recipeId: RecipeRecord['id'] | undefined) => void
}

/** The one-at-a-time "Filter by Recipe" chips shared by the Items list and the Shopping list. */
export function RecipeFilter({ recipes, selectedId, onChange }: RecipeFilterProps) {
  return (
    <div role="group" aria-label="Filter by Recipe" class="recipe-filter">
      {recipes.map((recipe) => (
        <FilterChip
          key={recipe.id}
          label={recipe.title}
          selected={recipe.id === selectedId}
          onToggle={() => onChange(recipe.id === selectedId ? undefined : recipe.id)}
        />
      ))}
    </div>
  )
}
