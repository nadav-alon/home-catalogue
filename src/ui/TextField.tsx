import type { JSX } from 'preact'
import { useUniqueId } from './useUniqueId.ts'
import { FieldError, useFieldError } from './FieldError.tsx'
import './Field.css'

export interface TextFieldProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class' | 'className'> {
  label: string
  /** Shown under the field as an alert and announced as its description; also marks the input invalid. */
  error?: string
}

/** A native `<input>` with a visible `<label>` and an optional error message. */
export function TextField({ label, error, id, 'aria-describedby': describedBy, ...rest }: TextFieldProps) {
  const generatedId = useUniqueId()
  const inputId = id ?? generatedId
  const field = useFieldError(inputId, error, describedBy)
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={inputId}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        class="ui-field__control"
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
      />
      <FieldError id={field.errorId} error={error} />
    </div>
  )
}
