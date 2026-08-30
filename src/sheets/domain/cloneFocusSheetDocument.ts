import {
  inspectWorkbookEngineIds,
  newSheetEngineId,
  type FocusSheetDocument,
} from './FocusSheetDocument';
import { migrateFocusSheetDocument } from './migrateFocusSheetDocument';

/**
 * Deep-clone a Focus sheet document and remint Univer workbook/worksheet IDs
 * so two independently editable objects never share engine identity.
 */
export function cloneFocusSheetDocument(raw: unknown): FocusSheetDocument {
  const source = migrateFocusSheetDocument(raw);
  const cloned = JSON.parse(JSON.stringify(source)) as FocusSheetDocument;
  const wb = cloned.workbook;
  if (!wb || typeof wb !== 'object' || Array.isArray(wb)) {
    return cloned;
  }

  const rec = wb as {
    id?: unknown;
    sheetOrder?: unknown;
    sheets?: Record<string, { id?: unknown }>;
  };
  const old = inspectWorkbookEngineIds(rec);
  const workbookId = newSheetEngineId('fwb');
  const worksheetId = newSheetEngineId('fws');
  rec.id = workbookId;

  if (Array.isArray(rec.sheetOrder) && old.worksheetId) {
    rec.sheetOrder = rec.sheetOrder.map((id) =>
      id === old.worksheetId ? worksheetId : id,
    );
  }

  if (rec.sheets && old.worksheetId && rec.sheets[old.worksheetId]) {
    const sheet = { ...rec.sheets[old.worksheetId], id: worksheetId };
    delete rec.sheets[old.worksheetId];
    rec.sheets[worksheetId] = sheet;
  }

  return cloned;
}
