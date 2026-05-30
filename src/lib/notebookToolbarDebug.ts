/** Gated trace logs: localStorage.setItem('NB_TOOLBAR_DEBUG', '1') */
export function nbToolbarDebug(...args: unknown[]): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('NB_TOOLBAR_DEBUG') === '1') {
      console.log('[nb-toolbar]', ...args);
    }
  } catch {
    /* quota / private mode */
  }
}
