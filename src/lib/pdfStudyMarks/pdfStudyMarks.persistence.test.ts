/**
 * PDF study marks stay a sidecar. Hiding the QA overlay must not change them.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { deletePdfStudyMarks, loadPdfStudyMarks, savePdfStudyMarks } from './pdfStudyMarksIdb';
import { emptyPdfStudyMarksDoc, PDF_STUDY_MARKS_VERSION } from './types';

const sectionId = 'sec-marks';
const objectId = 'pdf-marks';

afterEach(async () => {
  await deletePdfStudyMarks(sectionId, objectId);
});

describe('PDF study mark persistence', () => {
  it('round-trips marked pages and highlight regions', async () => {
    await savePdfStudyMarks(sectionId, objectId, {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [4, 2, 2],
      pages: {
        '2': {
          regions: [{ id: 'hl-1', x: 0.1, y: 0.2, w: 0.4, h: 0.15 }],
        },
      },
    });
    const loaded = await loadPdfStudyMarks(sectionId, objectId);
    expect(loaded.markedPages).toEqual([2, 4]);
    expect(loaded.pages['2']?.regions).toEqual([
      { id: 'hl-1', x: 0.1, y: 0.2, w: 0.4, h: 0.15 },
    ]);
  });

  it('drops an invalid highlight and leaves a cleared document empty', async () => {
    await savePdfStudyMarks(sectionId, objectId, {
      version: PDF_STUDY_MARKS_VERSION,
      markedPages: [1],
      pages: {
        '1': {
          regions: [
            { id: 'keep', x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
            { id: '', x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
            { id: 'tiny', x: 0, y: 0, w: 0.001, h: 0.2 },
          ],
        },
      },
    });
    const loaded = await loadPdfStudyMarks(sectionId, objectId);
    expect(loaded.pages['1']?.regions.map(region => region.id)).toEqual(['keep']);
    await deletePdfStudyMarks(sectionId, objectId);
    expect(await loadPdfStudyMarks(sectionId, objectId)).toEqual(emptyPdfStudyMarksDoc());
  });
});
