import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ManifestOptions } from 'vite-plugin-pwa'
import { appName } from './appName.ts'
import { appIcons, iconSizes } from './ui/appIcons.ts'
import { themeColor } from './theme.ts'
import { colourRoleHex } from 'household-ui/ui/colourRoles.ts'

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

/** The first 8 hex of the icon's sha256: changes exactly when its bytes do. */
export function iconVersion(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8)
}

/**
 * An icon URL that changes with the file's content, so an installed app sees
 * a changed icon when it re-checks the manifest.
 */
export function versionedIconSrc(file: string, bytes: Uint8Array = readFileSync(resolve(publicDir, file))): string {
  return `${file}?v=${iconVersion(bytes)}`
}

export const manifest: Partial<ManifestOptions> = {
  name: appName,
  short_name: 'Catalogue',
  description: "Tracks what the household has, is running low on, or is out of",
  theme_color: themeColor,
  background_color: colourRoleHex(themeColor, 'background', 'light'),
  display: 'standalone',
  start_url: '.',
  icons: appIcons.flatMap(({ purpose, output }) =>
    iconSizes.map((size) => ({
      src: versionedIconSrc(output(size)),
      sizes: `${size}x${size}`,
      type: 'image/png',
      ...(purpose === 'any' ? {} : { purpose }),
    })),
  ),
}
