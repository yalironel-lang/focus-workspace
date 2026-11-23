/**
 * REGRESSION SUITE: Incident NBI-01 — Cross-page Codec Collision & Table Serialization
 *
 * Verifies that:
 * 1. Outgoing page blocks are never serialized using an incoming page's codec.
 * 2. V1 pages with tables switch cleanly to and from legacy/unversioned pages.
 * 3. Rapid and repeated page navigation does not trigger WorkspaceSurfaceErrorBoundary.
 * 4. Device-local active page restore on reload (both legacy and V1) is safe and zero-write.
 * 5. Multi-page documents with tables, math, and text retain their exact content without data loss.
 *
 * @vitest-environment happy-dom
 */

import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { WorkspaceSurfaceErrorBoundary } from '../../components/common/WorkspaceSurfaceErrorBoundary';
import {
  serializeNotebookBlocks,
  parseNotebookBody,
  type NotebookDialectBlock,
} from '../notebookDialect';
import {
  saveNotebookActivePage,
  loadNotebookActivePage,
  clearNotebookActivePage,
} from '../notebookPages/notebookActivePage';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

const { ProjectNotebookBlock } = await import(
  '../../components/project-space/ProjectNotebookBlock'
);
const { FreeSpaceNotebookSurface } = await import(
  '../../components/notebook/FreeSpaceNotebookSurface'
);

const tokens: AtmosphereTokens = {
  cardBorder: '#333333',
  cardBg: '#111111',
  wellBg: '#222222',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#999999',
  textGhost: '#666666',
  accent: '#f59e0b',
  accentGlow: 'rgba(245,158,11,0.35)',
};

const SECTION_ID = 'sec-test-nbi01';
const BOARD_ID = 'board-test-nbi01';
const OBJECT_ID = 'ps-notebook-nbi01-test';
const SEC_NOTES = 'sec-notes';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

/**
 * Creates a synthetic multi-page notebook containing:
 * - Page 1: V1 document with a table, callout, and title (documentBodyCodecVersion: 1)
 * - Page 2: Empty unversioned page (documentBody: "", documentBodyCodecVersion: undefined)
 * - Page 3: Legacy plain text document with math (documentBodyCodecVersion: undefined)
 */
function createSyntheticMixedNotebook(): { object: ProjectSpaceObject; content: NotebookContent } {
  const tableBlock: NotebookDialectBlock = {
    id: 'tbl-1',
    kind: 'table',
    text: '',
    rows: [
      [{ t: 'Synthetic Header A' }, { t: 'Synthetic Header B' }],
      [{ t: 'Row 1 Cell A' }, { t: 'Row 1 Cell B' }],
    ],
  };

  const page1Blocks: NotebookDialectBlock[] = [
    { id: 't-1', kind: 'title', text: 'V1 Table Page' },
    { id: 'c-1', kind: 'callout', text: 'Important note on V1 tables', tone: 'concept' },
    tableBlock,
    { id: 'p-1', kind: 'paragraph', text: 'Trailing paragraph after table' },
  ];

  const page1Body = serializeNotebookBlocks(page1Blocks, 1);
  const page2Body = '';
  const page3Body = 'Legacy Title\n$$ \\int_0^1 x^2 dx = \\frac{1}{3}\nParagraph with legacy content';

  const content: NotebookContent = {
    type: 'notebook',
    schemaVersion: 1,
    title: 'Synthetic NBI-01 Test Notebook',
    notebookMode: 'normal',
    paperStyle: 'ruled',
    notebookSurface: 'spatial',
    activeSectionId: SEC_NOTES,
    activePageId: 'page-1',
    body: page1Body,
    bodyCodecVersion: 1,
    sections: [
      {
        id: SEC_NOTES,
        title: 'Notes Section',
        pageIds: ['page-1', 'page-2', 'page-3'],
      },
    ],
    pages: [
      {
        id: 'page-1',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Table Page',
        documentBody: page1Body,
        documentBodyCodecVersion: 1,
      },
      {
        id: 'page-2',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Empty Page',
        documentBody: page2Body,
      },
      {
        id: 'page-3',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Legacy Math Page',
        documentBody: page3Body,
      },
    ],
  };

  const object: ProjectSpaceObject = {
    id: OBJECT_ID,
    type: 'notebook',
    title: 'Synthetic NBI-01 Test Notebook',
    sectionId: SECTION_ID,
    boardId: BOARD_ID,
    content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { object, content };
}

describe('Incident NBI-01: Cross-Page Codec Collision & Table Serialization', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let onChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChangeSpy = vi.fn();
    clearNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID);
    host = document.createElement('div');
    host.style.width = '800px';
    host.style.height = '600px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    try {
      act(() => {
        root?.unmount();
      });
    } catch {
      /* ignore unmount error */
    }
    host?.remove();
    root = null;
    host = null;
    clearNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID);
    vi.restoreAllMocks();
  });

  function renderSurface(content: NotebookContent, object: ProjectSpaceObject) {
    act(() => {
      root!.render(
        createElement(
          WorkspaceSurfaceErrorBoundary,
          { tokens, label: 'Notebook' },
          createElement(FreeSpaceNotebookSurface, {
            content,
            object,
            tokens,
            onChange: onChangeSpy,
            freeSpaceSectionId: SECTION_ID,
            freeSpaceBoardId: BOARD_ID,
          }),
        ),
      );
    });
  }

  it('A & B: V1 table page to legacy empty page and back does not crash', async () => {
    const { object, content } = createSyntheticMixedNotebook();

    // 1. Mount on Page 1 (V1 table page)
    renderSurface(content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    expect(host?.textContent).not.toContain('Notebook is unavailable');
    expect(host?.textContent).toContain('V1 Table Page');
    expect(host?.textContent).toContain('Synthetic Header A');

    // 2. Switch to Page 2 (Empty unversioned page)
    const page2Content: NotebookContent = {
      ...content,
      activePageId: 'page-2',
      body: '',
      bodyCodecVersion: undefined,
    };
    renderSurface(page2Content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    expect(host?.textContent).not.toContain('Notebook is unavailable');
    expect(host?.textContent).not.toContain('Synthetic Header A');

    // 3. Switch back to Page 1 (V1 table page)
    renderSurface(content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    expect(host?.textContent).not.toContain('Notebook is unavailable');
    expect(host?.textContent).toContain('V1 Table Page');
    expect(host?.textContent).toContain('Synthetic Header A');
    expect(host?.textContent).toContain('Row 1 Cell B');
  });

  it('C: Repeated rapid switching between mixed-codec pages retains state and avoids error boundary', async () => {
    const { object, content } = createSyntheticMixedNotebook();

    renderSurface(content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    for (let i = 0; i < 5; i++) {
      // Switch to Page 2 (unversioned empty)
      renderSurface({ ...content, activePageId: 'page-2', body: '', bodyCodecVersion: undefined }, object);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(host?.textContent).not.toContain('Notebook is unavailable');

      // Switch to Page 3 (legacy math)
      renderSurface({
        ...content,
        activePageId: 'page-3',
        body: content.pages[2].documentBody,
        bodyCodecVersion: undefined,
      }, object);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(host?.textContent).not.toContain('Notebook is unavailable');

      // Switch to Page 1 (V1 table)
      renderSurface(content, object);
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });
      expect(host?.textContent).not.toContain('Notebook is unavailable');
      expect(host?.textContent).toContain('Synthetic Header A');
    }
  });

  async function flushAsync() {
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 60));
    });
    await act(async () => {
      await new Promise<void>(r => requestAnimationFrame(() => r()));
    });
    await act(async () => {
      await new Promise<void>(r => setTimeout(r, 60));
    });
  }

  it('D: Reload with legacy page in device-local navigation state restores cleanly', async () => {
    const { object, content } = createSyntheticMixedNotebook();

    // Cloud payload omits activePageId / activeSectionId; projects Page 1 (table, V1)
    const cloudContent: NotebookContent = {
      ...content,
      body: content.pages[0].documentBody,
      bodyCodecVersion: 1,
    };
    delete (cloudContent as { activePageId?: string }).activePageId;
    delete (cloudContent as { activeSectionId?: string }).activeSectionId;
    const cloudObject: ProjectSpaceObject = { ...object, content: cloudContent };

    // Pre-seed localStorage with Page 2 (unversioned empty page)
    saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, 'page-2');

    renderSurface(cloudContent, cloudObject);
    await flushAsync();
    await flushAsync();

    // Must NOT hit WorkspaceSurfaceErrorBoundary
    expect(host?.textContent).not.toContain('Notebook is unavailable');
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('E: Reload with V1 table page in device-local navigation state restores cleanly', async () => {
    const { object, content } = createSyntheticMixedNotebook();

    // Cloud payload omits activePageId / activeSectionId; projects Page 2 (unversioned empty)
    const cloudContent: NotebookContent = {
      ...content,
      body: '',
      bodyCodecVersion: undefined,
    };
    delete (cloudContent as { activePageId?: string }).activePageId;
    delete (cloudContent as { activeSectionId?: string }).activeSectionId;
    const cloudObject: ProjectSpaceObject = { ...object, content: cloudContent };

    // Pre-seed localStorage with Page 1 (table, V1)
    saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, 'page-1');

    renderSurface(cloudContent, cloudObject);
    await flushAsync();
    await flushAsync();

    expect(host?.textContent).not.toContain('Notebook is unavailable');
    expect(host?.textContent).toContain('Synthetic Header A');
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('F & I: Serialization and deserialization preserves table and math content across codecs', () => {
    const { content } = createSyntheticMixedNotebook();

    // Page 1 (V1) decodes with codec 1
    const decodedP1 = parseNotebookBody(content.pages[0].documentBody, 1);
    expect(decodedP1.some(b => b.kind === 'table')).toBe(true);

    const reEncodedP1 = serializeNotebookBlocks(decodedP1, 1);
    expect(reEncodedP1).toBe(content.pages[0].documentBody);

    // Page 3 (Legacy) decodes with undefined codec
    const decodedP3 = parseNotebookBody(content.pages[2].documentBody, undefined);
    expect(decodedP3.some(b => b.kind === 'math')).toBe(true);

    const reEncodedP3 = serializeNotebookBlocks(decodedP3, undefined);
    expect(reEncodedP3).toContain('\\int_0^1 x^2 dx');
  });

  it('H: No unintended writes (onChange) are triggered simply by mounting or navigating', async () => {
    const { object, content } = createSyntheticMixedNotebook();

    renderSurface(content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });
    expect(onChangeSpy).not.toHaveBeenCalled();

    renderSurface({ ...content, activePageId: 'page-2', body: '', bodyCodecVersion: undefined }, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });
    expect(onChangeSpy).not.toHaveBeenCalled();

    renderSurface(content, object);
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('G: Independent page edits preserve per-page codecs and avoid cross-contamination', async () => {
    const { content } = createSyntheticMixedNotebook();
    const { applyPageKeyedUserEdit, switchNotebookPage } = await import('../notebookPages');

    // 1. Edit Page 1 (append a row to the table while keeping codec 1)
    const p1Blocks = parseNotebookBody(content.pages[0].documentBody, 1);
    const updatedP1Body = serializeNotebookBlocks([
      ...p1Blocks,
      { id: 'p-new', kind: 'paragraph', text: 'Newly appended note on Page 1' },
    ], 1);

    let current = applyPageKeyedUserEdit(content, {
      pageKey: 'page-1',
      body: updatedP1Body,
      codecVersion: 1,
    });

    const page1After = current.pages.find(p => p.id === 'page-1');
    expect(page1After?.documentBody).toBe(updatedP1Body);
    expect(page1After?.documentBodyCodecVersion).toBe(1);

    // 2. Switch to Page 2 (unversioned) and edit it
    current = switchNotebookPage(current, 'page-2', updatedP1Body, 1);
    const updatedP2Body = 'First line on Page 2\nSecond line on Page 2';
    current = applyPageKeyedUserEdit(current, {
      pageKey: 'page-2',
      body: updatedP2Body,
      codecVersion: undefined,
    });

    const page2After = current.pages.find(p => p.id === 'page-2');
    expect(page2After?.documentBody).toBe(updatedP2Body);
    expect(page2After?.documentBodyCodecVersion).toBeUndefined();

    // 3. Switch back to Page 1: Page 1 must still have V1 codec, table, and new note
    current = switchNotebookPage(current, 'page-1', updatedP2Body, undefined);
    const page1Final = current.pages.find(p => p.id === 'page-1');
    expect(page1Final?.documentBody).toBe(updatedP1Body);
    expect(page1Final?.documentBodyCodecVersion).toBe(1);
    expect(page1Final?.documentBody).toContain('Synthetic Header A');
    expect(page1Final?.documentBody).toContain('Newly appended note on Page 1');

    // Page 2 must still have unversioned codec and distinct text
    const page2Final = current.pages.find(p => p.id === 'page-2');
    expect(page2Final?.documentBody).toBe(updatedP2Body);
    expect(page2Final?.documentBodyCodecVersion).toBeUndefined();
  });
});
