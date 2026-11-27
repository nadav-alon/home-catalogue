/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import Icons from 'unplugin-icons/vite'
import { iconBytes, manifest, versionedIconSrc, workboxOptions } from './src/pwa-manifest.ts'
import { appIcons, iconSizes } from './src/ui/appIcons.ts'
import { themeColor } from './src/theme.ts'

function injectThemeColor(): Plugin {
  return {
    name: 'inject-theme-color',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: themeColor },
          injectTo: 'head',
        },
      ]
    },
  }
}

/** Versions the favicon href like the manifest icons, so it follows the icon's content. */
function versionFavicon(): Plugin {
  const knownFiles = new Set<string>(appIcons.flatMap(({ output }) => iconSizes.map(output)))
  return {
    name: 'version-favicon',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/<link\b[^>]*\brel="icon"[^>]*>/, (tag) => {
          const href = /\bhref="([^"]*)"/.exec(tag)?.[1]
          const file = href?.replace(/^\//, '')
          if (!file || !knownFiles.has(file)) {
            throw new Error(`version-favicon: the favicon href ${JSON.stringify(href)} is not one of the app icons: ${[...knownFiles].join(', ')}`)
          }
          return tag.replace(`href="${href}"`, `href="/${versionedIconSrc(file, iconBytes(file))}"`)
        }),
    },
  }
}

export default defineConfig({
  base: '/home-catalogue/',
  plugins: [
    preact(),
    Icons({ compiler: 'jsx', jsx: 'preact', scale: 1 }),
    injectThemeColor(),
    versionFavicon(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
      workbox: workboxOptions,
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    /** `test/rules` runs separately, against the Firestore emulator — see `npm run test:rules`. */
    exclude: [...configDefaults.exclude, 'test/rules/**'],
  },
})
