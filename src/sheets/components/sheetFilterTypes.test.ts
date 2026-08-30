import { describe, expect, it } from 'vitest';
import { SHEET_FILTER_MESSAGES, sheetFilterFail } from './sheetFilterTypes';

describe('sheetFilterTypes', () => {
  it('builds typed fail results', () => {
    expect(sheetFilterFail('invalid-selection')).toEqual({
      ok: false,
      reason: 'invalid-selection',
      message: SHEET_FILTER_MESSAGES['invalid-selection'],
    });
  });
});
