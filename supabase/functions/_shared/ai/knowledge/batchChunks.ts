/**
 * Deterministic chunk batching for embedding requests.
 * Order: page_number ASC, chunk_index ASC (caller must pre-sort or we sort).
 */

import {
  KNOWLEDGE_EMBED_MAX_CHARS_PER_BATCH,
  KNOWLEDGE_EMBED_MAX_CHUNKS_PER_BATCH,
} from './bounds.ts';
import { buildPdfEmbeddingText } from './chunkPages.ts';

export type IndexableChunk = {
  id: string;
  page_number: number;
  chunk_index: number;
  text: string;
  source_version: number;
  /**
   * Free Space PDF file name for embed-only title cue (optional).
   * Not stored on the chunk row; attached by loadChunks for PDF sources.
   * Notebook paths leave this unset so embed input remains chunk.text.
   */
  fileName?: string | null;
};

export type EmbeddingBatch = {
  /** Stable order within the batch (maps 1:1 to provider input index). */
  chunks: IndexableChunk[];
  /** Sum of text lengths. */
  charCount: number;
};

export function sortChunksForEmbedding(chunks: IndexableChunk[]): IndexableChunk[] {
  return [...chunks].sort((a, b) => {
    if (a.page_number !== b.page_number) return a.page_number - b.page_number;
    return a.chunk_index - b.chunk_index;
  });
}

/**
 * Split sorted chunks into batches under chunk-count and char budgets.
 */
export function batchChunksForEmbedding(
  chunks: IndexableChunk[],
  opts?: {
    maxChunksPerBatch?: number;
    maxCharsPerBatch?: number;
  },
): EmbeddingBatch[] {
  const maxChunks = opts?.maxChunksPerBatch ?? KNOWLEDGE_EMBED_MAX_CHUNKS_PER_BATCH;
  const maxChars = opts?.maxCharsPerBatch ?? KNOWLEDGE_EMBED_MAX_CHARS_PER_BATCH;
  const ordered = sortChunksForEmbedding(chunks);
  const batches: EmbeddingBatch[] = [];
  let current: IndexableChunk[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length === 0) return;
    batches.push({ chunks: current, charCount: chars });
    current = [];
    chars = 0;
  };

  for (const c of ordered) {
    const len = c.text.length;
    const wouldExceedChunks = current.length >= maxChunks;
    const wouldExceedChars = current.length > 0 && chars + len > maxChars;
    if (wouldExceedChunks || wouldExceedChars) flush();
    // Single oversized chunk still forms its own batch (should not happen under 1200 cap).
    current.push(c);
    chars += len;
  }
  flush();
  return batches;
}

/**
 * Embed input for a chunk.
 * - Notebook / no fileName: canonical body only.
 * - Free Space PDF with fileName: sparse-safe title cue via buildPdfEmbeddingText
 *   (canonical stored text unchanged; model-visible COURSE MATERIAL uses body).
 */
export function embeddingInputForChunk(chunk: IndexableChunk): string {
  if (chunk.fileName != null && String(chunk.fileName).trim().length > 0) {
    return buildPdfEmbeddingText({ fileName: chunk.fileName, text: chunk.text });
  }
  return chunk.text;
}
