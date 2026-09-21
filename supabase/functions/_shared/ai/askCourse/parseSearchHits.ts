/**
 * Defensive parse of ai_knowledge_search RPC rows.
 * Never expects/accepts embedding vectors in the payload.
 *
 * M0.8F: rows may include source_kind + notebook_object_id.
 * Legacy PDF-only rows (no source_kind) default to free_space_pdf.
 */

import type { AskCourseSourceKind, KnowledgeSearchHit } from './retrievalTypes.ts';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseSourceKind(raw: unknown): AskCourseSourceKind | null {
  if (raw === 'free_space_pdf' || raw === 'notebook_page') return raw;
  if (raw === undefined || raw === null) return 'free_space_pdf';
  return null;
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
    const sourceKind = parseSourceKind(row.source_kind);
    if (!sourceKind) return { ok: false, reason: `row_${i}_source_kind` };

    const sourceObjectId = row.source_object_id;
    const fileName = row.file_name;
    const pageNumber = row.page_number;
    const chunkIndex = row.chunk_index;
    const text = row.text;
    const similarity = row.similarity;
    const notebookObjectIdRaw = row.notebook_object_id;

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

    let notebookObjectId: string | null = null;
    if (notebookObjectIdRaw === null || notebookObjectIdRaw === undefined) {
      notebookObjectId = null;
    } else if (typeof notebookObjectIdRaw === 'string' && notebookObjectIdRaw.trim().length > 0) {
      notebookObjectId = notebookObjectIdRaw.trim();
    } else {
      return { ok: false, reason: `row_${i}_notebook_object_id` };
    }

    if (sourceKind === 'notebook_page' && !notebookObjectId) {
      return { ok: false, reason: `row_${i}_notebook_object_id_required` };
    }
    if (sourceKind === 'free_space_pdf' && notebookObjectId) {
      // PDF rows must not carry notebook parent identity.
      return { ok: false, reason: `row_${i}_pdf_unexpected_notebook_object_id` };
    }

    hits.push({
      sourceKind,
      sourceObjectId: sourceObjectId.trim(),
      notebookObjectId,
      fileName: typeof fileName === 'string' ? fileName : null,
      pageNumber,
      chunkIndex,
      text,
      similarity,
    });
  }
  return { ok: true, hits };
}
