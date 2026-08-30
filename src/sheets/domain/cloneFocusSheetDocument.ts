import {
  inspectWorkbookEngineIds,
  newSheetEngineId,
  type FocusSheetDocument,
} from './FocusSheetDocument';
import { migrateFocusSheetDocument } from './migrateFocusSheetDocument';

/** Univer sheets-filter snapshot resource name (exact; do not guess other keys). */
export const SHEET_FILTER_SNAPSHOT_ID = 'SHEET_FILTER_PLUGIN';

type WorkbookResource = { name?: unknown; data?: unknown };

/**
 * Remint worksheet id keys inside SHEET_FILTER_PLUGIN only.
 * Unknown resources are left untouched.
 */
export function remintSheetFilterPluginResource(
  resources: unknown,
  oldWorksheetId: string,
  newWorksheetId: string,
): unknown {
  if (!Array.isArray(resources) || !oldWorksheetId || !newWorksheetId) return resources;
  return resources.map((raw) => {
    const item = raw as WorkbookResource;
    if (!item || typeof item !== 'object' || item.name !== SHEET_FILTER_SNAPSHOT_ID) {
      return raw;
    }
    if (typeof item.data !== 'string') return raw;
    try {
      const parsed = JSON.parse(item.data) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw;
      if (!(oldWorksheetId in parsed)) return raw;
      const next: Record<string, unknown> = { ...parsed };
      next[newWorksheetId] = parsed[oldWorksheetId];
      delete next[oldWorksheetId];
      return { ...item, data: JSON.stringify(next) };
    } catch {
      return raw;
    }
  });
}

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
    resources?: unknown;
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

  if (old.worksheetId) {
    rec.resources = remintSheetFilterPluginResource(
      rec.resources,
      old.worksheetId,
      worksheetId,
    );
  }

  return cloned;
}
