/**
 * M0.8C — Deterministic Notebook page semantic extraction + normalization.
 *
 * Page title policy (deliberate):
 *   Page title IS included as a leading semantic heading segment.
 *   Rationale: titles like "Solow Model" improve retrieval for body that
 *   discusses related concepts. Rename therefore changes the semantic hash
 *   and is a legitimate re-index. Notebook object title is citation-only
 *   (not hashed here).
 */

import { meaningfulCharCount } from './normalizeText.ts';
import {
  decodeNotebookDialectForKnowledge,
  type NotebookKnowledgeBlock,
  type NotebookKnowledgeCalloutTone,
} from './notebookDialectDecode.ts';

export type NotebookSemanticSegmentKind =
  | 'page_title'
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'callout'
  | 'math'
  | 'table'
  | 'quote'
  | 'step'
  | 'image_caption';

export type NotebookSemanticSegment = {
  kind: NotebookSemanticSegmentKind;
  text: string;
  order: number;
  /** Present for callouts only. */
  tone?: NotebookKnowledgeCalloutTone;
};

export type NotebookExtractSuccess = {
  ok: true;
  segments: NotebookSemanticSegment[];
  /** Deterministic normalized corpus used for hashing. */
  normalizedText: string;
  meaningfulChars: number;
};

export type NotebookExtractFailure = {
  ok: false;
  code:
    | 'notebook_codec_unsupported'
    | 'notebook_extract_failed'
    | 'no_extractable_text';
};

export type NotebookExtractResult = NotebookExtractSuccess | NotebookExtractFailure;

const CALLOUT_LABEL: Record<NotebookKnowledgeCalloutTone, string> = {
  definition: 'Definition',
  concept: 'Key Concept',
  theorem: 'Theorem',
  example: 'Example',
  mistake: 'Mistake',
  summary: 'Summary',
  review: 'Review',
};

/**
 * Normalization contract (documented + tested):
 * - CRLF / CR → LF
 * - NBSP → space
 * - trim each segment's edges
 * - collapse internal runs of spaces/tabs/soft newlines to a single space
 * - drop empty segments
 * - join segments with `\n\n` for the hash corpus
 * - collapse 3+ blank lines (defensive) to `\n\n`
 * - do NOT alter letters, RTL characters, math symbols, or table cell text meaning
 * - do NOT include align / mark / width / asset keys
 */
export function normalizeNotebookSemanticText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function normalizeSegmentText(text: string): string {
  return normalizeNotebookSemanticText(text).replace(/\n+/g, ' ').trim();
}

function blockToSegments(block: NotebookKnowledgeBlock): Omit<NotebookSemanticSegment, 'order'>[] {
  switch (block.kind) {
    case 'divider':
    case 'handwriting':
      return [];
    case 'image-ref': {
      const alt = normalizeSegmentText(block.alt);
      // Skip empty / key-only. V1 alt is a human string; legacy may embed raw JSON quotes.
      if (!alt || alt === '""' || alt === "''") return [];
      // Strip accidental surrounding quotes from legacy forms.
      const cleaned = alt.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
      if (!cleaned) return [];
      return [{ kind: 'image_caption', text: cleaned }];
    }
    case 'title':
    case 'section': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'heading', text: t }];
    }
    case 'paragraph': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'paragraph', text: t }];
    }
    case 'bullet': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      const indent = '  '.repeat(Math.max(0, Math.min(2, block.depth)));
      return [{ kind: 'list_item', text: `${indent}- ${t}` }];
    }
    case 'ordered': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'list_item', text: `${block.number}. ${t}` }];
    }
    case 'task': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'list_item', text: `- [${block.checked ? 'x' : ' '}] ${t}` }];
    }
    case 'quote': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'quote', text: t }];
    }
    case 'step': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'step', text: t }];
    }
    case 'callout': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      const label = CALLOUT_LABEL[block.tone];
      return [{ kind: 'callout', tone: block.tone, text: `${label}: ${t}` }];
    }
    case 'math': {
      const t = normalizeSegmentText(block.text);
      if (!t) return [];
      return [{ kind: 'math', text: t }];
    }
    case 'table': {
      const lines: string[] = [];
      for (const row of block.rows) {
        const cells = row.map((c) => normalizeSegmentText(c)).filter((c) => c.length > 0);
        if (cells.length === 0) continue;
        lines.push(cells.join(' | '));
      }
      if (lines.length === 0) return [];
      return [{ kind: 'table', text: lines.join('\n') }];
    }
  }
}

export function extractNotebookPageSemantics(input: {
  documentBody: string;
  codecVersion: number | undefined;
  /** Page title — included in semantic corpus (see file header policy). */
  pageTitle?: string | null;
}): NotebookExtractResult {
  const decoded = decodeNotebookDialectForKnowledge(input.documentBody, input.codecVersion);
  if (!decoded.ok) return decoded;

  const segments: NotebookSemanticSegment[] = [];
  let order = 0;

  const title = normalizeSegmentText(input.pageTitle ?? '');
  if (title) {
    segments.push({ kind: 'page_title', text: title, order: order++ });
  }

  for (const block of decoded.blocks) {
    for (const seg of blockToSegments(block)) {
      segments.push({ ...seg, order: order++ });
    }
  }

  if (segments.length === 0) {
    return { ok: false, code: 'no_extractable_text' };
  }

  const normalizedText = normalizeNotebookSemanticText(
    segments.map((s) => s.text).join('\n\n'),
  );
  const meaningfulChars = meaningfulCharCount(normalizedText);
  if (!normalizedText || meaningfulChars === 0) {
    return { ok: false, code: 'no_extractable_text' };
  }

  return {
    ok: true,
    segments,
    normalizedText,
    meaningfulChars,
  };
}
