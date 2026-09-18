import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'

function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    writeBundle(options) {
      if (options.dir) return copyFile(join(options.dir, 'index.html'), join(options.dir, '404.html'))
    },
  }
}

export default defineConfig({
  plugins: [
    spaFallback(),
    tsconfigPaths(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bookshelf Reader',
        short_name: 'Bookshelf',
        description: 'A local-first reader for your public book sources.',
        theme_color: '#17362d',
        background_color: '#f7f4ec',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
