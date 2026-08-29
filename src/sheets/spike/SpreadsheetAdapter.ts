/**
 * PR1 spike — engine-agnostic spreadsheet boundary.
 * Focus UI must not call Univer (or any engine) APIs outside an adapter.
 */

export type SpreadsheetWorkbookState = unknown;

export interface SpreadsheetAdapter {
  /** Mount engine into a DOM container. Replaces any prior instance. */
  mount(container: HTMLElement, initial?: SpreadsheetWorkbookState): Promise<void>;
  /** Replace workbook contents while mounted. */
  loadState(state: SpreadsheetWorkbookState): void;
  /** Export serializable workbook snapshot. */
  exportState(): SpreadsheetWorkbookState;
  /** Optional hint after container resize (engine may also auto-observe). */
  resizeHint?(): void;
  /** Spike-only helpers used by the harness (not required of every engine). */
  probeCells?(refs: string[]): Record<string, unknown>;
  setCellValue?(a1: string, value: unknown): void;
  /** Tear down engine, listeners, and DOM ownership. */
  dispose(): void;
}

export interface SpreadsheetAdapterFactory {
  create(): SpreadsheetAdapter;
}
