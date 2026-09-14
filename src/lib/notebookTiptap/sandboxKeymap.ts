/**
 * ZIKUK-aligned Enter / Backspace / Tab keymaps for the TipTap editable sandbox.
 * Mirrors ProjectNotebookBlock CE semantics where practical.
 * Shift+Enter (CE soft-break) is blocked — hardBreak cannot serialize.
 *
 * PRODUCT (M4.2): There is intentionally NO academic typed-prefix auto-transform.
 * Typing "Definition:" / "Theorem:" / etc. stays ordinary paragraph text.
 * Academic blocks are created only via explicit toolbar / block commands.
 * Existing stored `!definition …` callouts still load via dialect parse.
 */

import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { inheritDirForNewBlock } from './direction';

export const PROTECTED_BLOCK_ATOMS = new Set([
  'nbImageRef',
  'nbHandwriting',
  'nbDivider',
  'nbMath',
]);

export function isProtectedBlockAtom(node: ProseMirrorNode | null | undefined): boolean {
  if (!node) return false;
  return (node.isBlock && node.isAtom) || PROTECTED_BLOCK_ATOMS.has(node.type.name);
}

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

function dirAttr(parentDir: unknown) {
  return { dir: inheritDirForNewBlock(parentDir) };
}

export const NotebookSandboxKeymap = Extension.create({
  name: 'notebookSandboxKeymap',

  addKeyboardShortcuts() {
    return {
      /** CE soft-break is not representable — block Shift-Enter. */
      'Shift-Enter': () => true,

      Enter: ({ editor }) => {
        if (editor.state.selection instanceof NodeSelection) {
          const sel = editor.state.selection as NodeSelection;
          const insertPos = sel.to;
          return editor
            .chain()
            .command(({ tr, state }) => {
              const pNode = state.schema.nodes.nbParagraph.create({
                variant: null,
                dir: 'auto',
              });
              tr.insert(insertPos, pNode);
              tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
              return true;
            })
            .focus()
            .run();
        }

        const info = parentInfo(editor);
        if (info.type === 'doc') return false;

        if (info.type === 'nbDivider' || info.type === 'nbImageRef' || info.type === 'nbHandwriting') {
          return editor
            .chain()
            .focus()
            .insertContentAt(info.$from.after(), {
              type: 'nbParagraph',
              attrs: { variant: null, ...dirAttr(info.attrs.dir) },
              content: [],
            })
            .run();
        }

        if (info.empty && EMPTY_TO_PARAGRAPH.has(info.type)) {
          return editor
            .chain()
            .focus()
            .setNode('nbParagraph', { variant: null, ...dirAttr(info.attrs.dir) })
            .run();
        }

        const continueSame =
          LISTISH.has(info.type) && info.text.slice(0, info.$from.parentOffset).trim() !== '';

        const split = editor.commands.splitBlock({ keepMarks: true });
        if (!split) return true;

        if (continueSame) {
          if (info.type === 'nbBullet') {
            const depth = Math.min(2, Math.max(0, Number(info.attrs.depth ?? 0)));
            editor.chain().focus().setNode('nbBullet', { depth, ...dirAttr(info.attrs.dir) }).run();
          } else if (info.type === 'nbOrdered') {
            const number = Math.max(1, Number(info.attrs.number ?? 1) + 1);
            editor.chain().focus().setNode('nbOrdered', { number, ...dirAttr(info.attrs.dir) }).run();
          } else if (info.type === 'nbTask') {
            editor.chain().focus().setNode('nbTask', { checked: false, ...dirAttr(info.attrs.dir) }).run();
          } else if (info.type === 'nbStep') {
            editor.chain().focus().setNode('nbStep', { ...dirAttr(info.attrs.dir) }).run();
          }
        } else if (info.type !== 'nbParagraph') {
          // Title/section/quote/callout/math → new paragraph (CE parity).
          // Skip when already paragraph — setNode after split is a no-op that can throw.
          // New paragraph: inherit explicit dir only; otherwise auto.
          editor
            .chain()
            .focus()
            .setNode('nbParagraph', { variant: null, ...dirAttr(info.attrs.dir) })
            .run();
        }
        return true;
      },

      Backspace: ({ editor }) => {
        if (editor.state.selection instanceof NodeSelection) {
          const sel = editor.state.selection as NodeSelection;
          if (editor.state.doc.childCount <= 1) {
            return editor
              .chain()
              .command(({ tr, state }) => {
                const pNode = state.schema.nodes.nbParagraph.create({
                  variant: null,
                  dir: 'auto',
                });
                tr.replaceWith(sel.from, sel.to, pNode);
                tr.setSelection(TextSelection.create(tr.doc, 1));
                return true;
              })
              .focus()
              .run();
          }
          return editor.commands.deleteSelection();
        }

        // Range deletion takes precedence over empty-block/caret transformations.
        if (!editor.state.selection.empty) return editor.commands.deleteSelection();
        const info = parentInfo(editor);
        if (!info.atStart) return false;

        if (info.type === 'nbBullet' && info.empty) {
          const depth = Number(info.attrs.depth ?? 0);
          if (depth > 0) {
            return editor
              .chain()
              .focus()
              .setNode('nbBullet', { depth: depth - 1, ...dirAttr(info.attrs.dir) })
              .run();
          }
          return editor
            .chain()
            .focus()
            .setNode('nbParagraph', { variant: null, ...dirAttr(info.attrs.dir) })
            .run();
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
          return editor
            .chain()
            .focus()
            .setNode('nbParagraph', { variant: null, ...dirAttr(info.attrs.dir) })
            .run();
        }

        // GapCursor or doc-level selection:
        if (editor.state.selection.$from.parent.type.name === 'doc') {
          const { $from } = editor.state.selection;
          const nodeBefore = $from.nodeBefore;
          if (isProtectedBlockAtom(nodeBefore)) {
            const prevBlockPos = $from.pos - (nodeBefore?.nodeSize ?? 0);
            return editor
              .chain()
              .command(({ tr }) => {
                tr.setSelection(NodeSelection.create(tr.doc, prevBlockPos));
                return true;
              })
              .focus()
              .run();
          }
        }

        if (info.atStart) {
          const { $from } = editor.state.selection;
          const blockIndex = $from.index(0);
          if (blockIndex > 0) {
            const prevBlock = editor.state.doc.child(blockIndex - 1);
            if (isProtectedBlockAtom(prevBlock)) {
              // Select the adjacent atom instead of silently deleting it.
              // A second explicit Backspace/Delete on NodeSelection will delete it.
              const currentBlockPos = $from.before(1);
              const prevBlockPos = currentBlockPos - prevBlock.nodeSize;
              return editor
                .chain()
                .command(({ tr }) => {
                  tr.setSelection(NodeSelection.create(tr.doc, prevBlockPos));
                  return true;
                })
                .focus()
                .run();
            }
          }
          return editor.commands.joinBackward();
        }
        return false;
      },

      Delete: ({ editor }) => {
        if (editor.state.selection instanceof NodeSelection) {
          const sel = editor.state.selection as NodeSelection;
          if (editor.state.doc.childCount <= 1) {
            return editor
              .chain()
              .command(({ tr, state }) => {
                const pNode = state.schema.nodes.nbParagraph.create({
                  variant: null,
                  dir: 'auto',
                });
                tr.replaceWith(sel.from, sel.to, pNode);
                tr.setSelection(TextSelection.create(tr.doc, 1));
                return true;
              })
              .focus()
              .run();
          }
          return editor.commands.deleteSelection();
        }
        if (!editor.state.selection.empty) {
          return editor.commands.deleteSelection();
        }

        // GapCursor or doc-level selection:
        if (editor.state.selection.$from.parent.type.name === 'doc') {
          const { $from } = editor.state.selection;
          const nodeAfter = $from.nodeAfter;
          if (isProtectedBlockAtom(nodeAfter)) {
            const nextBlockPos = $from.pos;
            return editor
              .chain()
              .command(({ tr }) => {
                tr.setSelection(NodeSelection.create(tr.doc, nextBlockPos));
                return true;
              })
              .focus()
              .run();
          }
        }

        const { $from } = editor.state.selection;
        const parent = $from.parent;
        const atEnd = $from.parentOffset === parent.content.size;

        if (atEnd) {
          const blockIndex = $from.index(0);
          if (blockIndex < editor.state.doc.childCount - 1) {
            const nextBlock = editor.state.doc.child(blockIndex + 1);
            if (isProtectedBlockAtom(nextBlock)) {
              // Select the adjacent atom instead of silently deleting it.
              const nextBlockPos = $from.after(1);
              return editor
                .chain()
                .command(({ tr }) => {
                  tr.setSelection(NodeSelection.create(tr.doc, nextBlockPos));
                  return true;
                })
                .focus()
                .run();
            }
          }
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

function insertTextAdjacentToProtectedAtom(
  view: EditorView,
  sel: NodeSelection,
  text: string,
): boolean {
  if (!isProtectedBlockAtom(sel.node)) return false;

  const { doc } = view.state;
  const afterPos = sel.to;
  const $after = doc.resolve(afterPos);
  const blockIndex = $after.index(0);
  const hasNext = blockIndex < doc.childCount;
  const nextBlock = hasNext ? doc.child(blockIndex) : null;

  if (nextBlock && nextBlock.type.name === 'nbParagraph') {
    // If there is already an editable paragraph immediately after the object:
    // Focus that paragraph and insert the typed character at its start.
    const targetPos = afterPos + 1;
    const tr = view.state.tr.insertText(text, targetPos);
    tr.setSelection(TextSelection.create(tr.doc, targetPos + text.length));
    view.dispatch(tr);
    view.focus();
    return true;
  }

  // If there is no editable paragraph after the object:
  // Insert one immediately after, place caret inside it, and insert typed character.
  const textNode = text ? view.state.schema.text(text) : undefined;
  const pNode = view.state.schema.nodes.nbParagraph.create(
    { variant: null, dir: 'auto' },
    textNode,
  );
  const tr = view.state.tr.insert(afterPos, pNode);
  const caretPos = afterPos + 1 + text.length;
  tr.setSelection(TextSelection.create(tr.doc, caretPos));
  view.dispatch(tr);
  view.focus();
  return true;
}

/** M6.0 / M6.1: Document flow & safe typing guards around atom blocks. */
export const NotebookSandboxDocumentFlow = Extension.create({
  name: 'notebookSandboxDocumentFlow',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            // Ordinary printable typing on NodeSelection must not replace the atom node.
            if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              view.state.selection instanceof NodeSelection
            ) {
              const sel = view.state.selection as NodeSelection;
              if (isProtectedBlockAtom(sel.node)) {
                event.preventDefault();
                return insertTextAdjacentToProtectedAtom(view, sel, event.key);
              }
            }
            return false;
          },

          handleTextInput(view, _from, _to, text) {
            // Guard against direct textInput / IME replacing a selected atom node.
            if (view.state.selection instanceof NodeSelection) {
              const sel = view.state.selection as NodeSelection;
              if (isProtectedBlockAtom(sel.node)) {
                return insertTextAdjacentToProtectedAtom(view, sel, text);
              }
            }
            return false;
          },

          handleClick(view, pos, event) {
            const { doc } = view.state;
            const last = doc.lastChild;
            if (!last) return false;

            if (!isProtectedBlockAtom(last)) return false;

            if (event.target === view.dom || pos >= doc.content.size) {
              const insertPos = doc.content.size;
              const tr = view.state.tr.insert(
                insertPos,
                view.state.schema.nodes.nbParagraph.create({ variant: null, dir: 'auto' }),
              );
              tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
              view.dispatch(tr);
              view.focus();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
