import { describe, expect, it } from 'vitest';
import { parsePdfCapture } from './pdfCapture.ts';

describe('parsePdfCapture recovery bridge', () => {
  const base = {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 2,
    text: 'Recovered Mean Value Theorem page text.',
  };

  it('accepts native selection (default / omitted textKind)', () => {
    const parsed = parsePdfCapture(base, 'sec-1');
    expect(parsed).toEqual({
      ...base,
    });
    expect(parsed?.textKind).toBeUndefined();
  });

  it('accepts recovered_page textKind', () => {
    const parsed = parsePdfCapture({ ...base, textKind: 'recovered_page' }, 'sec-1');
    expect(parsed?.textKind).toBe('recovered_page');
    expect(parsed?.text).toContain('Mean Value Theorem');
  });

  it('accepts native_page textKind (full-page native fallback)', () => {
    const parsed = parsePdfCapture({ ...base, textKind: 'native_page' }, 'sec-1');
    expect(parsed?.textKind).toBe('native_page');
    expect(parsed?.text).toContain('Mean Value Theorem');
  });

  it('rejects unknown textKind', () => {
    expect(parsePdfCapture({ ...base, textKind: 'region_ocr' }, 'sec-1')).toBeNull();
  });

  it('rejects section mismatch', () => {
    expect(parsePdfCapture(base, 'other-sec')).toBeNull();
  });
});
