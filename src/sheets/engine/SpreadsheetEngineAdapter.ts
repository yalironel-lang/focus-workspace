import type { FocusSheetDocument } from '../domain/FocusSheetDocument';
import type {
  SheetHorizontalAlign,
  SheetNumberFormatPreset,
  SheetSelectionState,
} from '../components/sheetToolbarTypes';

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

  /**
   * Fires on selection changes (and after format mutations so UI can refresh).
   * Must NEVER schedule document export by itself.
   */
  onSelectionChange(cb: () => void): SpreadsheetUnsubscribe;

  /** Active selection + active-cell style for toolbar pressed states. */
  getSelectionState(): SheetSelectionState;

  undo(): void;
  redo(): void;

  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;

  setHorizontalAlign(align: SheetHorizontalAlign): void;

  setFontColor(cssColor: string | null): void;
  setFillColor(cssColor: string | null): void;

  setNumberFormat(preset: SheetNumberFormatPreset): void;
  adjustDecimalPlaces(delta: -1 | 1): void;

  /** Add AutoFilter on the resolved selection (header = first row). */
  addFilter(): import('../components/sheetFilterTypes').SheetFilterResult;
  /** Clear all column criteria; keep filter buttons. */
  clearFilter(): import('../components/sheetFilterTypes').SheetFilterResult;
  /** Remove AutoFilter entirely. */
  removeFilter(): import('../components/sheetFilterTypes').SheetFilterResult;
  /** Toolbar enable/disable for Data ▾ filter actions. */
  getDataToolState(): import('../components/sheetFilterTypes').SheetDataToolState;

  /** Optional — used by UOV Escape handoff when the engine tracks cell edit UI. */
  isCellEditing?(): boolean;
  onCellEditingChanged?(cb: (editing: boolean) => void): SpreadsheetUnsubscribe;

  /** Future Calculate UX / tests. */
  setCellValue(a1: string, value: SpreadsheetCellValue): void;
  setCellFormula(a1: string, formula: string): void;
  clearCell(a1: string): void;
}

export interface SpreadsheetEngineAdapterFactory {
  create(): SpreadsheetEngineAdapter;
}
