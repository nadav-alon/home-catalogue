export const iconSizes = [192, 512] as const

/** Each app icon asset: its source SVG, its manifest purpose and the PNG name for a size. */
export const appIcons = [
  { source: 'house-check.svg', purpose: 'any', output: (size: number) => `pwa-${size}x${size}.png` },
  { source: 'house-check-maskable.svg', purpose: 'maskable', output: (size: number) => `pwa-maskable-${size}x${size}.png` },
] as const
