/**
 * Dev-only A/B toggle to compare legacy full-redraw polyline vs mathInk.
 * Production uses dual-layer rendering: draft polyline while drawing,
 * perfect-freehand once on commit (see handwritingLayers.ts).
 *
 * Safari console (dev build):
 *   window.__fwHwRenderMode = 'polyline'  // force legacy polyline
 *   window.__fwHwRenderMode = 'ink'       // mathInk (production default)
 */

export type HwRenderMode = 'polyline' | 'ink';

declare global {
  interface Window {
    __fwHwRenderMode?: HwRenderMode;
  }
}

export function isHandwritingDevBuild(): boolean {
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
}

function isDevBuild(): boolean {
  return isHandwritingDevBuild();
}

export function getHwRenderMode(): HwRenderMode {
  if (!isDevBuild()) return 'ink';
  return window.__fwHwRenderMode === 'polyline' ? 'polyline' : 'ink';
}

export function setHwRenderMode(mode: HwRenderMode): void {
  if (!isDevBuild()) return;
  window.__fwHwRenderMode = mode;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fw-hw-render-mode', { detail: mode }));
  }
}

if (typeof window !== 'undefined') {
  if (isDevBuild()) {
    window.__fwHwSetRenderMode = setHwRenderMode;
  } else {
    window.__fwHwSetRenderMode = () => {
      console.info(
        '[handwriting] Render mode toggle is dev-only. Production uses mathInk.',
      );
    };
  }
}

declare global {
  interface Window {
    __fwHwSetRenderMode?: (mode: HwRenderMode) => void;
  }
}
