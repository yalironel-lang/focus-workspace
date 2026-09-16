/**
 * TipTap Candidate block / academic morph commands (M4.2 / M7.4A).
 * Explicit toolbar-driven transformations only — no typed-prefix auto-convert.
 *
 * Create vs convert (M7.4A product contract):
 * - `runCandidateBlockCommand` — CONVERT the current textblock (floating toolbar).
 * - `insertCandidateBlockAtTarget` — CREATE a new block at a captured insert target (+ Add menu).
 */

import type { Editor, JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { CalloutTone } from '../notebookDialect';
import { CALLOUT_TONES } from '../notebookDialect';
import { inheritDirForNewBlock, normalizeTextDir } from './direction';
import { calloutLabel } from './visualTokens';
import {
  resolveNbImageInsertTarget,
  type NbImageInsertTarget,
} from './candidateImageInsert';

export type CandidateBasicBlockTarget =
  | 'paragraph'
  | 'title'
  | 'section'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'step'
  | 'math';

export type CandidateAcademicBlockTarget = `callout:${CalloutTone}`;

export type CandidateBlockTarget = CandidateBasicBlockTarget | CandidateAcademicBlockTarget;

export type CandidateBlockMenuItem = {
  id: CandidateBlockTarget;
  label: string;
  group: 'basic' | 'academic';
};

/**
 * M7.4A product Academic Block order (stable internal tone IDs).
 * Display labels come from calloutLabel() — never persist UI chrome into the body.
 */
export const PRODUCT_ACADEMIC_TONES: readonly CalloutTone[] = [
  'definition',
  'concept',
  'theorem',
  'example',
  'mistake',
  'summary',
  'review',
] as const;

/** Menu items that round-trip through the Notebook dialect. */
export const CANDIDATE_BLOCK_MENU: readonly CandidateBlockMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', group: 'basic' },
  { id: 'title', label: 'Title', group: 'basic' },
  { id: 'section', label: 'Section', group: 'basic' },
  { id: 'bullet', label: 'Bullet', group: 'basic' },
  { id: 'ordered', label: 'Numbered', group: 'basic' },
  { id: 'task', label: 'Task', group: 'basic' },
  { id: 'quote', label: 'Quote', group: 'basic' },
  { id: 'step', label: 'Step', group: 'basic' },
  { id: 'math', label: 'Math Block', group: 'basic' },
  ...PRODUCT_ACADEMIC_TONES.map(
    (tone): CandidateBlockMenuItem => ({
      id: `callout:${tone}`,
      label: calloutLabel(tone),
      group: 'academic',
    }),
  ),
] as const;

function currentDir(editor: Editor) {
  return normalizeTextDir(editor.state.selection.$from.parent.attrs.dir);
}

function dirAttrs(editor: Editor) {
  return { dir: inheritDirForNewBlock(currentDir(editor)) };
}

export function readCandidateBlockKind(editor: Editor): {
  type: string;
  tone: CalloutTone | null;
  label: string;
} {
  const parent = editor.state.selection.$from.parent;
  const type = parent.type.name;
  if (type === 'nbCallout') {
    const tone = (parent.attrs.tone as CalloutTone) ?? 'concept';
    return { type, tone, label: calloutLabel(tone) };
  }
  const labels: Record<string, string> = {
    nbParagraph: 'Paragraph',
    nbTitle: 'Title',
    nbSection: 'Section',
    nbBullet: 'Bullet',
    nbOrdered: 'Numbered',
    nbTask: 'Task',
    nbQuote: 'Quote',
    nbStep: 'Step',
    nbMath: 'Math Block',
  };
  return { type, tone: null, label: labels[type] ?? type };
}

function blockTypeAndAttrs(
  target: CandidateBlockTarget,
  dir: ReturnType<typeof dirAttrs>,
): { type: string; attrs: Record<string, unknown> } | null {
  if (target.startsWith('callout:')) {
    const tone = target.slice('callout:'.length) as CalloutTone;
    if (!CALLOUT_TONES.includes(tone)) return null;
    return { type: 'nbCallout', attrs: { tone, ...dir } };
  }
  switch (target as CandidateBasicBlockTarget) {
    case 'paragraph':
      return { type: 'nbParagraph', attrs: { variant: null, ...dir } };
    case 'title':
      return { type: 'nbTitle', attrs: { ...dir } };
    case 'section':
      return { type: 'nbSection', attrs: { ...dir } };
    case 'bullet':
      return { type: 'nbBullet', attrs: { depth: 0, ...dir } };
    case 'ordered':
      return { type: 'nbOrdered', attrs: { number: 1, ...dir } };
    case 'task':
      return { type: 'nbTask', attrs: { checked: false, ...dir } };
    case 'quote':
      return { type: 'nbQuote', attrs: { ...dir } };
    case 'step':
      return { type: 'nbStep', attrs: { ...dir } };
    case 'math':
      return { type: 'nbMath', attrs: { ...dir } };
    default:
      return null;
  }
}

function createEmptyBlockNode(editor: Editor, target: CandidateBlockTarget): PmNode | null {
  const spec = blockTypeAndAttrs(target, dirAttrs(editor));
  if (!spec) return null;
  const nodeType = editor.schema.nodes[spec.type];
  if (!nodeType) return null;
  return nodeType.createAndFill(spec.attrs) ?? nodeType.create(spec.attrs);
}

function emptyBlockJson(editor: Editor, target: CandidateBlockTarget): JSONContent | null {
  const spec = blockTypeAndAttrs(target, dirAttrs(editor));
  if (!spec) return null;
  return { type: spec.type, attrs: spec.attrs, content: [] };
}

/**
 * Transform the current text block into a dialect-safe block type (CONVERT).
 * Used by the floating selection / block-type control.
 * Content (text + marks) is preserved by TipTap setNode.
 */
export function runCandidateBlockCommand(editor: Editor, target: CandidateBlockTarget): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const parent = editor.state.selection.$from.parent;
  if (!parent.isTextblock) return false;

  const dir = dirAttrs(editor);

  if (target.startsWith('callout:')) {
    const tone = target.slice('callout:'.length) as CalloutTone;
    if (!CALLOUT_TONES.includes(tone)) return false;
    return editor.chain().focus().setNode('nbCallout', { tone, ...dir }).run();
  }

  switch (target as CandidateBasicBlockTarget) {
    case 'paragraph':
      return editor.chain().focus().setNode('nbParagraph', { variant: null, ...dir }).run();
    case 'title':
      return editor.chain().focus().setNode('nbTitle', { ...dir }).run();
    case 'section':
      return editor.chain().focus().setNode('nbSection', { ...dir }).run();
    case 'bullet':
      return editor.chain().focus().setNode('nbBullet', { depth: 0, ...dir }).run();
    case 'ordered':
      return editor.chain().focus().setNode('nbOrdered', { number: 1, ...dir }).run();
    case 'task':
      return editor.chain().focus().setNode('nbTask', { checked: false, ...dir }).run();
    case 'quote':
      return editor.chain().focus().setNode('nbQuote', { ...dir }).run();
    case 'step':
      return editor.chain().focus().setNode('nbStep', { ...dir }).run();
    case 'math':
      return editor.chain().focus().setNode('nbMath', { ...dir }).run();
    default:
      return false;
  }
}

/**
 * CREATE a new empty block at a captured Image/HW-style insert target (+ Add menu).
 * Never morphs non-empty existing content.
 * Empty *paragraph* at caret may be filled in place (create-at-slot) to avoid a blank neighbor.
 * Empty academic/other textblocks are never morphing targets — insert after them.
 */
export function insertCandidateBlockAtTarget(
  editor: Editor,
  target: CandidateBlockTarget,
  insertTarget?: NbImageInsertTarget,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;

  const $from = editor.state.selection.$from;
  const parent = $from.parent;

  // Empty paragraph at caret: fill in place — no content to lose, no blank left behind.
  if (
    parent.isTextblock &&
    parent.content.size === 0 &&
    parent.type.name === 'nbParagraph' &&
    !(editor.state.selection instanceof NodeSelection)
  ) {
    return runCandidateBlockCommand(editor, target);
  }

  let resolved = insertTarget ?? resolveNbImageInsertTarget(editor.state);

  // Empty non-paragraph (e.g. just-created Definition): prefer AFTER so + Add creates a sibling.
  if (
    parent.isTextblock &&
    parent.content.size === 0 &&
    parent.type.name !== 'nbParagraph' &&
    $from.depth >= 1
  ) {
    resolved = { kind: 'pos', pos: $from.after(1) };
  }

  const node = createEmptyBlockNode(editor, target);
  if (!node) return false;

  if (resolved.kind === 'pos') {
    const pos = Math.max(0, Math.min(resolved.pos, editor.state.doc.content.size));
    return editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insert(pos, node);
        try {
          if (node.isTextblock) {
            tr.setSelection(TextSelection.create(tr.doc, pos + 1));
          } else {
            tr.setSelection(NodeSelection.create(tr.doc, pos));
          }
        } catch {
          /* selection best-effort */
        }
        return true;
      })
      .run();
  }

  // Mid-textblock: TipTap split semantics (same as Image insert path).
  const json = emptyBlockJson(editor, target);
  if (!json) return false;
  return editor.chain().focus().insertContent(json).run();
}

/**
 * Product rule: typed academic labels must never auto-morph in the TipTap candidate.
 * Storage syntax `!definition …` remains valid via dialect parse/paste only.
 */
export function textLooksLikeAcademicTypedLabel(text: string): boolean {
  return /^(Definition|Key\s*Concept|Theorem|Example|Mistake|Common\s*Mistake|Summary|Review)\s*:/i.test(
    text.trim(),
  );
}
