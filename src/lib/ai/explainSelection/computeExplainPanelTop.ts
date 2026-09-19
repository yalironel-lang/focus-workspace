/**
 * Smallest vertical clamp for the Explain panel: keep toolbar-anchored placement,
 * but do not let the panel sit significantly below the viewport.
 */

export function computeExplainPanelTop(input: {
  anchorTop: number | null;
  /** Preferred offset below the toolbar top (matches prior panel layout). */
  gapBelowToolbar?: number;
  maxHeightPx?: number;
  viewportHeight?: number;
  padding?: number;
}): number {
  const gap = input.gapBelowToolbar ?? 44;
  const padding = input.padding ?? 12;
  const preferred = input.anchorTop != null ? input.anchorTop + gap : 72;
  const vh =
    input.viewportHeight ??
    (typeof window !== 'undefined'
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 768);
  const maxH =
    input.maxHeightPx ??
    Math.min(typeof vh === 'number' ? vh * 0.4 : 320, 320);
  const maxTop = Math.max(padding, vh - padding - maxH);
  return Math.max(padding, Math.min(preferred, maxTop));
}
