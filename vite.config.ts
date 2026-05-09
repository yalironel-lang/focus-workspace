import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: new SW installs + activates silently.
      // Combined with the controllerchange reload in main.tsx, the page
      // refreshes automatically to pick up the new assets.
      registerType: 'autoUpdate',

      workbox: {
        // ── Precache ──────────────────────────────────────────────────────────
        // All app-shell assets are content-hashed, so Workbox can track
        // revisions and update them atomically across deploys.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],

        // ── Critical update flags ─────────────────────────────────────────────
        // skipWaiting: new SW jumps straight to active — no waiting for tabs to close.
        // clientsClaim: new SW immediately controls all open tabs on activation.
        // Together these ensure the page is always running under the latest SW.
        skipWaiting:  true,
        clientsClaim: true,

        // ── Stale cache cleanup ───────────────────────────────────────────────
        // Removes precache entries left by older SW versions (different Workbox
        // cache-key format).  Prevents old hashed bundles accumulating forever.
        cleanupOutdatedCaches: true,

        // ── Navigation fallback ───────────────────────────────────────────────
        // SPA: every navigation returns index.html from precache.
        // Denylist guards non-SPA paths so they aren't served stale HTML.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api\//,         // future API routes
          /^\/sw\.js$/,       // SW itself
          /^\/workbox-/,      // Workbox chunks
        ],

        // ── Runtime caching ───────────────────────────────────────────────────
        // IMPORTANT: App JS/CSS bundles are NOT listed here.
        //   Content-hashed files (assets/index-HASH.js) belong only in the
        //   Workbox precache where revision tracking is exact.  A separate
        //   runtime cache would store old bundles for up to 7 days, serving
        //   stale code to users even after a fresh deploy.
        runtimeCaching: [
          // Supabase API — network first, 10s timeout, 24h fallback
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-v1',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          // Google Fonts stylesheet — stale-while-revalidate (changes rarely)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets-v1',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Google Fonts files — cache first (immutable, vary by URL)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // External images / media (CDN assets not in the app bundle)
          {
            urlPattern: /\.(?:png|jpg|jpeg|gif|webp|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },

      // ── Web app manifest ──────────────────────────────────────────────────
      manifest: {
        name: 'Focus Workspace',
        short_name: 'Focus',
        description: 'Your calm daily operating layer. Capture → Choose → Focus.',
        theme_color: '#0a0805',
        background_color: '#0a0805',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/dashboard',
        id: 'focus-workspace-v1',
        categories: ['productivity', 'education'],
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Quick Capture',
            short_name: 'Capture',
            description: 'Capture a thought instantly',
            url: '/dashboard?capture=1',
            icons: [{ src: '/icon.svg', sizes: 'any' }],
          },
          {
            name: 'Start Focus Session',
            short_name: 'Focus',
            description: 'Begin a timed work session',
            url: '/dashboard?focus=1',
            icons: [{ src: '/icon.svg', sizes: 'any' }],
          },
        ],
      },

      // ── Dev ───────────────────────────────────────────────────────────────
      // Keep SW disabled in dev — it would serve stale assets and make
      // hot-reload confusing.  Use `npm run preview` to test SW locally.
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],

  server: {
    port: 5173,
    host: true,
    allowedHosts: ['legal-bats-post.loca.lt'],
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['legal-bats-post.loca.lt'],
  },
})
