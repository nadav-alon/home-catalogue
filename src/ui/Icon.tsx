import type { ComponentType, JSX } from 'preact'

/** A symbol as produced by an `~icons/material-symbols/<name>` import. */
export type IconSymbol = ComponentType<JSX.SVGAttributes<SVGSVGElement>>

export interface IconProps {
  symbol: IconSymbol
  /** Any CSS length; defaults to the symbol's own `1em`. */
  size?: string
  /** Accessible name. Without one (or with an empty one) the icon is decorative and hidden from assistive tech. */
  label?: string
}

/** Renders one Material Symbols SVG inline, coloured by the surrounding text colour. */
export function Icon({ symbol: SymbolSvg, size, label }: IconProps) {
  const a11y =
    label
      ? { role: 'img' as const, 'aria-label': label }
      : { 'aria-hidden': true as const }
  const dimensions = size === undefined ? {} : { width: size, height: size }
  return <SymbolSvg {...dimensions} {...a11y} />
}
