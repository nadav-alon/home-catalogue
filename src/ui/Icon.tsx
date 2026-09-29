import type { ComponentType, JSX } from 'preact'

/** A symbol as produced by an `~icons/material-symbols/<name>` import. */
export type IconSymbol = ComponentType<JSX.SVGAttributes<SVGSVGElement>>

export interface IconProps {
  symbol: IconSymbol
  /** Any CSS length; defaults to the symbol's own `1em`. */
  size?: string
  /** Accessible name. Without one the icon is decorative and hidden from assistive tech. */
  label?: string
}

/** Renders one Material Symbols SVG inline, coloured by the surrounding text colour. */
export function Icon({ symbol: Symbol, size, label }: IconProps) {
  const a11y =
    label === undefined
      ? { 'aria-hidden': true as const }
      : { role: 'img' as const, 'aria-label': label }
  const dimensions = size === undefined ? {} : { width: size, height: size }
  return <Symbol {...dimensions} {...a11y} />
}
