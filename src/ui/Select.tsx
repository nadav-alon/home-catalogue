import type { JSX } from 'preact'
import { useId } from 'preact/hooks'
import './Field.css'

export interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class' | 'className'> {
  label: string
  /** Shown under the field as an alert and announced as its description; also marks the select invalid. */
  error?: string
}

/** A native `<select>` with a visible `<label>`, styled like a TextField; pass `<option>`s as children. */
export function Select({ label, error, id, 'aria-describedby': describedBy, ...rest }: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        class="ui-field__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={description}
      />
      {error ? (
        <p class="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
