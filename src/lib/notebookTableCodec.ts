/**
 * M6.4A — Canonical table payload (V1) validation.
 * Payload versioning (`v: 1`) is independent of NOTEBOOK_TEXT_CODEC_V1.
 *
 * Ownership (deliberate dual representation):
 * - WIRE: TablePayloadV1 `{ v: 1, rows }` — `v` is required and validated here.
 * - IN-MEMORY Notebook block: `{ kind: 'table', rows }` — represents ONLY validated
 *   TablePayloadV1 rows; `v` is intentionally consumed at this wire boundary.
 * - ENCODE: may emit `v: 1` ONLY because the in-memory table block type is the V1
 *   rows carrier. A future TablePayloadV2 MUST NOT reuse this block/encoder path
 *   without explicit version-aware handling.
 */

import type { InlineMark } from './notebookInlineMarks';
import { isCanonicalUrl } from './urlSanitizer';

export const TABLE_PAYLOAD_V1 = 1 as const;
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLS = 20;

/** Cell text + optional non-empty marks. `m: []` is non-canonical and rejected. */
export type TableCellV1 = {
  t: string;
  m?: InlineMark[];
};

export type TablePayloadV1 = {
  v: typeof TABLE_PAYLOAD_V1;
  rows: TableCellV1[][];
};

const markTypes = new Set(['b', 'i', 'u', 's', 'fs', 'fg', 'bg', 'hl', 'm', 'a']);

function invalid(): never {
  throw new Error('Invalid versioned Notebook text record');
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
}

function validateMarks(value: unknown, length: number): InlineMark[] {
  if (!Array.isArray(value)) return invalid();
  return value.map(mark => {
    if (
      !mark ||
      typeof mark !== 'object' ||
      Array.isArray(mark) ||
      !markTypes.has((mark as InlineMark).t) ||
      !Number.isInteger((mark as InlineMark).s) ||
      !Number.isInteger((mark as InlineMark).e) ||
      (mark as InlineMark).s < 0 ||
      (mark as InlineMark).e <= (mark as InlineMark).s ||
      (mark as InlineMark).e > length ||
      ((mark as InlineMark).v !== undefined && typeof (mark as InlineMark).v !== 'string')
    ) {
      return invalid();
    }
    const m = mark as InlineMark;
    if (m.t === 'a' && !isCanonicalUrl(m.v)) return invalid();
    return {
      s: m.s,
      e: m.e,
      t: m.t,
      ...(m.v !== undefined ? { v: m.v } : {}),
    };
  });
}

function validateCell(raw: unknown): TableCellV1 {
  assertPlainObject(raw);
  for (const key of Object.keys(raw)) {
    if (key !== 't' && key !== 'm') return invalid();
  }
  if (typeof raw.t !== 'string') return invalid();
  // Canonical cells: omit `m`, or provide a non-empty mark array. `m: []` rejects.
  if (!('m' in raw) || raw.m === undefined) {
    return { t: raw.t };
  }
  if (!Array.isArray(raw.m) || raw.m.length === 0) return invalid();
  const marks = validateMarks(raw.m, raw.t.length);
  if (marks.length === 0) return invalid();
  return { t: raw.t, m: marks };
}

/** Fail-closed validation of a canonical table payload. */
export function validateTablePayloadV1(raw: unknown): TablePayloadV1 {
  assertPlainObject(raw);
  for (const key of Object.keys(raw)) {
    if (key !== 'v' && key !== 'rows') return invalid();
  }
  if (raw.v !== TABLE_PAYLOAD_V1) return invalid();
  if (!Array.isArray(raw.rows)) return invalid();
  if (raw.rows.length < 1 || raw.rows.length > MAX_TABLE_ROWS) return invalid();

  const rows: TableCellV1[][] = [];
  let colCount: number | null = null;
  for (const row of raw.rows) {
    if (!Array.isArray(row)) return invalid();
    if (row.length < 1 || row.length > MAX_TABLE_COLS) return invalid();
    if (colCount === null) colCount = row.length;
    else if (row.length !== colCount) return invalid();
    rows.push(row.map(validateCell));
  }
  if (colCount === null || colCount < 1) return invalid();
  return { v: TABLE_PAYLOAD_V1, rows };
}

/**
 * Deterministic encode shape for validated V1 payloads.
 * Emits `v: 1` because this function is V1-only (see file ownership comment).
 */
export function canonicalizeTablePayloadV1(payload: TablePayloadV1): TablePayloadV1 {
  const validated = validateTablePayloadV1(payload);
  return {
    v: TABLE_PAYLOAD_V1,
    rows: validated.rows.map(row =>
      row.map(cell => {
        if (!cell.m) return { t: cell.t };
        return {
          t: cell.t,
          m: cell.m.map(m => ({
            s: m.s,
            e: m.e,
            t: m.t,
            ...(m.v !== undefined ? { v: m.v } : {}),
          })),
        };
      }),
    ),
  };
}

export function tableColCount(payload: TablePayloadV1): number {
  return payload.rows[0]?.length ?? 0;
}
