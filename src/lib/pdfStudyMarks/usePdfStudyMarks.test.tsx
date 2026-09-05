/**
 * usePdfStudyMarks — stroke CRUD isolation + leave/remount restore.
 *
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePdfStudyMarks } from './usePdfStudyMarks';
import { loadPdfStudyMarks, savePdfStudyMarks } from './pdfStudyMarksIdb';
import { PDF_STUDY_MARKS_VERSION } from './types';
import { resetSaveStatusForTests } from '../saveStatus';

type Api = ReturnType<typeof usePdfStudyMarks>;

function Harness({
  sectionId,
  objectId,
  page,
  enabled,
  box,
}: {
  sectionId: string;
  objectId: string;
  page: number;
  enabled: boolean;
  box: { current: Api | null };
}) {
  const api = usePdfStudyMarks({
    sectionId,
    objectId,
    page,
    enabled,
    onJumpToPage: () => {},
  });
  box.current = api;
  return null;
}

describe('usePdfStudyMarks ink API', () => {
  let host: HTMLDivElement;
  let root: Root;
  const sectionId = 'sec-hook-ink';
  const objectId = 'obj-hook-ink';

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetSaveStatusForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function mount(page = 1, oid = objectId) {
    const box: { current: Api | null } = { current: null };
    await act(async () => {
      root.render(
        createElement(Harness, {
          sectionId,
          objectId: oid,
          page,
          enabled: true,
          box,
        }),
      );
    });
    for (let i = 0; i < 50 && !box.current?.loaded; i++) {
      await act(async () => {
        await new Promise(r => setTimeout(r, 5));
      });
    }
    expect(box.current?.loaded).toBe(true);
    return box;
  }

  it('5. per-page strokes remain isolated', async () => {
    const box = await mount(1, `${objectId}-iso`);
    await act(async () => {
      box.current!.addStroke(1, {
        color: '#000',
        width: 2,
        points: [{ x: 0.1, y: 0.1 }],
      });
      box.current!.addStroke(2, {
        color: '#000',
        width: 2,
        points: [{ x: 0.8, y: 0.8 }],
      });
    });
    expect(box.current!.strokesForPage(1)).toHaveLength(1);
    expect(box.current!.strokesForPage(2)).toHaveLength(1);
    expect(box.current!.strokesForPage(1)[0]!.points[0]!.x).toBeCloseTo(0.1);
    expect(box.current!.strokesForPage(3)).toHaveLength(0);
  });

  it('11. clearPageInk only affects intended page', async () => {
    const box = await mount(1, `${objectId}-clear`);
    await act(async () => {
      box.current!.addStroke(1, { color: '#000', width: 2, points: [{ x: 0.2, y: 0.2 }] });
      box.current!.addStroke(2, { color: '#000', width: 2, points: [{ x: 0.3, y: 0.3 }] });
      box.current!.addRegion(1, { x: 0.1, y: 0.1, w: 0.2, h: 0.05 });
      box.current!.clearPageInk(1);
    });
    expect(box.current!.strokesForPage(1)).toHaveLength(0);
    expect(box.current!.strokesForPage(2)).toHaveLength(1);
    expect(box.current!.regionsForPage(1)).toHaveLength(1);
  });

  it('8. leave/remount restores strokes from IDB', async () => {
    await savePdfStudyMarks(sectionId, objectId, {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [2],
      pages: {
        '2': {
          regions: [],
          strokes: [
            {
              id: 'seed',
              color: '#1a1a1a',
              width: 2.5,
              points: [{ x: 0.44, y: 0.66 }],
            },
          ],
        },
      },
    });

    const box = await mount(2);
    expect(box.current!.strokesForPage(2)).toHaveLength(1);
    expect(box.current!.strokesForPage(2)[0]!.id).toBe('seed');
    expect(box.current!.markedPages).toEqual([2]);

    await act(async () => {
      box.current!.flushSave();
    });
    const reloaded = await loadPdfStudyMarks(sectionId, objectId);
    expect(reloaded.pages['2']!.strokes![0]!.points[0]).toEqual({ x: 0.44, y: 0.66 });
  });

  it('12. existing highlights/bookmarks remain intact when adding ink', async () => {
    await savePdfStudyMarks(sectionId, `${objectId}-hl`, {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [1],
      pages: {
        '1': {
          regions: [{ id: 'hr-old', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }],
        },
      },
    });
    const box = await mount(1, `${objectId}-hl`);
    await act(async () => {
      box.current!.addStroke(1, { color: '#000', width: 2, points: [{ x: 0.5, y: 0.5 }] });
    });
    expect(box.current!.regionsForPage(1)).toHaveLength(1);
    expect(box.current!.markedPages).toContain(1);
    expect(box.current!.strokesForPage(1)).toHaveLength(1);
  });

  it('switching visible page does not hide persisted strokes on other pages', async () => {
    const box = await mount(1, `${objectId}-vis`);
    await act(async () => {
      box.current!.addStroke(1, { color: '#000', width: 2, points: [{ x: 0.1, y: 0.1 }] });
      box.current!.addStroke(2, { color: '#000', width: 2, points: [{ x: 0.2, y: 0.2 }] });
    });
    expect(box.current!.strokesForPage(1)).toHaveLength(1);
    expect(box.current!.strokesForPage(2)).toHaveLength(1);
  });
});
