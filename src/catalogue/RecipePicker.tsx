import { useState } from 'preact/hooks'
import { FilterChip } from 'household-ui/ui/FilterChip.tsx'
import type { RecipeRecord } from './recipes.ts'
import './RecipePicker.css'

export interface RecipePickerProps {
  recipes: readonly RecipeRecord[]
  /** The Recipe the list is narrowed to; undefined when it is not narrowed. */
  selected: RecipeRecord | undefined
  /** Called with the Recipe the picker chose, or undefined when the chip of the chosen Recipe is tapped to clear it. */
  onChange: (recipeId: RecipeRecord['id'] | undefined) => void
}

/** One "Recipe" chip that opens a list of the Recipes; once one is chosen the chip reads its title, is pressed, and clears it when tapped. */
export function RecipePicker({ recipes, selected, onChange }: RecipePickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <div class="recipe-picker">
      <FilterChip
        label={selected?.title ?? 'Recipe'}
        selected={selected !== undefined}
        onToggle={() => {
          if (selected !== undefined) onChange(undefined)
          else setOpen(!open)
        }}
      />
      {open && selected === undefined && (
        <ul class="recipe-picker__list" aria-label="Recipes">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                class="recipe-picker__option"
                onClick={() => {
                  setOpen(false)
                  onChange(recipe.id)
                }}
              >
                {recipe.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
