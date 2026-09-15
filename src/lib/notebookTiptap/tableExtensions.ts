/**
 * M6.4A — TipTap/ProseMirror table nodes with Notebook names + tableRole.
 * Cell content is exactly one nbParagraph (not inline*).
 *
 * nbTableHeader remains in the schema for TipTap/ProseMirror table machinery
 * compatibility, but TablePayloadV1 has no header semantics — serialization
 * MUST fail closed if any nbTableHeader is present (see tipTapTableToBlock).
 * M6.4A initial tables use nbTableCell only. M6.4B must insert with
 * withHeaderRow: false when/if insertTable is wired.
 */

import { Table } from '@tiptap/extension-table/table';
import { TableRow } from '@tiptap/extension-table/row';
import { TableCell } from '@tiptap/extension-table/cell';
import { TableHeader } from '@tiptap/extension-table/header';

export const NbTable = Table.extend({
  name: 'nbTable',
  content: 'nbTableRow+',
}).configure({
  resizable: false,
  allowTableNodeSelection: true,
});

export const NbTableRow = TableRow.extend({
  name: 'nbTableRow',
  content: '(nbTableCell | nbTableHeader)*',
});

export const NbTableCell = TableCell.extend({
  name: 'nbTableCell',
  content: 'nbParagraph',
});

export const NbTableHeader = TableHeader.extend({
  name: 'nbTableHeader',
  content: 'nbParagraph',
});

/** Schema nodes required for table round-trip (no resize plugin). */
export function createNotebookTableExtensions() {
  return [NbTable, NbTableRow, NbTableCell, NbTableHeader];
}
