/**
 * M0.8C — Notebook-aware deterministic chunking (no embeddings).
 *
 * Reuses PDF size bounds (900 soft / 1200 hard / 40 min) but prefers
 * Notebook semantic segment boundaries. Never crosses pages — each call
 * is already page-local (page_number fixed to 1 for the notebook page source).
 */

import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_CHUNK_MIN_CHARS,
  KNOWLEDGE_CHUNK_TARGET_CHARS,
} from './bounds.ts';
import type { KnowledgeChunk } from './chunkPages.ts';
import type { NotebookSemanticSegment } from './extractNotebookPage.ts';
import { meaningfulCharCount } from './normalizeText.ts';

/** Display/page_number for a notebook_page source is always 1 (page-local source). */
export const NOTEBOOK_PAGE_CHUNK_PAGE_NUMBER = 1 as const;

function splitOversized(text: string): string[] {
  if (text.length <= KNOWLEDGE_CHUNK_MAX_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= KNOWLEDGE_CHUNK_MAX_CHARS) {
      parts.push(rest);
      break;
    }
    const window = rest.slice(0, KNOWLEDGE_CHUNK_MAX_CHARS);
    const softEnd = Math.min(
      window.length,
      Math.max(KNOWLEDGE_CHUNK_TARGET_CHARS, Math.floor(KNOWLEDGE_CHUNK_MAX_CHARS * 0.6)),
    );
    let cut = -1;
    const sentenceRe = /[.!?]["')\]]?\s+/g;
    let m: RegExpExecArray | null;
    while ((m = sentenceRe.exec(window)) !== null) {
      const end = m.index + m[0].length;
      if (end <= softEnd) cut = end;
      if (end > softEnd) break;
    }
    if (cut < KNOWLEDGE_CHUNK_MIN_CHARS) {
      const space = window.lastIndexOf(' ');
      cut = space >= KNOWLEDGE_CHUNK_MIN_CHARS ? space + 1 : KNOWLEDGE_CHUNK_MAX_CHARS;
    }
    const piece = rest.slice(0, cut).trim();
    rest = rest.slice(cut).trimStart();
    if (piece.length > 0) parts.push(piece);
    else {
      parts.push(rest.slice(0, KNOWLEDGE_CHUNK_MAX_CHARS));
      rest = rest.slice(KNOWLEDGE_CHUNK_MAX_CHARS);
    }
  }
  return parts.filter((p) => p.length > 0);
}

/**
 * Priority: keep academic callouts / headings / tables atomic when possible;
 * then pack segments up to soft target without exceeding hard max.
 */
export function chunkNotebookSegments(
  segments: readonly NotebookSemanticSegment[],
): KnowledgeChunk[] {
  const ordered = [...segments].sort((a, b) => a.order - b.order);
  const units: string[] = [];

  for (const seg of ordered) {
    const text = seg.text.trim();
    if (!text || meaningfulCharCount(text) === 0) continue;

    // Prefer not to split callouts/headings/tables unless oversized.
    if (
      seg.kind === 'callout' ||
      seg.kind === 'heading' ||
      seg.kind === 'page_title' ||
      seg.kind === 'table' ||
      seg.kind === 'math'
    ) {
      units.push(...splitOversized(text));
      continue;
    }
    units.push(...splitOversized(text));
  }

  if (units.length === 0) return [];

  const raw: KnowledgeChunk[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let index = 0;

  const pushBuf = () => {
    if (buf.length === 0) return;
    const text = buf.join('\n\n').trim();
    buf = [];
    bufLen = 0;
    if (!text || meaningfulCharCount(text) === 0) return;
    raw.push({
      page_number: NOTEBOOK_PAGE_CHUNK_PAGE_NUMBER,
      chunk_index: index,
      text,
      char_count: text.length,
    });
    index += 1;
  };

  for (const unit of units) {
    const addLen = unit.length + (bufLen > 0 ? 2 : 0);
    if (bufLen > 0 && bufLen + addLen > KNOWLEDGE_CHUNK_TARGET_CHARS) {
      if (bufLen >= KNOWLEDGE_CHUNK_MIN_CHARS) pushBuf();
    }
    if (bufLen > 0 && bufLen + addLen > KNOWLEDGE_CHUNK_MAX_CHARS) {
      pushBuf();
    }
    buf.push(unit);
    bufLen += addLen;
    if (bufLen >= KNOWLEDGE_CHUNK_MAX_CHARS) pushBuf();
  }
  pushBuf();

  // Tiny-tail merge
  if (raw.length >= 2) {
    const last = raw[raw.length - 1]!;
    const prev = raw[raw.length - 2]!;
    if (
      last.text.length < KNOWLEDGE_CHUNK_MIN_CHARS &&
      prev.char_count + 2 + last.char_count <= KNOWLEDGE_CHUNK_MAX_CHARS
    ) {
      const merged = `${prev.text}\n\n${last.text}`;
      raw[raw.length - 2] = {
        page_number: NOTEBOOK_PAGE_CHUNK_PAGE_NUMBER,
        chunk_index: prev.chunk_index,
        text: merged,
        char_count: merged.length,
      };
      raw.pop();
    }
  }

  const filtered = raw.filter((c) => {
    if (c.text.length >= KNOWLEDGE_CHUNK_MIN_CHARS) return true;
    return meaningfulCharCount(c.text) >= Math.min(16, KNOWLEDGE_CHUNK_MIN_CHARS);
  });

  return filtered.map((c, i) => ({
    page_number: NOTEBOOK_PAGE_CHUNK_PAGE_NUMBER,
    chunk_index: i,
    text: c.text,
    char_count: c.text.length,
  }));
}
