import { getSelectionOffsetsIn } from './notebookCaret';

export type CopyableNotebookBlock = {
  id: string;
  kind: string;
  text?: string;
};

function offsetAtBoundary(el: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(container, offset);
  return r.toString().length;
}

/** Map a DOM Range to plain-text offsets within one rich-editable line. */
export function getRangeOffsetsIn(
  el: HTMLElement,
  range: Range,
): { start: number; end: number } | null {
  const er = document.createRange();
  try {
    er.selectNodeContents(el);
  } catch {
    return null;
  }

  const startsBefore =
    range.compareBoundaryPoints(Range.START_TO_START, er) <= 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, er) >= 0;
  const endsAfter =
    range.compareBoundaryPoints(Range.END_TO_START, er) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, er) >= 0;

  if (!startsBefore && !endsAfter) {
    if (range.compareBoundaryPoints(Range.END_TO_START, er) > 0) return null;
    if (range.compareBoundaryPoints(Range.START_TO_END, er) < 0) return null;
  }

  const start = el.contains(range.startContainer)
    ? offsetAtBoundary(el, range.startContainer, range.startOffset)
    : 0;
  const end = el.contains(range.endContainer)
    ? offsetAtBoundary(el, range.endContainer, range.endOffset)
    : (el.textContent?.length ?? 0);

  if (start === end) return null;
  return start < end ? { start, end } : { start: end, end: start };
}

function richEditableBlocksInRange(
  root: HTMLElement,
  range: Range,
): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>('[data-rich-editable="1"]');
  const out: HTMLElement[] = [];
  nodes.forEach(el => {
    if (getRangeOffsetsIn(el, range) != null) out.push(el);
  });
  return out;
}

function plainForBlock(block: CopyableNotebookBlock | undefined, el: HTMLElement): string {
  if (block && typeof block.text === 'string') return block.text;
  return el.textContent ?? '';
}

/**
 * Build exact plain-text copy payload for the current DOM selection inside the editor.
 * Uses block model text (not live DOM text) so copied text matches stored content.
 */
export function buildNotebookCopyText(
  root: HTMLElement,
  blocks: CopyableNotebookBlock[],
  range: Range,
): string | null {
  const editables = richEditableBlocksInRange(root, range);
  if (editables.length === 0) return null;

  const blockById = new Map(blocks.map(b => [b.id, b]));
  const slices: string[] = [];

  for (const el of editables) {
    const offsets =
      editables.length === 1 && el.contains(range.startContainer) && el.contains(range.endContainer)
        ? getSelectionOffsetsIn(el) ?? getRangeOffsetsIn(el, range)
        : getRangeOffsetsIn(el, range);
    if (!offsets) continue;
    const blockId = el.getAttribute('data-block-id') ?? '';
    const block = blockById.get(blockId);
    if (
      block &&
      (block.kind === 'divider' || block.kind === 'image-ref' || block.kind === 'handwriting')
    ) {
      continue;
    }
    const plain = plainForBlock(block, el);
    const slice = plain.slice(offsets.start, offsets.end);
    if (slice.length > 0) slices.push(slice);
  }

  if (slices.length === 0) return null;
  return slices.join('\n');
}

export function buildNotebookCopyFromSelection(
  root: HTMLElement,
  blocks: CopyableNotebookBlock[],
): string | null {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return buildNotebookCopyText(root, blocks, range);
}
