/**
 * ZIKUK AI context layer (M0.1) — provider-independent capture only.
 * No Gateway, no prompts, no provider SDKs.
 */

export type {
  ZikukAiContext,
  ZikukAiIdentity,
  ZikukAiAcademic,
  ZikukAiNotebookSurface,
  ZikukAiBlockKind,
  ZikukAiSurroundingBlockKind,
  ZikukAiNormalizedContent,
  ZikukAiFocus,
  ZikukAiSurroundingBlock,
  ZikukAiSurroundings,
  CaptureNotebookAiContextHost,
  CaptureNotebookAiContextInput,
  CaptureNotebookAiContextResult,
} from './types';

export {
  MAX_SELECTION_CHARS,
  MAX_BLOCK_CHARS,
  MAX_TABLE_PREVIEW_CHARS,
  MAX_SURROUNDING_BLOCKS,
} from './bounds';

export { captureNotebookAiContext } from './captureNotebookAiContext';
export { extractFocus } from './extractFocus';
export { extractSurroundings } from './extractSurroundings';
export {
  normalizeTopLevelBlock,
  mapTextBlockKind,
  plainTextFromNode,
} from './normalizeBlock';
