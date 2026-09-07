/**
 * Shared app-shell inset for the global connectivity banner.
 * Banner is in normal document flow; fixed/portaled chrome must offset by this var
 * so it never covers navigation.
 */

export const APP_CONNECTIVITY_INSET_CSS_VAR = '--app-connectivity-inset';
export const APP_CHROME_SAFE_PAD_TOP_CSS_VAR = '--app-chrome-safe-pad-top';

/** CSS length for `top` (and similar) on fixed chrome below the banner. */
export const appConnectivityInsetTop = `var(${APP_CONNECTIVITY_INSET_CSS_VAR}, 0px)`;

/**
 * Padding-top for fixed chrome.
 * Default (no banner): max(8px, safe-area).
 * Banner visible: 8px only — safe-area already included in the inset.
 */
export const appChromeSafePadTop = `var(${APP_CHROME_SAFE_PAD_TOP_CSS_VAR}, max(8px, env(safe-area-inset-top, 0px)))`;

export function setAppConnectivityInsetPx(px: number): void {
  if (typeof document === 'undefined') return;
  const next = Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
  document.documentElement.style.setProperty(APP_CONNECTIVITY_INSET_CSS_VAR, `${next}px`);
  if (next > 0) {
    document.documentElement.style.setProperty(APP_CHROME_SAFE_PAD_TOP_CSS_VAR, '8px');
  } else {
    document.documentElement.style.removeProperty(APP_CHROME_SAFE_PAD_TOP_CSS_VAR);
  }
}

export function clearAppConnectivityInset(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(APP_CONNECTIVITY_INSET_CSS_VAR, '0px');
  document.documentElement.style.removeProperty(APP_CHROME_SAFE_PAD_TOP_CSS_VAR);
}
