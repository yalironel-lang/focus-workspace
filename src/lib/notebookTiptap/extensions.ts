/**
 * Closed TipTap schema for ZIKUK Notebook dialect (Milestone 0 + RTL Phase A attrs).
 * Only constructs representable in the persisted Notebook format for *content*.
 * `dir` is TipTap in-memory metadata (not in dialect body) — serializers ignore it.
 * Tables (M6.4A): nested nbTable structure; canonical persist is still one ~nb1 table block.
 */

import { Node, Mark, mergeAttributes } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize, BackgroundColor } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import type { CalloutTone, ParagraphVariant, TextAlignment } from '../notebookDialect';
import { CALLOUT_TONES } from '../notebookDialect';
import { notebookDirAttribute } from './direction';
import { plainMathToLatex } from '../mathInputAssistant';
import { renderKatexHtml } from '../notebookMath';
import { sanitizeUrl } from './urlSanitizer';
import { NB_TIPTAP_LINK_CLASS } from './openNotebookLink';
import { createNotebookTableExtensions } from './tableExtensions';

const inlineContent = 'inline*';

export function notebookAlignAttribute() {
  return {
    align: {
      default: null as TextAlignment | null,
      parseHTML: (el: HTMLElement) =>
        (el.getAttribute('data-align') as TextAlignment | null) ||
        (el.style.textAlign as TextAlignment | null) ||
        null,
      renderHTML: (attrs: Record<string, unknown>) => {
        if (!attrs.align) return {};
        return {
          'data-align': attrs.align,
          style: `text-align: ${attrs.align};`,
        };
      },
    },
  };
}

function textBlock(name: string, attrs?: Record<string, unknown>, withAlign = false) {
  return Node.create({
    name,
    group: 'block',
    content: inlineContent,
    defining: true,
    addAttributes() {
      return {
        ...notebookDirAttribute(),
        ...(withAlign ? notebookAlignAttribute() : {}),
        ...(attrs ?? {}),
      };
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
      ...notebookAlignAttribute(),
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

export const NbTitle = textBlock('nbTitle', undefined, true);
export const NbSection = textBlock('nbSection', undefined, true);
export const NbQuote = textBlock('nbQuote', undefined, true);
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
      width: { default: null },
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

export const MathMark = Mark.create({
  name: 'math',
  inclusive: false,
  parseHTML() {
    return [
      {
        tag: 'span[data-nb-math="true"]',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-nb-math': 'true',
        dir: 'ltr',
        style: 'direction: ltr; unicode-bidi: isolate;',
      }),
      0,
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    link: {
      setLink: (attributes: { href: string; target?: string | null; rel?: string | null; class?: string | null; title?: string | null }) => ReturnType;
      toggleLink: (attributes?: { href: string; target?: string | null; rel?: string | null; class?: string | null; title?: string | null }) => ReturnType;
      unsetLink: () => ReturnType;
    };
  }
}

export const LinkMark = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: element => sanitizeUrl(element.getAttribute('href')),
        renderHTML: attributes => {
          const href = sanitizeUrl(attributes.href);
          if (!href) return {};
          return { href };
        },
      },
      target: {
        default: '_blank',
      },
      rel: {
        default: 'noopener noreferrer',
      },
      class: {
        default: NB_TIPTAP_LINK_CLASS,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: NB_TIPTAP_LINK_CLASS,
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setLink:
        attributes =>
        ({ chain }) => {
          const href = sanitizeUrl(attributes.href);
          if (!href) return false;
          return chain().setMark(this.name, { ...attributes, href }).run();
        },
      toggleLink:
        attributes =>
        ({ chain }) => {
          const href = attributes?.href ? sanitizeUrl(attributes.href) : null;
          if (!href) return false;
          return chain().toggleMark(this.name, { ...attributes, href }, { extendEmptyMarkRange: true }).run();
        },
      unsetLink:
        () =>
        ({ chain }) => {
          return chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run();
        },
    };
  },
});

export const NbInlineMath = Node.create({
  name: 'nbInlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: '_',
  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: el => el.getAttribute('data-text') ?? '',
        renderHTML: attrs => ({ 'data-text': attrs.text }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-nb-inline-math="true"]',
        getAttrs: el => {
          const elem = el as HTMLElement;
          return { text: elem.getAttribute('data-text') ?? elem.textContent ?? '' };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-nb': 'nbInlineMath',
        'data-nb-inline-math': 'true',
        'data-text': node.attrs.text,
        dir: 'ltr',
        style: 'direction: ltr; unicode-bidi: isolate; display: inline-block; vertical-align: middle;',
      }),
      node.attrs.text,
    ];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      let isEditing = false;

      const dom = document.createElement('span');
      dom.className = 'nb-inline-math-atom';
      dom.setAttribute('data-nb', 'nbInlineMath');
      dom.setAttribute('data-nb-inline-math', 'true');
      dom.setAttribute('data-text', currentNode.attrs.text);
      dom.setAttribute('dir', 'ltr');
      dom.style.direction = 'ltr';
      dom.style.unicodeBidi = 'isolate';
      dom.style.display = 'inline-block';
      dom.style.verticalAlign = 'middle';
      dom.style.margin = '0 1px';
      dom.style.padding = '0 2px';
      dom.style.cursor = editor.isEditable ? 'pointer' : 'default';
      dom.title = editor.isEditable ? 'Double-click to edit formula' : '';

      const render = () => {
        dom.innerHTML = '';
        const latex = plainMathToLatex(currentNode.attrs.text);
        const { html, error } = renderKatexHtml(latex, false);
        if (error) {
          dom.textContent = currentNode.attrs.text;
        } else {
          dom.innerHTML = html;
        }
      };
      render();

      dom.addEventListener('dblclick', (e) => {
        if (!editor.isEditable || isEditing) return;
        e.preventDefault();
        e.stopPropagation();

        isEditing = true;
        dom.setAttribute('data-nb-editing', 'true');
        dom.style.outline = 'none';

        const currentText = currentNode.attrs.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'nb-inline-math-editing';
        input.style.cssText = [
          'border: 1.5px solid #38bdf8',
          'border-radius: 4px',
          'padding: 0 5px',
          'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          'font-size: 0.9em',
          'outline: none',
          'background-color: #0f172a',
          'color: #f8fafc',
          'caret-color: #38bdf8',
          'margin: 0 2px',
          'direction: ltr',
          'unicode-bidi: isolate',
          'box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25)',
        ].join('; ');
        input.style.minWidth = '40px';
        input.style.width = `${Math.max(4, currentText.length + 1)}ch`;

        let finished = false;
        const finish = (apply: boolean) => {
          if (finished) return;
          finished = true;
          isEditing = false;
          dom.removeAttribute('data-nb-editing');

          const next = input.value.trim();
          // Empty or whitespace-only formula safely cancels edit and preserves original formula.
          if (apply && next && next !== currentText) {
            const pos = typeof getPos === 'function' ? getPos() : undefined;
            if (typeof pos === 'number' && pos >= 0) {
              const tr = editor.state.tr.setNodeMarkup(pos, undefined, { text: next });
              const targetPos = Math.min(pos + 1, tr.doc.content.size);
              tr.setSelection(Selection.near(tr.doc.resolve(targetPos)));
              editor.view.dispatch(tr);
              editor.view.focus();
              return;
            }
          }

          render();
          editor.view.focus();
        };

        const stopPropagation = (ev: Event) => ev.stopPropagation();
        input.addEventListener('keydown', (ke) => {
          ke.stopPropagation();
          if (ke.key === 'Enter') {
            ke.preventDefault();
            finish(true);
          } else if (ke.key === 'Escape') {
            ke.preventDefault();
            finish(false);
          }
        });
        input.addEventListener('beforeinput', stopPropagation);
        input.addEventListener('input', (ev) => {
          ev.stopPropagation();
          input.style.width = `${Math.max(4, input.value.length + 1)}ch`;
        });
        input.addEventListener('keyup', stopPropagation);
        input.addEventListener('keypress', stopPropagation);
        input.addEventListener('mousedown', stopPropagation);
        input.addEventListener('mouseup', stopPropagation);
        input.addEventListener('click', stopPropagation);
        input.addEventListener('dblclick', stopPropagation);

        input.addEventListener('blur', () => {
          finish(true);
        });

        dom.innerHTML = '';
        dom.appendChild(input);
        input.focus();
        input.select();
      });

      return {
        dom,
        update(newNode) {
          if (newNode.type !== currentNode.type) return false;
          currentNode = newNode;
          dom.setAttribute('data-text', currentNode.attrs.text);
          if (!isEditing) {
            render();
          }
          return true;
        },
        selectNode() {
          if (!isEditing) {
            dom.style.outline = '2px solid #38bdf8';
            dom.style.borderRadius = '3px';
          }
        },
        deselectNode() {
          dom.style.outline = 'none';
        },
        stopEvent(event) {
          if (isEditing) return true;
          const target = event.target as HTMLElement | null;
          if (
            target &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.closest('input, textarea'))
          ) {
            return true;
          }
          return false;
        },
        ignoreMutation() {
          return true;
        },
        destroy() {
          isEditing = false;
        },
      };
    };
  },
});

/**
 * Closed extension set for a future TipTap Notebook editor.
 * No hardBreak, codeBlock, or deep lists.
 * Tables use Notebook-named TipTap table nodes (M6.4A).
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
    ...createNotebookTableExtensions(),
    NbInlineMath,
    Bold,
    Italic,
    Strike,
    Underline,
    TextStyle,
    Color,
    FontSize,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
    MathMark,
    LinkMark,
  ];
}

/** Node type names allowed as top-level TipTap JSON blocks for this dialect. */
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
  'nbTable',
]);

export const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'textStyle',
  'highlight',
  'math',
  'link',
]);
