import { describe, expect, it } from 'vitest';
import { cloneFocusSheetDocument } from './cloneFocusSheetDocument';
import {
  createEmptyFocusSheetDocument,
  inspectWorkbookEngineIds,
} from './FocusSheetDocument';

describe('cloneFocusSheetDocument', () => {
  it('remints workbook and worksheet ids while keeping cell values', () => {
    const source = createEmptyFocusSheetDocument();
    const wb = source.workbook as {
      sheets: Record<string, { cellData?: Record<string, Record<string, { v?: unknown }>> }>;
    };
    const ids = inspectWorkbookEngineIds(source.workbook);
    if (ids.worksheetId) {
      wb.sheets[ids.worksheetId].cellData = { 0: { 0: { v: 'keep' } } };
    }
    const clone = cloneFocusSheetDocument(source);
    const cloneIds = inspectWorkbookEngineIds(clone.workbook);
    expect(cloneIds.workbookId).toBeTruthy();
    expect(cloneIds.worksheetId).toBeTruthy();
    expect(cloneIds.workbookId).not.toBe(ids.workbookId);
    expect(cloneIds.worksheetId).not.toBe(ids.worksheetId);
    const clonedWb = clone.workbook as typeof wb;
    expect(clonedWb.sheets[cloneIds.worksheetId!].cellData?.[0]?.[0]?.v).toBe('keep');
    expect(clonedWb.sheets[ids.worksheetId!]).toBeUndefined();
  });
});
