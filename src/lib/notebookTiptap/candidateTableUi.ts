/**
 * M6.4C — Product table UI constants + labels (commands stay in tableCommands).
 *
 * Picker max is a UX cap only; canonical/runtime bounds remain 1..20.
 */

import type { CandidateTableCommand } from './tableCommands';

/** Visible size-picker grid (does not change MAX_TABLE_ROWS/COLS). */
export const TABLE_SIZE_PICKER_MAX = 10;

export type TableMenuAction = {
  cmd: Exclude<CandidateTableCommand['type'], 'insertTable'>;
  label: string;
  title: string;
  destructive?: boolean;
  /** Which CandidateTableState flag gates enabling (delete* always allow when in table). */
  enableKey?: 'canAddRow' | 'canAddColumn' | 'canDeleteRow' | 'canDeleteColumn' | 'canDeleteTable';
};

export const TABLE_CONTEXT_MENU_ACTIONS: readonly TableMenuAction[] = [
  { cmd: 'addRowBefore', label: 'Add row above', title: 'Insert a row above the current row', enableKey: 'canAddRow' },
  { cmd: 'addRowAfter', label: 'Add row below', title: 'Insert a row below the current row', enableKey: 'canAddRow' },
  { cmd: 'addColumnBefore', label: 'Add column left', title: 'Insert a column to the left', enableKey: 'canAddColumn' },
  { cmd: 'addColumnAfter', label: 'Add column right', title: 'Insert a column to the right', enableKey: 'canAddColumn' },
  { cmd: 'deleteRow', label: 'Delete row', title: 'Delete the current row (last row deletes the table)', enableKey: 'canDeleteRow', destructive: true },
  { cmd: 'deleteColumn', label: 'Delete column', title: 'Delete the current column (last column deletes the table)', enableKey: 'canDeleteColumn', destructive: true },
  { cmd: 'deleteTable', label: 'Delete table', title: 'Delete the entire table', enableKey: 'canDeleteTable', destructive: true },
] as const;

/** Label for picker hover: columns × rows (matches insert args). */
export function formatTableSizeLabel(cols: number, rows: number): string {
  return `${cols} × ${rows}`;
}
