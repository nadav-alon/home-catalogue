import './SegmentedButton.css'

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
}

export interface SegmentedButtonProps<Value extends string> {
  /** The group's accessible name. */
  label: string
  options: readonly SegmentedOption<Value>[]
  value: Value
  onChange: (value: Value) => void
}

/** A group of native toggle buttons, one per option; the selected one has `aria-pressed="true"`. */
export function SegmentedButton<Value extends string>({ label, options, value, onChange }: SegmentedButtonProps<Value>) {
  return (
    <div role="group" aria-label={label} class="ui-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          class="ui-segmented__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
