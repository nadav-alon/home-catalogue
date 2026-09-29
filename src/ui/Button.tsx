import type { JSX } from 'preact'
import './Button.css'

export type ButtonVariant = 'filled' | 'tonal' | 'text'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className'> {
  variant?: ButtonVariant
}

/** A native `<button>`; native focus, keyboard activation and `disabled` semantics are untouched. */
export function Button({ variant = 'filled', type = 'button', ...rest }: ButtonProps) {
  return <button {...rest} type={type} class={`ui-button ui-button--${variant}`} />
}
