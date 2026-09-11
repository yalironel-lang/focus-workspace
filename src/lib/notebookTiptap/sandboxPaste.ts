/**
 * Plain-text paste for TipTap sandbox.
 * Newlines → dialect blocks (via parseNotebookLine), never hardBreak.
 * HTML-only paste is refused.
 *
 * Policy: do NOT strip Unicode bidi control characters from user paste.
 * ZIKUK implements RTL via DOM dir/isolation and never injects bidi controls.
 */

import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import { parseNotebookLine, notebookLineToBlock } from '../notebookDialect';
import { blockToTiptapNode } from './blocksToTiptapDoc';

function linesToJsonNodes(text: string): JSONContent[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  return lines.map(line => {
    const block = notebookLineToBlock(parseNotebookLine(line));
    if (block.kind === 'bullet' && block.depth > 2) {
      return blockToTiptapNode({ ...block, depth: 2 });
    }
    return blockToTiptapNode(block);
  });
}

export const NotebookSandboxPaste = Extension.create({
  name: 'notebookSandboxPaste',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('notebookSandboxPaste'),
        props: {
          handlePaste(view, event) {
            const plain = event.clipboardData?.getData('text/plain') ?? '';
            if (!plain) {
              event.preventDefault();
              return true;
            }
            event.preventDefault();
            const nodesJson = linesToJsonNodes(plain);
            const schema = view.state.schema;
            const pmNodes = [];
            for (const j of nodesJson) {
              try {
                pmNodes.push(schema.nodeFromJSON(j));
              } catch {
                pmNodes.push(schema.node('nbParagraph', { variant: null }));
              }
            }
            if (!pmNodes.length) return true;
            const fragment = Fragment.fromArray(pmNodes);
            // Plain paragraph edges should join the surrounding text, just like
            // native text paste. Keep explicit dialect block edges closed so
            // pasting a list/callout still inserts that existing block type.
            const first = pmNodes[0];
            const last = pmNodes[pmNodes.length - 1];
            const openStart = first.type.name === 'nbParagraph' && first.attrs.variant == null ? 1 : 0;
            const openEnd = last.type.name === 'nbParagraph' && last.attrs.variant == null ? 1 : 0;
            const slice = new Slice(fragment, openStart, openEnd);
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          },
          handleDrop(_view, event) {
            if (event.dataTransfer?.files?.length) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
