import './FilterChip.css'

export interface FilterChipProps {
  label: string
  selected: boolean
  onToggle: () => void
}

/** A filter chip: a toggle button that reads as pressed while its filter applies. */
export function FilterChip({ label, selected, onToggle }: FilterChipProps) {
  return (
    <button type="button" class="ui-filter-chip" aria-pressed={selected} onClick={onToggle}>
      {label}
    </button>
  )
}
