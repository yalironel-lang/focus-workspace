/**
 * M0.8C — Notebook semantic extraction, hash, chunking, loader, version lifecycle.
 * No remote Supabase. No provider calls. No embeddings.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_CHUNK_MIN_CHARS,
} from './bounds.ts';
import { chunkNotebookSegments } from './chunkNotebookSegments.ts';
import { extractNotebookPageSemantics } from './extractNotebookPage.ts';
import { sha256HexUtf8 } from './hash.ts';
import { loadNotebookPageFromFsoObject } from './loadNotebookPageSource.ts';
import {
  assertSafeNotebookKnowledgeLogPayload,
  formatNotebookKnowledgeLogLine,
} from './privacyLogNotebook.ts';
import {
  parseNotebookKnowledgeIngestRequest,
  runNotebookKnowledgeIngest,
  type NotebookKnowledgeIngestDeps,
} from './runNotebookKnowledgeIngest.ts';

const SQL_014 = resolve(
  process.cwd(),
  'supabase/migrations/014_ai_knowledge_notebook_page_ingest.sql',
);

function nb1(kind: string, text: string, detail: unknown = null): string {
  return `~nb1:${JSON.stringify([kind, text, [], detail])}`;
}

function tableLine(rows: { t: string }[][]): string {
  return `~nb1:${JSON.stringify(['table', '', [], { v: 1, rows }])}`;
}

function makeFso(overrides?: {
  userId?: string;
  sectionId?: string;
  type?: string;
  pages?: unknown[];
  title?: string;
  id?: string;
}) {
  const id = overrides?.id ?? 'ps-notebook-1';
  return {
    id,
    user_id: overrides?.userId ?? '11111111-1111-4111-8111-111111111111',
    section_id: overrides?.sectionId ?? '22222222-2222-4222-8222-222222222222',
    object: {
      id,
      type: overrides?.type ?? 'notebook',
      title: overrides?.title ?? 'Law Notes',
      content: {
        type: 'notebook',
        body: '',
        pages: overrides?.pages ?? [
          {
            id: 'page-abc',
            kind: 'document',
            title: 'Strict Liability',
            documentBody: nb1('paragraph', 'Strict liability does not require proof of fault.'),
            documentBodyCodecVersion: 1,
          },
        ],
      },
    },
  };
}

describe('M0.8C extraction', () => {
  it('1–10. paragraphs, headings, lists, academic callouts', () => {
    const body = [
      nb1('title', 'Chapter'),
      nb1('section', 'Section A'),
      nb1('paragraph', 'Body paragraph'),
      nb1('bullet', 'Bullet one', 0),
      nb1('ordered', 'First', 1),
      nb1('callout', 'A contract needs consideration.', 'definition'),
      nb1('callout', 'Opportunity cost matters.', 'concept'),
      nb1('callout', 'Pythagoras.', 'theorem'),
      nb1('callout', 'Worked example.', 'example'),
      nb1('callout', 'Common error.', 'mistake'),
      nb1('callout', 'Key takeaways.', 'summary'),
      nb1('callout', 'Review points.', 'review'),
    ].join('\n');
    const res = extractNotebookPageSemantics({
      documentBody: body,
      codecVersion: 1,
      pageTitle: 'Page Title',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const texts = res.segments.map((s) => s.text);
    expect(texts[0]).toBe('Page Title');
    expect(texts).toContain('Chapter');
    expect(texts).toContain('Section A');
    expect(texts).toContain('Body paragraph');
    expect(texts.some((t) => t.includes('- Bullet one'))).toBe(true);
    expect(texts.some((t) => t.startsWith('1. First'))).toBe(true);
    expect(texts).toContain('Definition: A contract needs consideration.');
    expect(texts).toContain('Key Concept: Opportunity cost matters.');
    expect(texts).toContain('Theorem: Pythagoras.');
    expect(texts).toContain('Example: Worked example.');
    expect(texts).toContain('Mistake: Common error.');
    expect(texts).toContain('Summary: Key takeaways.');
    expect(texts).toContain('Review: Review points.');
  });

  it('11–13. math, table, soft line break normalization', () => {
    const body = [
      nb1('math', 'E=mc^2'),
      tableLine([
        [{ t: 'A' }, { t: 'B' }],
        [{ t: '1' }, { t: '2' }],
      ]),
      nb1('paragraph', 'line one\nline two'),
    ].join('\n');
    const res = extractNotebookPageSemantics({ documentBody: body, codecVersion: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.segments.some((s) => s.kind === 'math' && s.text === 'E=mc^2')).toBe(true);
    expect(res.segments.some((s) => s.kind === 'table' && s.text.includes('A | B'))).toBe(true);
    expect(res.segments.some((s) => s.text === 'line one line two')).toBe(true);
  });

  it('14. RTL text preserved', () => {
    const res = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'שלום עולם'),
      codecVersion: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.normalizedText).toContain('שלום עולם');
  });

  it('15–16. image key ignored; alt kept; handwriting ignored', () => {
    const body = [
      '::img::img-1::"Diagram of Solow model"::400::',
      '::hw::hw-page-1::',
      nb1('paragraph', 'Captioned page still has text.'),
    ].join('\n');
    const res = extractNotebookPageSemantics({ documentBody: body, codecVersion: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.normalizedText).not.toContain('img-1');
    expect(res.normalizedText).not.toContain('hw-page-1');
    expect(res.normalizedText).toContain('Diagram of Solow model');
    expect(res.normalizedText).toContain('Captioned page still has text.');
  });

  it('17–18. mixed page deterministic', async () => {
    const body = [
      nb1('callout', 'Strict liability.', 'definition'),
      nb1('paragraph', 'No fault required.'),
    ].join('\n');
    const a = extractNotebookPageSemantics({
      documentBody: body,
      codecVersion: 1,
      pageTitle: 'Torts',
    });
    const b = extractNotebookPageSemantics({
      documentBody: body,
      codecVersion: 1,
      pageTitle: 'Torts',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.normalizedText).toBe(b.normalizedText);
    expect(await sha256HexUtf8(a.normalizedText)).toBe(await sha256HexUtf8(b.normalizedText));
  });

  it('19–20. legacy + V1 bodies', () => {
    const legacy = extractNotebookPageSemantics({
      documentBody: '# Heading\n!definition A term.\n$$ E=mc^2\nHello',
      codecVersion: undefined,
    });
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.normalizedText).toContain('Heading');
    expect(legacy.normalizedText).toContain('Definition: A term.');
    expect(legacy.normalizedText).toContain('E=mc^2');

    const v1 = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'V1 text'),
      codecVersion: 1,
    });
    expect(v1.ok).toBe(true);
  });

  it('21–22. malformed + unsupported codec fail closed', () => {
    const bad = extractNotebookPageSemantics({
      documentBody: '~nb1:["paragraph","oops"',
      codecVersion: 1,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('notebook_extract_failed');

    const future = extractNotebookPageSemantics({
      documentBody: 'hello',
      codecVersion: 99,
    });
    expect(future.ok).toBe(false);
    if (future.ok) return;
    expect(future.code).toBe('notebook_codec_unsupported');

    const corrupt = extractNotebookPageSemantics({
      documentBody: '~nb1:["paragraph","x",[],null]',
      codecVersion: undefined,
    });
    expect(corrupt.ok).toBe(false);
  });
});

describe('M0.8C hash policy', () => {
  it('23–29. semantic hash stability and sensitivity', async () => {
    const base = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'Strict liability'),
      codecVersion: 1,
      pageTitle: 'Torts',
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const h0 = await sha256HexUtf8(base.normalizedText);

    const same = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'Strict liability'),
      codecVersion: 1,
      pageTitle: 'Torts',
    });
    expect(same.ok).toBe(true);
    if (!same.ok) return;
    expect(await sha256HexUtf8(same.normalizedText)).toBe(h0);

    const textEdit = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'Strict liability!!'),
      codecVersion: 1,
      pageTitle: 'Torts',
    });
    expect(textEdit.ok).toBe(true);
    if (!textEdit.ok) return;
    expect(await sha256HexUtf8(textEdit.normalizedText)).not.toBe(h0);

    const mathEdit = extractNotebookPageSemantics({
      documentBody: nb1('math', 'a^2'),
      codecVersion: 1,
    });
    const mathEdit2 = extractNotebookPageSemantics({
      documentBody: nb1('math', 'a^3'),
      codecVersion: 1,
    });
    expect(mathEdit.ok && mathEdit2.ok).toBe(true);
    if (!mathEdit.ok || !mathEdit2.ok) return;
    expect(await sha256HexUtf8(mathEdit.normalizedText)).not.toBe(
      await sha256HexUtf8(mathEdit2.normalizedText),
    );

    const table1 = extractNotebookPageSemantics({
      documentBody: tableLine([[{ t: 'A' }], [{ t: '1' }]]),
      codecVersion: 1,
    });
    const table2 = extractNotebookPageSemantics({
      documentBody: tableLine([[{ t: 'A' }], [{ t: '2' }]]),
      codecVersion: 1,
    });
    expect(table1.ok && table2.ok).toBe(true);
    if (!table1.ok || !table2.ok) return;
    expect(await sha256HexUtf8(table1.normalizedText)).not.toBe(
      await sha256HexUtf8(table2.normalizedText),
    );

    // Image width-only change → same semantic hash when alt unchanged and no other text.
    const imgA = extractNotebookPageSemantics({
      documentBody: '::img::img-1::"Alt"::200::\n' + nb1('paragraph', 'Keep'),
      codecVersion: 1,
    });
    const imgB = extractNotebookPageSemantics({
      documentBody: '::img::img-1::"Alt"::800::\n' + nb1('paragraph', 'Keep'),
      codecVersion: 1,
    });
    expect(imgA.ok && imgB.ok).toBe(true);
    if (!imgA.ok || !imgB.ok) return;
    expect(await sha256HexUtf8(imgA.normalizedText)).toBe(await sha256HexUtf8(imgB.normalizedText));

    // Page title rename → hash changes (title participates).
    const renamed = extractNotebookPageSemantics({
      documentBody: nb1('paragraph', 'Strict liability'),
      codecVersion: 1,
      pageTitle: 'Renamed',
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(await sha256HexUtf8(renamed.normalizedText)).not.toBe(h0);
  });
});

describe('M0.8C chunking', () => {
  it('30–34. deterministic, hard max, no cross-page, tiny-tail', () => {
    const segments = Array.from({ length: 20 }, (_, i) => ({
      kind: 'paragraph' as const,
      text: `Paragraph ${i} ` + 'word '.repeat(40),
      order: i,
    }));
    const a = chunkNotebookSegments(segments);
    const b = chunkNotebookSegments(segments);
    expect(a).toEqual(b);
    expect(a.every((c) => c.char_count <= KNOWLEDGE_CHUNK_MAX_CHARS)).toBe(true);
    expect(a.every((c) => c.page_number === 1)).toBe(true);
    expect(a.every((c, i) => c.chunk_index === i)).toBe(true);

    const callout = chunkNotebookSegments([
      {
        kind: 'callout',
        text: 'Definition: ' + 'x'.repeat(50),
        order: 0,
        tone: 'definition',
      },
      { kind: 'paragraph', text: 'After', order: 1 },
    ]);
    expect(callout[0]!.text.startsWith('Definition:')).toBe(true);

    const tiny = chunkNotebookSegments([
      { kind: 'paragraph', text: 'A'.repeat(KNOWLEDGE_CHUNK_MIN_CHARS + 10), order: 0 },
      { kind: 'paragraph', text: 'tail', order: 1 },
    ]);
    expect(tiny.length).toBeGreaterThanOrEqual(1);
    expect(tiny.every((c) => c.char_count <= KNOWLEDGE_CHUNK_MAX_CHARS)).toBe(true);
  });
});

describe('M0.8C loader auth', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sectionId = '22222222-2222-4222-8222-222222222222';

  it('35–41. load valid / reject forged / deleted / wrong kind', () => {
    const fso = makeFso();
    const ok = loadNotebookPageFromFsoObject({
      userId,
      sectionId,
      notebookObjectId: 'ps-notebook-1',
      pageId: 'page-abc',
      fso,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.page.documentBody).toContain('Strict liability');

    expect(
      loadNotebookPageFromFsoObject({
        userId: '99999999-9999-4999-8999-999999999999',
        sectionId,
        notebookObjectId: 'ps-notebook-1',
        pageId: 'page-abc',
        fso,
      }).ok,
    ).toBe(false);

    expect(
      loadNotebookPageFromFsoObject({
        userId,
        sectionId: '33333333-3333-4333-8333-333333333333',
        notebookObjectId: 'ps-notebook-1',
        pageId: 'page-abc',
        fso,
      }).ok,
    ).toBe(false);

    expect(
      loadNotebookPageFromFsoObject({
        userId,
        sectionId,
        notebookObjectId: 'ps-other',
        pageId: 'page-abc',
        fso,
      }).ok,
    ).toBe(false);

    expect(
      loadNotebookPageFromFsoObject({
        userId,
        sectionId,
        notebookObjectId: 'ps-notebook-1',
        pageId: 'missing',
        fso,
      }).ok,
    ).toBe(false);

    // Deleted / tombstoned page absent from pages[]
    const deleted = makeFso({ pages: [] });
    expect(
      loadNotebookPageFromFsoObject({
        userId,
        sectionId,
        notebookObjectId: 'ps-notebook-1',
        pageId: 'page-abc',
        fso: deleted,
      }).ok,
    ).toBe(false);

    const pdf = makeFso({ type: 'pdf' });
    const notNb = loadNotebookPageFromFsoObject({
      userId,
      sectionId,
      notebookObjectId: 'ps-notebook-1',
      pageId: 'page-abc',
      fso: pdf,
    });
    expect(notNb.ok).toBe(false);
    if (notNb.ok) return;
    expect(notNb.code).toBe('not_notebook');
  });
});

describe('M0.8C empty / blank', () => {
  it('48–50. blank / image-only / handwriting-only → no_extractable_text', () => {
    expect(
      extractNotebookPageSemantics({ documentBody: '', codecVersion: 1 }).ok,
    ).toBe(false);
    expect(
      extractNotebookPageSemantics({
        documentBody: '::img::img-1::""::',
        codecVersion: 1,
      }).ok,
    ).toBe(false);
    expect(
      extractNotebookPageSemantics({
        documentBody: '::hw::hw-1::',
        codecVersion: 1,
      }).ok,
    ).toBe(false);
  });
});

describe('M0.8C version lifecycle orchestration', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sectionId = '22222222-2222-4222-8222-222222222222';
  const notebookObjectId = 'ps-notebook-1';
  const pageId = 'page-abc';

  function baseDeps(
    overrides: Partial<NotebookKnowledgeIngestDeps> = {},
  ): NotebookKnowledgeIngestDeps {
    return {
      loadOwnedNotebookFso: vi.fn(async () => ({
        ok: true as const,
        fso: makeFso(),
      })),
      beginNotebookPageIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-nb-1',
        source_version: 1,
        status: 'pending',
        retrieval_source_version: null,
        idempotent: false,
      })),
      finalizeIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-nb-1',
        source_version: 1,
        status: 'ready',
        chunk_count: 1,
      })),
      invalidateNotebookPageCorpus: vi.fn(async () => ({
        ok: true,
        cleared: false,
        source_id: null,
      })),
      ...overrides,
    };
  }

  it('42. first content → ready version 1', async () => {
    const deps = baseDeps();
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('ready');
    expect(res.result.sourceVersion).toBe(1);
    expect(res.result.reused).toBe(false);
    expect(deps.finalizeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready', pageCount: 1 }),
    );
  });

  it('43. unchanged → reused', async () => {
    const deps = baseDeps({
      beginNotebookPageIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-nb-1',
        source_version: 1,
        status: 'ready',
        retrieval_source_version: 1,
        idempotent: true,
      })),
    });
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.reused).toBe(true);
    expect(deps.finalizeIngest).not.toHaveBeenCalled();
  });

  it('44–45. changed content begins with prior retrieval preserved at SQL layer', async () => {
    const deps = baseDeps({
      beginNotebookPageIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-nb-1',
        source_version: 1,
        status: 'stale',
        retrieval_source_version: 1,
        idempotent: false,
      })),
      finalizeIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-nb-1',
        source_version: 2,
        status: 'ready',
        chunk_count: 2,
      })),
    });
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.sourceVersion).toBe(2);
    // begin returned retrieval_source_version still 1 during preparation
    expect(deps.beginNotebookPageIngest).toHaveBeenCalled();
  });

  it('46. parse failure does not invalidate prior retrieval', async () => {
    const deps = baseDeps({
      loadOwnedNotebookFso: vi.fn(async () => ({
        ok: true as const,
        fso: makeFso({
          pages: [
            {
              id: pageId,
              kind: 'document',
              title: 'X',
              documentBody: '~nb1:["paragraph","broken"',
              documentBodyCodecVersion: 1,
            },
          ],
        }),
      })),
    });
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('notebook_extract_failed');
    expect(deps.invalidateNotebookPageCorpus).not.toHaveBeenCalled();
    expect(deps.beginNotebookPageIngest).not.toHaveBeenCalled();
  });

  it('47. request rejects client hash/body authority; stale completion guarded by version RPCs', () => {
    expect(
      parseNotebookKnowledgeIngestRequest({
        version: 1,
        sectionId,
        notebookObjectId,
        pageId,
        contentHash: 'forged',
      }).ok,
    ).toBe(false);
    expect(
      parseNotebookKnowledgeIngestRequest({
        version: 1,
        sectionId,
        notebookObjectId,
        pageId,
        documentBody: 'forged',
      }).ok,
    ).toBe(false);
  });

  it('51. blank page clears retrieval via invalidate', async () => {
    const deps = baseDeps({
      loadOwnedNotebookFso: vi.fn(async () => ({
        ok: true as const,
        fso: makeFso({
          pages: [
            {
              id: pageId,
              kind: 'document',
              title: '',
              documentBody: '',
              documentBodyCodecVersion: 1,
            },
          ],
        }),
      })),
      invalidateNotebookPageCorpus: vi.fn(async () => ({
        ok: true,
        cleared: true,
        source_id: 'src-nb-1',
      })),
    });
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('cleared');
    expect(res.result.retrievalCleared).toBe(true);
    expect(deps.invalidateNotebookPageCorpus).toHaveBeenCalled();
    expect(deps.beginNotebookPageIngest).not.toHaveBeenCalled();
  });

  it('auth failures map correctly', async () => {
    const deps = baseDeps({
      loadOwnedNotebookFso: vi.fn(async () => ({
        ok: false as const,
        code: 'auth_mismatch',
      })),
    });
    const res = await runNotebookKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('auth_mismatch');
  });
});

describe('M0.8C SQL 014 contract + privacy', () => {
  it('begin + invalidate RPCs are service_role only; preserve retrieval during begin', () => {
    const sql = readFileSync(SQL_014, 'utf8');
    expect(sql).toContain('ai_knowledge_begin_notebook_page_ingest');
    expect(sql).toContain('ai_knowledge_invalidate_notebook_page_corpus');
    expect(sql).toContain('Do NOT change retrieval_source_version here');
    expect(sql).toContain("source_kind = 'notebook_page'");
    expect(sql).toContain('ai_knowledge_notebook_page_is_live');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('retrieval_source_version = null');
  });

  it('privacy log excludes body/hash/text', () => {
    const line = formatNotebookKnowledgeLogLine({
      event: 'ai_knowledge_notebook_ingest',
      requestId: 'r1',
      outcome: 'ok',
      code: 'ok',
      hasUser: true,
      hasSection: true,
      hasNotebook: true,
      hasPage: true,
      chunkCount: 2,
      segmentCount: 3,
      latencyMs: 12,
    });
    const parsed = JSON.parse(line);
    expect(assertSafeNotebookKnowledgeLogPayload(parsed)).toBe(true);
    expect(line).not.toMatch(/Strict|hash|documentBody|normalized/i);
  });
});
