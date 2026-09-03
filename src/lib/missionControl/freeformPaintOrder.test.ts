import { describe, expect, it } from 'vitest';
import { freeformPaintRank, orderFreeformItemsForPaint } from '../freeformPaintOrder';

describe('orderFreeformItemsForPaint (MC / selection stacking)', () => {
  const items = [
    { id: 'pdf-target', kind: 'block' as const },
    { id: 'blue-neighbor', kind: 'block' as const },
    { id: 'note-c', kind: 'block' as const },
  ];

  it('paints selected MC target after an overlapping later sibling (transient)', () => {
    // Natural store order: PDF first, blue neighbor second → blue would cover PDF.
    const painted = orderFreeformItemsForPaint(items, { selectedId: 'pdf-target' });
    expect(painted.map(i => i.id)).toEqual(['blue-neighbor', 'note-c', 'pdf-target']);
    expect(painted[painted.length - 1]?.id).toBe('pdf-target');
  });

  it('does not mutate the input array or imply persisted reordering', () => {
    const original = items.map(i => i.id);
    orderFreeformItemsForPaint(items, { selectedId: 'pdf-target' });
    expect(items.map(i => i.id)).toEqual(original);
  });

  it('transfers foreground when another object is selected', () => {
    const first = orderFreeformItemsForPaint(items, { selectedId: 'pdf-target' });
    expect(first.at(-1)?.id).toBe('pdf-target');
    const second = orderFreeformItemsForPaint(items, { selectedId: 'blue-neighbor' });
    expect(second.at(-1)?.id).toBe('blue-neighbor');
    expect(second.map(i => i.id)).toEqual(['pdf-target', 'note-c', 'blue-neighbor']);
  });

  it('keeps stable relative order among non-foreground items', () => {
    const painted = orderFreeformItemsForPaint(items, { selectedId: 'note-c' });
    expect(painted.map(i => i.id)).toEqual(['pdf-target', 'blue-neighbor', 'note-c']);
  });

  it('ranks dragging above selection', () => {
    expect(
      freeformPaintRank('pdf-target', { draggingId: 'pdf-target', selectedId: 'blue-neighbor' }),
    ).toBeGreaterThan(
      freeformPaintRank('blue-neighbor', { draggingId: 'pdf-target', selectedId: 'blue-neighbor' }),
    );
    const painted = orderFreeformItemsForPaint(items, {
      draggingId: 'blue-neighbor',
      selectedId: 'pdf-target',
    });
    expect(painted.at(-1)?.id).toBe('blue-neighbor');
  });

  it('ranks deep-focus editing above plain selection', () => {
    const painted = orderFreeformItemsForPaint(items, {
      selectedId: 'pdf-target',
      focusEditingId: 'note-c',
    });
    expect(painted.at(-1)?.id).toBe('note-c');
  });

  it('same-board and cross-board MC Open both rely on selectedId only', () => {
    // Framing is orthogonal; stacking contract is selection → paint last.
    for (const selectedId of ['pdf-target', 'pdf-target'] as const) {
      const painted = orderFreeformItemsForPaint(items, { selectedId });
      expect(painted.at(-1)?.id).toBe('pdf-target');
    }
  });
});
