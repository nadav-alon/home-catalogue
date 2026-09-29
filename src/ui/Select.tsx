import type { JSX } from 'preact'
import { useId } from 'preact/hooks'
import './TextField.css'

export interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class' | 'className'> {
  label: string
}

/** A native `<select>` with a visible `<label>`, styled like a TextField; pass `<option>`s as children. */
export function Select({ label, id, ...rest }: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  return (
    <div class="ui-field">
      <label class="ui-field__label" for={selectId}>
        {label}
      </label>
      <select {...rest} id={selectId} class="ui-field__control" />
    </div>
  )
}
