/**
 * Deterministic page-aware chunking.
 * Hard rule: a chunk never spans two PDF pages.
 */

import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_CHUNK_MIN_CHARS,
  KNOWLEDGE_CHUNK_TARGET_CHARS,
  KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS,
} from './bounds.ts';
import { meaningfulCharCount } from './normalizeText.ts';

export type KnowledgeChunk = {
  page_number: number;
  chunk_index: number;
  text: string;
  char_count: number;
};

export type PageText = {
  pageNumber: number;
  text: string;
};

/**
 * M1.0B B1 — native PDF page extraction with detector metrics.
 * Extra fields are observational; chunking continues to use only pageNumber + text.
 */
export type ExtractedPdfPage = PageText & {
  itemCount: number;
  meaningfulChars: number;
  suspiciousUnicodeCount: number;
};

function splitIntoBlocks(pageText: string): string[] {
  const paragraphs = pageText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const blocks: string[] = [];
  for (const para of paragraphs) {
    const lines = para
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    // Keep paragraph as one block when small; otherwise use lines.
    if (para.length <= KNOWLEDGE_CHUNK_TARGET_CHARS) {
      blocks.push(lines.join('\n'));
    } else {
      blocks.push(...lines);
    }
  }
  return blocks;
}

function findSoftBreak(text: string, target: number, max: number): number {
  if (text.length <= max) return text.length;
  const window = text.slice(0, max);
  // Prefer sentence boundary near target.
  const softEnd = Math.min(window.length, Math.max(target, Math.floor(max * 0.6)));
  const sentenceRe = /[.!?]["')\]]?\s+/g;
  let lastSentence = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(window)) !== null) {
    const end = m.index + m[0].length;
    if (end <= softEnd) lastSentence = end;
    if (end > softEnd) break;
  }
  if (lastSentence >= KNOWLEDGE_CHUNK_MIN_CHARS) return lastSentence;

  // Prefer last whitespace before max.
  const space = window.lastIndexOf(' ');
  if (space >= KNOWLEDGE_CHUNK_MIN_CHARS) return space + 1;

  return max;
}

function splitOversizedBlock(block: string): string[] {
  if (block.length <= KNOWLEDGE_CHUNK_MAX_CHARS) return [block];
  const parts: string[] = [];
  let rest = block;
  while (rest.length > 0) {
    if (rest.length <= KNOWLEDGE_CHUNK_MAX_CHARS) {
      parts.push(rest);
      break;
    }
    const cut = findSoftBreak(rest, KNOWLEDGE_CHUNK_TARGET_CHARS, KNOWLEDGE_CHUNK_MAX_CHARS);
    const piece = rest.slice(0, cut).trim();
    rest = rest.slice(cut).trimStart();
    if (piece.length > 0) parts.push(piece);
    if (piece.length === 0) {
      // Avoid infinite loop on pathological input.
      parts.push(rest.slice(0, KNOWLEDGE_CHUNK_MAX_CHARS));
      rest = rest.slice(KNOWLEDGE_CHUNK_MAX_CHARS);
    }
  }
  return parts.filter((p) => p.length > 0);
}

function flushChunk(
  pageNumber: number,
  chunkIndex: number,
  buf: string[],
): KnowledgeChunk | null {
  const text = buf.join('\n').trim();
  if (!text) return null;
  if (meaningfulCharCount(text) === 0) return null;
  if (text.length < KNOWLEDGE_CHUNK_MIN_CHARS && meaningfulCharCount(text) < KNOWLEDGE_CHUNK_MIN_CHARS) {
    // Keep tiny leftover only if it has some substance and will be merged by caller.
    return {
      page_number: pageNumber,
      chunk_index: chunkIndex,
      text,
      char_count: text.length,
    };
  }
  return {
    page_number: pageNumber,
    chunk_index: chunkIndex,
    text,
    char_count: text.length,
  };
}

function chunkSinglePage(pageNumber: number, pageText: string): KnowledgeChunk[] {
  const trimmed = pageText.trim();
  if (!trimmed || meaningfulCharCount(trimmed) === 0) return [];

  const blocks = splitIntoBlocks(trimmed);
  const expanded: string[] = [];
  for (const b of blocks) {
    expanded.push(...splitOversizedBlock(b));
  }
  if (expanded.length === 0) {
    // Entire page is one blob.
    for (const part of splitOversizedBlock(trimmed)) {
      expanded.push(part);
    }
  }

  const raw: KnowledgeChunk[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let index = 0;

  const pushBuf = () => {
    if (buf.length === 0) return;
    const chunk = flushChunk(pageNumber, index, buf);
    buf = [];
    bufLen = 0;
    if (!chunk) return;
    raw.push(chunk);
    index += 1;
  };

  for (const block of expanded) {
    const addLen = block.length + (bufLen > 0 ? 1 : 0);
    if (bufLen > 0 && bufLen + addLen > KNOWLEDGE_CHUNK_TARGET_CHARS) {
      // Try soft close if we already have enough.
      if (bufLen >= KNOWLEDGE_CHUNK_MIN_CHARS) {
        pushBuf();
      }
    }
    if (bufLen > 0 && bufLen + addLen > KNOWLEDGE_CHUNK_MAX_CHARS) {
      pushBuf();
    }
    buf.push(block);
    bufLen += addLen;
    if (bufLen >= KNOWLEDGE_CHUNK_MAX_CHARS) {
      pushBuf();
    }
  }
  pushBuf();

  // Merge trailing tiny chunk into previous when possible.
  if (raw.length >= 2) {
    const last = raw[raw.length - 1]!;
    const prev = raw[raw.length - 2]!;
    if (
      last.text.length < KNOWLEDGE_CHUNK_MIN_CHARS &&
      prev.char_count + 1 + last.char_count <= KNOWLEDGE_CHUNK_MAX_CHARS
    ) {
      const mergedText = `${prev.text}\n${last.text}`;
      raw[raw.length - 2] = {
        page_number: pageNumber,
        chunk_index: prev.chunk_index,
        text: mergedText,
        char_count: mergedText.length,
      };
      raw.pop();
    }
  }

  // Drop remaining tiny noise chunks with almost no substance.
  const filtered = raw.filter((c) => {
    if (c.text.length >= KNOWLEDGE_CHUNK_MIN_CHARS) return true;
    return meaningfulCharCount(c.text) >= Math.min(16, KNOWLEDGE_CHUNK_MIN_CHARS);
  });

  // Re-index stably.
  return filtered.map((c, i) => ({
    page_number: pageNumber,
    chunk_index: i,
    text: c.text,
    char_count: c.text.length,
  }));
}

/**
 * Chunk pages independently. Ordering: page asc, chunk_index asc.
 * Identical page texts always produce identical chunks.
 */
export function chunkPageTexts(pages: PageText[]): KnowledgeChunk[] {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const out: KnowledgeChunk[] = [];
  for (const page of sorted) {
    out.push(...chunkSinglePage(page.pageNumber, page.text));
  }
  return out;
}

/**
 * Embed-only PDF title cue (M1.0B B4.1).
 *
 * Stored chunk.text stays canonical academic body (classic ingest + recovery).
 * Citation/page identity stays in metadata — do not bake `filename — page N`
 * into the model-visible COURSE MATERIAL body.
 *
 * Sparse / ultra-short pages skip the cue so repeated filename tokens cannot
 * dominate ranking. Threshold reuses the existing thin-page meaningful-char signal.
 */
export function buildPdfEmbeddingText(input: {
  fileName: string | null | undefined;
  text: string;
}): string {
  const body = input.text.trim();
  if (!body) return body;
  if (meaningfulCharCount(body) <= KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS) {
    return body;
  }
  const name = (input.fileName ?? '').trim();
  if (!name) return body;
  return `${name}\n${body}`;
}
