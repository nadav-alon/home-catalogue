import type { JSX } from 'preact'
import { Icon, type IconSymbol } from './Icon.tsx'
import './Fab.css'

export interface FabProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className' | 'children' | 'aria-label'> {
  symbol: IconSymbol
  /** The button's accessible name; the icon itself stays decorative. */
  label: string
}

/** The screen's primary action, as a native `<button>` showing only an icon. */
export function Fab({ symbol, label, type = 'button', ...rest }: FabProps) {
  return (
    <button {...rest} type={type} aria-label={label} class="ui-fab">
      <Icon symbol={symbol} size="1.5rem" />
    </button>
  )
}
