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
        // SPA fallback: a cold offline load of a deep link (/dashboard,
        // /explore/...) must still boot the app shell rather than showing the
        // browser's offline page. Without this, offline support only works on
        // a reload of "/" — which is not how anyone actually opens a PWA.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Dashboard data is per-user and changes as holdings are edited,
            // so unlike the library it must prefer the network and fall back
            // to cache only when offline. The client can't tell a cache hit
            // from a live response here (SPEC.md §7 rules out a custom
            // service worker for this slice), so freshness is tracked
            // separately in src/lib/pwa-cache.ts.
            //
            // Flat path only, deliberately: this project's Vercel zero-config
            // routing 404s any second /api/ path segment before Hono runs, so
            // /api/dashboard never has one to match.
            //
            // networkTimeoutSeconds matters as much as the handler — on a
            // flaky/captive connection the request can hang rather than fail,
            // and without a timeout NetworkFirst would wait it out instead of
            // serving the cache the user is entitled to.
            urlPattern: /\/api\/dashboard$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dashboard-last',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Instrument library content is read-only and public — safe to
            // serve from cache first so browsing works fully offline once
            // visited once, falling back to network only on a cache miss.
            // Matches both the list (/api/instruments) and detail
            // (/api/instruments?slug=...) requests — no trailing path
            // segment, since /:slug path params 404 on this project's
            // Vercel zero-config routing (see server/routes/instruments.ts).
            urlPattern: /\/api\/instruments(\?.*)?$/,
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
