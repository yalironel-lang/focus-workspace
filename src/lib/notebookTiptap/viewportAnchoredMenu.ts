/**
 * Shared viewport clamping for Notebook product popovers.
 * Reuses the same visualViewport + edge-padding model as product Add/More menus.
 */

export type ViewportAnchoredMenuPos = {
  top: number;
  left: number;
  placement: 'below' | 'above';
  maxHeight: number;
};

export function readViewportSize(): { width: number; height: number } {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return {
    width: vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024),
    height: vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 768),
  };
}

/**
 * Place a fixed menu beside an anchor rect, flipping above when needed and
 * clamping within the visible viewport (8px padding).
 */
export function computeViewportAnchoredMenuPosition(input: {
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>;
  menuWidth: number;
  /** Estimated or measured menu height for flip decisions. */
  menuHeight: number;
  gap?: number;
  padding?: number;
  minHeight?: number;
}): ViewportAnchoredMenuPos {
  const gap = input.gap ?? 6;
  const padding = input.padding ?? 8;
  const { width: viewW, height: viewH } = readViewportSize();
  const r = input.anchor;

  let left = r.left;
  left = Math.max(padding, Math.min(left, viewW - input.menuWidth - padding));

  const spaceBelow = viewH - r.bottom - padding;
  const spaceAbove = r.top - padding;
  const preferBelow = spaceBelow >= input.menuHeight || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    input.minHeight ?? 80,
    Math.min(input.menuHeight, preferBelow ? spaceBelow : spaceAbove),
  );
  const top = preferBelow
    ? r.bottom + gap
    : Math.max(padding, r.top - gap - maxHeight);

  return {
    top,
    left,
    placement: preferBelow ? 'below' : 'above',
    maxHeight,
  };
}
