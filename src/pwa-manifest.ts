import type { ManifestOptions } from 'vite-plugin-pwa'
import { appIcons, iconSizes } from './ui/appIcons.ts'
import { themeColor } from './theme.ts'
import { colourRoleHex } from './ui/colourRoles.ts'

export const manifest: Partial<ManifestOptions> = {
  name: 'Home Catalogue',
  short_name: 'Catalogue',
  description: "Tracks what the household has, is running low on, or is out of",
  theme_color: themeColor,
  background_color: colourRoleHex(themeColor, 'background', false),
  display: 'standalone',
  start_url: '.',
  icons: appIcons.flatMap(({ purpose, output }) =>
    iconSizes.map((size) => ({
      src: output(size),
      sizes: `${size}x${size}`,
      type: 'image/png',
      ...(purpose === 'any' ? {} : { purpose }),
    })),
  ),
}
