/**
 * FreeformCanvas paint order — transient stacking only.
 *
 * Per-item wrappers often create stacking contexts (opacity / filter / transform),
 * so FreeformBlock's internal z-index (selected=7, idle=2) does NOT compete across
 * siblings. Later DOM nodes paint above earlier ones. Reorder the render list so
 * the active/selected target paints last without mutating persisted object order
 * or PositionMap geometry.
 */

export type FreeformPaintOrderOpts = {
  draggingId?: string | null;
  selectedId?: string | null;
  focusEditingId?: string | null;
};

export function freeformPaintRank(id: string, opts: FreeformPaintOrderOpts): number {
  if (opts.draggingId && id === opts.draggingId) return 30;
  if (opts.focusEditingId && id === opts.focusEditingId) return 20;
  if (opts.selectedId && id === opts.selectedId) return 10;
  return 0;
}

export function orderFreeformItemsForPaint<T extends { id: string }>(
  items: readonly T[],
  opts: FreeformPaintOrderOpts,
): T[] {
  return items
    .map((item, index) => ({ item, index, rank: freeformPaintRank(item.id, opts) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map(entry => entry.item);
}
