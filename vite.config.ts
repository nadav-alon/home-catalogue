/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './src/pwa-manifest.ts'

export default defineConfig({
  base: '/home-catalogue/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
