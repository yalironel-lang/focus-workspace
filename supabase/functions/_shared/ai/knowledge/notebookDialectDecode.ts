/**
 * M0.8C — Server-side Notebook dialect decode for knowledge extraction.
 * Fail-closed. Does not mutate Notebook content. Does not import TipTap.
 *
 * Supports:
 * - codecVersion === 1 → ~nb1: versioned records (+ ::img:: / ::hw:: / ---)
 * - codecVersion undefined → legacy markdown-lite lines
 * - any other codecVersion → unsupported (caller must fail closed)
 */

export const NOTEBOOK_KNOWLEDGE_CODEC_V1 = 1 as const;

export type NotebookKnowledgeCalloutTone =
  | 'summary'
  | 'concept'
  | 'review'
  | 'definition'
  | 'theorem'
  | 'example'
  | 'mistake';

export type NotebookKnowledgeBlock =
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'ordered'; text: string; number: number }
  | { kind: 'task'; text: string; checked: boolean }
  | { kind: 'quote'; text: string }
  | { kind: 'step'; text: string }
  | { kind: 'callout'; tone: NotebookKnowledgeCalloutTone; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'image-ref'; alt: string }
  | { kind: 'handwriting' }
  | { kind: 'divider' };

export type DecodeNotebookDialectResult =
  | { ok: true; blocks: NotebookKnowledgeBlock[] }
  | {
      ok: false;
      code: 'notebook_codec_unsupported' | 'notebook_extract_failed';
    };

const TONES = new Set<NotebookKnowledgeCalloutTone>([
  'summary',
  'concept',
  'review',
  'definition',
  'theorem',
  'example',
  'mistake',
]);

const V1_KINDS = new Set([
  'paragraph',
  'title',
  'section',
  'bullet',
  'ordered',
  'task',
  'quote',
  'step',
  'callout',
  'math',
  'table',
]);

function normalizeSpaces(s: string): string {
  return s.replace(/\u00a0/g, ' ');
}

function parseLegacyLine(raw: string): NotebookKnowledgeBlock | null {
  const normalized = normalizeSpaces(raw);
  const trimmed = normalized.trim();
  if (trimmed === '') return { kind: 'paragraph', text: '' };
  if (trimmed === '---') return { kind: 'divider' };

  const sectionMatch = trimmed.match(/^##\s*(.*)$/);
  if (sectionMatch) return { kind: 'section', text: (sectionMatch[1] ?? '').trimEnd() };

  const titleMatch = trimmed.match(/^#(?!\#)\s*(.*)$/);
  if (titleMatch) return { kind: 'title', text: (titleMatch[1] ?? '').trimEnd() };

  const orderedMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
  if (orderedMatch) {
    return {
      kind: 'ordered',
      number: Math.max(1, Number(orderedMatch[1] ?? 1) || 1),
      text: (orderedMatch[2] ?? '').trimEnd(),
    };
  }

  const taskMatch = trimmed.match(/^- \[\s*([xX ])\s*\]\s*(.*)$/);
  if (taskMatch) {
    const checked = taskMatch[1]!.trim().toLowerCase() === 'x';
    return { kind: 'task', checked, text: (taskMatch[2] ?? '').trimEnd() };
  }

  const bulletIndentMatch = normalized.match(/^(\s*)- (?!\[)\s*(.*)$/);
  if (bulletIndentMatch) {
    const depth = Math.min(2, Math.floor((bulletIndentMatch[1]?.length ?? 0) / 2));
    return { kind: 'bullet', depth, text: (bulletIndentMatch[2] ?? '').trimEnd() };
  }

  const quoteMatch = trimmed.match(/^>\s?(.*)$/);
  if (quoteMatch && trimmed.startsWith('>')) {
    return { kind: 'quote', text: (quoteMatch[1] ?? '').trimEnd() };
  }

  const calloutMatch = trimmed.match(
    /^!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i,
  );
  if (calloutMatch) {
    return {
      kind: 'callout',
      tone: calloutMatch[1]!.toLowerCase() as NotebookKnowledgeCalloutTone,
      text: (calloutMatch[2] ?? '').trimEnd(),
    };
  }

  const mathMatch = trimmed.match(/^\$\$\s+(.*)$/);
  if (mathMatch) return { kind: 'math', text: (mathMatch[1] ?? '').trimEnd() };

  const imgWithWidth = trimmed.match(/^::img::([a-z0-9-]+)::(.+)::([0-9]+)::$/);
  if (imgWithWidth) {
    return { kind: 'image-ref', alt: imgWithWidth[2] ?? '' };
  }
  const imgMatch = trimmed.match(/^::img::([a-z0-9-]+)::(.*)::$/);
  if (imgMatch) return { kind: 'image-ref', alt: imgMatch[2] ?? '' };

  const hwMatch = trimmed.match(/^::hw::([a-z0-9-]+)::$/);
  if (hwMatch) return { kind: 'handwriting' };

  const stepMatch = trimmed.match(/^=>\s*(.*)$/);
  if (stepMatch) return { kind: 'step', text: (stepMatch[1] ?? '').trimEnd() };

  if (trimmed.startsWith('\u00b6\u00b6')) {
    return { kind: 'paragraph', text: trimmed.slice(2).trimStart().trimEnd() };
  }
  if (trimmed.startsWith('\u00b6')) {
    return { kind: 'paragraph', text: trimmed.slice(1).trimStart().trimEnd() };
  }

  return { kind: 'paragraph', text: normalized };
}

function assertMarksShape(value: unknown, length: number): void {
  if (!Array.isArray(value)) throw new Error('bad marks');
  for (const mark of value) {
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) throw new Error('bad mark');
    const m = mark as Record<string, unknown>;
    if (typeof m.t !== 'string') throw new Error('bad mark t');
    if (!Number.isInteger(m.s) || !Number.isInteger(m.e)) throw new Error('bad mark range');
    if ((m.s as number) < 0 || (m.e as number) <= (m.s as number) || (m.e as number) > length) {
      throw new Error('bad mark bounds');
    }
    if (m.v !== undefined && typeof m.v !== 'string') throw new Error('bad mark v');
  }
}

function parseTableRows(detail: unknown): string[][] {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    throw new Error('bad table');
  }
  const payload = detail as Record<string, unknown>;
  if (payload.v !== 1) throw new Error('bad table version');
  if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 20) {
    throw new Error('bad table rows');
  }
  const rows: string[][] = [];
  let colCount: number | null = null;
  for (const row of payload.rows) {
    if (!Array.isArray(row) || row.length < 1 || row.length > 20) throw new Error('bad table row');
    if (colCount === null) colCount = row.length;
    else if (row.length !== colCount) throw new Error('ragged table');
    const cells: string[] = [];
    for (const cell of row) {
      if (!cell || typeof cell !== 'object' || Array.isArray(cell)) throw new Error('bad cell');
      const c = cell as Record<string, unknown>;
      if (typeof c.t !== 'string') throw new Error('bad cell text');
      if ('m' in c && c.m !== undefined) assertMarksShape(c.m, c.t.length);
      cells.push(c.t);
    }
    rows.push(cells);
  }
  return rows;
}

function decodeV1Line(line: string): NotebookKnowledgeBlock {
  if (line === '---') return { kind: 'divider' };

  const hw = /^::hw::([a-z0-9-]+)::$/.exec(line);
  if (hw) return { kind: 'handwriting' };

  const imgWithWidth = /^::img::([a-z0-9-]+)::(.+)::([0-9]+)::$/.exec(line);
  if (imgWithWidth) {
    const alt: unknown = JSON.parse(imgWithWidth[2]!);
    if (typeof alt !== 'string') throw new Error('bad img alt');
    const width = parseInt(imgWithWidth[3]!, 10);
    if (!Number.isInteger(width) || width < 50 || width > 3000) throw new Error('bad img width');
    return { kind: 'image-ref', alt };
  }
  const image = /^::img::([a-z0-9-]+)::(.*)::$/.exec(line);
  if (image) {
    const alt: unknown = JSON.parse(image[2]!);
    if (typeof alt !== 'string') throw new Error('bad img alt');
    return { kind: 'image-ref', alt };
  }

  if (!line.startsWith('~nb1:')) throw new Error('not v1');
  const row: unknown = JSON.parse(line.slice('~nb1:'.length));
  if (!Array.isArray(row) || (row.length !== 4 && row.length !== 5)) throw new Error('bad row');
  const [kind, text, rawMarks, detail, rawAlign] = row;
  if (typeof kind !== 'string' || !V1_KINDS.has(kind) || typeof text !== 'string') {
    throw new Error('bad kind/text');
  }
  if (kind === 'table') {
    if (row.length !== 4 || text !== '') throw new Error('bad table row');
    assertMarksShape(rawMarks, 0);
    if ((rawMarks as unknown[]).length !== 0) throw new Error('table marks');
    return { kind: 'table', rows: parseTableRows(detail) };
  }
  assertMarksShape(rawMarks, text.length);
  if (row.length === 5) {
    if (rawAlign !== 'left' && rawAlign !== 'center' && rawAlign !== 'right') {
      throw new Error('bad align');
    }
    if (kind !== 'paragraph' && kind !== 'title' && kind !== 'section' && kind !== 'quote') {
      throw new Error('align ineligible');
    }
  }

  switch (kind) {
    case 'paragraph':
      if (detail !== null && detail !== 'muted' && detail !== 'fine') throw new Error('bad variant');
      return { kind: 'paragraph', text };
    case 'bullet':
      if (!Number.isInteger(detail) || (detail as number) < 0 || (detail as number) > 2) {
        throw new Error('bad depth');
      }
      return { kind: 'bullet', text, depth: detail as number };
    case 'ordered':
      if (!Number.isInteger(detail) || (detail as number) < 1) throw new Error('bad number');
      return { kind: 'ordered', text, number: detail as number };
    case 'task':
      if (typeof detail !== 'boolean') throw new Error('bad task');
      return { kind: 'task', text, checked: detail };
    case 'callout':
      if (typeof detail !== 'string' || !TONES.has(detail as NotebookKnowledgeCalloutTone)) {
        throw new Error('bad tone');
      }
      return { kind: 'callout', tone: detail as NotebookKnowledgeCalloutTone, text };
    case 'title':
    case 'section':
    case 'quote':
    case 'step':
    case 'math':
      if (detail !== null) throw new Error('detail');
      return { kind, text } as NotebookKnowledgeBlock;
    default:
      throw new Error('unknown kind');
  }
}

function hasVersionedRecord(body: string): boolean {
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('~nb1:')) return true;
  }
  return false;
}

/**
 * Decode canonical persisted dialect into knowledge blocks.
 * Never mutates input. Never invents TipTap JSON.
 */
export function decodeNotebookDialectForKnowledge(
  body: string,
  codecVersion: number | undefined,
): DecodeNotebookDialectResult {
  if (codecVersion !== undefined && codecVersion !== NOTEBOOK_KNOWLEDGE_CODEC_V1) {
    return { ok: false, code: 'notebook_codec_unsupported' };
  }

  if (codecVersion === undefined && hasVersionedRecord(body)) {
    // Corrupt: ~nb1: without codec — fail closed (matches product parser).
    return { ok: false, code: 'notebook_extract_failed' };
  }

  try {
    if (codecVersion === NOTEBOOK_KNOWLEDGE_CODEC_V1) {
      if (body === '') return { ok: true, blocks: [] };
      const blocks = body.split(/\r?\n/).map((line) => decodeV1Line(line));
      return { ok: true, blocks };
    }

    // Legacy markdown-lite
    if (body.trim().length === 0) return { ok: true, blocks: [] };
    const blocks = body
      .split(/\r?\n/)
      .map((line) => parseLegacyLine(line))
      .filter((b): b is NotebookKnowledgeBlock => b !== null);
    return { ok: true, blocks };
  } catch {
    return { ok: false, code: 'notebook_extract_failed' };
  }
}
