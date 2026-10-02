import type { JSX } from 'preact'
import { useUniqueId } from './useUniqueId.ts'
import { FieldError, useFieldError } from './FieldError.tsx'
import './Field.css'

export interface TextAreaProps extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'class' | 'className'> {
  label: string
  /** Shown under the field as an alert and announced as its description; also marks the field invalid. */
  error?: string
}

/** A native `<textarea>` with a visible `<label>`, styled like a TextField, and an optional error message. */
export function TextArea({ label, error, id, 'aria-describedby': describedBy, ...rest }: TextAreaProps) {
  const generatedId = useUniqueId()
  const areaId = id ?? generatedId
  const field = useFieldError(areaId, error, describedBy)
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={areaId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={areaId}
        class="ui-field__control ui-field__control--multiline"
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
      />
      <FieldError id={field.errorId} error={error} />
    </div>
  )
}
