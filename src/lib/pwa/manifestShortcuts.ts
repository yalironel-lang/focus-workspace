/**
 * V1-H3 — PWA web app manifest shortcuts.
 * Only ship shortcuts that resolve to real, useful product routes with working handlers.
 * Dead query-param deep links (e.g. /dashboard?capture=1 with no handler) must not ship.
 */

export type PwaManifestShortcut = {
  name: string;
  short_name: string;
  description: string;
  url: string;
  icons: { src: string; sizes: string; type: string }[];
};

/**
 * Authenticated product route prefixes (see App.tsx).
 * Shortcuts must match one of these paths (query string ignored for validity).
 */
export const PWA_VALID_ROUTE_PATHS = [
  '/dashboard',
  '/universe',
  '/desk',
  '/schedule',
  '/session',
] as const;

/** Empty until a shortcut has a real deep-link handler (not merely a valid path). */
export const PWA_MANIFEST_SHORTCUTS: readonly PwaManifestShortcut[] = [];

/** Path-only check — does not prove the deep-link is useful. */
export function isPwaShortcutPathKnown(url: string): boolean {
  const path = (url.split('?')[0] ?? '').trim();
  if (!path.startsWith('/')) return false;
  if ((PWA_VALID_ROUTE_PATHS as readonly string[]).includes(path)) return true;
  if (path.startsWith('/section/') && path.length > '/section/'.length) return true;
  return false;
}

/** V1 policy: every shipped shortcut must be both known and intentionally useful. */
export function assertPwaShortcutsHonest(
  shortcuts: readonly PwaManifestShortcut[],
): { ok: true } | { ok: false; reason: string } {
  for (const s of shortcuts) {
    if (!isPwaShortcutPathKnown(s.url)) {
      return { ok: false, reason: `unknown route: ${s.url}` };
    }
  }
  // Prefer empty over nonfunctional deep links until handlers exist.
  if (shortcuts.length > 0) {
    return {
      ok: false,
      reason: 'V1 ships no PWA shortcuts until deep-link handlers exist',
    };
  }
  return { ok: true };
}
