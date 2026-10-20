/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyActiveDocumentQuestion,
  documentWindowRange,
  fitDocumentWindow,
  namedDocumentPage,
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

  it('routes an open PDF question to that document, and a named page to that page', () => {
    expect(classifyActiveDocumentQuestion('According to the PDF, what is the cyclical part of real GDP?')).toBe(
      'pdf_source',
    );
    expect(classifyActiveDocumentQuestion('According to this PDF, what is the cyclical part of real GDP?')).toBe(
      'pdf_source',
    );
    expect(classifyActiveDocumentQuestion('Summarize this PDF')).toBe('document_walk');
    expect(
      documentWindowRange({
        route: 'document_walk',
        visiblePage: 6,
        sourceObjectId: 'pdf-1',
      }),
    ).toEqual({ pageFrom: 1, pageTo: 6 });
    expect(
      documentWindowRange({
        route: 'pdf_source',
        visiblePage: 6,
        sourceObjectId: 'pdf-1',
      }),
    ).toEqual({ pageFrom: 6, pageTo: 6 });

    expect(classifyActiveDocumentQuestion('On this page, what is the cyclical part of real GDP?')).toBe('current_page');
    expect(classifyActiveDocumentQuestion('According to page 2, what is the cyclical part of real GDP?')).toBe(
      'named_page',
    );
    expect(namedDocumentPage('According to page 2 of the PDF')).toBe(2);
    expect(
      documentWindowRange({
        route: 'named_page',
        visiblePage: 6,
        namedPage: 2,
        sourceObjectId: 'pdf-1',
      }),
    ).toEqual({ pageFrom: 2, pageTo: 2 });
    expect(classifyActiveDocumentQuestion('What is monetary policy according to the lecture?')).toBe('topical');
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

  it('keeps a short page 2 inside the prompt budget', () => {
    const fitted = fitDocumentWindow(
      [
        chunk(1, 0, 'p'.repeat(223)),
        chunk(2, 0, 'p'.repeat(914)),
        chunk(3, 0, 'p'.repeat(832)),
        chunk(3, 1, 'p'.repeat(1108)),
        chunk(4, 0, 'p'.repeat(826)),
        chunk(4, 1, 'p'.repeat(1161)),
        chunk(5, 0, 'p'.repeat(897)),
      ],
      ASK_COURSE_MAX_RETRIEVED_CHARS,
    );
    const pageTwo = fitted.chunks.find((item) => item.pageNumber === 2);
    expect(pageTwo?.text.length).toBe(914);
    expect(fitted.chars).toBeLessThanOrEqual(ASK_COURSE_MAX_RETRIEVED_CHARS);
    expect(fitted.chunks.some((item) => item.pageNumber === 5)).toBe(false);
  });

  it('drops the following page when the visible page already has enough text', () => {
    const scoped = scopeCurrentPageChunks(
      [chunk(4, 0, 'x'.repeat(900)), chunk(5, 0, 'later question')],
      4,
    );
    expect(scoped.map((item) => item.pageNumber)).toEqual([4]);
  });
});

describe('pdf source search SQL contract', () => {
  const sql = readFileSync(
    new URL('../../../../migrations/021_ai_knowledge_pdf_source_search.sql', import.meta.url),
    'utf8',
  );
  const body = sql.replace(/--[^\n]*/g, '');

  it('restricts ranking to one owned PDF version and does not replace section search', () => {
    const sourceAt = body.toLowerCase().indexOf('s.source_object_id = v_object_id');
    const orderAt = body.toLowerCase().indexOf('order by e.embedding');
    const limitAt = body.toLowerCase().indexOf('limit v_limit');
    expect(sourceAt).toBeGreaterThan(0);
    expect(orderAt).toBeGreaterThan(sourceAt);
    expect(limitAt).toBeGreaterThan(orderAt);
    expect(body).toContain('s.user_id = p_user_id');
    expect(body).toContain('s.section_id = p_section_id');
    expect(body).toContain('c.user_id = p_user_id');
    expect(body).toContain('c.section_id = p_section_id');
    expect(body).toContain('e.user_id = p_user_id');
    expect(body).toContain('e.section_id = p_section_id');
    expect(body).toContain("s.source_kind = 'free_space_pdf'");
    expect(body).toContain('vi.source_version = s.retrieval_source_version');
    expect(body).toContain('c.source_version = s.retrieval_source_version');
    expect(body).toContain('e.source_version = s.retrieval_source_version');
    expect(body).toContain("vi.status = 'indexed'");
    expect(body).toContain('s.page_count');
    expect(body).toContain('least(greatest(coalesce(p_limit, 8), 1), 12)');
    expect(body.toLowerCase()).not.toMatch(/\b(insert|update|delete|truncate)\b/);
    expect(body).not.toContain('notebook_page');
    expect(sql).not.toMatch(/drop\s+function[\s\S]*ai_knowledge_search\s*\(/i);
    expect(sql).not.toMatch(/drop\s+function[\s\S]*ai_knowledge_document_window/i);
    expect(sql).toContain('from public');
    expect(sql).toContain('from anon');
    expect(sql).toContain('from authenticated');
    expect(sql).toContain('to service_role');
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
