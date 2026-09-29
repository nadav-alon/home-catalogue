import type { JSX } from 'preact'
import { Icon, type IconSymbol } from './Icon.tsx'
import './IconButton.css'

export interface IconButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className' | 'children' | 'aria-label'> {
  symbol: IconSymbol
  /** The button's accessible name; the icon itself stays decorative. */
  label: string
}

/** A native `<button>` showing only an icon. */
export function IconButton({ symbol, label, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} class="ui-icon-button">
      <Icon symbol={symbol} size="1.5rem" />
    </button>
  )
}
