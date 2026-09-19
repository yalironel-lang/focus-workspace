/**
 * M0.3 — which focus kinds may show Explain (explain_selection).
 * Reuses M0.1 focus kinds; does not duplicate extraction logic.
 */

import type { ZikukAiFocus } from '../context/types';

export function isExplainableFocus(focus: ZikukAiFocus): boolean {
  switch (focus.kind) {
    case 'text':
      return focus.text.trim().length > 0;
    case 'math_block':
    case 'math_inline':
      return focus.latex.trim().length > 0;
    case 'table':
      // whole_table is structure-explainable; cell_text needs non-empty text
      if (focus.mode === 'whole_table') return true;
      return Boolean(focus.text?.trim());
    case 'empty':
    case 'image':
    case 'handwriting':
    case 'unsupported':
      return false;
    default:
      return false;
  }
}
