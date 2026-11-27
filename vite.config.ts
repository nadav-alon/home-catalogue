/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import Icons from 'unplugin-icons/vite'
import { manifest, versionedIconSrc } from './src/pwa-manifest.ts'
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
  return {
    name: 'version-favicon',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/(<link rel="icon"[^>]*href=")\/(pwa-[^"?]+\.png)"/, (_, head, file) => `${head}/${versionedIconSrc(file)}"`),
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
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    /** `test/rules` runs separately, against the Firestore emulator — see `npm run test:rules`. */
    exclude: [...configDefaults.exclude, 'test/rules/**'],
  },
})
