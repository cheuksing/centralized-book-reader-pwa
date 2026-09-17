import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv('defaults', process.cwd(), ''), ...loadEnv(mode, process.cwd(), ''), ...process.env }

  return {
    define: {
      'import.meta.env.VITE_WORKER_ORIGIN': JSON.stringify(env.WORKER_ORIGIN ?? ''),
      'import.meta.env.VITE_WORKER_TOKEN': JSON.stringify(env.WORKER_ACCESS_TOKEN ?? ''),
    },
    plugins: [
      tsconfigPaths(),
      react(),
      ...(command === 'serve' ? [cloudflare({
        configPath: 'worker/wrangler.toml',
        config: { vars: { ACCESS_TOKEN: env.WORKER_ACCESS_TOKEN ?? '', ALLOWED_ORIGINS: env.WORKER_ALLOWED_ORIGINS ?? '' } },
      })] : []),
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
  }
})
