import type { JSX } from 'preact'
import { useId } from 'preact/hooks'
import './Field.css'

export interface TextFieldProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class' | 'className'> {
  label: string
  /** Shown under the field as an alert and announced as its description; also marks the input invalid. */
  error?: string
}

/** A native `<input>` with a visible `<label>` and an optional error message. */
export function TextField({ label, error, id, 'aria-describedby': describedBy, ...rest }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={inputId}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
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
