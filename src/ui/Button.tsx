import type { JSX } from 'preact'
import './Button.css'

export type ButtonVariant = 'filled' | 'tonal' | 'text'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className'> {
  variant?: ButtonVariant
  /**
   * Colours a `variant="text"` Button from the error token so it reads apart from its neighbours; the other variants
   * ignore it. It is only the colour: it does not set the action apart by position, which is `DialogActions`'
   * `destructive` slot. That slot applies this colour to a text Button itself, so a caller there need not pass it.
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
