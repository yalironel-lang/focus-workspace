/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyActiveDocumentQuestion,
  documentWindowRange,
  fitDocumentWindow,
  scopeCurrentPageChunks,
  type DocumentWindowChunk,
} from './documentWindow.ts';
import { ASK_COURSE_MAX_RETRIEVED_CHARS } from './bounds.ts';

function chunk(page: number, index: number, text: string): DocumentWindowChunk {
  return {
    sourceObjectId: 'pdf-1',
    fileName: 'Problem Set 4 Solutions.pdf',
    pageCount: 30,
    pageNumber: page,
    chunkIndex: index,
    text,
  };
}

describe('active PDF question routing', () => {
  it('starts a document walk at page 1 even when another page is visible', () => {
    expect(classifyActiveDocumentQuestion('Teach me this PDF question by question')).toBe('document_walk');
    expect(
      documentWindowRange({
        route: 'document_walk',
        visiblePage: 12,
        sourceObjectId: 'pdf-1',
        cursor: { sourceObjectId: 'pdf-1', resumeFromPage: 9 },
      }),
    ).toEqual({ pageFrom: 1, pageTo: 6 });
  });

  it('keeps a current-page question on the visible page', () => {
    expect(classifyActiveDocumentQuestion('Explain question 2 on this page')).toBe('current_page');
    expect(
      classifyActiveDocumentQuestion(
        'Explain the first question on my currently visible PDF page. Tell me which page you are using.',
      ),
    ).toBe('current_page');
    for (const question of [
      'Explain the currently visible page',
      'What is on the visible page?',
      "Teach the page I'm looking at",
      'Explain the page I am viewing',
      'Explain the page on my screen',
      'Explain this PDF page',
      'Explain the open page',
    ]) {
      expect(classifyActiveDocumentQuestion(question)).toBe('current_page');
    }
    expect(
      documentWindowRange({
        route: 'current_page',
        visiblePage: 8,
        sourceObjectId: 'pdf-1',
      }),
    ).toEqual({ pageFrom: 8, pageTo: 9 });
  });

  it('continues from the window cursor and ignores a different document', () => {
    expect(classifyActiveDocumentQuestion('Next question')).toBe('continue');
    expect(
      documentWindowRange({
        route: 'continue',
        visiblePage: 1,
        sourceObjectId: 'pdf-1',
        cursor: { sourceObjectId: 'pdf-1', resumeFromPage: 4 },
      }),
    ).toEqual({ pageFrom: 4, pageTo: 9 });
    expect(
      documentWindowRange({
        route: 'continue',
        visiblePage: 1,
        sourceObjectId: 'pdf-1',
        cursor: { sourceObjectId: 'pdf-other', resumeFromPage: 4 },
      }),
    ).toEqual({ pageFrom: 1, pageTo: 6 });
  });

  it('leaves a general course question on section retrieval', () => {
    expect(classifyActiveDocumentQuestion('What is monetary policy?')).toBe('topical');
    expect(classifyActiveDocumentQuestion('What is the current inflation rate?')).toBe('topical');
    expect(classifyActiveDocumentQuestion('Is supply visible in this model?')).toBe('topical');
    expect(classifyActiveDocumentQuestion('How many pages does the syllabus mention?')).toBe('topical');
  });
});

describe('document window budget', () => {
  it('repeats a page that was cut instead of skipping to the next citation', () => {
    const fitted = fitDocumentWindow(
      [
        chunk(1, 0, 'Q1 '.padEnd(2000, 'a')),
        chunk(2, 0, 'Q2 start '.padEnd(2000, 'b')),
        chunk(2, 1, 'Q2 rest '.padEnd(2000, 'c')),
        chunk(3, 0, 'Q3 '.padEnd(2000, 'd')),
      ],
      ASK_COURSE_MAX_RETRIEVED_CHARS,
    );
    expect(fitted.chars).toBeLessThanOrEqual(ASK_COURSE_MAX_RETRIEVED_CHARS);
    expect(fitted.toPage).toBe(2);
    expect(fitted.resumeFromPage).toBe(2);
    expect(fitted.partial).toBe(true);
    expect(fitted.chunks.map((item) => item.pageNumber)).toEqual([1, 2]);
  });

  it('advances one page after a complete page instead of jumping to the end of the span', () => {
    const fitted = fitDocumentWindow([
      chunk(1, 0, 'complete page'),
      chunk(2, 0, 'next'),
      chunk(3, 0, 'later'),
    ]);
    expect(fitted.partial).toBe(false);
    expect(fitted.toPage).toBe(3);
    expect(fitted.resumeFromPage).toBe(2);
  });

  it('drops the following page when the visible page already has enough text', () => {
    const scoped = scopeCurrentPageChunks(
      [chunk(4, 0, 'x'.repeat(900)), chunk(5, 0, 'later question')],
      4,
    );
    expect(scoped.map((item) => item.pageNumber)).toEqual([4]);
  });
});

describe('document window SQL contract', () => {
  const sql = readFileSync(
    new URL('../../../../migrations/020_ai_knowledge_document_window.sql', import.meta.url),
    'utf8',
  );

  it('scopes the window to the owner, section, and indexed PDF without changing knowledge rows', () => {
    expect(sql).toContain('s.user_id = p_user_id');
    expect(sql).toContain('s.section_id = p_section_id');
    expect(sql).toContain('c.user_id = p_user_id');
    expect(sql).toContain('c.section_id = p_section_id');
    expect(sql).toContain("s.source_kind = 'free_space_pdf'");
    expect(sql).toContain("s.status = 'ready'");
    expect(sql).toContain("vi.status = 'indexed'");
    expect(sql).toContain('order by c.page_number asc, c.chunk_index asc');
    expect(sql).toContain('least(greatest(coalesce(p_limit, 8), 1), 24)');
    const body = sql.replace(/--[^\n]*/g, '');
    expect(body.toLowerCase()).not.toMatch(/\b(insert|update|delete|truncate)\b/);
    expect(body).not.toContain('ai_knowledge_search');
    expect(sql).toContain('grant execute');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('from authenticated');
  });
});
