import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      // Service worker strategies
      workbox: {
        // Precache the entire built app shell
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],

        // Route strategies
        runtimeCaching: [
          // Supabase API — network first, fall back to cache
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          // Google Fonts — cache first
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Everything else — stale while revalidate
          {
            urlPattern: /\.(js|css|png|svg|jpg|jpeg|gif|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],

        // Skip waiting — update immediately when new SW is available
        skipWaiting: true,
        clientsClaim: true,
      },

      // Web app manifest
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

      // Dev options — show SW in development
      devOptions: {
        enabled: false,       // disable in dev to avoid stale cache confusion
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
