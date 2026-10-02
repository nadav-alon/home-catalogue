import type { JSX } from 'preact'
import './Button.css'

export type ButtonVariant = 'filled' | 'tonal' | 'text'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className'> {
  variant?: ButtonVariant
  /** Marks an action that removes something, so it reads apart from its neighbours; coloured from the error token. */
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
