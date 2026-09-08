/**
 * ZIKUK-aligned Enter / Backspace / Tab keymaps for the TipTap editable sandbox.
 * Mirrors ProjectNotebookBlock CE semantics where practical.
 * Shift+Enter (CE soft-break) is blocked — hardBreak cannot serialize.
 */

import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';

const LISTISH = new Set(['nbBullet', 'nbOrdered', 'nbTask', 'nbStep']);
const EMPTY_TO_PARAGRAPH = new Set([
  'nbTitle',
  'nbSection',
  'nbBullet',
  'nbOrdered',
  'nbQuote',
  'nbStep',
  'nbTask',
  'nbCallout',
  'nbMath',
]);

function parentInfo(editor: Editor) {
  const { $from } = editor.state.selection;
  return {
    type: $from.parent.type.name,
    attrs: $from.parent.attrs,
    text: $from.parent.textContent,
    empty: $from.parent.textContent.trim() === '',
    atStart: $from.parentOffset === 0,
    $from,
  };
}

export const NotebookSandboxKeymap = Extension.create({
  name: 'notebookSandboxKeymap',

  addKeyboardShortcuts() {
    return {
      /** CE soft-break is not representable — block Shift-Enter. */
      'Shift-Enter': () => true,

      Enter: ({ editor }) => {
        const info = parentInfo(editor);
        if (info.type === 'doc') return false;

        if (info.type === 'nbDivider' || info.type === 'nbImageRef' || info.type === 'nbHandwriting') {
          return editor
            .chain()
            .focus()
            .insertContentAt(info.$from.after(), {
              type: 'nbParagraph',
              attrs: { variant: null },
              content: [],
            })
            .run();
        }

        if (info.empty && EMPTY_TO_PARAGRAPH.has(info.type)) {
          return editor.chain().focus().setNode('nbParagraph', { variant: null }).run();
        }

        const continueSame =
          LISTISH.has(info.type) && info.text.slice(0, info.$from.parentOffset).trim() !== '';

        const split = editor.commands.splitBlock({ keepMarks: true });
        if (!split) return true;

        if (continueSame) {
          if (info.type === 'nbBullet') {
            const depth = Math.min(2, Math.max(0, Number(info.attrs.depth ?? 0)));
            editor.chain().focus().setNode('nbBullet', { depth }).run();
          } else if (info.type === 'nbOrdered') {
            const number = Math.max(1, Number(info.attrs.number ?? 1) + 1);
            editor.chain().focus().setNode('nbOrdered', { number }).run();
          } else if (info.type === 'nbTask') {
            editor.chain().focus().setNode('nbTask', { checked: false }).run();
          } else if (info.type === 'nbStep') {
            editor.chain().focus().setNode('nbStep').run();
          }
        } else if (info.type !== 'nbParagraph') {
          // Title/section/quote/callout/math → new paragraph (CE parity).
          // Skip when already paragraph — setNode after split is a no-op that can throw.
          editor.chain().focus().setNode('nbParagraph', { variant: null }).run();
        }
        return true;
      },

      Backspace: ({ editor }) => {
        const info = parentInfo(editor);
        if (!info.atStart) return false;

        if (info.type === 'nbBullet' && info.empty) {
          const depth = Number(info.attrs.depth ?? 0);
          if (depth > 0) {
            return editor.chain().focus().setNode('nbBullet', { depth: depth - 1 }).run();
          }
          return editor.chain().focus().setNode('nbParagraph', { variant: null }).run();
        }

        if (
          info.empty &&
          (info.type === 'nbTitle' ||
            info.type === 'nbSection' ||
            info.type === 'nbOrdered' ||
            info.type === 'nbQuote' ||
            info.type === 'nbStep' ||
            info.type === 'nbTask' ||
            info.type === 'nbCallout' ||
            info.type === 'nbMath')
        ) {
          return editor.chain().focus().setNode('nbParagraph', { variant: null }).run();
        }

        if (info.atStart) {
          return editor.commands.joinBackward();
        }
        return false;
      },

      Tab: ({ editor }) => {
        const info = parentInfo(editor);
        if (info.type !== 'nbBullet') return true;
        const depth = Number(info.attrs.depth ?? 0);
        if (depth >= 2) return true;
        return editor.chain().focus().setNode('nbBullet', { depth: depth + 1 }).run();
      },

      'Shift-Tab': ({ editor }) => {
        const info = parentInfo(editor);
        if (info.type !== 'nbBullet') return true;
        const depth = Number(info.attrs.depth ?? 0);
        if (depth <= 0) return true;
        return editor.chain().focus().setNode('nbBullet', { depth: depth - 1 }).run();
      },

      'Mod-a': ({ editor }) => {
        const { doc } = editor.state;
        const sel = TextSelection.create(doc, 1, doc.content.size);
        editor.view.dispatch(editor.state.tr.setSelection(sel));
        return true;
      },
    };
  },
});

/** Guard: reject transactions that introduce hardBreak or depth>2 bullets. */
export const NotebookSandboxGuards = Extension.create({
  name: 'notebookSandboxGuards',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(tr) {
          if (!tr.docChanged) return true;
          let ok = true;
          tr.doc.descendants(node => {
            if (node.type.name === 'hardBreak') ok = false;
            if (node.type.name === 'nbBullet' && Number(node.attrs.depth ?? 0) > 2) ok = false;
            return ok;
          });
          return ok;
        },
      }),
    ];
  },
});
