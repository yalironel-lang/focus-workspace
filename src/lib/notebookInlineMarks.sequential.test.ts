/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import {
  applyMarkToggle,
  isMarkActiveOnRange,
  marksAtSelection,
  type InlineMark,
} from './notebookInlineMarks';

function applySequential(
  marks: InlineMark[],
  start: number,
  end: number,
  types: Array<'b' | 'i' | 'u' | 's'>,
): InlineMark[] {
  let out = marks;
  for (const t of types) {
    out = applyMarkToggle(out, start, end, t);
  }
  return out;
}

describe('notebookInlineMarks sequential composition', () => {
  const start = 5;
  const end = 12;

  it('plain → Bold → Bold+Italic → +Underline → +Strike', () => {
    let marks = applySequential([], start, end, ['b']);
    expect(marksAtSelection(marks, start, end)).toEqual({ b: true });
    expect(isMarkActiveOnRange(marks, start, end, 'b')).toBe(true);

    marks = applySequential(marks, start, end, ['i']);
    expect(marksAtSelection(marks, start, end)).toEqual({ b: true, i: true });

    marks = applySequential(marks, start, end, ['u']);
    expect(marksAtSelection(marks, start, end)).toEqual({ b: true, i: true, u: true });

    marks = applySequential(marks, start, end, ['s']);
    expect(marksAtSelection(marks, start, end)).toEqual({ b: true, i: true, u: true, s: true });
    expect(marks.filter(m => m.t === 'b')).toHaveLength(1);
    expect(marks.filter(m => m.t === 'i')).toHaveLength(1);
  });

  it('A/B: add Bold then click Bold again removes Bold', () => {
    let marks = applyMarkToggle([], start, end, 'b');
    expect(isMarkActiveOnRange(marks, start, end, 'b')).toBe(true);
    marks = applyMarkToggle(marks, start, end, 'b');
    expect(marks).toEqual([]);
    expect(isMarkActiveOnRange(marks, start, end, 'b')).toBe(false);
  });

  it('toggle-off preserves Italic/Underline/Strike', () => {
    let marks = applySequential([], start, end, ['b', 'i', 'u', 's']);
    marks = applyMarkToggle(marks, start, end, 'b');
    expect(marksAtSelection(marks, start, end)).toEqual({ i: true, u: true, s: true });
    expect(isMarkActiveOnRange(marks, start, end, 'b')).toBe(false);
    expect(marks.some(m => m.t === 'b')).toBe(false);
    expect(marks.some(m => m.t === 'i')).toBe(true);
  });

  it('C: remove Bold from subrange of a larger Bold mark', () => {
    let marks = applyMarkToggle([], 0, 6, 'b');
    marks = applyMarkToggle(marks, 2, 4, 'b');
    expect(isMarkActiveOnRange(marks, 0, 2, 'b')).toBe(true);
    expect(isMarkActiveOnRange(marks, 2, 4, 'b')).toBe(false);
    expect(isMarkActiveOnRange(marks, 4, 6, 'b')).toBe(true);
    expect(marks).toEqual([
      { s: 0, e: 2, t: 'b' },
      { s: 4, e: 6, t: 'b' },
    ]);
  });

  it('D: partially Bold selection → click Bold makes whole selection Bold', () => {
    let marks = applyMarkToggle([], 0, 6, 'b');
    marks = applyMarkToggle(marks, 2, 4, 'b');
    expect(isMarkActiveOnRange(marks, 0, 6, 'b')).toBe(false);
    marks = applyMarkToggle(marks, 0, 6, 'b');
    expect(isMarkActiveOnRange(marks, 0, 6, 'b')).toBe(true);
    expect(marks).toEqual([{ s: 0, e: 6, t: 'b' }]);
  });

  it('fragmented Bold marks toggle off on full selection', () => {
    const marks = [
      { s: 5, e: 8, t: 'b' as const },
      { s: 8, e: 12, t: 'b' as const },
    ];
    expect(isMarkActiveOnRange(marks, 5, 12, 'b')).toBe(true);
    const toggled = applyMarkToggle(marks, 5, 12, 'b');
    expect(toggled.some(m => m.t === 'b')).toBe(false);
  });

  it('F: Italic/Underline/Strike toggle on and off', () => {
    for (const t of ['i', 'u', 's'] as const) {
      let marks = applyMarkToggle([], start, end, t);
      expect(isMarkActiveOnRange(marks, start, end, t)).toBe(true);
      marks = applyMarkToggle(marks, start, end, t);
      expect(isMarkActiveOnRange(marks, start, end, t)).toBe(false);
    }
  });

  it('overlapping ranges: bold on wider range + italic on inner range', () => {
    let marks = applyMarkToggle([], 0, 10, 'b');
    marks = applyMarkToggle(marks, 3, 7, 'i');
    expect(marksAtSelection(marks, 3, 7)).toEqual({ b: true, i: true });
    expect(marksAtSelection(marks, 0, 2)).toEqual({ b: true });
    expect(marksAtSelection(marks, 8, 10)).toEqual({ b: true });
  });

  it('G/H: second selection uses its own offsets/block', () => {
    let marks = applyMarkToggle([], 0, 4, 'b');
    marks = applyMarkToggle(marks, 8, 12, 'i');
    expect(marksAtSelection(marks, 0, 4)).toEqual({ b: true });
    expect(marksAtSelection(marks, 8, 12)).toEqual({ i: true });
    expect(marksAtSelection(marks, 0, 4).i).toBeUndefined();
    expect(marks).toHaveLength(2);

    marks = applyMarkToggle(marks, 8, 12, 'i');
    expect(marksAtSelection(marks, 8, 12).i).toBeUndefined();
    expect(marksAtSelection(marks, 0, 4)).toEqual({ b: true });
  });
});

describe('isMarkActiveOnRange selection bold', () => {
  it('returns false when bold exists outside selection', () => {
    const marks = [{ s: 0, e: 4, t: 'b' as const }];
    expect(isMarkActiveOnRange(marks, 8, 12, 'b')).toBe(false);
  });

  it('returns true when bold fully covers selection via fragmented marks', () => {
    const marks = [
      { s: 0, e: 3, t: 'b' as const },
      { s: 3, e: 6, t: 'b' as const },
    ];
    expect(isMarkActiveOnRange(marks, 0, 6, 'b')).toBe(true);
  });
});
