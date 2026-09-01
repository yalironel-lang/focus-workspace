import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const buildId = new Date().toISOString()
let gitCommit = 'unknown'
const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA
if (vercelSha && vercelSha.length >= 7) {
  gitCommit = vercelSha.slice(0, 7)
} else {
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    /* not a git checkout */
  }
}

const fwFeatureFlags = { incrementalDraft: true } as const

function debugLogIngestPlugin(): Plugin {
  const logPath = path.join(process.cwd(), '.cursor/debug-3f83e8.log')
  return {
    name: 'debug-log-ingest',
    configureServer(server) {
      server.middlewares.use('/__debug_ingest', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          try {
            fs.mkdirSync(path.dirname(logPath), { recursive: true })
            fs.appendFileSync(logPath, `${body.trim()}\n`)
          } catch {
            /* ignore write failures */
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __FW_FEATURE_FLAGS__: JSON.stringify(fwFeatureFlags),
  },
  plugins: [
    react(),
    debugLogIngestPlugin(),
    VitePWA({
      // autoUpdate: new SW installs + activates silently.
      // Combined with the controllerchange reload in main.tsx, the page
      // refreshes automatically to pick up the new assets.
      registerType: 'autoUpdate',
      minify: false,

      workbox: {
        // Work around terser renderChunk hang in this toolchain by disabling
        // SW minification path used by Workbox's production mode.
        mode: 'development',

        // Raise the precache limit from the 2 MiB default.
        // The main JS bundle (Tiptap + ProseMirror + KaTeX + pdf.js) exceeds 2 MiB
        // uncompressed. Workbox still serves it over the network correctly;
        // this limit only controls which assets are precached in the SW manifest.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB

        // ── Precache ──────────────────────────────────────────────────────────
        // All app-shell assets are content-hashed, so Workbox can track
        // revisions and update them atomically across deploys.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Sheet/Univer chunks load only when a Sheet mounts — do not precache them
        // for every Free Space user.
        globIgnores: [
          '**/FocusSheetSurface-*.js',
          '**/univer-sheets-*.js',
          '**/univer-sheets-*.css',
        ],

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
          // ── Supabase: NetworkOnly (never read/write Cache API for API/auth) ──
          // Explicit rule so no future runtime rule can accidentally cache REST/auth.
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
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
          // Living environment scenes (public/environments/* — too large for precache)
          {
            urlPattern: /\/environments\/.+\.(?:jpg|jpeg|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'living-environments-v1',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
        name: 'ZIKUK',
        short_name: 'ZIKUK',
        description: 'Your calm daily operating layer. Capture → Choose → Focus.',
        theme_color: '#000119',
        background_color: '#000119',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/dashboard',
        id: 'focus-workspace-v1',
        categories: ['productivity', 'education'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-48.png',
            sizes: '48x48',
            type: 'image/png',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Quick Capture',
            short_name: 'Capture',
            description: 'Capture a thought instantly',
            url: '/dashboard?capture=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Start Focus Session',
            short_name: 'Focus',
            description: 'Begin a timed work session',
            url: '/dashboard?focus=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@univerjs')) return 'univer-sheets';
          return undefined;
        },
      },
    },
  },
})
