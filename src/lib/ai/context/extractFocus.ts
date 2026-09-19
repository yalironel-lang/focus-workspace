/**
 * Classify TipTap selection into a detached ZikukAiFocus snapshot.
 * Read-only — never mutates the editor.
 */

import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { readCandidateBlockKind } from '../../notebookTiptap/candidateBlockCommands';
import { getProtectedAtomInSelection } from '../../notebookTiptap/sandboxKeymap';
import {
  isSelectionInsideTable,
  readCandidateTableState,
} from '../../notebookTiptap/tableCommands';
import { MAX_SELECTION_CHARS, truncateWithFlag } from './bounds';
import {
  inlineMathLeafText,
  mapTextBlockKind,
  plainTextFromNode,
} from './normalizeBlock';
import type { ZikukAiBlockKind, ZikukAiFocus } from './types';

function calloutToneFromEditor(editor: Editor): string | undefined {
  const kind = readCandidateBlockKind(editor);
  if (kind.type === 'nbCallout' && kind.tone) return kind.tone;
  return undefined;
}

function containingBlockKind(editor: Editor): ZikukAiBlockKind {
  const kind = readCandidateBlockKind(editor);
  return mapTextBlockKind(kind.type);
}

function selectionPlainText(editor: Editor, from: number, to: number): string {
  return editor.state.doc.textBetween(from, to, '\n', inlineMathLeafText);
}

function onlyInlineMathInRange(doc: PmNode, from: number, to: number): PmNode | null {
  let math: PmNode | null = null;
  let otherText = false;
  doc.nodesBetween(from, to, node => {
    if (node.type.name === 'nbInlineMath') {
      math = node;
      return false;
    }
    if (node.isText && node.text && node.text.length > 0) {
      otherText = true;
    }
    return true;
  });
  if (math && !otherText) return math;
  return null;
}

export function extractFocus(editor: Editor): ZikukAiFocus {
  const { selection, doc } = editor.state;
  const { from, to, empty } = selection;

  // Whole-node selections (atoms / table)
  if (selection instanceof NodeSelection) {
    const node = selection.node;
    const name = node.type.name;

    if (name === 'nbImageRef') {
      return {
        kind: 'image',
        assetKey: String(node.attrs.key ?? ''),
        alt: String(node.attrs.alt ?? ''),
        from,
        to,
      };
    }
    if (name === 'nbHandwriting') {
      return {
        kind: 'handwriting',
        assetKey: String(node.attrs.key ?? ''),
        from,
        to,
      };
    }
    if (name === 'nbDivider') {
      return { kind: 'unsupported', reason: 'divider', from, to };
    }
    if (name === 'nbTable') {
      const rows = node.childCount;
      const cols = node.firstChild?.childCount ?? 0;
      return {
        kind: 'table',
        mode: 'whole_table',
        rows,
        cols,
        from,
        to,
      };
    }
    if (name === 'nbInlineMath') {
      const latexRaw = String(node.attrs.text ?? '');
      const { text: latex } = truncateWithFlag(latexRaw, MAX_SELECTION_CHARS);
      return {
        kind: 'math_inline',
        latex,
        from,
        to,
        blockKind: containingBlockKind(editor),
        calloutTone: calloutToneFromEditor(editor),
      };
    }
    if (name === 'nbMath') {
      const latexRaw = plainTextFromNode(node);
      const { text: latex } = truncateWithFlag(latexRaw, MAX_SELECTION_CHARS);
      return { kind: 'math_block', latex, from, to, blockKind: 'math' };
    }
  }

  // GapCursor / protected atom helpers (doc-level select of block atom)
  const protectedAtom = getProtectedAtomInSelection(editor.state);
  if (protectedAtom && !(selection instanceof NodeSelection && selection.node === protectedAtom.node)) {
    // Already handled NodeSelection above; this covers doc-parent edge cases.
    const node = protectedAtom.node;
    const name = node.type.name;
    if (name === 'nbImageRef') {
      return {
        kind: 'image',
        assetKey: String(node.attrs.key ?? ''),
        alt: String(node.attrs.alt ?? ''),
        from: protectedAtom.pos,
        to: protectedAtom.to,
      };
    }
    if (name === 'nbHandwriting') {
      return {
        kind: 'handwriting',
        assetKey: String(node.attrs.key ?? ''),
        from: protectedAtom.pos,
        to: protectedAtom.to,
      };
    }
    if (name === 'nbDivider') {
      return {
        kind: 'unsupported',
        reason: 'divider',
        from: protectedAtom.pos,
        to: protectedAtom.to,
      };
    }
    if (name === 'nbTable') {
      return {
        kind: 'table',
        mode: 'whole_table',
        rows: node.childCount,
        cols: node.firstChild?.childCount ?? 0,
        from: protectedAtom.pos,
        to: protectedAtom.to,
      };
    }
  }

  if (empty) {
    return { kind: 'empty' };
  }

  // Table cell text selection
  if (isSelectionInsideTable(editor)) {
    const tableState = readCandidateTableState(editor);
    const raw = selectionPlainText(editor, from, to);
    const { text } = truncateWithFlag(raw, MAX_SELECTION_CHARS);
    return {
      kind: 'table',
      mode: 'cell_text',
      rows: tableState.rows,
      cols: tableState.cols,
      text,
      from,
      to,
    };
  }

  const parent = selection.$from.parent;

  // Block math textblock
  if (parent.type.name === 'nbMath') {
    const raw = selectionPlainText(editor, from, to) || plainTextFromNode(parent);
    const { text: latex } = truncateWithFlag(raw, MAX_SELECTION_CHARS);
    return { kind: 'math_block', latex, from, to, blockKind: 'math' };
  }

  // Selection that is only an inline math atom (range covering the atom)
  const onlyMath = onlyInlineMathInRange(doc, from, to);
  if (onlyMath) {
    const latexRaw = String(onlyMath.attrs.text ?? '');
    const { text: latex } = truncateWithFlag(latexRaw, MAX_SELECTION_CHARS);
    return {
      kind: 'math_inline',
      latex,
      from,
      to,
      blockKind: containingBlockKind(editor),
      calloutTone: calloutToneFromEditor(editor),
    };
  }

  const raw = selectionPlainText(editor, from, to);
  const { text } = truncateWithFlag(raw, MAX_SELECTION_CHARS);
  const blockKind = containingBlockKind(editor);
  const tone = calloutToneFromEditor(editor);
  return {
    kind: 'text',
    text,
    from,
    to,
    blockKind,
    ...(tone ? { calloutTone: tone } : {}),
  };
}
