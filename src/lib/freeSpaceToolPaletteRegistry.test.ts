import { describe, expect, it, vi } from 'vitest';
import {
  FREE_SPACE_TOOL_PALETTE_GROUPS,
  freeSpacePaletteIncludesSheet,
  getFreeSpacePaletteToolsGroup,
  isDirectFreeSpaceObjectCreateId,
} from './freeSpaceToolPaletteRegistry';
import { createDefaultSheetObjectContent } from '../sheets/freeSpace/sheetObjectContent';
import {
  FOCUS_SHEET_ENGINE,
  FOCUS_SHEET_SCHEMA_VERSION,
  inspectWorkbookEngineIds,
} from '../sheets/domain/FocusSheetDocument';
import { validateFocusSheetDocument } from '../sheets/domain/validateFocusSheetDocument';

describe('freeSpaceToolPaletteRegistry (production Add menu)', () => {
  it('includes Sheet under Tools with Focus-native copy (not DEV-gated)', () => {
    expect(freeSpacePaletteIncludesSheet()).toBe(true);

    const tools = getFreeSpacePaletteToolsGroup();
    expect(tools.label).toBe('Tools');

    const ids = tools.items.map(i => i.id);
    expect(ids).toEqual(['calculator', 'graph', 'sheet', 'link', 'image']);

    const sheet = tools.items.find(i => i.id === 'sheet');
    expect(sheet).toMatchObject({
      id: 'sheet',
      title: 'Sheet',
      description: 'Create a spreadsheet for data and calculations.',
      iconKey: 'sheet',
    });

    // Static production registry — no runtime env filter on groups.
    expect(FREE_SPACE_TOOL_PALETTE_GROUPS).toHaveLength(3);
  });

  it('preserves existing Tools entries used in production QA', () => {
    const tools = getFreeSpacePaletteToolsGroup();
    for (const id of ['calculator', 'graph', 'link', 'image'] as const) {
      expect(tools.items.some(i => i.id === id)).toBe(true);
    }
  });

  it('selecting sheet is a direct object create of type sheet', () => {
    expect(isDirectFreeSpaceObjectCreateId('sheet')).toBe(true);
    expect(isDirectFreeSpaceObjectCreateId('math-setup')).toBe(false);

    const onPick = vi.fn((id: string) => {
      if (!isDirectFreeSpaceObjectCreateId(id as never)) return;
      expect(id).toBe('sheet');
    });
    onPick('sheet');
    expect(onPick).toHaveBeenCalledWith('sheet');
  });

  it('sheet create path yields unique FocusSheetDocuments (no shared workbook ids)', () => {
    const a = createDefaultSheetObjectContent();
    const b = createDefaultSheetObjectContent();
    expect(a.type).toBe('sheet');
    expect(b.type).toBe('sheet');
    expect(validateFocusSheetDocument(a.document).ok).toBe(true);
    expect(validateFocusSheetDocument(b.document).ok).toBe(true);
    expect(a.document.engine).toBe(FOCUS_SHEET_ENGINE);
    expect(a.document.schemaVersion).toBe(FOCUS_SHEET_SCHEMA_VERSION);

    const idsA = inspectWorkbookEngineIds(a.document.workbook);
    const idsB = inspectWorkbookEngineIds(b.document.workbook);
    expect(idsA.workbookId).toBeTruthy();
    expect(idsB.workbookId).toBeTruthy();
    expect(idsA.worksheetId).toBeTruthy();
    expect(idsB.worksheetId).toBeTruthy();
    expect(idsA.workbookId).not.toBe(idsB.workbookId);
    expect(idsA.worksheetId).not.toBe(idsB.worksheetId);
  });
});
