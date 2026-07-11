import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'Household Financial Planning',
        short_name: 'FamilyPlan',
        description: 'See what your household holds, and how complete your plan is.',
        theme_color: '#1B6B6B',
        background_color: '#F7F5F1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML) is static and safe to precache at build time.
        // Dashboard data is fetched dynamically — see src/lib/pwa-cache.ts (Slice 8).
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // Instrument library content is read-only and public — safe to
            // serve from cache first so browsing works fully offline once
            // visited once, falling back to network only on a cache miss.
            urlPattern: /^\/api\/instruments(\/.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'instrument-library',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
})
