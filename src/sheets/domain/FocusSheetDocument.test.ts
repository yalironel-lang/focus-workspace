import { describe, expect, it } from 'vitest';
import {
  createEmptyFocusSheetDocument,
  inspectWorkbookEngineIds,
} from './FocusSheetDocument';
import { migrateFocusSheetDocument } from './migrateFocusSheetDocument';
import { SheetEngineError } from './sheetEngineErrors';
import { validateFocusSheetDocument } from './validateFocusSheetDocument';

describe('createEmptyFocusSheetDocument', () => {
  it('produces a valid schemaVersion 1 univer document', () => {
    const doc = createEmptyFocusSheetDocument();
    const result = validateFocusSheetDocument(doc);
    expect(result.ok).toBe(true);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.engine).toBe('univer');
  });

  it('generates unique workbook and worksheet IDs per document', () => {
    const a = createEmptyFocusSheetDocument();
    const b = createEmptyFocusSheetDocument();
    const idsA = inspectWorkbookEngineIds(a.workbook);
    const idsB = inspectWorkbookEngineIds(b.workbook);
    expect(idsA.workbookId).toBeTruthy();
    expect(idsA.worksheetId).toBeTruthy();
    expect(idsB.workbookId).toBeTruthy();
    expect(idsB.worksheetId).toBeTruthy();
    expect(idsA.workbookId).not.toBe(idsB.workbookId);
    expect(idsA.worksheetId).not.toBe(idsB.worksheetId);
    expect(idsA.workbookId).not.toBe(idsA.worksheetId);
  });

  it('does not use Focus object id prefixes', () => {
    const ids = inspectWorkbookEngineIds(createEmptyFocusSheetDocument().workbook);
    expect(ids.workbookId?.startsWith('ps-')).toBe(false);
    expect(ids.worksheetId?.startsWith('ps-')).toBe(false);
    expect(ids.workbookId?.startsWith('fwb-')).toBe(true);
    expect(ids.worksheetId?.startsWith('fws-')).toBe(true);
  });

  it('JSON round-trip preserves engine IDs', () => {
    const doc = createEmptyFocusSheetDocument();
    const parsed = JSON.parse(JSON.stringify(doc)) as unknown;
    const migrated = migrateFocusSheetDocument(parsed);
    expect(inspectWorkbookEngineIds(migrated.workbook)).toEqual(
      inspectWorkbookEngineIds(doc.workbook),
    );
  });
});

describe('validateFocusSheetDocument', () => {
  it('rejects null / array / non-object roots as INVALID_DOCUMENT', () => {
    for (const raw of [null, [], 'sheet', 1, true]) {
      const r = validateFocusSheetDocument(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_DOCUMENT');
    }
  });

  it('rejects missing schemaVersion as UNSUPPORTED_SCHEMA', () => {
    const r = validateFocusSheetDocument({ engine: 'univer', workbook: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_SCHEMA');
  });

  it('rejects unknown schemaVersion as UNSUPPORTED_SCHEMA', () => {
    const r = validateFocusSheetDocument({ schemaVersion: 99, engine: 'univer', workbook: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_SCHEMA');
  });

  it('rejects wrong engine as INVALID_DOCUMENT', () => {
    const r = validateFocusSheetDocument({ schemaVersion: 1, engine: 'excel', workbook: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_DOCUMENT');
  });

  it('rejects missing / null / array workbook as INVALID_DOCUMENT', () => {
    expect(validateFocusSheetDocument({ schemaVersion: 1, engine: 'univer' }).ok).toBe(false);
    expect(validateFocusSheetDocument({ schemaVersion: 1, engine: 'univer', workbook: null }).ok).toBe(false);
    expect(validateFocusSheetDocument({ schemaVersion: 1, engine: 'univer', workbook: [] }).ok).toBe(false);
  });
});

describe('migrateFocusSheetDocument', () => {
  it('is identity for schemaVersion 1', () => {
    const doc = createEmptyFocusSheetDocument();
    expect(migrateFocusSheetDocument(doc)).toEqual(doc);
  });

  it('throws SheetEngineError for unsupported schema', () => {
    try {
      migrateFocusSheetDocument({ schemaVersion: 2, engine: 'univer', workbook: {} });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SheetEngineError);
      expect((err as SheetEngineError).code).toBe('UNSUPPORTED_SCHEMA');
    }
  });
});
