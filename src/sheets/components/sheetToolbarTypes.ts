/** Focus-owned toolbar / selection types — no Univer imports. */

export type SheetHorizontalAlign = 'left' | 'center' | 'right';

export type SheetNumberFormatPreset =
  | 'general'
  | 'number'
  | 'currency_eur'
  | 'currency_usd'
  | 'currency_gbp'
  | 'percent';

export type SheetStyleSnapshot = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  horizontalAlign: SheetHorizontalAlign | null;
  fontColor: string | null;
  fillColor: string | null;
  numberFormat: SheetNumberFormatPreset | 'custom' | null;
  numberPattern: string | null;
};

export type SheetSelectionState = {
  a1: string | null;
  rangeA1: string | null;
  /** Active-cell (anchor) style — required for toolbar pressed states. */
  style: SheetStyleSnapshot | null;
};

/** Explicit patterns — never locale-inferred. */
export const SHEET_NUMBER_FORMAT_PATTERNS: Record<SheetNumberFormatPreset, string> = {
  general: 'General',
  number: '#,##0.00',
  currency_eur: '"€"#,##0.00',
  currency_usd: '"$"#,##0.00',
  currency_gbp: '"£"#,##0.00',
  percent: '0%',
};

export const SHEET_TEXT_COLORS = [
  { id: 'default', label: 'Default', value: null },
  { id: 'ink', label: 'Ink', value: '#1a1a1a' },
  { id: 'muted', label: 'Muted', value: '#64748b' },
  { id: 'red', label: 'Red', value: '#dc2626' },
  { id: 'orange', label: 'Orange', value: '#ea580c' },
  { id: 'green', label: 'Green', value: '#16a34a' },
  { id: 'blue', label: 'Blue', value: '#2563eb' },
  { id: 'violet', label: 'Violet', value: '#7c3aed' },
] as const;

export const SHEET_FILL_COLORS = [
  { id: 'none', label: 'None', value: null },
  { id: 'yellow', label: 'Yellow', value: '#fef08a' },
  { id: 'amber', label: 'Amber', value: '#fde68a' },
  { id: 'green', label: 'Green', value: '#bbf7d0' },
  { id: 'blue', label: 'Blue', value: '#bfdbfe' },
  { id: 'violet', label: 'Violet', value: '#ddd6fe' },
  { id: 'rose', label: 'Rose', value: '#fecdd3' },
  { id: 'slate', label: 'Slate', value: '#e2e8f0' },
] as const;

export function patternToNumberPreset(pattern: string | null | undefined): SheetNumberFormatPreset | 'custom' | null {
  if (pattern == null || pattern === '' || pattern === 'General') return 'general';
  const p = pattern.trim();
  for (const [preset, expected] of Object.entries(SHEET_NUMBER_FORMAT_PATTERNS) as Array<
    [SheetNumberFormatPreset, string]
  >) {
    if (expected === p) return preset;
  }
  // Tolerate decimal variants of currency/number/percent
  if (/^"€"#,##0(\.0+)?$/.test(p)) return 'currency_eur';
  if (/^"\$"#,##0(\.0+)?$/.test(p)) return 'currency_usd';
  if (/^"£"#,##0(\.0+)?$/.test(p)) return 'currency_gbp';
  if (/^#,##0(\.0+)?$/.test(p) || /^0(\.0+)?$/.test(p)) return 'number';
  if (/^0(\.0+)?%$/.test(p)) return 'percent';
  return 'custom';
}

/** Adjust decimal places in a numfmt pattern without changing currency/percent kind. */
export function adjustNumberPatternDecimals(pattern: string | null | undefined, delta: -1 | 1): string {
  const raw = (pattern && pattern !== 'General' ? pattern : '0').trim();
  const percent = raw.endsWith('%');
  const body = percent ? raw.slice(0, -1) : raw;

  const m = body.match(/^(.*?)(\.0+)?$/);
  if (!m) return delta > 0 ? (percent ? '0.0%' : '0.0') : (percent ? '0%' : '0');

  const prefix = m[1] || '0';
  const zeros = m[2] ? m[2].length - 1 : 0;
  const next = Math.max(0, Math.min(6, zeros + delta));
  const decimal = next === 0 ? '' : `.${'0'.repeat(next)}`;
  // Keep a bare 0 prefix when stripping decimals from General-ish patterns
  const head = prefix.endsWith('0') || prefix.endsWith('#') ? prefix : `${prefix}0`;
  return `${head}${decimal}${percent ? '%' : ''}`;
}
