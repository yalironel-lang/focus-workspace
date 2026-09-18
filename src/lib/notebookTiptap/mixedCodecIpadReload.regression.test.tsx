/**
 * REGRESSION — mixed legacy + V1 cloud shape (hosted QA object
 * ps-notebook-1788861553809-6rczr structure).
 *
 * Guards: fresh-mount must not WorkspaceSurfaceErrorBoundary when device-local
 * activePageId restores a V1 page after hydrate projects legacy page-1.
 *
 * Invariant: pageKey + body + codecVersion travel together at every parse boundary.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { WorkspaceSurfaceErrorBoundary } from '../../components/common/WorkspaceSurfaceErrorBoundary';
import {
  serializeNotebookBlocks,
  hasVersionedNotebookRecord,
  parseNotebookBody,
} from '../notebookDialect';
import { hydrateNotebookPages } from '../notebookPages/hydrate';
import { prepareNotebookForCloudPersist } from '../notebookPages/persist';
import {
  saveNotebookActivePage,
  clearNotebookActivePage,
} from '../notebookPages/notebookActivePage';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import * as notebookDialect from '../notebookDialect';

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

const tokens = {
  cardBorder: '#333',
  cardBg: '#111',
  wellBg: '#222',
  textPrimary: '#fff',
  textSecondary: '#ccc',
  textMuted: '#999',
  textGhost: '#666',
  accent: '#f59e0b',
  accentGlow: 'rgba(245,158,11,0.35)',
} as AtmosphereTokens;

const SECTION_ID = 'sec-calc-2';
const BOARD_ID = 'main';
const OBJECT_ID = 'ps-notebook-1788861553809-6rczr';
const SEC_NOTES = 'sec-notes';
const PAGE1_LEGACY = 'Page 1 legacy notes for calculus';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

type ParseCallMeta = {
  codec: number | undefined;
  isVersioned: boolean;
  bodyLen: number;
  threw: boolean;
  error?: string;
};

function metaBody(
  body: string,
  codec: number | undefined,
  threw: boolean,
  error?: string,
): ParseCallMeta {
  return {
    codec,
    isVersioned: hasVersionedNotebookRecord(body),
    bodyLen: body.length,
    threw,
    ...(error ? { error } : {}),
  };
}

/** Structural cloud shape from hosted QA evidence. */
function buildCloudShapedNotebook(): NotebookContent {
  const page3Body = serializeNotebookBlocks(
    [{ kind: 'paragraph', text: 'Ipad test 123' }],
    1,
  );

  const withNav: NotebookContent = {
    type: 'notebook',
    schemaVersion: 1,
    title: 'Calc notebook',
    notebookMode: 'normal',
    paperStyle: 'ruled',
    notebookSurface: 'spatial',
    activeSectionId: SEC_NOTES,
    activePageId: 'page-3',
    body: page3Body,
    bodyCodecVersion: 1,
    sections: [
      {
        id: SEC_NOTES,
        title: 'Notes',
        pageIds: ['page-1', 'page-2', 'page-3', 'page-4', 'page-5'],
      },
    ],
    pages: [
      {
        id: 'page-1',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Page 1',
        documentBody: PAGE1_LEGACY,
      },
      {
        id: 'page-2',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Page 2',
        documentBody: 'Page 2 more legacy material',
      },
      {
        id: 'page-3',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Page 3',
        documentBody: page3Body,
        documentBodyCodecVersion: 1,
      },
      {
        id: 'page-4',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Page 4',
        documentBody: 'Page 4 legacy scratch',
      },
      {
        id: 'page-5',
        sectionId: SEC_NOTES,
        kind: 'document',
        title: 'Page 5',
        documentBody: 'Page 5 legacy review',
      },
    ],
  };

  const cloud = prepareNotebookForCloudPersist(withNav, 'page-3') as NotebookContent;
  delete (cloud as { activePageId?: string }).activePageId;
  delete (cloud as { activeSectionId?: string }).activeSectionId;
  return cloud;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const parseCalls: ParseCallMeta[] = [];
let realParseNotebookBody: typeof parseNotebookBody;
let onChangeSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  parseCalls.length = 0;
  onChangeSpy = vi.fn();
  clearNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID);
  const actual = await vi.importActual<typeof notebookDialect>('../notebookDialect');
  realParseNotebookBody = actual.parseNotebookBody;
  vi.spyOn(notebookDialect, 'parseNotebookBody').mockImplementation((body, codec) => {
    try {
      const out = realParseNotebookBody(body, codec);
      parseCalls.push(metaBody(body, codec, false));
      return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      parseCalls.push(metaBody(body, codec, true, msg));
      throw e;
    }
  });
});

afterEach(() => {
  try {
    act(() => root?.unmount());
  } catch {
    /* boundary may already be in error state */
  }
  host?.remove();
  root = null;
  host = null;
  clearNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID);
  vi.restoreAllMocks();
  document.querySelectorAll('[data-nb-candidate-selection-toolbar]').forEach(el => el.remove());
});

function mountNotebook(content: NotebookContent, onChange = onChangeSpy) {
  host = document.createElement('div');
  host.style.width = '720px';
  host.style.height = '640px';
  document.body.appendChild(host);
  root = createRoot(host);
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  act(() => {
    root!.render(
      createElement(
        WorkspaceSurfaceErrorBoundary,
        { tokens, label: 'Notebook' },
        createElement(ProjectNotebookBlock, {
          content,
          tokens,
          onChange,
          context: 'free-space',
          presentation: 'embedded',
          objectId: OBJECT_ID,
          objectTitle: 'Calc notebook',
          freeSpaceSectionId: SECTION_ID,
          freeSpaceBoardId: BOARD_ID,
        }),
      ),
    );
  });
  return spy;
}

async function flushMount() {
  await act(async () => {
    await new Promise<void>(r => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  });
}

function mountResult() {
  const text = host?.textContent ?? '';
  return {
    unavailable: text.includes('Notebook is unavailable'),
    tipTapLoadError: !!host?.querySelector('[data-nb-candidate-load-error="1"]'),
    hasPM: !!host?.querySelector('.ProseMirror'),
    pmHasIpad: (host?.querySelector('.ProseMirror')?.textContent ?? '').includes(
      'Ipad test 123',
    ),
    pmHasPage1Legacy: (host?.querySelector('.ProseMirror')?.textContent ?? '').includes(
      'Page 1 legacy',
    ),
    threwParses: parseCalls.filter(c => c.threw),
    parseCalls: [...parseCalls],
  };
}

describe('REGRESSION mixed-codec iPad reload (body+codec snapshot)', () => {
  it('cloud fixture matches QA structural evidence', () => {
    const cloud = buildCloudShapedNotebook();
    expect(cloud.activePageId).toBeUndefined();
    expect(cloud.bodyCodecVersion).toBe(1);
    expect(hasVersionedNotebookRecord(cloud.body ?? '')).toBe(true);
    expect(cloud.sections?.[0]?.id).toBe(SEC_NOTES);
    expect(cloud.sections?.[0]?.pageIds?.[0]).toBe('page-1');
    const p1 = cloud.pages?.find(p => p.id === 'page-1');
    const p3 = cloud.pages?.find(p => p.id === 'page-3');
    expect(p1 && p1.kind === 'document' ? p1.documentBodyCodecVersion : 1).toBeUndefined();
    expect(
      hasVersionedNotebookRecord(p1 && p1.kind === 'document' ? p1.documentBody ?? '' : ''),
    ).toBe(false);
    expect(p3 && p3.kind === 'document' ? p3.documentBodyCodecVersion : null).toBe(1);
    expect(
      hasVersionedNotebookRecord(p3 && p3.kind === 'document' ? p3.documentBody ?? '' : ''),
    ).toBe(true);
    expect(
      p3 && p3.kind === 'document' ? (p3.documentBody ?? '').includes('Ipad test 123') : false,
    ).toBe(true);
  });

  it('hydrate with cloud activePageId null projects first (legacy) page without migrating it', () => {
    const cloud = buildCloudShapedNotebook();
    const hydrated = hydrateNotebookPages(cloud);
    const p1 = hydrated.pages?.find(p => p.id === 'page-1');
    expect(hydrated.sections?.[0]?.pageIds?.[0]).toBe('page-1');
    expect(hasVersionedNotebookRecord(hydrated.body ?? '')).toBe(false);
    expect(hydrated.bodyCodecVersion).toBeUndefined();
    expect(p1 && p1.kind === 'document' ? p1.documentBody : '').toBe(PAGE1_LEGACY);
    expect(p1 && p1.kind === 'document' ? p1.documentBodyCodecVersion : 1).toBeUndefined();
    const p3 = hydrated.pages?.find(p => p.id === 'page-3');
    expect(p3 && p3.kind === 'document' ? p3.documentBodyCodecVersion : null).toBe(1);
    expect(hasVersionedNotebookRecord(p3 && p3.kind === 'document' ? p3.documentBody ?? '' : '')).toBe(
      true,
    );
  });

  describe.each([
    { name: 'A_no_local_active', localPage: null as string | null, expectIpad: false, expectLegacy: true },
    { name: 'B_local_page_1', localPage: 'page-1', expectIpad: false, expectLegacy: true },
    { name: 'C_local_page_3', localPage: 'page-3', expectIpad: true, expectLegacy: false },
    { name: 'D_stale_local_page', localPage: 'page-does-not-exist', expectIpad: false, expectLegacy: true },
  ])('$name', ({ name, localPage, expectIpad, expectLegacy }) => {
    it(`fresh-mount does not hit WorkspaceSurfaceErrorBoundary (${name})`, async () => {
      const cloud = buildCloudShapedNotebook();
      const content = ensureProjectObjectContent('notebook', cloud) as NotebookContent;

      if (localPage) {
        saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, localPage);
      } else {
        clearNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID);
      }

      const spy = mountNotebook(content);
      await flushMount();
      await flushMount();

      const result = mountResult();
      expect(result.unavailable).toBe(false);
      expect(result.threwParses).toEqual([]);
      expect(result.hasPM || result.tipTapLoadError).toBe(true);

      if (expectIpad) {
        expect(result.pmHasIpad).toBe(true);
      }
      if (expectLegacy && result.hasPM) {
        expect(result.pmHasPage1Legacy).toBe(true);
      }

      spy.mockRestore();
    });
  });

  it('zero-write hydration: mount + local Page 3 restore does not persist via onChange', async () => {
    const cloud = buildCloudShapedNotebook();
    const content = ensureProjectObjectContent('notebook', cloud) as NotebookContent;
    saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, 'page-3');
    const spy = mountNotebook(content);
    await flushMount();
    await flushMount();
    expect(mountResult().unavailable).toBe(false);
    expect(onChangeSpy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('legacy page-1 is not auto-upgraded to V1 merely by mounting Page 3', async () => {
    const cloud = buildCloudShapedNotebook();
    const content = ensureProjectObjectContent('notebook', cloud) as NotebookContent;
    const page1Before = content.pages?.find(p => p.id === 'page-1');
    saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, 'page-3');
    const spy = mountNotebook(content);
    await flushMount();
    await flushMount();
    expect(mountResult().unavailable).toBe(false);
    expect(onChangeSpy).not.toHaveBeenCalled();
    const page1After = content.pages?.find(p => p.id === 'page-1');
    expect(page1After && page1After.kind === 'document' ? page1After.documentBody : null).toBe(
      page1Before && page1Before.kind === 'document' ? page1Before.documentBody : null,
    );
    expect(
      page1After && page1After.kind === 'document' ? page1After.documentBodyCodecVersion : 1,
    ).toBeUndefined();
    expect(
      hasVersionedNotebookRecord(
        page1After && page1After.kind === 'document' ? page1After.documentBody ?? '' : '',
      ),
    ).toBe(false);
    spy.mockRestore();
  });

  it('RAW cloud + local page-3 mounts without boundary', async () => {
    const cloud = buildCloudShapedNotebook();
    saveNotebookActivePage(SECTION_ID, BOARD_ID, OBJECT_ID, SEC_NOTES, 'page-3');
    const spy = mountNotebook(cloud);
    await flushMount();
    await flushMount();
    const result = mountResult();
    expect(result.unavailable).toBe(false);
    expect(result.threwParses).toEqual([]);
    expect(result.pmHasIpad).toBe(true);
    spy.mockRestore();
  });

  it('MISMATCH control: legacy body + codec 1 still fails closed', () => {
    expect(() => realParseNotebookBody(PAGE1_LEGACY, 1)).toThrow(
      /Invalid versioned Notebook text record/,
    );
  });

  it('stale body snapshot must never be parsed with a newer page codec (invariant)', () => {
    const cloud = buildCloudShapedNotebook();
    const ensured = ensureProjectObjectContent('notebook', cloud) as NotebookContent;
    const page3 = ensured.pages?.find(p => p.id === 'page-3');
    const page3Body =
      page3 && page3.kind === 'document' ? (page3.documentBody ?? '') : '';
    // Same synthetic pairing the pre-fix setBlocks effect produced:
    expect(() => realParseNotebookBody(ensured.body ?? '', 1)).toThrow(
      /Invalid versioned Notebook text record/,
    );
    // Correct pair for Page 3 remains valid:
    expect(() => realParseNotebookBody(page3Body, 1)).not.toThrow();
  });

  it('genuine malformed V1 still fails closed', () => {
    expect(() => realParseNotebookBody('~nb1:not-valid-json', 1)).toThrow();
  });
});
