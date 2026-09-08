/**
 * Lossless TipTap adapters for ZIKUK Notebook dialect (Milestone 0).
 * In-memory editing model only — does not persist TipTap JSON.
 */

export {
  NotebookTiptapConversionError,
  isNotebookTiptapConversionError,
  type NotebookTiptapErrorCode,
} from './errors';

export { isNotebookTiptapEditorEnabled } from './featureFlag';

export {
  createNotebookTiptapExtensions,
  ALLOWED_BLOCK_TYPES,
  ALLOWED_MARK_TYPES,
} from './extensions';

export { createNotebookTiptapViewerExtensions } from './viewerExtensions';
export { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
export { PARITY_FIXTURE_BODY, RTL_OBSERVATION_LINES } from './parityFixture';
export {
  buildShadowSnapshot,
  classifyDirtyKind,
  summarizeBodyDiff,
  tryCanonicalBody,
} from './shadowDiff';

export { bodyToTiptapDoc, blocksToTiptapDoc, blockToTiptapNode } from './blocksToTiptapDoc';
export { tiptapDocToBody, tiptapDocToBlocks } from './tiptapDocToBody';
export { richLineToTiptapInline, tiptapInlineToRichLine } from './inlineBridge';

import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import type { JSONContent } from '@tiptap/core';

/** Round-trip helpers for tests and future gated editor paths. */
export function roundTripBody(body: string): string {
  return tiptapDocToBody(bodyToTiptapDoc(body));
}

export function roundTripTiptapDoc(doc: JSONContent): JSONContent {
  return bodyToTiptapDoc(tiptapDocToBody(doc));
}
