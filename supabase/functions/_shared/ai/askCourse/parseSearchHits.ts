/**
 * Defensive parse of ai_knowledge_search RPC rows.
 * Never expects/accepts embedding vectors in the payload.
 */

import type { KnowledgeSearchHit } from './retrievalTypes.ts';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate untrusted RPC JSON into KnowledgeSearchHit[].
 * Rejects rows with vector-like fields or non-finite similarity.
 */
export function parseKnowledgeSearchRows(
  raw: unknown,
): { ok: true; hits: KnowledgeSearchHit[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'not_array' };
  }
  const hits: KnowledgeSearchHit[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!isRecord(row)) return { ok: false, reason: `row_${i}_not_object` };
    if ('embedding' in row || 'vector' in row || 'embeddings' in row) {
      return { ok: false, reason: `row_${i}_unexpected_vector` };
    }
    const sourceObjectId = row.source_object_id;
    const fileName = row.file_name;
    const pageNumber = row.page_number;
    const chunkIndex = row.chunk_index;
    const text = row.text;
    const similarity = row.similarity;
    if (typeof sourceObjectId !== 'string' || sourceObjectId.trim().length === 0) {
      return { ok: false, reason: `row_${i}_source_object_id` };
    }
    if (fileName !== null && fileName !== undefined && typeof fileName !== 'string') {
      return { ok: false, reason: `row_${i}_file_name` };
    }
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber) || !Number.isInteger(pageNumber)) {
      return { ok: false, reason: `row_${i}_page_number` };
    }
    if (typeof chunkIndex !== 'number' || !Number.isFinite(chunkIndex) || !Number.isInteger(chunkIndex)) {
      return { ok: false, reason: `row_${i}_chunk_index` };
    }
    if (typeof text !== 'string') {
      return { ok: false, reason: `row_${i}_text` };
    }
    if (typeof similarity !== 'number' || !Number.isFinite(similarity)) {
      return { ok: false, reason: `row_${i}_similarity` };
    }
    hits.push({
      sourceObjectId: sourceObjectId.trim(),
      fileName: typeof fileName === 'string' ? fileName : null,
      pageNumber,
      chunkIndex,
      text,
      similarity,
    });
  }
  return { ok: true, hits };
}
