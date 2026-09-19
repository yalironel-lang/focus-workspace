/**
 * Bounded surrounding context: previous + current + next top-level blocks only.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import { MAX_SURROUNDING_BLOCKS } from './bounds';
import { normalizeTopLevelBlock } from './normalizeBlock';
import type { ZikukAiSurroundingBlock, ZikukAiSurroundings } from './types';

/**
 * @param doc TipTap document node
 * @param anchorPos ProseMirror position inside the selection anchor
 */
export function extractSurroundings(doc: PmNode, anchorPos: number): ZikukAiSurroundings {
  const $ = doc.resolve(Math.max(0, Math.min(anchorPos, doc.content.size)));
  const index = $.index(0);
  const blocks: ZikukAiSurroundingBlock[] = [];
  let truncated = false;

  const candidates: Array<{ role: 'previous' | 'current' | 'next'; i: number }> = [
    { role: 'previous', i: index - 1 },
    { role: 'current', i: index },
    { role: 'next', i: index + 1 },
  ];

  for (const { role, i } of candidates) {
    if (i < 0 || i >= doc.childCount) continue;
    if (blocks.length >= MAX_SURROUNDING_BLOCKS) break;
    const node = doc.child(i);
    const norm = normalizeTopLevelBlock(node);
    if (norm.truncated) truncated = true;
    blocks.push({
      role,
      blockKind: norm.blockKind,
      content: norm.content,
    });
  }

  return { blocks, truncated };
}
