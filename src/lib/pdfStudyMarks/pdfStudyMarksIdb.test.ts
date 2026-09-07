// @vitest-environment happy-dom
/**
 * PDF Study Marks + Ink V1 — sanitize, per-page isolation, local IDB authority, saveStatus.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getSaveStatusSnapshot,
  resetSaveStatusForTests,
} from '../saveStatus';
import { deriveSyncUiStatus } from '../sync/deriveSyncUiStatus';
import type { CloudSyncSnapshot } from '../sync/cloudSyncStatus';
import {
  loadPdfStudyMarks,
  sanitizeDoc,
  savePdfStudyMarks,
} from './pdfStudyMarksIdb';
import { emptyPdfStudyMarksDoc, PDF_STUDY_MARKS_VERSION } from './types';

function emptyCloud(): CloudSyncSnapshot {
  return {
    pendingCount: 0,
    pendingOpIds: [],
    flushInFlight: false,
    anyCloudPending: false,
    anyCloudFailure: false,
    lastFailureAt: null,
    lastFailureMessage: null,
  };
}

beforeEach(() => {
  resetSaveStatusForTests();
});

describe('pdfStudyMarks sanitize + normalized ink', () => {
  it('persists normalized coordinates (not CSS pixels)', () => {
    const doc = sanitizeDoc({
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [1],
      pages: {
        '1': {
          regions: [{ id: 'hr-1', x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
          strokes: [
            {
              id: 'is-1',
              color: '#111',
              width: 2.5,
              points: [
                { x: 0.12, y: 0.34, pressure: 0.8 },
                { x: 0.15, y: 0.36 },
              ],
            },
          ],
        },
      },
    });
    const stroke = doc.pages['1']!.strokes![0]!;
    expect(stroke.points[0]).toEqual({ x: 0.12, y: 0.34, pressure: 0.8 });
    expect(stroke.points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
  });

  it('clamps out-of-range points and drops empty strokes', () => {
    const doc = sanitizeDoc({
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [],
      pages: {
        '2': {
          regions: [],
          strokes: [
            { id: 'bad', color: '#000', width: 2, points: [] },
            {
              id: 'ok',
              color: '#000',
              width: 2,
              points: [{ x: -1, y: 2 }, { x: 0.5, y: 0.5 }],
            },
          ],
        },
      },
    });
    expect(doc.pages['2']!.strokes).toHaveLength(1);
    expect(doc.pages['2']!.strokes![0]!.points[0]).toEqual({ x: 0, y: 1 });
  });

  it('keeps highlights/bookmarks intact alongside ink', () => {
    const doc = sanitizeDoc({
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [3, 1],
      pages: {
        '1': {
          regions: [{ id: 'hr-a', x: 0.2, y: 0.2, w: 0.4, h: 0.1 }],
          strokes: [
            { id: 'is-a', color: '#000', width: 2, points: [{ x: 0.5, y: 0.5 }] },
          ],
        },
      },
    });
    expect(doc.markedPages).toEqual([1, 3]);
    expect(doc.pages['1']!.regions).toHaveLength(1);
    expect(doc.pages['1']!.strokes).toHaveLength(1);
  });

  it('isolates strokes per page', () => {
    const doc = sanitizeDoc({
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [],
      pages: {
        '1': {
          regions: [],
          strokes: [{ id: 'p1', color: '#000', width: 2, points: [{ x: 0.1, y: 0.1 }] }],
        },
        '2': {
          regions: [],
          strokes: [{ id: 'p2', color: '#000', width: 2, points: [{ x: 0.9, y: 0.9 }] }],
        },
      },
    });
    expect(doc.pages['1']!.strokes![0]!.id).toBe('p1');
    expect(doc.pages['2']!.strokes![0]!.id).toBe('p2');
    expect(doc.pages['1']!.strokes).toHaveLength(1);
    expect(doc.pages['2']!.strokes).toHaveLength(1);
  });

  it('rejects wrong version', () => {
    expect(sanitizeDoc({ version: 99, markedPages: [1], pages: {} })).toEqual(
      emptyPdfStudyMarksDoc(),
    );
  });
});

describe('pdfStudyMarks IDB persistence (local-authoritative)', () => {
  const sectionId = 'sec-pdf-ink';
  const objectId = 'ps-pdf-ink-1';

  it('round-trips strokes and restores after "remount" load', async () => {
    const doc = {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [1],
      pages: {
        '1': {
          regions: [{ id: 'hr-1', x: 0.1, y: 0.1, w: 0.2, h: 0.05 }],
          strokes: [
            {
              id: 'is-dot',
              color: '#1a1a1a',
              width: 2.5,
              points: [{ x: 0.42, y: 0.55 }],
            },
          ],
        },
        '2': {
          regions: [],
          strokes: [
            {
              id: 'is-line',
              color: '#1a1a1a',
              width: 2.5,
              points: [
                { x: 0.05, y: 0.05 },
                { x: 0.95, y: 0.95 },
              ],
            },
          ],
        },
      },
    } as const;

    await savePdfStudyMarks(sectionId, objectId, doc);
    const loaded = await loadPdfStudyMarks(sectionId, objectId);
    expect(loaded.pages['1']!.strokes![0]!.points).toEqual([{ x: 0.42, y: 0.55 }]);
    expect(loaded.pages['2']!.strokes![0]!.id).toBe('is-line');
    expect(loaded.pages['1']!.regions).toHaveLength(1);
    expect(loaded.markedPages).toEqual([1]);
  });

  it('clearing page ink does not remove highlights on that page', async () => {
    await savePdfStudyMarks(sectionId, `${objectId}-clear`, {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [],
      pages: {
        '1': {
          regions: [{ id: 'hr-keep', x: 0.2, y: 0.2, w: 0.3, h: 0.1 }],
          strokes: [
            { id: 'is-gone', color: '#000', width: 2, points: [{ x: 0.5, y: 0.5 }] },
          ],
        },
      },
    });
    const before = await loadPdfStudyMarks(sectionId, `${objectId}-clear`);
    const layer = before.pages['1']!;
    await savePdfStudyMarks(sectionId, `${objectId}-clear`, {
      ...before,
      pages: {
        '1': { regions: layer.regions },
      },
    });
    const after = await loadPdfStudyMarks(sectionId, `${objectId}-clear`);
    expect(after.pages['1']!.regions).toHaveLength(1);
    expect(after.pages['1']!.strokes).toBeUndefined();
  });

  it('save success uses pdfStudyMarks channel (not pdfBlob cache semantics)', async () => {
    await savePdfStudyMarks(sectionId, `${objectId}-ok`, emptyPdfStudyMarksDoc());
    const snap = getSaveStatusSnapshot();
    expect(snap.channels.pdfStudyMarks.lastError).toBeNull();
    expect(snap.anyError).toBe(false);
    const ui = deriveSyncUiStatus(snap, { online: true, cloud: emptyCloud() });
    expect(ui.label).not.toBe('Save failed');
  });
});
