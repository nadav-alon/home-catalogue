/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './src/pwa-manifest.ts'
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

export default defineConfig({
  base: '/home-catalogue/',
  plugins: [
    preact(),
    injectThemeColor(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
