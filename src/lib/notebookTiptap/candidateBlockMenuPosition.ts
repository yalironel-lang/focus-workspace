/** Viewport-only geometry for the candidate block picker; no document mutations. */
export function placeCandidateBlockMenu(
  anchor: { left: number; right: number; top: number; bottom: number },
  viewport: { left: number; top: number; width: number; height: number },
) {
  const margin = Math.min(8, viewport.width / 4, viewport.height / 4);
  const gap = 8;
  const width = Math.max(0, Math.min(384, viewport.width - margin * 2));
  const maxHeight = Math.max(0, Math.min(360, viewport.height - margin * 2));
  const above = Math.max(0, anchor.top - viewport.top - margin - gap);
  const below = Math.max(0, viewport.top + viewport.height - margin - anchor.bottom - gap);
  const side = above >= maxHeight || above > below ? 'above' : 'below';
  // On very short screens use the available viewport rather than clip the picker.
  const height = Math.min(maxHeight, Math.max(above, below, Math.min(120, maxHeight)));
  const idealTop = side === 'above' ? anchor.top - gap - height : anchor.bottom + gap;
  const left = Math.max(viewport.left + margin, Math.min(anchor.right - width, viewport.left + viewport.width - margin - width));
  const top = Math.max(viewport.top + margin, Math.min(idealTop, viewport.top + viewport.height - margin - height));
  return { left, top, width, height, side };
}
