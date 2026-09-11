/**
 * TipTap Candidate block / academic morph commands (M4.2).
 * Explicit toolbar-driven transformations only — no typed-prefix auto-convert.
 */

import type { Editor } from '@tiptap/core';
import type { CalloutTone } from '../notebookDialect';
import { CALLOUT_TONES } from '../notebookDialect';
import { inheritDirForNewBlock, normalizeTextDir } from './direction';
import { calloutLabel } from './visualTokens';

export type CandidateBasicBlockTarget =
  | 'paragraph'
  | 'title'
  | 'section'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'step';

export type CandidateAcademicBlockTarget = `callout:${CalloutTone}`;

export type CandidateBlockTarget = CandidateBasicBlockTarget | CandidateAcademicBlockTarget;

export type CandidateBlockMenuItem = {
  id: CandidateBlockTarget;
  label: string;
  group: 'basic' | 'academic';
};

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
  ...CALLOUT_TONES.map(
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
  };
  return { type, tone: null, label: labels[type] ?? type };
}

/**
 * Transform the current text block into a dialect-safe block type.
 * Does not invent new storage kinds — callouts use existing tones.
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
    default:
      return false;
  }
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
