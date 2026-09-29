import type { ComponentType, JSX } from 'preact'

/** A symbol as produced by an `~icons/material-symbols/<name>` import. */
export type IconSymbol = ComponentType<JSX.SVGAttributes<SVGSVGElement>>

export interface IconProps {
  symbol: IconSymbol
}

/** Renders one Material Symbols SVG inline, coloured by the surrounding text colour. */
export function Icon({ symbol: Symbol }: IconProps) {
  return <Symbol />
}
