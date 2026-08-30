import { describe, expect, it } from 'vitest';
import {
  cloneFocusSheetDocument,
  remintSheetFilterPluginResource,
  SHEET_FILTER_SNAPSHOT_ID,
} from './cloneFocusSheetDocument';
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

  it('rewrites SHEET_FILTER_PLUGIN worksheet keys only', () => {
    const source = createEmptyFocusSheetDocument();
    const ids = inspectWorkbookEngineIds(source.workbook);
    const wb = source.workbook as {
      resources?: Array<{ name: string; data: string }>;
    };
    wb.resources = [
      {
        name: SHEET_FILTER_SNAPSHOT_ID,
        data: JSON.stringify({
          [ids.worksheetId!]: {
            ref: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 },
            filterColumns: [{ colId: 0, filters: { filterBy: 0, values: ['A'] } }],
            cachedFilteredOut: [2],
          },
        }),
      },
      {
        name: 'SOME_UNKNOWN_PLUGIN',
        data: JSON.stringify({ [ids.worksheetId!]: { keep: true } }),
      },
    ];

    const clone = cloneFocusSheetDocument(source);
    const cloneIds = inspectWorkbookEngineIds(clone.workbook);
    const resources = (clone.workbook as typeof wb).resources ?? [];
    const filterRes = resources.find((r) => r.name === SHEET_FILTER_SNAPSHOT_ID);
    expect(filterRes).toBeTruthy();
    const parsed = JSON.parse(filterRes!.data) as Record<string, unknown>;
    expect(parsed[cloneIds.worksheetId!]).toBeTruthy();
    expect(parsed[ids.worksheetId!]).toBeUndefined();
    expect(Object.keys(parsed)).toEqual([cloneIds.worksheetId!]);

    const unknown = resources.find((r) => r.name === 'SOME_UNKNOWN_PLUGIN');
    expect(unknown?.data).toBe(JSON.stringify({ [ids.worksheetId!]: { keep: true } }));
  });

  it('round-trips missing / empty resources and leaves unknown untouched', () => {
    const a = createEmptyFocusSheetDocument();
    expect((cloneFocusSheetDocument(a).workbook as { resources?: unknown }).resources).toBeUndefined();

    const b = createEmptyFocusSheetDocument();
    (b.workbook as { resources?: unknown[] }).resources = [];
    expect((cloneFocusSheetDocument(b).workbook as { resources?: unknown[] }).resources).toEqual([]);

    const reminted = remintSheetFilterPluginResource(
      [{ name: 'OTHER', data: '{"x":1}' }],
      'old',
      'new',
    );
    expect(reminted).toEqual([{ name: 'OTHER', data: '{"x":1}' }]);
  });
});
