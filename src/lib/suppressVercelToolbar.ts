/**
 * Vercel injects a floating preview toolbar (vercel.live) on deployment hosts.
 * Not part of the app bundle — strip/hide it so the workspace stays immersive.
 */

const VERCEL_TOOLBAR_SELECTORS = [
  'vercel-live-feedback',
  '[data-vercel-toolbar]',
  '#vercel-toolbar',
  'iframe[src*="vercel.live"]',
].join(', ');

function hideVercelToolbarNodes(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(VERCEL_TOOLBAR_SELECTORS).forEach(node => {
    if (node instanceof HTMLElement) {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    }
    node.remove();
  });
}

let observer: MutationObserver | null = null;

export function suppressVercelToolbar(): void {
  hideVercelToolbarNodes();
  if (typeof MutationObserver === 'undefined' || observer) return;
  observer = new MutationObserver(() => hideVercelToolbarNodes());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
