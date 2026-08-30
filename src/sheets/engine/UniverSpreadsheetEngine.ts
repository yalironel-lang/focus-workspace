/**
 * Univer implementation of SpreadsheetEngineAdapter.
 * All Univer imports stay inside this module (and createUniverOss).
 */

import {
  FOCUS_SHEET_ENGINE,
  FOCUS_SHEET_SCHEMA_VERSION,
  type FocusSheetDocument,
} from '../domain/FocusSheetDocument';
import { migrateFocusSheetDocument } from '../domain/migrateFocusSheetDocument';
import { SheetEngineError } from '../domain/sheetEngineErrors';
import { createUniverOss, LocaleType, mergeLocales } from './createUniverOss';
import type {
  SpreadsheetCellValue,
  SpreadsheetEngineAdapter,
  SpreadsheetUnsubscribe,
} from './SpreadsheetEngineAdapter';

/** Univer CommandType.MUTATION — persisted snapshot change. */
const COMMAND_TYPE_MUTATION = 2;
/** Univer CommandType.OPERATION — not saved to snapshot (selection, scroll). */
const COMMAND_TYPE_OPERATION = 1;

type CommandInfo = { id?: string; type?: number; params?: { visible?: boolean } };

type UniverRange = {
  getValue: () => unknown;
  getFormula?: () => string;
  setValue: (v: unknown) => unknown;
  setValues?: (grid: unknown) => unknown;
  setFormula?: (formula: string) => unknown;
  clearContent?: () => unknown;
  setFontWeight?: (weight: string) => unknown;
  getA1Notation?: () => string;
  getRow?: () => number;
  getColumn?: () => number;
};

type UniverSheet = {
  getRange: (a1: string) => UniverRange;
  setActiveRange?: (range: UniverRange) => unknown;
  getActiveRange?: () => UniverRange | null;
  getActiveCell?: () => UniverRange | null;
  insertRows?: (rowIndex: number, numRows?: number) => unknown;
  deleteRows?: (rowPosition: number, howMany: number) => unknown;
  insertColumns?: (columnIndex: number, numColumns?: number) => unknown;
  deleteColumns?: (columnPosition: number, howMany: number) => unknown;
  getRowHeight?: (rowPosition: number) => number;
  getColumnWidth?: (columnPosition: number) => number;
};

type UniverWorkbook = {
  save: () => unknown;
  getId: () => string;
  getActiveSheet: () => UniverSheet;
  undo?: () => unknown;
  redo?: () => unknown;
  onCommandExecuted?: (cb: (info: CommandInfo) => void) => { dispose: () => void };
  setActiveRange?: (range: UniverRange) => unknown;
};

type UniverApi = {
  createWorkbook: (data?: unknown) => unknown;
  getActiveWorkbook: () => UniverWorkbook | null;
  disposeUnit: (unitId: string) => void;
  dispose: () => void;
  undo?: () => Promise<boolean> | boolean;
  redo?: () => Promise<boolean> | boolean;
  onCommandExecuted?: (cb: (info: CommandInfo) => void) => { dispose: () => void };
};

type UniverHandle = { dispose: () => void };

/** Prevents a cancelled Strict-Mode mount from wiping a newer engine's host DOM. */
const hostOwners = new WeakMap<HTMLElement, UniverSpreadsheetEngine>();

export type DocumentChangedTrace = {
  id: string;
  type: number | undefined;
};

export class UniverSpreadsheetEngine implements SpreadsheetEngineAdapter {
  private univer: UniverHandle | null = null;
  private univerAPI: UniverApi | null = null;
  private container: HTMLElement | null = null;
  private changeListeners = new Set<() => void>();
  private commandUnsubs: Array<() => void> = [];
  /** Last mutation command ids (diagnostics / evidence). */
  lastMutationCommands: DocumentChangedTrace[] = [];
  /** All observed commands including operations. */
  lastObservedCommands: DocumentChangedTrace[] = [];
  /** True while Univer cell / formula editor is visible. */
  private cellEditing = false;
  private cellEditingListeners = new Set<(editing: boolean) => void>();

  isCellEditing(): boolean {
    return this.cellEditing;
  }

  onCellEditingChanged(cb: (editing: boolean) => void): SpreadsheetUnsubscribe {
    this.cellEditingListeners.add(cb);
    return () => {
      this.cellEditingListeners.delete(cb);
    };
  }

  async mount(container: HTMLElement, document: FocusSheetDocument): Promise<void> {
    this.dispose();
    this.container = container;
    hostOwners.set(container, this);
    const doc = migrateFocusSheetDocument(document);

    try {
      const [{ UniverSheetsCorePreset }, sheetsCoreEnUS] = await Promise.all([
        import('@univerjs/preset-sheets-core'),
        import('@univerjs/preset-sheets-core/locales/en-US'),
      ]);
      await import('@univerjs/preset-sheets-core/lib/index.css');

      const localeMod = (sheetsCoreEnUS as { default?: unknown }).default ?? sheetsCoreEnUS;

      if (hostOwners.get(container) !== this) {
        this.univerAPI = null;
        this.univer = null;
        this.container = null;
        throw new SheetEngineError('ENGINE_MOUNT_FAILED', 'SHEET_MOUNT_SUPERSEDED');
      }

      const { univer, univerAPI } = createUniverOss({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(localeMod as Parameters<typeof mergeLocales>[0]),
        },
        presets: [
          UniverSheetsCorePreset({
            container,
            footer: false,
            toolbar: false,
            formulaBar: true,
          }),
        ],
      });

      this.univer = univer;
      this.univerAPI = univerAPI as unknown as UniverApi;
      this.univerAPI.createWorkbook(doc.workbook);
      this.bindCommandListeners();
    } catch (err) {
      this.dispose();
      if (err instanceof SheetEngineError) throw err;
      throw new SheetEngineError(
        'ENGINE_MOUNT_FAILED',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  loadDocument(document: FocusSheetDocument): void {
    const api = this.requireApi();
    const doc = migrateFocusSheetDocument(document);
    this.unbindCommandListeners();
    const active = api.getActiveWorkbook();
    if (active) {
      try {
        api.disposeUnit(active.getId());
      } catch {
        // ignore dispose race
      }
    }
    api.createWorkbook(doc.workbook);
    this.bindCommandListeners();
  }

  exportDocument(): FocusSheetDocument {
    const wb = this.requireWorkbook();
    return {
      schemaVersion: FOCUS_SHEET_SCHEMA_VERSION,
      engine: FOCUS_SHEET_ENGINE,
      workbook: wb.save(),
    };
  }

  resize(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }

  focus(): void {
    this.container?.focus();
  }

  dispose(): void {
    this.unbindCommandListeners();
    this.setCellEditing(false);
    this.cellEditingListeners.clear();
    try {
      this.univerAPI?.dispose();
    } catch {
      // ignore
    }
    try {
      this.univer?.dispose();
    } catch {
      // ignore
    }
    this.univerAPI = null;
    this.univer = null;
    const host = this.container;
    this.container = null;
    if (host && hostOwners.get(host) === this) {
      hostOwners.delete(host);
      host.replaceChildren();
    }
  }

  onDocumentChanged(cb: () => void): SpreadsheetUnsubscribe {
    this.changeListeners.add(cb);
    return () => {
      this.changeListeners.delete(cb);
    };
  }

  setCellValue(a1: string, value: SpreadsheetCellValue): void {
    this.requireRange(a1).setValue(value);
  }

  setCellFormula(a1: string, formula: string): void {
    const range = this.requireRange(a1);
    if (typeof range.setFormula === 'function') {
      range.setFormula(formula);
      return;
    }
    range.setValue({ f: formula });
  }

  clearCell(a1: string): void {
    const range = this.requireRange(a1);
    if (typeof range.clearContent === 'function') {
      range.clearContent();
      return;
    }
    range.setValue(null);
  }

  /**
   * Evidence/harness only — not on SpreadsheetEngineAdapter.
   * GATE 1 must use a real clipboard/DOM paste path, not this helper.
   */
  pasteValues(startA1: string, grid: Array<Array<SpreadsheetCellValue>>): void {
    const range = this.requireRange(startA1);
    if (typeof range.setValues === 'function') {
      range.setValues(grid);
      return;
    }
    range.setValue(grid[0]?.[0] ?? null);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  undo(): void {
    const wb = this.requireWorkbook();
    if (typeof wb.undo === 'function') {
      void wb.undo();
      return;
    }
    void this.requireApi().undo?.();
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  redo(): void {
    const wb = this.requireWorkbook();
    if (typeof wb.redo === 'function') {
      void wb.redo();
      return;
    }
    void this.requireApi().redo?.();
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  selectRange(a1: string): void {
    const wb = this.requireWorkbook();
    const range = this.requireRange(a1);
    if (typeof wb.setActiveRange === 'function') {
      wb.setActiveRange(range);
      return;
    }
    const sheet = wb.getActiveSheet();
    sheet.setActiveRange?.(range);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  setCellFontWeight(a1: string, weight: string): void {
    const range = this.requireRange(a1);
    if (typeof range.setFontWeight !== 'function') {
      throw new Error('Univer range.setFontWeight is not available');
    }
    range.setFontWeight(weight);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  insertRows(rowIndex: number, numRows = 1): void {
    const sheet = this.requireWorkbook().getActiveSheet();
    if (typeof sheet.insertRows !== 'function') {
      throw new Error('Univer sheet.insertRows is not available');
    }
    sheet.insertRows(rowIndex, numRows);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  deleteRows(rowPosition: number, howMany = 1): void {
    const sheet = this.requireWorkbook().getActiveSheet();
    if (typeof sheet.deleteRows !== 'function') {
      throw new Error('Univer sheet.deleteRows is not available');
    }
    sheet.deleteRows(rowPosition, howMany);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  insertColumns(columnIndex: number, numColumns = 1): void {
    const sheet = this.requireWorkbook().getActiveSheet();
    if (typeof sheet.insertColumns !== 'function') {
      throw new Error('Univer sheet.insertColumns is not available');
    }
    sheet.insertColumns(columnIndex, numColumns);
  }

  /** Evidence/harness only — not on SpreadsheetEngineAdapter. */
  deleteColumns(columnPosition: number, howMany = 1): void {
    const sheet = this.requireWorkbook().getActiveSheet();
    if (typeof sheet.deleteColumns !== 'function') {
      throw new Error('Univer sheet.deleteColumns is not available');
    }
    sheet.deleteColumns(columnPosition, howMany);
  }

  /** Test helper: read displayed value/formula without exposing Univer types. */
  probeCells(refs: string[]): Record<string, { value: unknown; formula: string | null }> {
    const sheet = this.requireWorkbook().getActiveSheet();
    const out: Record<string, { value: unknown; formula: string | null }> = {};
    for (const ref of refs) {
      const range = sheet.getRange(ref);
      out[ref] = {
        value: range.getValue(),
        formula: range.getFormula?.() ?? null,
      };
    }
    return out;
  }

  /** Evidence helper — active cell A1 after a pointer hit. */
  getActiveA1(): string | null {
    const raw = this.getActiveRangeA1();
    if (!raw) return null;
    return raw.split(':')[0].replace(/\$/g, '').replace(/^.*!/, '');
  }

  getActiveRangeA1(): string | null {
    if (!this.univerAPI) return null;
    const wb = this.univerAPI.getActiveWorkbook();
    const sheet = wb?.getActiveSheet?.();
    if (!sheet) return null;
    // Prefer the full selection range — getActiveCell is often only the anchor cell.
    const cell = sheet.getActiveRange?.() ?? sheet.getActiveCell?.();
    if (!cell) return null;
    if (typeof cell.getA1Notation === 'function') return cell.getA1Notation();
    const row = cell.getRow?.();
    const col = cell.getColumn?.();
    if (typeof row === 'number' && typeof col === 'number') {
      return `${String.fromCharCode(65 + col)}${row + 1}`;
    }
    return null;
  }

  getGridMetrics(): { row0: number; col0: number } {
    const sheet = this.requireWorkbook().getActiveSheet();
    return {
      row0: typeof sheet.getRowHeight === 'function' ? sheet.getRowHeight(0) : 24,
      col0: typeof sheet.getColumnWidth === 'function' ? sheet.getColumnWidth(0) : 73,
    };
  }

  private requireApi(): UniverApi {
    if (!this.univerAPI) {
      throw new SheetEngineError('ENGINE_NOT_MOUNTED', 'Spreadsheet engine is not mounted');
    }
    return this.univerAPI;
  }

  private requireWorkbook(): UniverWorkbook {
    const wb = this.requireApi().getActiveWorkbook();
    if (!wb) {
      throw new SheetEngineError('ENGINE_NOT_MOUNTED', 'No active workbook');
    }
    return wb;
  }

  private requireRange(a1: string): UniverRange {
    return this.requireWorkbook().getActiveSheet().getRange(a1);
  }

  private setCellEditing(editing: boolean): void {
    if (this.cellEditing === editing) return;
    this.cellEditing = editing;
    for (const cb of this.cellEditingListeners) cb(editing);
  }

  private bindCommandListeners(): void {
    this.unbindCommandListeners();
    const emitIfMutation = (info: CommandInfo) => {
      const id = String(info?.id ?? '');
      const trace: DocumentChangedTrace = { id, type: info?.type };
      this.lastObservedCommands = [...this.lastObservedCommands.slice(-80), trace];

      if (
        id === 'sheet.operation.set-cell-edit-visible'
        || id === 'sheet.operation.set-cell-edit-visible-f2'
        || id === 'sheet.operation.set-cell-edit-visible-arrow'
      ) {
        this.setCellEditing(Boolean(info?.params?.visible));
      }

      // Univer: MUTATION is snapshot-persisted; OPERATION is not (selection/scroll).
      if (info?.type === COMMAND_TYPE_MUTATION) {
        this.lastMutationCommands = [...this.lastMutationCommands.slice(-80), trace];
        for (const cb of this.changeListeners) cb();
      }
    };

    const api = this.univerAPI;
    const wb = api?.getActiveWorkbook();
    // Subscribe once. Prefer workbook; fall back to univerAPI.
    if (wb && typeof wb.onCommandExecuted === 'function') {
      const d = wb.onCommandExecuted(emitIfMutation);
      this.commandUnsubs.push(() => d.dispose());
    } else if (api && typeof api.onCommandExecuted === 'function') {
      const d = api.onCommandExecuted(emitIfMutation);
      this.commandUnsubs.push(() => d.dispose());
    }
  }

  private unbindCommandListeners(): void {
    for (const u of this.commandUnsubs) {
      try {
        u();
      } catch {
        // ignore
      }
    }
    this.commandUnsubs = [];
  }
}

export function createUniverSpreadsheetEngine(): SpreadsheetEngineAdapter {
  return new UniverSpreadsheetEngine();
}

export { COMMAND_TYPE_MUTATION, COMMAND_TYPE_OPERATION };
