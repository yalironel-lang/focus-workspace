/**
 * Plain-text paste for TipTap sandbox.
 * Newlines → dialect blocks (via parseNotebookLine), never hardBreak.
 * HTML-only paste is refused.
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
            const slice = new Slice(fragment, 0, 0);
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
