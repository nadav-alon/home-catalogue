import type { JSX } from 'preact'
import { useId } from 'preact/hooks'
import './Field.css'

export interface TextAreaProps extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'class' | 'className'> {
  label: string
  /** Shown under the field as an alert and announced as its description; also marks the field invalid. */
  error?: string
}

/** A native `<textarea>` with a visible `<label>`, styled like a TextField, and an optional error message. */
export function TextArea({ label, error, id, 'aria-describedby': describedBy, ...rest }: TextAreaProps) {
  const generatedId = useId()
  const areaId = id ?? generatedId
  const errorId = `${areaId}-error`
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={areaId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={areaId}
        class="ui-field__control ui-field__control--multiline"
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
