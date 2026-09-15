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
import { EditorState, NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { inheritDirForNewBlock } from './direction';
import { isSelectionInsideTable, isSelectionInsideTableCell } from './tableCommands';

export const PROTECTED_ATOMS = new Set([
  'nbImageRef',
  'nbHandwriting',
  'nbDivider',
  'nbMath',
  'nbInlineMath',
]);

export function isProtectedBlockAtom(node: ProseMirrorNode | null | undefined): boolean {
  if (!node) return false;
  return (node.isBlock && node.isAtom) || (PROTECTED_ATOMS.has(node.type.name) && node.isBlock);
}

export function isProtectedAtom(node: ProseMirrorNode | null | undefined): boolean {
  if (!node) return false;
  return node.isAtom || PROTECTED_ATOMS.has(node.type.name);
}

/** Whole-table NodeSelection — nested content, but protected like atoms against replace-by-typing. */
export function isTableBlock(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && node.type.name === 'nbTable');
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
          if (sel.node.isInline) {
            return editor.commands.setTextSelection(sel.to);
          }
          // Protected atoms + whole-table NodeSelection: insert/focus paragraph after.
          if (isProtectedBlockAtom(sel.node) || isTableBlock(sel.node)) {
            const { doc } = editor.state;
            const afterPos = sel.to;
            const $after = doc.resolve(afterPos);
            const blockIndex = $after.index(0);
            const hasNext = blockIndex < doc.childCount;
            const nextBlock = hasNext ? doc.child(blockIndex) : null;
            if (nextBlock && nextBlock.type.name === 'nbParagraph' && nextBlock.textContent === '') {
              return editor
                .chain()
                .command(({ tr }) => {
                  tr.setSelection(TextSelection.create(tr.doc, afterPos + 1));
                  return true;
                })
                .focus()
                .run();
            }
          }
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

        // M6.4B: cells hold exactly one nbParagraph — Enter must not split into a second.
        // Soft hardBreak is unsupported. Enter inside a cell is a structural no-op.
        if (isSelectionInsideTableCell(editor)) {
          return true;
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
          if (sel.node.isInline) {
            return editor.commands.deleteSelection();
          }
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

        // M6.4B: never joinBackward out of a table cell.
        if (isSelectionInsideTableCell(editor)) {
          return true;
        }

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
          if (isProtectedBlockAtom(nodeBefore) || isTableBlock(nodeBefore)) {
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
            if (isProtectedBlockAtom(prevBlock) || isTableBlock(prevBlock)) {
              // Select the adjacent atom/table instead of silently deleting it.
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
          if (isProtectedBlockAtom(nodeAfter) || isTableBlock(nodeAfter)) {
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
          // M6.4B: never joinForward out of a table cell into top-level content.
          if (isSelectionInsideTableCell(editor)) {
            return true;
          }
          const blockIndex = $from.index(0);
          if (blockIndex < editor.state.doc.childCount - 1) {
            const nextBlock = editor.state.doc.child(blockIndex + 1);
            if (isProtectedBlockAtom(nextBlock) || isTableBlock(nextBlock)) {
              // Select the adjacent atom/table instead of silently deleting it.
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
        // Inside tables: defer to NbTable goToNextCell (do not swallow Tab).
        if (isSelectionInsideTable(editor)) return false;
        const info = parentInfo(editor);
        if (info.type !== 'nbBullet') return true;
        const depth = Number(info.attrs.depth ?? 0);
        if (depth >= 2) return true;
        return editor.chain().focus().setNode('nbBullet', { depth: depth + 1 }).run();
      },

      'Shift-Tab': ({ editor }) => {
        if (isSelectionInsideTable(editor)) return false;
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

/** Guard: reject transactions that introduce hardBreak, depth>2 bullets, or illegal tables. */
export const NotebookSandboxGuards = Extension.create({
  name: 'notebookSandboxGuards',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(tr) {
          if (!tr.docChanged) return true;
          let ok = true;
          tr.doc.descendants(node => {
            if (!ok) return false;
            if (node.type.name === 'hardBreak') ok = false;
            if (node.type.name === 'nbBullet' && Number(node.attrs.depth ?? 0) > 2) ok = false;
            if (node.type.name === 'nbTableHeader') ok = false;
            if (node.type.name === 'nbTableCell') {
              const { colspan, rowspan, colwidth, align } = node.attrs as {
                colspan?: unknown;
                rowspan?: unknown;
                colwidth?: unknown;
                align?: unknown;
              };
              if (colspan !== undefined && colspan !== 1) ok = false;
              if (rowspan !== undefined && rowspan !== 1) ok = false;
              if (colwidth != null) ok = false;
              if (align != null) ok = false;
              if (node.childCount !== 1 || node.firstChild?.type.name !== 'nbParagraph') ok = false;
            }
            if (node.type.name === 'nbTable') {
              if (node.childCount < 1 || node.childCount > 20) ok = false;
              const cols = node.firstChild?.childCount ?? 0;
              if (cols < 1 || cols > 20) ok = false;
              for (let i = 0; i < node.childCount; i++) {
                if (node.child(i).childCount !== cols) ok = false;
              }
            }
            return ok;
          });
          return ok;
        },
      }),
    ];
  },
});

export function getProtectedAtomInSelection(
  state: EditorState,
): { node: ProseMirrorNode; pos: number; to: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    if (isProtectedAtom(selection.node) || isTableBlock(selection.node)) {
      return { node: selection.node, pos: selection.from, to: selection.to };
    }
  }
  const { $from, $to } = selection;
  if ($from.sameParent($to) && $from.parent.type.name === 'doc') {
    const node = $from.nodeAfter;
    if (
      node &&
      (isProtectedBlockAtom(node) || isTableBlock(node)) &&
      selection.from === $from.pos &&
      selection.to === $from.pos + node.nodeSize
    ) {
      return { node, pos: selection.from, to: selection.to };
    }
  }
  return null;
}

export function insertTextAdjacentToProtectedAtom(
  view: EditorView,
  atomInfo: { node: ProseMirrorNode; pos: number; to: number },
  text: string,
): boolean {
  if (atomInfo.node.isInline) {
    const afterPos = atomInfo.to;
    const tr = view.state.tr.insertText(text, afterPos);
    tr.setSelection(TextSelection.create(tr.doc, afterPos + text.length));
    view.dispatch(tr);
    view.focus();
    return true;
  }

  const { doc } = view.state;
  const afterPos = atomInfo.to;
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

export const notebookSandboxDocumentFlowPluginKey = new PluginKey('notebookSandboxDocumentFlow');

/** M6.0 / M6.1: Document flow & safe typing guards around atom blocks. */
function isDomInputEvent(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    Boolean(target.closest('input, textarea'))
  );
}

export const NotebookSandboxDocumentFlow = Extension.create({
  name: 'notebookSandboxDocumentFlow',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: notebookSandboxDocumentFlowPluginKey,
        props: {
          handleKeyDown(view, event) {
            // Typing inside a native form control (e.g. inline formula edit input) belongs to that input.
            if (isDomInputEvent(event.target)) {
              return false;
            }

            const atomInfo = getProtectedAtomInSelection(view.state);
            const isPrintable =
              event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

            // Ordinary printable typing on protected atom selection must not replace the atom node.
            if (isPrintable && atomInfo) {
              event.preventDefault();
              return insertTextAdjacentToProtectedAtom(view, atomInfo, event.key);
            }
            return false;
          },

          handleTextInput(view, _from, _to, text) {
            if (isDomInputEvent(document.activeElement)) {
              return false;
            }

            const atomInfo = getProtectedAtomInSelection(view.state);
            if (atomInfo) {
              return insertTextAdjacentToProtectedAtom(view, atomInfo, text);
            }
            return false;
          },

          handleDOMEvents: {
            beforeinput(view, event) {
              if (isDomInputEvent(event.target)) {
                return false;
              }

              const inputEvent = event as InputEvent;
              if (
                inputEvent.inputType === 'insertText' ||
                inputEvent.inputType === 'insertReplacementText'
              ) {
                const atomInfo = getProtectedAtomInSelection(view.state);
                if (atomInfo) {
                  event.preventDefault();
                  const text = inputEvent.data ?? '';
                  if (text) {
                    insertTextAdjacentToProtectedAtom(view, atomInfo, text);
                  }
                  return true;
                }
              }
              return false;
            },
          },

          handleClick(view, pos, event) {
            const { doc } = view.state;
            const last = doc.lastChild;
            if (!last) return false;

            if (!isProtectedBlockAtom(last) && !isTableBlock(last)) return false;

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
