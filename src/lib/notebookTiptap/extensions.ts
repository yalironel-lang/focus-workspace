/**
 * Closed TipTap schema for ZIKUK Notebook dialect (Milestone 0 + RTL Phase A attrs).
 * Only constructs representable in the persisted Notebook format for *content*.
 * `dir` is TipTap in-memory metadata (not in dialect body) — serializers ignore it.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize, BackgroundColor } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import type { CalloutTone, ParagraphVariant } from '../notebookDialect';
import { CALLOUT_TONES } from '../notebookDialect';
import { notebookDirAttribute } from './direction';

const inlineContent = 'text*';

function textBlock(name: string, attrs?: Record<string, unknown>) {
  return Node.create({
    name,
    group: 'block',
    content: inlineContent,
    defining: true,
    addAttributes() {
      return { ...notebookDirAttribute(), ...(attrs ?? {}) };
    },
    parseHTML() {
      return [{ tag: `div[data-nb="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': name }), 0];
    },
  });
}

export const NbParagraph = Node.create({
  name: 'nbParagraph',
  group: 'block',
  content: inlineContent,
  defining: true,
  addAttributes() {
    return {
      ...notebookDirAttribute(),
      variant: {
        default: null as ParagraphVariant | null,
        parseHTML: el => el.getAttribute('data-variant'),
        renderHTML: attrs => (attrs.variant ? { 'data-variant': attrs.variant } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbParagraph"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbParagraph' }), 0];
  },
});

export const NbTitle = textBlock('nbTitle');
export const NbSection = textBlock('nbSection');
export const NbQuote = textBlock('nbQuote');
export const NbStep = textBlock('nbStep');
/** Block math keeps dir attr for schema uniformity; NodeViews force LTR isolate visually. */
export const NbMath = textBlock('nbMath');

export const NbBullet = Node.create({
  name: 'nbBullet',
  group: 'block',
  content: inlineContent,
  defining: true,
  addAttributes() {
    return {
      ...notebookDirAttribute(),
      depth: {
        default: 0,
        parseHTML: el => Number(el.getAttribute('data-depth') ?? 0),
        renderHTML: attrs => ({ 'data-depth': attrs.depth }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbBullet"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbBullet' }), 0];
  },
});

export const NbOrdered = Node.create({
  name: 'nbOrdered',
  group: 'block',
  content: inlineContent,
  defining: true,
  addAttributes() {
    return {
      ...notebookDirAttribute(),
      number: {
        default: 1,
        parseHTML: el => Number(el.getAttribute('data-number') ?? 1),
        renderHTML: attrs => ({ 'data-number': attrs.number }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbOrdered"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbOrdered' }), 0];
  },
});

export const NbTask = Node.create({
  name: 'nbTask',
  group: 'block',
  content: inlineContent,
  defining: true,
  addAttributes() {
    return {
      ...notebookDirAttribute(),
      checked: {
        default: false,
        parseHTML: el => el.getAttribute('data-checked') === 'true',
        renderHTML: attrs => ({ 'data-checked': attrs.checked ? 'true' : 'false' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbTask"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbTask' }), 0];
  },
});

export const NbCallout = Node.create({
  name: 'nbCallout',
  group: 'block',
  content: inlineContent,
  defining: true,
  addAttributes() {
    return {
      ...notebookDirAttribute(),
      tone: {
        default: 'concept' as CalloutTone,
        parseHTML: el => el.getAttribute('data-tone') ?? 'concept',
        renderHTML: attrs => ({ 'data-tone': attrs.tone }),
        validate: (value: string) => (CALLOUT_TONES as readonly string[]).includes(value),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbCallout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbCallout' }), 0];
  },
});

export const NbDivider = Node.create({
  name: 'nbDivider',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr[data-nb="nbDivider"]' }];
  },
  renderHTML() {
    return ['hr', { 'data-nb': 'nbDivider' }];
  },
});

export const NbImageRef = Node.create({
  name: 'nbImageRef',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: { default: '' },
      alt: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbImageRef"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbImageRef' })];
  },
});

export const NbHandwriting = Node.create({
  name: 'nbHandwriting',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-nb="nbHandwriting"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-nb': 'nbHandwriting' })];
  },
});

/**
 * Closed extension set for a future TipTap Notebook editor.
 * No hardBreak, link, table, codeBlock, or deep lists.
 * hardBreak is omitted from the schema; serializers also fail-close if present in JSON.
 */
export function createNotebookTiptapExtensions() {
  return [
    Document,
    Text,
    NbParagraph,
    NbTitle,
    NbSection,
    NbQuote,
    NbStep,
    NbMath,
    NbBullet,
    NbOrdered,
    NbTask,
    NbCallout,
    NbDivider,
    NbImageRef,
    NbHandwriting,
    Bold,
    Italic,
    Strike,
    Underline,
    TextStyle,
    Color,
    FontSize,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
  ];
}

/** Node type names allowed in TipTap JSON for this dialect. */
export const ALLOWED_BLOCK_TYPES = new Set([
  'nbParagraph',
  'nbTitle',
  'nbSection',
  'nbQuote',
  'nbStep',
  'nbMath',
  'nbBullet',
  'nbOrdered',
  'nbTask',
  'nbCallout',
  'nbDivider',
  'nbImageRef',
  'nbHandwriting',
]);

export const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'textStyle',
  'highlight',
]);
