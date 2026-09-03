import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionControlEverything } from '../../components/mission-control/MissionControlEverything';
import { shouldOfferShowInWorkspace } from './shouldOfferShowInWorkspace';
import type { MissionControlItem } from './types';

function makeItem(
  overrides: Partial<MissionControlItem> & Pick<MissionControlItem, 'id' | 'title' | 'category'>,
): MissionControlItem {
  return {
    source: 'freespace',
    sourceId: overrides.id,
    sectionId: 's1',
    sourceKind: { source: 'freespace', type: 'notebook' },
    subtitle: null,
    createdAt: 1,
    updatedAt: 2,
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
    openAction: { type: 'freespace-focus', objectId: overrides.id, boardId: 'main' },
    showInWorkspaceAction: { type: 'freespace-focus', objectId: overrides.id, boardId: 'main' },
    availability: { metadata: 'available', content: 'unknown' },
    ...overrides,
  };
}

describe('MissionControlEverything', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  const items: MissionControlItem[] = [
    makeItem({ id: 'n1', title: 'Lecture Notes', category: 'notebook' }),
    makeItem({
      id: 'p1',
      title: 'Slides PDF',
      category: 'pdf',
      sourceKind: { source: 'freespace', type: 'pdf' },
      openAction: { type: 'freespace-focus', objectId: 'p1', boardId: 'main' },
      showInWorkspaceAction: { type: 'freespace-focus', objectId: 'p1', boardId: 'main' },
    }),
    makeItem({
      id: 'l1',
      title: 'Wikipedia',
      category: 'link',
      sourceKind: { source: 'freespace', type: 'link' },
      openAction: { type: 'external-url', url: 'https://en.wikipedia.org' },
      showInWorkspaceAction: { type: 'freespace-focus', objectId: 'l1', boardId: 'main' },
    }),
    makeItem({
      id: 'sf1',
      title: 'Study file',
      category: 'other',
      sourceKind: { source: 'freespace', type: 'studyfile' },
      capabilities: {
        open: false,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: true,
        move: false,
      },
      openAction: { type: 'unavailable' },
      showInWorkspaceAction: { type: 'unavailable' },
    }),
    makeItem({
      id: 'shelf1',
      title: 'Shelf handout',
      category: 'pdf',
      source: 'shelf-item',
      sourceKind: { source: 'shelf-item', type: 'file' },
      capabilities: {
        open: true,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: false,
        move: false,
      },
      openAction: { type: 'shelf-file', itemId: 'shelf1', filePath: 'u/s/g/f.pdf' },
      showInWorkspaceAction: { type: 'unavailable' },
    }),
  ];

  it('renders Phase 1 items and section setup slot', () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Algebra"
          items={items}
          completeness="complete"
          status="ready"
          onOpenItem={onOpen}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
          setupSlot={<div data-testid="mc-section-setup">setup</div>}
        />,
      );
    });
    expect(host.querySelector('[data-testid="mc-everything"]')).toBeTruthy();
    expect(host.textContent).toContain('Lecture Notes');
    expect(host.textContent).toContain('Slides PDF');
    expect(host.querySelector('[data-testid="mc-section-setup"]')).toBeTruthy();
    expect(host.textContent).not.toContain('Do next');
    expect(host.textContent).not.toContain('Next');
  });

  it('filters by category chip', () => {
    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Algebra"
          items={items}
          completeness="complete"
          status="ready"
          onOpenItem={vi.fn()}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });
    act(() => {
      (host.querySelector('[data-testid="mc-filter-pdf"]') as HTMLButtonElement).click();
    });
    expect(host.textContent).toContain('Slides PDF');
    expect(host.textContent).toContain('Shelf handout');
    expect(host.textContent).not.toContain('Lecture Notes');
    expect(host.textContent).not.toContain('Wikipedia');
  });

  it('row Open dispatches; unavailable not interactive; Show only when distinct', () => {
    const onOpen = vi.fn();
    const onShow = vi.fn();
    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Algebra"
          items={items}
          completeness="complete"
          status="ready"
          onOpenItem={onOpen}
          onShowInWorkspace={onShow}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });

    expect(shouldOfferShowInWorkspace(items[0]!)).toBe(false);
    expect(shouldOfferShowInWorkspace(items[2]!)).toBe(true);

    const rows = host.querySelectorAll('.mc-row');
    const notesRow = Array.from(rows).find(r => r.textContent?.includes('Lecture Notes'));
    const studyRow = Array.from(rows).find(r => r.textContent?.includes('Study file'));
    const wikiRow = Array.from(rows).find(r => r.textContent?.includes('Wikipedia'));
    const shelfRow = Array.from(rows).find(r => r.textContent?.includes('Shelf handout'));

    expect(notesRow?.getAttribute('data-disabled')).toBeNull();
    expect(studyRow?.getAttribute('data-disabled')).toBe('true');
    expect(notesRow?.querySelector('.mc-row-menu-btn')).toBeNull();
    expect(wikiRow?.querySelector('.mc-row-menu-btn')).toBeTruthy();
    expect(shelfRow?.querySelector('.mc-row-menu-btn')).toBeNull();

    act(() => {
      notesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].title).toBe('Lecture Notes');
    expect(onOpen.mock.calls[0][0].openAction.type).toBe('freespace-focus');

    act(() => {
      shelfRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen.mock.calls[1][0].openAction).toEqual({
      type: 'shelf-file',
      itemId: 'shelf1',
      filePath: 'u/s/g/f.pdf',
    });

    act(() => {
      studyRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(2);

    act(() => {
      wikiRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen.mock.calls[2][0].openAction.type).toBe('external-url');
  });

  it('empty / loading / local-only states', () => {
    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Empty"
          items={[]}
          completeness="loading"
          status="loading"
          onOpenItem={vi.fn()}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });
    expect(host.querySelector('[data-testid="mc-skeleton"]')).toBeTruthy();

    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Empty"
          items={[]}
          completeness="complete"
          status="ready"
          onOpenItem={vi.fn()}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });
    expect(host.querySelector('[data-testid="mc-empty-true"]')).toBeTruthy();
    expect(host.textContent).toContain('Nothing here yet.');
    expect(host.textContent).not.toContain('Shelf');

    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Empty"
          items={[]}
          completeness="local-only"
          status="error"
          onOpenItem={vi.fn()}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });
    expect(host.querySelector('[data-testid="mc-empty-offline"]')).toBeTruthy();

    act(() => {
      root.render(
        <MissionControlEverything
          sectionTitle="Partial"
          items={items}
          completeness="partial"
          status="loading"
          onOpenItem={vi.fn()}
          onShowInWorkspace={vi.fn()}
          onOpenWorkspace={vi.fn()}
        />,
      );
    });
    expect(host.textContent).toContain('Updating…');
  });
});
