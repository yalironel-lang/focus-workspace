/**
 * Focus-owned spreadsheet document.
 * Title, Focus object id, geometry, and sync timestamps live on Free Space later —
 * not on this document.
 */

export type FocusSheetEngineId = 'univer';

export const FOCUS_SHEET_SCHEMA_VERSION = 1 as const;

export const FOCUS_SHEET_ENGINE: FocusSheetEngineId = 'univer';

/**
 * Focus-owned sheet document. Opaque `workbook` is the engine snapshot
 * (Univer IWorkbookData when engine === 'univer'). Never mutate workbook
 * outside SpreadsheetEngineAdapter.
 */
export interface FocusSheetDocument {
  schemaVersion: typeof FOCUS_SHEET_SCHEMA_VERSION;
  engine: FocusSheetEngineId;
  workbook: unknown;
}

export function newSheetEngineId(prefix: 'fwb' | 'fws'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Minimum valid Univer workbook snapshot for a single-worksheet V1 sheet.
 * Workbook and worksheet IDs are unique per call and are not derived from
 * Focus object identity.
 */
export function createEmptyFocusSheetDocument(): FocusSheetDocument {
  const workbookId = newSheetEngineId('fwb');
  const worksheetId = newSheetEngineId('fws');
  return {
    schemaVersion: FOCUS_SHEET_SCHEMA_VERSION,
    engine: FOCUS_SHEET_ENGINE,
    workbook: {
      id: workbookId,
      name: 'Workbook',
      appVersion: '0.25.1',
      locale: 'enUS',
      styles: {},
      sheetOrder: [worksheetId],
      sheets: {
        [worksheetId]: {
          id: worksheetId,
          name: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
          cellData: {},
        },
      },
    },
  };
}

/** Boundary inspection only — not a Univer schema validator. */
export function inspectWorkbookEngineIds(workbook: unknown): {
  workbookId: string | null;
  worksheetId: string | null;
} {
  if (!workbook || typeof workbook !== 'object' || Array.isArray(workbook)) {
    return { workbookId: null, worksheetId: null };
  }
  const wb = workbook as {
    id?: unknown;
    sheetOrder?: unknown;
    sheets?: Record<string, { id?: unknown }>;
  };
  const workbookId = typeof wb.id === 'string' && wb.id.length > 0 ? wb.id : null;
  const first = Array.isArray(wb.sheetOrder) && typeof wb.sheetOrder[0] === 'string'
    ? wb.sheetOrder[0]
    : null;
  const nestedId = first && wb.sheets?.[first] && typeof wb.sheets[first].id === 'string'
    ? wb.sheets[first].id
    : first;
  return { workbookId, worksheetId: nestedId };
}
