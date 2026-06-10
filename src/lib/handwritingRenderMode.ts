/**
 * Dev-only A/B toggle for handwriting renderers.
 * Production always uses polyline.
 *
 * Safari console (dev build):
 *   window.__fwHwRenderMode = 'polyline'  // default
 *   window.__fwHwRenderMode = 'ink'       // perfect-freehand (dev spike)
 */

export type HwRenderMode = 'polyline' | 'ink';

declare global {
  interface Window {
    __fwHwRenderMode?: HwRenderMode;
  }
}

function isDevBuild(): boolean {
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
}

export function getHwRenderMode(): HwRenderMode {
  if (!isDevBuild()) return 'polyline';
  return window.__fwHwRenderMode === 'ink' ? 'ink' : 'polyline';
}

export function setHwRenderMode(mode: HwRenderMode): void {
  if (!isDevBuild()) return;
  window.__fwHwRenderMode = mode;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fw-hw-render-mode', { detail: mode }));
  }
}

if (isDevBuild() && typeof window !== 'undefined') {
  window.__fwHwSetRenderMode = setHwRenderMode;
}

declare global {
  interface Window {
    __fwHwSetRenderMode?: (mode: HwRenderMode) => void;
  }
}
