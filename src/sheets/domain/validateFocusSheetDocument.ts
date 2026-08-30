import {
  FOCUS_SHEET_ENGINE,
  FOCUS_SHEET_SCHEMA_VERSION,
  type FocusSheetDocument,
} from './FocusSheetDocument';
import type { SheetEngineErrorCode } from './sheetEngineErrors';

export type ValidateFocusSheetDocumentResult =
  | { ok: true; document: FocusSheetDocument }
  | { ok: false; code: SheetEngineErrorCode; reason: string };

function fail(code: SheetEngineErrorCode, reason: string): ValidateFocusSheetDocumentResult {
  return { ok: false, code, reason };
}

/**
 * Boundary validation only. Does not inspect Univer cell internals.
 */
export function validateFocusSheetDocument(raw: unknown): ValidateFocusSheetDocumentResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('INVALID_DOCUMENT', 'Document root must be a non-null object');
  }

  const rec = raw as Record<string, unknown>;

  if (!('schemaVersion' in rec)) {
    return fail('UNSUPPORTED_SCHEMA', 'Missing schemaVersion');
  }
  if (typeof rec.schemaVersion !== 'number' || !Number.isFinite(rec.schemaVersion)) {
    return fail('UNSUPPORTED_SCHEMA', 'schemaVersion must be a number');
  }
  if (rec.schemaVersion !== FOCUS_SHEET_SCHEMA_VERSION) {
    return fail(
      'UNSUPPORTED_SCHEMA',
      `Unsupported schemaVersion ${rec.schemaVersion} (expected ${FOCUS_SHEET_SCHEMA_VERSION})`,
    );
  }

  if (rec.engine !== FOCUS_SHEET_ENGINE) {
    return fail('INVALID_DOCUMENT', `Unsupported engine ${String(rec.engine)} (expected ${FOCUS_SHEET_ENGINE})`);
  }

  if (!('workbook' in rec)) {
    return fail('INVALID_DOCUMENT', 'Missing workbook');
  }
  if (rec.workbook === null || typeof rec.workbook !== 'object' || Array.isArray(rec.workbook)) {
    return fail('INVALID_DOCUMENT', 'workbook must be a non-null object');
  }

  return {
    ok: true,
    document: {
      schemaVersion: FOCUS_SHEET_SCHEMA_VERSION,
      engine: FOCUS_SHEET_ENGINE,
      workbook: rec.workbook,
    },
  };
}
