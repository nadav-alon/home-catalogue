import type { JSX } from 'preact'
import { useId } from 'preact/hooks'
import { FieldError, useFieldError } from './FieldError.tsx'
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
  const field = useFieldError(selectId, error, describedBy)
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        class="ui-field__control"
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
      />
      <FieldError id={field.errorId} error={error} />
    </div>
  )
}
