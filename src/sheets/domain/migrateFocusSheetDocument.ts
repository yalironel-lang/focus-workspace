import { validateFocusSheetDocument } from './validateFocusSheetDocument';
import type { FocusSheetDocument } from './FocusSheetDocument';
import { SheetEngineError } from './sheetEngineErrors';

/**
 * Schema migration entry point.
 * V1 is identity. Unknown / missing versions throw UNSUPPORTED_SCHEMA.
 * No speculative v2 migrations.
 */
export function migrateFocusSheetDocument(raw: unknown): FocusSheetDocument {
  const result = validateFocusSheetDocument(raw);
  if (!result.ok) {
    throw new SheetEngineError(result.code, result.reason);
  }
  return result.document;
}
