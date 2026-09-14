/**
 * TipTap Candidate formatting commands (M4.1 / M4.2).
 * Presentation-free — usable from toolbar, shortcuts, future chrome.
 */

import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { DEFAULT_NOTEBOOK_FONT_SIZE } from '../notebookInlineMarks';

/** Student-oriented size presets for the candidate toolbar. */
export const CANDIDATE_FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32] as const;

export type CandidateFontSizePx = (typeof CANDIDATE_FONT_SIZE_PRESETS)[number];

export type CandidateFormatCommand =
  | { type: 'toggleBold' }
  | { type: 'toggleItalic' }
  | { type: 'toggleUnderline' }
  | { type: 'toggleStrike' }
  | { type: 'toggleMath' }
  | { type: 'setFontSize'; px: number }
  | { type: 'setTextColor'; color: string }
  | { type: 'setHighlight'; color: string }
  | { type: 'clearHighlight' }
  | { type: 'clearFormatting' };

export type CandidateFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  math: boolean;
  /** Unambiguous size in px, or null when default / unset. */
  fontSizePx: number | null;
  fontSizeMixed: boolean;
  color: string | undefined;
  colorMixed: boolean;
  highlight: string | undefined;
  highlightMixed: boolean;
  selectionEmpty: boolean;
  from: number;
  to: number;
};

function parseFontSizePx(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw).replace(/px$/i, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Walk the selection and collect textStyle/highlight attribute values per character.
 * Used for honest mixed-state toolbar feedback.
 */
function collectMarkValuesAcrossSelection(
  editor: Editor,
  key: 'fontSize' | 'color' | 'highlight',
): Set<string> {
  const { from, to, empty } = editor.state.selection;
  const values = new Set<string>();
  if (empty || to <= from) return values;

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    if (end <= start) return;

    if (key === 'highlight') {
      const hl = node.marks.find(m => m.type.name === 'highlight');
      const c = hl?.attrs?.color;
      values.add(typeof c === 'string' && c ? c : '');
      return;
    }

    const ts = node.marks.find(m => m.type.name === 'textStyle');
    if (key === 'fontSize') {
      const px = parseFontSizePx(ts?.attrs?.fontSize);
      values.add(px == null ? '' : String(px));
    } else {
      const c = ts?.attrs?.color;
      values.add(typeof c === 'string' && c ? c : '');
    }
  });

  return values;
}

export function readCandidateFormatState(editor: Editor): CandidateFormatState {
  const { from, to, empty } = editor.state.selection;
  const fontSizes = collectMarkValuesAcrossSelection(editor, 'fontSize');
  const colors = collectMarkValuesAcrossSelection(editor, 'color');
  const highlights = collectMarkValuesAcrossSelection(editor, 'highlight');

  const fontSizeMixed = fontSizes.size > 1;
  const colorMixed = colors.size > 1;
  const highlightMixed = highlights.size > 1;

  let fontSizePx: number | null = null;
  if (!fontSizeMixed && fontSizes.size === 1) {
    const only = [...fontSizes][0]!;
    fontSizePx = only === '' ? null : Number(only);
  } else if (fontSizes.size === 0) {
    fontSizePx = null;
  }

  let color: string | undefined;
  if (!colorMixed && colors.size === 1) {
    const only = [...colors][0]!;
    color = only === '' ? undefined : only;
  }

  let highlight: string | undefined;
  if (!highlightMixed && highlights.size === 1) {
    const only = [...highlights][0]!;
    highlight = only === '' ? undefined : only;
  }

  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    math: (() => {
      if (editor.isActive('math')) return true;
      const mathNodeType = editor.state.schema.nodes.nbInlineMath;
      if (!mathNodeType) return false;
      if (editor.state.selection instanceof NodeSelection && editor.state.selection.node.type === mathNodeType) {
        return true;
      }
      if (!empty && to > from) {
        let found = false;
        editor.state.doc.nodesBetween(from, to, node => {
          if (node.type === mathNodeType) {
            found = true;
            return false;
          }
        });
        return found;
      }
      return false;
    })(),
    fontSizePx,
    fontSizeMixed,
    color,
    colorMixed,
    highlight,
    highlightMixed,
    selectionEmpty: empty,
    from,
    to,
  };
}

/**
 * Apply / replace font-size on the live selection.
 * Default (18) clears the explicit mark so dialect storage stays canonical.
 */
export function applyCandidateFontSize(editor: Editor, px: number): boolean {
  if (editor.isDestroyed || !editor.isEditable || editor.state.selection.empty) return false;
  if (!(CANDIDATE_FONT_SIZE_PRESETS as readonly number[]).includes(px)) return false;
  if (px === DEFAULT_NOTEBOOK_FONT_SIZE) {
    return editor.chain().focus().unsetFontSize().removeEmptyTextStyle().run();
  }
  // setFontSize replaces textStyle.fontSize rather than stacking parallel marks.
  return editor.chain().focus().setFontSize(`${px}px`).run();
}

export function toggleCandidateMath(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  const mathNodeType = state.schema.nodes.nbInlineMath;
  if (!mathNodeType) return false;

  // Case 1: NodeSelection on an nbInlineMath node
  if (state.selection instanceof NodeSelection && state.selection.node.type === mathNodeType) {
    const node = state.selection.node;
    const text = (node.attrs.text as string) ?? '';
    const marks = (node.marks ?? []).filter(m => m.type.name !== 'math');
    const tr = state.tr.replaceWith(from, to, state.schema.text(text, marks));
    tr.setSelection(TextSelection.create(tr.doc, from, from + text.length));
    view.dispatch(tr);
    return true;
  }

  // Case 2: Selection encompasses or overlaps nbInlineMath node(s)
  const mathNodes: { pos: number; nodeSize: number; text: string; marks: any[] }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === mathNodeType) {
      mathNodes.push({
        pos,
        nodeSize: node.nodeSize,
        text: (node.attrs.text as string) ?? '',
        marks: (node.marks ?? []).filter(m => m.type.name !== 'math'),
      });
      return false;
    }
  });

  if (mathNodes.length > 0) {
    const tr = state.tr;
    for (let i = mathNodes.length - 1; i >= 0; i--) {
      const { pos, nodeSize, text, marks } = mathNodes[i]!;
      tr.replaceWith(pos, pos + nodeSize, state.schema.text(text, marks));
    }
    view.dispatch(tr);
    return true;
  }

  // Case 3: Text range selected -> convert to nbInlineMath
  if (!empty && to > from) {
    const selectedText = state.doc.textBetween(from, to);
    if (!selectedText.trim()) return false;

    const $from = state.doc.resolve(from);
    const existingMarks = $from.marks().filter(m => m.type.name !== 'math');

    const inlineMathNode = mathNodeType.create(
      { text: selectedText },
      null,
      existingMarks,
    );
    const tr = state.tr.replaceWith(from, to, inlineMathNode);
    const afterPos = from + inlineMathNode.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, afterPos, afterPos));
    view.dispatch(tr);
    return true;
  }

  return false;
}

export function runCandidateFormatCommand(editor: Editor, cmd: CandidateFormatCommand): boolean {
  if (editor.isDestroyed || !editor.isEditable || editor.state.selection.empty) return false;

  switch (cmd.type) {
    case 'toggleBold':
      return editor.chain().focus().toggleBold().run();
    case 'toggleItalic':
      return editor.chain().focus().toggleItalic().run();
    case 'toggleUnderline':
      return editor.chain().focus().toggleUnderline().run();
    case 'toggleStrike':
      return editor.chain().focus().toggleStrike().run();
    case 'toggleMath':
      return toggleCandidateMath(editor);
    case 'setFontSize':
      return applyCandidateFontSize(editor, cmd.px);
    case 'setTextColor':
      return editor.chain().focus().setColor(cmd.color).run();
    case 'setHighlight':
      return editor.chain().focus().setHighlight({ color: cmd.color }).run();
    case 'clearHighlight':
      return editor.chain().focus().unsetHighlight().run();
    case 'clearFormatting':
      return editor.chain().focus().command(({ tr, state }) => {
        const { from, to } = tr.selection;
        state.doc.nodesBetween(from, to, (node, pos) => {
          // Block math and media are opaque; clear only editable inline presentation.
          if (node.isAtom && !node.isText) {
            if (node.type.name === 'nbInlineMath') {
              const text = (node.attrs.text as string) ?? '';
              const marks = (node.marks ?? []).filter(m => m.type.name !== 'math');
              tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(text, marks));
            }
            return false;
          }
          if (!node.isText) return;
          const start = Math.max(from, pos);
          const end = Math.min(to, pos + node.nodeSize);
          for (const name of ['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight', 'math']) {
            if (state.schema.marks[name]) {
              tr.removeMark(start, end, state.schema.marks[name]);
            }
          }
        });
        return true;
      }).run();
    default: {
      const _exhaustive: never = cmd;
      return _exhaustive;
    }
  }
}

/** @deprecated use readCandidateFormatState().fontSizePx */
export function activeFontSizePx(fontSize: string | undefined): number | null {
  if (!fontSize) return DEFAULT_NOTEBOOK_FONT_SIZE;
  return parseFontSizePx(fontSize) ?? null;
}
