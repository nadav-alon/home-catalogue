import type { JSX } from 'preact'
import './Field.css'

export interface FieldErrorState {
  errorId: string
  /** The caller's `aria-describedby` with the error's id appended while there is an error; undefined when empty. */
  describedBy: string | undefined
  invalid: true | undefined
}

/** The accessibility wiring a field shares for its error message; render the message with `FieldError`. */
export function useFieldError(controlId: JSX.HTMLAttributes['id'], error: string | undefined, describedBy: JSX.AriaAttributes['aria-describedby']): FieldErrorState {
  const errorId = `${controlId}-error`
  return {
    errorId,
    describedBy: [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined,
    invalid: error ? true : undefined,
  }
}

/** The alert shown under a field; renders nothing without an error. */
export function FieldError({ id, error }: { id: string; error: string | undefined }) {
  return error ? (
    <p class="ui-field__error" id={id} role="alert">
      {error}
    </p>
  ) : null
}
