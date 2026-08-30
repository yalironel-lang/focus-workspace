import { describe, expect, it } from 'vitest';
import {
  adjustNumberPatternDecimals,
  patternToNumberPreset,
  SHEET_NUMBER_FORMAT_PATTERNS,
} from './sheetToolbarTypes';

describe('sheetNumberFormats', () => {
  it('maps explicit currency patterns without locale inference', () => {
    expect(SHEET_NUMBER_FORMAT_PATTERNS.currency_eur).toBe('"€"#,##0.00');
    expect(SHEET_NUMBER_FORMAT_PATTERNS.currency_usd).toBe('"$"#,##0.00');
    expect(SHEET_NUMBER_FORMAT_PATTERNS.currency_gbp).toBe('"£"#,##0.00');
    expect(patternToNumberPreset('"€"#,##0.00')).toBe('currency_eur');
    expect(patternToNumberPreset('"$"#,##0.00')).toBe('currency_usd');
    expect(patternToNumberPreset('"£"#,##0.00')).toBe('currency_gbp');
    expect(patternToNumberPreset('0%')).toBe('percent');
    expect(patternToNumberPreset('General')).toBe('general');
  });

  it('adjusts decimals for number and percent patterns', () => {
    expect(adjustNumberPatternDecimals('#,##0.00', -1)).toBe('#,##0.0');
    expect(adjustNumberPatternDecimals('#,##0.0', -1)).toBe('#,##0');
    expect(adjustNumberPatternDecimals('0%', 1)).toBe('0.0%');
    expect(adjustNumberPatternDecimals('0.0%', 1)).toBe('0.00%');
    expect(adjustNumberPatternDecimals('0.00%', -1)).toBe('0.0%');
    expect(adjustNumberPatternDecimals('"€"#,##0.00', -1)).toBe('"€"#,##0.0');
  });
});
