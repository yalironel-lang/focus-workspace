/**
 * Notebook Designer layout + persistence timing constants (pure).
 */

export const NOTEBOOK_DESIGNER_PANEL_MIN_WIDTH_PX = 720;
export const NOTEBOOK_DESIGNER_PANEL_WIDTH_PX = 300;
export const NOTEBOOK_DESIGNER_PERSIST_DEBOUNCE_MS = 500;

export type NotebookDesignerContainerMode = 'panel' | 'sheet';

/** Wide notebook shell → docked panel; narrow / iPad → bottom sheet. */
export function resolveNotebookDesignerContainerMode(
  surfaceWidthPx: number,
): NotebookDesignerContainerMode {
  if (!Number.isFinite(surfaceWidthPx) || surfaceWidthPx <= 0) return 'sheet';
  return surfaceWidthPx >= NOTEBOOK_DESIGNER_PANEL_MIN_WIDTH_PX ? 'panel' : 'sheet';
}

/**
 * Stabilize shell width for ResizeObserver → React state.
 * Rounds fractional CSS pixels and returns `prev` when unchanged so setState
 * is a no-op (prevents scrollbar/sticky oscillation loops).
 */
export function nextNotebookSurfaceWidthPx(prev: number, measured: number): number {
  if (!Number.isFinite(measured)) return prev;
  const w = Math.round(measured);
  return prev === w ? prev : w;
}
