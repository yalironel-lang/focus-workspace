/**
 * Univer implementation of SpreadsheetAdapter.
 * All Univer imports stay inside this module (and createUniverOss).
 */

import type { SpreadsheetAdapter, SpreadsheetWorkbookState } from './SpreadsheetAdapter';
import { createUniverOss, LocaleType, mergeLocales } from './createUniverOss';

type UniverApi = {
  createWorkbook: (data?: unknown) => unknown;
  getActiveWorkbook: () => {
    save: () => unknown;
    getId: () => string;
    getActiveSheet: () => {
      getRange: (a1: string) => {
        getValue: () => unknown;
        getFormula: () => string;
        setValue: (v: unknown) => unknown;
      };
    };
  } | null;
  disposeUnit: (unitId: string) => void;
  dispose: () => void;
  getFormula?: () => { executeCalculation?: () => void };
};

type UniverHandle = {
  dispose: () => void;
};

export class UniverSpreadsheetAdapter implements SpreadsheetAdapter {
  private univer: UniverHandle | null = null;
  private univerAPI: UniverApi | null = null;
  private container: HTMLElement | null = null;

  async mount(container: HTMLElement, initial?: SpreadsheetWorkbookState): Promise<void> {
    this.dispose();
    this.container = container;

    // Dynamic import keeps Univer out of the main Focus chunk until the spike opens.
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
          toolbar: true,
          formulaBar: true,
        }),
      ],
    });

    this.univer = univer;
    this.univerAPI = univerAPI as unknown as UniverApi;
    this.univerAPI.createWorkbook(initial ?? {});
  }

  loadState(state: SpreadsheetWorkbookState): void {
    if (!this.univerAPI) {
      throw new Error('UniverSpreadsheetAdapter: not mounted');
    }
    const active = this.univerAPI.getActiveWorkbook();
    if (active) {
      try {
        this.univerAPI.disposeUnit(active.getId());
      } catch {
        // ignore dispose race
      }
    }
    this.univerAPI.createWorkbook(state ?? {});
  }

  exportState(): SpreadsheetWorkbookState {
    if (!this.univerAPI) {
      throw new Error('UniverSpreadsheetAdapter: not mounted');
    }
    const wb = this.univerAPI.getActiveWorkbook();
    if (!wb) {
      throw new Error('UniverSpreadsheetAdapter: no active workbook');
    }
    return wb.save();
  }

  resizeHint(): void {
    // Univer sheets-ui uses ResizeObserver on the container; force a window
    // resize event as a fallback nudge for stubborn layouts.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }

  probeCells(refs: string[]): Record<string, unknown> {
    if (!this.univerAPI) {
      throw new Error('UniverSpreadsheetAdapter: not mounted');
    }
    const wb = this.univerAPI.getActiveWorkbook();
    if (!wb) {
      throw new Error('UniverSpreadsheetAdapter: no active workbook');
    }
    const sheet = wb.getActiveSheet();
    const out: Record<string, unknown> = {};
    for (const ref of refs) {
      const range = sheet.getRange(ref);
      out[ref] = {
        value: range.getValue(),
        formula: range.getFormula?.() ?? null,
      };
    }
    return out;
  }

  /** Spike helper: set a cell value via facade (for dependency recalc tests). */
  setCellValue(a1: string, value: unknown): void {
    if (!this.univerAPI) throw new Error('not mounted');
    const wb = this.univerAPI.getActiveWorkbook();
    wb?.getActiveSheet().getRange(a1).setValue(value);
  }

  dispose(): void {
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
}

export function createUniverSpreadsheetAdapter(): SpreadsheetAdapter {
  return new UniverSpreadsheetAdapter();
}
