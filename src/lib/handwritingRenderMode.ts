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

export function isHandwritingDevBuild(): boolean {
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
}

function isDevBuild(): boolean {
  return isHandwritingDevBuild();
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

if (typeof window !== 'undefined') {
  if (isDevBuild()) {
    window.__fwHwSetRenderMode = setHwRenderMode;
  } else {
    window.__fwHwSetRenderMode = () => {
      console.info(
        '[handwriting] Render mode toggle is dev-only. Production always uses polyline.',
      );
    };
  }
}

declare global {
  interface Window {
    __fwHwSetRenderMode?: (mode: HwRenderMode) => void;
  }
}
