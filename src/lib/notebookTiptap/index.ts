/**
 * Lossless TipTap adapters for ZIKUK Notebook dialect (Milestone 0).
 * In-memory editing model only — does not persist TipTap JSON.
 */

export {
  NotebookTiptapConversionError,
  isNotebookTiptapConversionError,
  type NotebookTiptapErrorCode,
} from './errors';

export { isNotebookTiptapEditorEnabled, isNotebookTiptapCandidateEnabled, isNotebookTiptapCandidateActive, isNotebookTiptapPersistEnabled, isNotebookTiptapPersistActive, isNotebookLegacyCeForced } from './featureFlag';

export {
  createNotebookTiptapExtensions,
  ALLOWED_BLOCK_TYPES,
  ALLOWED_MARK_TYPES,
} from './extensions';

export { createNotebookTiptapViewerExtensions } from './viewerExtensions';
export { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
export { findDelimitedMathSourceRanges } from './sandboxInlineMathIsolate';
export { PARITY_FIXTURE_BODY, RTL_OBSERVATION_LINES, RTL_PHASE_A_FIXTURE_BODY } from './parityFixture';
export {
  buildShadowSnapshot,
  classifyDirtyKind,
  summarizeBodyDiff,
  tryCanonicalBody,
} from './shadowDiff';
export {
  detectFirstStrongDirection,
  resolveEffectiveDir,
  hasBidiControlChars,
  normalizeTextDir,
  inheritDirForNewBlock,
  notebookChromeAwareDirWrapperProps,
  type NotebookTextDir,
} from './direction';

export {
  runCandidateFormatCommand,
  readCandidateFormatState,
  applyCandidateFontSize,
  CANDIDATE_FONT_SIZE_PRESETS,
  type CandidateFormatCommand,
  type CandidateFormatState,
} from './candidateFormatCommands';

export { ACADEMIC_PRODUCT_QA_BODY } from './academicProductQaFixture';
export {
  runCandidateBlockCommand,
  insertCandidateBlockAtTarget,
  readCandidateBlockKind,
  CANDIDATE_BLOCK_MENU,
  PRODUCT_ACADEMIC_TONES,
  textLooksLikeAcademicTypedLabel,
  type CandidateBlockTarget,
} from './candidateBlockCommands';

export {
  DEFAULT_INSERT_TABLE_COLS,
  DEFAULT_INSERT_TABLE_ROWS,
  collapseSelectionToEndOfTableCell,
  createNotebookTableJson,
  isEditorTableDocSerializable,
  isSelectionInsideTable,
  isSelectionInsideTableCell,
  isValidTableSize,
  navigateNotebookTableCell,
  readCandidateTableState,
  readTableContext,
  resolveNotebookTableInsertPos,
  runCandidateTableCommand,
  type CandidateTableCommand,
  type CandidateTableState,
} from './tableCommands';

export {
  TABLE_CONTEXT_MENU_ACTIONS,
  TABLE_SIZE_PICKER_MAX,
  formatTableSizeLabel,
} from './candidateTableUi';

export { bodyToTiptapDoc, blocksToTiptapDoc, blockToTiptapNode } from './blocksToTiptapDoc';
export { tiptapDocToBody, tiptapDocToBlocks } from './tiptapDocToBody';
export { richLineToTiptapInline, tiptapInlineToRichLine } from './inlineBridge';

export {
  CANDIDATE_INSERT_IMAGE_MENU_VALUE,
  NOTEBOOK_IMAGE_FILE_ACCEPT,
  insertNbImageRefAtSelection,
  resolveNbImageInsertTarget,
  removeSelectedNbImageRef,
  type NbImageInsertTarget,
} from './candidateImageInsert';

export {
  CANDIDATE_INSERT_HANDWRITING_MENU_VALUE,
  insertNbHandwritingAtSelection,
  resolveNbHandwritingInsertTarget,
  removeSelectedNbHandwriting,
  newHandwritingKey,
  type NbHandwritingInsertTarget,
} from './candidateHandwritingInsert';

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
