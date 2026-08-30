import type { FocusSheetDocument } from '../domain/FocusSheetDocument';

export type SpreadsheetUnsubscribe = () => void;

export type SpreadsheetCellValue = string | number | boolean | null;

/**
 * Focus-owned spreadsheet engine boundary.
 * Product code must not import Univer types through this interface.
 */
export interface SpreadsheetEngineAdapter {
  mount(container: HTMLElement, document: FocusSheetDocument): Promise<void>;
  /** Replace workbook while mounted. */
  loadDocument(document: FocusSheetDocument): void;
  exportDocument(): FocusSheetDocument;
  resize(): void;
  focus(): void;
  dispose(): void;

  /**
   * Fires when persistent workbook content changed.
   * Does not fire for selection-only movement when Univer distinguishes it
   * (CommandType.MUTATION vs OPERATION).
   * Adapter does not debounce and does not export on each event.
   */
  onDocumentChanged(cb: () => void): SpreadsheetUnsubscribe;

  /** Future Calculate UX / tests. */
  setCellValue(a1: string, value: SpreadsheetCellValue): void;
  setCellFormula(a1: string, formula: string): void;
  clearCell(a1: string): void;
}

export interface SpreadsheetEngineAdapterFactory {
  create(): SpreadsheetEngineAdapter;
}
