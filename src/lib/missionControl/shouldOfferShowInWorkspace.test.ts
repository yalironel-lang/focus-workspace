import { describe, expect, it } from 'vitest';
import { shouldOfferShowInWorkspace } from './shouldOfferShowInWorkspace';
import type { MissionControlItem } from './types';

function base(overrides: Partial<MissionControlItem>): MissionControlItem {
  return {
    id: 'freespace:x',
    source: 'freespace',
    sourceId: 'x',
    sectionId: 's1',
    sourceKind: { source: 'freespace', type: 'notebook' },
    category: 'notebook',
    title: 'N',
    subtitle: null,
    createdAt: null,
    updatedAt: null,
    lastOpenedAt: null,
    preview: { kind: 'none' },
    capabilities: {
      open: true,
      showInWorkspace: true,
      rename: true,
      delete: true,
      duplicate: true,
      move: false,
    },
    openAction: { type: 'freespace-focus', objectId: 'x', boardId: 'main' },
    showInWorkspaceAction: { type: 'freespace-focus', objectId: 'x', boardId: 'main' },
    availability: { metadata: 'available', content: 'unknown' },
    ...overrides,
  };
}

describe('shouldOfferShowInWorkspace', () => {
  it('hides when Open and Show are identical freespace-focus', () => {
    expect(shouldOfferShowInWorkspace(base({}))).toBe(false);
  });

  it('shows for Free Space link (external Open vs spatial Show)', () => {
    expect(
      shouldOfferShowInWorkspace(
        base({
          category: 'link',
          sourceKind: { source: 'freespace', type: 'link' },
          openAction: { type: 'external-url', url: 'https://ex.com' },
          showInWorkspaceAction: { type: 'freespace-focus', objectId: 'x', boardId: 'main' },
          capabilities: {
            open: true,
            showInWorkspace: true,
            rename: true,
            delete: true,
            duplicate: true,
            move: false,
          },
        }),
      ),
    ).toBe(true);
  });

  it('hides when showInWorkspace capability is false', () => {
    expect(
      shouldOfferShowInWorkspace(
        base({
          capabilities: {
            open: true,
            showInWorkspace: false,
            rename: false,
            delete: false,
            duplicate: false,
            move: false,
          },
          showInWorkspaceAction: { type: 'unavailable' },
        }),
      ),
    ).toBe(false);
  });
});
