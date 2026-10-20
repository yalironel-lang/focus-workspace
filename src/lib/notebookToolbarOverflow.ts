/**
 * Decide which Notebook toolbar controls stay inline.
 * Widths are the measured control widths. The container width is the toolbar's
 * own content box, not the viewport.
 */

export type NotebookToolbarFitItem = {
  id: string;
  priority: 'primary' | 'secondary';
  width: number;
};

export type NotebookToolbarFit = {
  inlineIds: string[];
  overflowIds: string[];
};

export function fitNotebookToolbar(options: {
  containerWidth: number;
  items: readonly NotebookToolbarFitItem[];
  gap: number;
  overflowWidth: number;
}): NotebookToolbarFit {
  const { containerWidth, items, gap, overflowWidth } = options;
  if (!(containerWidth > 0)) {
    return { inlineIds: items.map(item => item.id), overflowIds: [] };
  }

  const primary = items.filter(item => item.priority === 'primary');
  const secondary = items.filter(item => item.priority === 'secondary');

  const total = (list: readonly NotebookToolbarFitItem[], withButton: boolean) => {
    const count = list.length + (withButton ? 1 : 0);
    const widths =
      list.reduce((sum, item) => sum + item.width, 0) + (withButton ? overflowWidth : 0);
    return widths + gap * Math.max(0, count - 1);
  };

  let keep = secondary.length;
  while (keep > 0) {
    const kept = secondary.slice(0, keep);
    const hidden = secondary.length - keep;
    if (total([...primary, ...kept], hidden > 0) <= containerWidth) break;
    keep -= 1;
  }

  const inline = new Set<string>([
    ...primary.map(item => item.id),
    ...secondary.slice(0, keep).map(item => item.id),
  ]);
  return {
    inlineIds: items.filter(item => inline.has(item.id)).map(item => item.id),
    overflowIds: secondary.slice(keep).map(item => item.id),
  };
}

/** Inline controls plus the overflow button must stay inside the content box. */
export function toolbarInlineWidth(options: {
  items: readonly NotebookToolbarFitItem[];
  inlineIds: readonly string[];
  overflowIds: readonly string[];
  gap: number;
  overflowWidth: number;
}): number {
  const byId = new Map(options.items.map(item => [item.id, item]));
  const inline = options.inlineIds
    .map(id => byId.get(id))
    .filter((item): item is NotebookToolbarFitItem => !!item);
  const withButton = options.overflowIds.length > 0;
  const count = inline.length + (withButton ? 1 : 0);
  const widths =
    inline.reduce((sum, item) => sum + item.width, 0) +
    (withButton ? options.overflowWidth : 0);
  return widths + options.gap * Math.max(0, count - 1);
}
