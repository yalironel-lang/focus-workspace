import { describe, expect, it } from 'vitest';
import { assessPdfPageTextLayer } from './assessPdfPageTextLayer';

describe('assessPdfPageTextLayer', () => {
  it('classifies empty layers as empty', () => {
    expect(assessPdfPageTextLayer({ items: [] }, 500, 500)).toEqual({
      kind: 'empty',
      itemCount: 0,
      meaningfulCharCount: 0,
    });
  });

  it('does not treat a single page-number glyph as useful page text', () => {
    const assessment = assessPdfPageTextLayer(
      {
        items: [{ str: '1', transform: [1, 0, 0, 1, 500, 780], width: 10, height: 12 }],
      },
      612,
      792,
    );
    expect(assessment.kind).toBe('sparse');
    expect(assessment.itemCount).toBe(1);
    expect(assessment.pageText).toBeUndefined();
  });

  it('classifies multi-line academic text as useful', () => {
    const assessment = assessPdfPageTextLayer(
      {
        items: [
          { str: 'Find the derivative of f(x)', transform: [1, 0, 0, 1, 72, 700], width: 200, height: 12 },
          { str: 'using the Mean Value Theorem.', transform: [1, 0, 0, 1, 72, 680], width: 220, height: 12 },
        ],
      },
      612,
      792,
    );
    expect(assessment.kind).toBe('useful');
    expect(assessment.pageText).toContain('Mean Value Theorem');
    expect(assessment.meaningfulCharCount).toBeGreaterThan(10);
  });

  it('marks sparse residual headers without enough useful text', () => {
    const assessment = assessPdfPageTextLayer(
      {
        items: [
          { str: 'a', transform: [1, 0, 0, 1, 40, 760], width: 8, height: 10 },
        ],
      },
      612,
      792,
    );
    expect(assessment.kind).toBe('sparse');
  });
});
