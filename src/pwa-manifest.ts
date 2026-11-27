import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ManifestOptions } from 'vite-plugin-pwa'
import type { GenerateSWOptions } from 'workbox-build'
import { appName } from './appName.ts'
import { appIcons, iconSizes } from './ui/appIcons.ts'
import { themeColor } from './theme.ts'
import { colourRoleHex } from 'household-ui/ui/colourRoles.ts'

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

declare const iconVersionBrand: unique symbol
declare const versionedIconSrcBrand: unique symbol

/** The first 8 hex of an icon's sha256. */
export type IconVersion = string & { readonly [iconVersionBrand]: true }

/** A `<file>?v=<IconVersion>` URL, `file` being a path relative to `public/`. */
export type VersionedIconSrc = string & { readonly [versionedIconSrcBrand]: true }

const versionedIconSrcPattern = /^([^?]+)\?v=[0-9a-f]{8}$/

export function isVersionedIconSrc(value: string): value is VersionedIconSrc {
  return versionedIconSrcPattern.test(value)
}

/** The icon file (relative to `public/`) a versioned icon URL points at: the inverse of `versionedIconSrc`. */
export function iconFileOf(src: VersionedIconSrc): string {
  return versionedIconSrcPattern.exec(src)![1]
}

/** The first 8 hex of the icon's sha256: changes whenever its bytes do. */
export function iconVersion(bytes: Uint8Array): IconVersion {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8) as IconVersion
}

/** The bytes of an icon file, given its path relative to `public/`. */
export function iconBytes(file: string): Uint8Array {
  return readFileSync(resolve(publicDir, file))
}

/**
 * An icon URL that changes with the file's content, so an installed app sees
 * a changed icon when it re-checks the manifest.
 */
export function versionedIconSrc(file: string, bytes: Uint8Array): VersionedIconSrc {
  return `${file}?v=${iconVersion(bytes)}` as VersionedIconSrc
}

/** The manifest, its icon URLs versioned from the bytes `readIcon` returns for each icon file. */
export function buildManifest(readIcon: (file: string) => Uint8Array): Partial<ManifestOptions> {
  return {
    name: appName,
    short_name: 'Catalogue',
    description: "Tracks what the household has, is running low on, or is out of",
    theme_color: themeColor,
    background_color: colourRoleHex(themeColor, 'background', 'light'),
    display: 'standalone',
    start_url: '.',
    icons: appIcons.flatMap(({ purpose, output }) =>
      iconSizes.map((size) => ({
        src: versionedIconSrc(output(size), readIcon(output(size))),
        sizes: `${size}x${size}`,
        type: 'image/png',
        ...(purpose === 'any' ? {} : { purpose }),
      })),
    ),
  }
}

export const manifest = buildManifest(iconBytes)

/**
 * Icons are requested as `<file>?v=<version>`, while the precache holds the
 * bare files: png must be globbed in and `v` ignored when matching requests.
 */
export const workboxOptions: Partial<GenerateSWOptions> = {
  globPatterns: ['**/*.{js,css,html,png}'],
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
}
