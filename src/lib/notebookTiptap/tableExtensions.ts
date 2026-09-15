/**
 * M6.4A — TipTap/ProseMirror table nodes with Notebook names + tableRole.
 * Cell content is exactly one nbParagraph (not inline*).
 *
 * nbTableHeader remains in the schema for TipTap/ProseMirror table machinery
 * compatibility, but TablePayloadV1 has no header semantics — serialization
 * MUST fail closed if any nbTableHeader is present (see tipTapTableToBlock).
 * M6.4A initial tables use nbTableCell only.
 *
 * M6.4B: all Notebook insert wrappers MUST use withHeaderRow: false (see
 * tableCommands.ts). NbTable Tab does NOT auto-add rows at the last cell.
 *
 * Visibility: TipTap tables have no default borders. Empty cells collapse to a
 * blank-looking caret without explicit cell chrome — set minimal inline styles
 * so a 3×3 grid is structurally visible in candidate/viewer (not product UI).
 */

import { Table } from '@tiptap/extension-table/table';
import { TableRow } from '@tiptap/extension-table/row';
import { TableCell } from '@tiptap/extension-table/cell';
import { TableHeader } from '@tiptap/extension-table/header';
import { isSelectionInsideTable, navigateNotebookTableCell } from './tableCommands';

/** Product-facing grid chrome (M6.4C) — restrained document table, not a spreadsheet. */
export const NB_TABLE_ELEMENT_STYLE =
  'border-collapse:collapse;width:100%;margin:0.65em 0;table-layout:fixed;border:1px solid rgba(148,163,184,0.55);';
export const NB_TABLE_CELL_ELEMENT_STYLE =
  'border:1px solid rgba(148,163,184,0.55);min-width:3.25rem;min-height:2rem;padding:8px 10px;vertical-align:top;';

export const NbTable = Table.extend({
  name: 'nbTable',
  content: 'nbTableRow+',

  addKeyboardShortcuts() {
    return {
      // Notebook Tab: move cell + collapsed caret at paragraph END.
      // Do NOT leave goToNextCell's TextSelection.between range (selects cell text).
      // Do NOT TipTap-default addRowAfter on last cell. Never steal bullet indent Tab.
      Tab: () => {
        if (!isSelectionInsideTable(this.editor)) return false;
        navigateNotebookTableCell(this.editor, 1);
        return true;
      },
      'Shift-Tab': () => {
        if (!isSelectionInsideTable(this.editor)) return false;
        navigateNotebookTableCell(this.editor, -1);
        return true;
      },
      // Stock deleteTableWhenAllCellsSelected hardcodes "table"/"tableCell" names —
      // leave Backspace/Delete to Notebook keymap / Nestable CellSelection text edits.
      Backspace: () => false,
      'Mod-Backspace': () => false,
      Delete: () => false,
      'Mod-Delete': () => false,
    };
  },
}).configure({
  resizable: false,
  allowTableNodeSelection: true,
  HTMLAttributes: {
    class: 'nb-table',
    'data-nb': 'nbTable',
    style: NB_TABLE_ELEMENT_STYLE,
  },
});

export const NbTableRow = TableRow.extend({
  name: 'nbTableRow',
  content: '(nbTableCell | nbTableHeader)*',
});

export const NbTableCell = TableCell.extend({
  name: 'nbTableCell',
  content: 'nbParagraph',
}).configure({
  HTMLAttributes: {
    class: 'nb-table-cell',
    'data-nb': 'nbTableCell',
    style: NB_TABLE_CELL_ELEMENT_STYLE,
  },
});

export const NbTableHeader = TableHeader.extend({
  name: 'nbTableHeader',
  content: 'nbParagraph',
}).configure({
  HTMLAttributes: {
    class: 'nb-table-header',
    'data-nb': 'nbTableHeader',
    style: NB_TABLE_CELL_ELEMENT_STYLE,
  },
});

/** Schema nodes required for table round-trip (no resize plugin). */
export function createNotebookTableExtensions() {
  return [NbTable, NbTableRow, NbTableCell, NbTableHeader];
}
