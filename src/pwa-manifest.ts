import type { ManifestOptions } from 'vite-plugin-pwa'
import { themeColor } from './theme.ts'

export const manifest: Partial<ManifestOptions> = {
  name: 'Home Catalogue',
  short_name: 'Catalogue',
  description: "Tracks what the household has, is running low on, or is out of",
  theme_color: themeColor,
  background_color: '#ffffff',
  display: 'standalone',
  start_url: '.',
  icons: [
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}
