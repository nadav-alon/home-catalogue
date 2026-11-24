/** `current` cleared when it is `id`, else `id`: what pressing a chip of a one-at-a-time group selects. */
export function toggledSelection<Id extends string>(current: Id | undefined, id: Id): Id | undefined {
  return current === id ? undefined : id
}
