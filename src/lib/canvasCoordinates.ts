/** Screen (viewport-local) ↔ world coordinates for the free-space canvas transform. */

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

const TRANSLATE_SCALE_RE =
  /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/;

/** Parse `translate(px, py) scale(z)` from an inline transform string. */
export function parseDisplayedTransform(transform: string): CanvasViewport | null {
  const m = transform.match(TRANSLATE_SCALE_RE);
  if (!m) return null;
  const panX = parseFloat(m[1]);
  const panY = parseFloat(m[2]);
  const zoom = parseFloat(m[3]);
  if (!Number.isFinite(panX) || !Number.isFinite(panY) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { panX, panY, zoom };
}

/**
 * Measure pan/zoom from painted geometry: world div is viewport-sized, transform-origin 0 0,
 * `translate(pan) scale(zoom)` → world origin appears at (panX, panY) viewport-local and
 * width scales by zoom.
 */
export function readViewportFromGeometry(
  viewportEl: HTMLElement,
  worldEl: HTMLElement,
): CanvasViewport | null {
  const vr = viewportEl.getBoundingClientRect();
  const wr = worldEl.getBoundingClientRect();
  if (vr.width < 1 || wr.width < 1) return null;
  const panX = wr.left - vr.left;
  const panY = wr.top - vr.top;
  const zoom = wr.width / vr.width;
  if (!Number.isFinite(panX) || !Number.isFinite(panY) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { panX, panY, zoom };
}

/** Read the pan/zoom actually visible on screen. Geometry is authoritative. */
export function readDisplayedViewport(
  viewportEl: HTMLElement | null,
  worldEl: HTMLElement | null,
  fallback: CanvasViewport,
): CanvasViewport {
  if (!viewportEl || !worldEl) return fallback;

  const fromGeometry = readViewportFromGeometry(viewportEl, worldEl);
  if (fromGeometry) return fromGeometry;

  const inline = worldEl.style.transform;
  if (inline && inline !== 'none') {
    const parsed = parseDisplayedTransform(inline);
    if (parsed) return parsed;
  }

  const matrix = new DOMMatrixReadOnly(getComputedStyle(worldEl).transform);
  if (matrix.m11 > 0 && Number.isFinite(matrix.m11)) {
    return { panX: matrix.e, panY: matrix.f, zoom: matrix.m11 };
  }

  return fallback;
}

export function clientToWorld(
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
  viewport: CanvasViewport,
): { worldX: number; worldY: number } {
  const lx = clientX - viewportRect.left;
  const ly = clientY - viewportRect.top;
  const z = viewport.zoom > 0 ? viewport.zoom : 1;
  return {
    worldX: (lx - viewport.panX) / z,
    worldY: (ly - viewport.panY) / z,
  };
}

/** Zoom toward a viewport-local focal point while keeping that world point fixed on screen. */
export function zoomViewportTowardPoint(
  viewport: CanvasViewport,
  focalX: number,
  focalY: number,
  newZoom: number,
): CanvasViewport {
  const prevZ = viewport.zoom > 0 ? viewport.zoom : 1;
  const nz = newZoom;
  return {
    zoom: nz,
    panX: focalX - (focalX - viewport.panX) * (nz / prevZ),
    panY: focalY - (focalY - viewport.panY) * (nz / prevZ),
  };
}
