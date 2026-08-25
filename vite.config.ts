import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vittam',
        short_name: 'Vittam',
        description: 'See what your household holds, and how complete your plan is.',
        theme_color: '#186A4F',
        background_color: '#F0F3EE',
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
        // Exactly one runtime rule, and it caches public content only.
        //
        // The former /api/dashboard NetworkFirst rule was removed with the
        // route itself (D-014, step 7 — the dashboard is computed in the
        // browser now). Beyond being dead config, a cached copy of that
        // response is the one thing the encryption change cannot allow: it
        // held a household's decrypted numbers, and the service worker cache
        // is not cleared by signing out.
        //
        // Every encrypted route (/api/holdings, /api/family-members,
        // /api/protection, /api/household, /api/household-keys) must stay
        // absent from this list. src/lib/sw-cache-policy.test.ts enforces that
        // — omission is easy to undo by accident, so it is asserted rather
        // than left to this comment.
        runtimeCaching: [
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
