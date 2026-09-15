/**
 * TipTap Candidate formatting commands (M4.1 / M4.2).
 * Presentation-free — usable from toolbar, shortcuts, future chrome.
 */

import type { Editor } from '@tiptap/core';
import { getMarkRange } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { DEFAULT_NOTEBOOK_FONT_SIZE } from '../notebookInlineMarks';
import type { TextAlignment } from '../notebookDialect';
import { sanitizeUrl } from '../urlSanitizer';

/** Student-oriented size presets for the candidate toolbar. */
export const CANDIDATE_FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32] as const;

export type CandidateFontSizePx = (typeof CANDIDATE_FONT_SIZE_PRESETS)[number];

export const SUPPORTED_ALIGN_NODE_NAMES = new Set([
  'nbParagraph',
  'nbTitle',
  'nbSection',
  'nbQuote',
]);

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
  | { type: 'clearFormatting' }
  | { type: 'applyLink'; href: string }
  | { type: 'removeLink' }
  | { type: 'setAlignment'; align: TextAlignment | null };

export type CandidateFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  math: boolean;
  link: boolean;
  linkHref: string | null;
  canLink: boolean;
  align: TextAlignment | null;
  alignSupported: boolean;
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

  const isLinkActive = editor.isActive('link');
  const linkHref = isLinkActive
    ? ((editor.getAttributes('link').href as string | null) ?? null)
    : null;
  const canLink = (!empty && to > from) || isLinkActive;

  let alignSupported = false;
  const alignments = new Set<TextAlignment | null>();
  if (editor.state.selection instanceof NodeSelection) {
    const node = editor.state.selection.node;
    if (SUPPORTED_ALIGN_NODE_NAMES.has(node.type.name)) {
      alignSupported = true;
      alignments.add((node.attrs.align as TextAlignment | null) ?? null);
    }
  } else {
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.isBlock && SUPPORTED_ALIGN_NODE_NAMES.has(node.type.name)) {
        alignSupported = true;
        alignments.add((node.attrs.align as TextAlignment | null) ?? null);
      }
    });
  }
  let align: TextAlignment | null = null;
  if (alignSupported && alignments.size === 1) {
    align = [...alignments][0]!;
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
    link: isLinkActive,
    linkHref,
    canLink,
    align,
    alignSupported,
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

export function applyCandidateLink(editor: Editor, rawHref: string): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const href = sanitizeUrl(rawHref);
  if (!href) return false;

  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  const linkType = state.schema.marks.link;
  if (!linkType) return false;

  if (empty && editor.isActive('link')) {
    const range = getMarkRange(state.selection.$from, linkType);
    if (!range) return false;
    const tr = state.tr;
    tr.removeMark(range.from, range.to, linkType);
    tr.addMark(range.from, range.to, linkType.create({ href }));
    view.dispatch(tr);
    return true;
  }

  if (!empty && to > from) {
    let effectiveTo = to;
    while (effectiveTo > from) {
      const char = state.doc.textBetween(effectiveTo - 1, effectiveTo);
      if (char === ' ' || char === '\t' || char === '\n') {
        effectiveTo--;
      } else {
        break;
      }
    }
    if (effectiveTo <= from) return false;

    const tr = state.tr;
    tr.removeMark(from, effectiveTo, linkType);

    let applied = false;
    state.doc.nodesBetween(from, effectiveTo, (node, pos) => {
      if (node.isText) {
        const start = Math.max(from, pos);
        const end = Math.min(effectiveTo, pos + node.nodeSize);
        if (end > start) {
          tr.addMark(start, end, linkType.create({ href }));
          applied = true;
        }
      }
    });

    if (applied) {
      view.dispatch(tr);
      return true;
    }
  }

  return false;
}

export function removeCandidateLink(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state, view } = editor;
  const linkType = state.schema.marks.link;
  if (!linkType) return false;

  const { from, to, empty } = state.selection;

  if (empty && editor.isActive('link')) {
    const range = getMarkRange(state.selection.$from, linkType);
    if (!range) return false;
    const tr = state.tr.removeMark(range.from, range.to, linkType);
    view.dispatch(tr);
    return true;
  }

  if (!empty && to > from) {
    const tr = state.tr.removeMark(from, to, linkType);
    view.dispatch(tr);
    return true;
  }

  return false;
}

export function setCandidateAlignment(
  editor: Editor,
  align: TextAlignment | null,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (align !== null && align !== 'left' && align !== 'center' && align !== 'right') {
    return false;
  }

  const { state, view } = editor;
  const { from, to } = state.selection;

  const blocksToUpdate: { pos: number; node: any }[] = [];

  if (state.selection instanceof NodeSelection) {
    const node = state.selection.node;
    if (SUPPORTED_ALIGN_NODE_NAMES.has(node.type.name)) {
      blocksToUpdate.push({ pos: from, node });
    }
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && SUPPORTED_ALIGN_NODE_NAMES.has(node.type.name)) {
        blocksToUpdate.push({ pos, node });
      }
    });
  }

  if (blocksToUpdate.length === 0) return false;

  const tr = state.tr;
  for (const { pos, node } of blocksToUpdate) {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      align,
    });
  }
  view.dispatch(tr);
  return true;
}

export function runCandidateFormatCommand(editor: Editor, cmd: CandidateFormatCommand): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { empty } = editor.state.selection;
  const isAllowedEmpty =
    cmd.type === 'setAlignment' ||
    ((cmd.type === 'applyLink' || cmd.type === 'removeLink') && editor.isActive('link'));
  if (empty && !isAllowedEmpty) return false;

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
    case 'applyLink':
      return applyCandidateLink(editor, cmd.href);
    case 'removeLink':
      return removeCandidateLink(editor);
    case 'setAlignment':
      return setCandidateAlignment(editor, cmd.align);
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
          for (const name of ['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight', 'math', 'link']) {
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
