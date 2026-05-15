import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { logAppBuildInfo } from './lib/appBuildInfo'
import { initPerformanceSafeModeListeners } from './lib/performanceSafeMode'

logAppBuildInfo()
initPerformanceSafeModeListeners()

// ── Service Worker update lifecycle ──────────────────────────────────────────
//
// Problem this solves:
//   skipWaiting + clientsClaim activates the new SW immediately, but the
//   running page is NOT automatically refreshed.  It keeps executing old JS
//   while the new SW has taken over.  If the new SW deleted old precached
//   chunks via cleanupOutdatedCaches, any lazy-loaded import for an old hashed
//   filename will 404.
//
// Fix:
//   Listen for `controllerchange` — fires when the SW controller changes
//   (i.e. the new SW just claimed this tab).  Reload so the page picks up the
//   fresh index.html and new hashed assets from the updated precache.
//
// Loop guard:
//   `hadController` is false on the very first visit (no SW installed yet).
//   We skip the reload then so a new user doesn't get an extra refresh.
//   On all subsequent visits an existing controller is present, so any
//   controller change means "new deploy just activated" → safe to reload once.
//
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload on UPDATE (existing SW replaced), not on first install.
    if (!hadController) return

    // In-memory flag prevents the same page instance from reloading twice.
    // Cleared automatically on reload (new page instance, flag = false).
    if ((window as Window & { __swRefreshing?: boolean }).__swRefreshing) return

    const reload = () => {
      ;(window as Window & { __swRefreshing?: boolean }).__swRefreshing = true
      if (import.meta.env.DEV) {
        console.info('[SW] Controller changed — reloading to pick up new assets')
      }
      window.location.reload()
    }

    // Defer reload until idle to avoid a visible flash mid-interaction (common in installed PWA).
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
          window.setTimeout(reload, 320);
        }, { timeout: 4000 });
      } else {
        window.setTimeout(reload, 800);
      }
    };
    if (document.visibilityState === 'visible') schedule()
    else document.addEventListener('visibilitychange', () => schedule(), { once: true })
  })

  // ── Dev-only diagnostics ──────────────────────────────────────────────────
  // Completely tree-shaken in production builds (import.meta.env.DEV = false).
  if (import.meta.env.DEV) {
    // Log registration state once SW is ready
    navigator.serviceWorker.ready.then(reg => {
      console.group('[SW] Ready')
      console.info('  scope :', reg.scope)
      console.info('  state :', reg.active?.state ?? 'none')
      console.groupEnd()
    })

    // Log state transitions for all SW phases (installing → waiting → active)
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        const watch = (sw: ServiceWorker | null, label: string) => {
          if (!sw) return
          sw.addEventListener('statechange', () =>
            console.info(`[SW] ${label} state → ${sw.state}`),
          )
        }
        watch(reg.installing, 'installing')
        watch(reg.waiting,    'waiting')
        watch(reg.active,     'active')

        reg.addEventListener('updatefound', () => {
          console.info('[SW] updatefound — new SW is installing')
          watch(reg.installing, 'new')
        })
      })
    })

    // Log all open cache names (useful for spotting stale caches)
    if ('caches' in window) {
      caches.keys().then(names => {
        if (names.length === 0) return
        console.group('[SW] Open caches')
        names.forEach(n => console.info(' •', n))
        console.groupEnd()
      })
    }
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
