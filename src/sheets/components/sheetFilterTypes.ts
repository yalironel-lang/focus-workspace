/** Focus-owned filter / data-tool types — no Univer imports. */

export type SheetFilterFailReason =
  | 'no-filter'
  | 'no-criteria'
  | 'filter-exists'
  | 'invalid-selection'
  | 'unsupported';

export type SheetFilterResult =
  | { ok: true }
  | { ok: false; reason: SheetFilterFailReason; message: string };

export type SheetDataToolState = {
  canAddFilter: boolean;
  canClearFilter: boolean;
  canRemoveFilter: boolean;
  addDisableReason: string | null;
  clearDisableReason: string | null;
  removeDisableReason: string | null;
  hasFilter: boolean;
  hasCriteria: boolean;
};

export const SHEET_FILTER_MESSAGES: Record<SheetFilterFailReason, string> = {
  'no-filter': 'No filter on this sheet.',
  'no-criteria': 'No active filter criteria.',
  'filter-exists': 'Remove the existing filter first.',
  'invalid-selection': 'Select a table including a header row.',
  unsupported: "Can't apply a filter to this selection.",
};

export function sheetFilterFail(
  reason: SheetFilterFailReason,
): Extract<SheetFilterResult, { ok: false }> {
  return { ok: false, reason, message: SHEET_FILTER_MESSAGES[reason] };
}
