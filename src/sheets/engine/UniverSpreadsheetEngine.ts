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
  SpreadsheetCellGrid,
  SpreadsheetCellValue,
  SpreadsheetEngineAdapter,
  SpreadsheetUnsubscribe,
} from './SpreadsheetEngineAdapter';

/** Univer CommandType.MUTATION — persisted snapshot change. */
const COMMAND_TYPE_MUTATION = 2;
/** Univer CommandType.OPERATION — not saved to snapshot (selection, scroll). */
const COMMAND_TYPE_OPERATION = 1;

type CommandInfo = { id?: string; type?: number };

type UniverRange = {
  getValue: () => unknown;
  getFormula?: () => string;
  setValue: (v: unknown) => unknown;
  setValues?: (grid: unknown) => unknown;
  setFormula?: (formula: string) => unknown;
  clearContent?: () => unknown;
};

type UniverSheet = {
  getRange: (a1: string) => UniverRange;
  setActiveRange?: (range: UniverRange) => unknown;
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

  async mount(container: HTMLElement, document: FocusSheetDocument): Promise<void> {
    this.dispose();
    this.container = container;
    const doc = migrateFocusSheetDocument(document);

    try {
      const [{ UniverSheetsCorePreset }, sheetsCoreEnUS] = await Promise.all([
        import('@univerjs/preset-sheets-core'),
        import('@univerjs/preset-sheets-core/locales/en-US'),
      ]);
      await import('@univerjs/preset-sheets-core/lib/index.css');

      const localeMod = (sheetsCoreEnUS as { default?: unknown }).default ?? sheetsCoreEnUS;

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
    if (this.container) {
      this.container.replaceChildren();
    }
    this.container = null;
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

  pasteValues(startA1: string, grid: SpreadsheetCellGrid): void {
    const range = this.requireRange(startA1);
    if (typeof range.setValues === 'function') {
      range.setValues(grid);
      return;
    }
    range.setValue(grid[0]?.[0] ?? null);
  }

  undo(): void {
    const wb = this.requireWorkbook();
    if (typeof wb.undo === 'function') {
      void wb.undo();
      return;
    }
    void this.requireApi().undo?.();
  }

  redo(): void {
    const wb = this.requireWorkbook();
    if (typeof wb.redo === 'function') {
      void wb.redo();
      return;
    }
    void this.requireApi().redo?.();
  }

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

  private bindCommandListeners(): void {
    this.unbindCommandListeners();
    const emitIfMutation = (info: CommandInfo) => {
      const trace: DocumentChangedTrace = { id: String(info?.id ?? ''), type: info?.type };
      this.lastObservedCommands = [...this.lastObservedCommands.slice(-80), trace];
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
