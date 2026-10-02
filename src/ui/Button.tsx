import type { JSX } from 'preact'
import './Button.css'

export type ButtonVariant = 'filled' | 'tonal' | 'text'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className'> {
  variant?: ButtonVariant
  /**
   * Colours a `variant="text"` Button from the error token so it reads apart from its neighbours; the other variants
   * ignore it. It is only the colour; position is `DialogActions`' destructive slot.
   */
  destructive?: boolean
}

/** A native `<button>`; native focus, keyboard activation and `disabled` semantics are untouched. */
export function Button({ variant = 'filled', destructive = false, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={`ui-button ui-button--${variant}${destructive ? ' ui-button--destructive' : ''}`}
    />
  )
}
