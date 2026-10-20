import { ASK_COURSE_MAX_RETRIEVED_CHARS } from './bounds.ts';

export const DOCUMENT_WINDOW_PAGE_SPAN = 6;
export const DOCUMENT_WINDOW_FETCH_LIMIT = 24;
export const VISIBLE_PAGE_SUFFICIENT_CHARS = 800;

export type ActiveDocumentRoute =
  | 'current_page'
  | 'named_page'
  | 'document_walk'
  | 'continue'
  | 'pdf_source'
  | 'topical';

export type DocumentWindowChunk = {
  sourceObjectId: string;
  fileName: string | null;
  pageCount: number | null;
  pageNumber: number;
  chunkIndex: number;
  text: string;
};

export type DocumentWindowCursor = {
  sourceObjectId: string;
  resumeFromPage: number;
};

export type FittedDocumentWindow = {
  chunks: DocumentWindowChunk[];
  fromPage: number | null;
  toPage: number | null;
  resumeFromPage: number | null;
  /** True when the last included page was cut and must be read again. */
  partial: boolean;
  chars: number;
};

/**
 * "Next question" is not the last citation. Continuation uses only an explicit
 * window cursor. "On this page" stays on the visible page. "According to page N"
 * uses N. A summary or question-by-question reading walks from page 1.
 * A topical question about the open PDF is searched across that file.
 */
const VISIBLE_PAGE_PATTERN =
  /\b(?:on this page|this page|current page|this pdf page|the open page|(?:currently\s+)?visible(?:\s+pdf)?\s+page|the page (?:i'm|i am) (?:looking at|viewing)|the page on my screen)\b/;

const NAMED_PAGE_PATTERN =
  /\b(?:according to|based on|on|from|in)\s+page\s+(\d{1,4})\b|\bpage\s+(\d{1,4})\s+of\s+(?:the\s+|this\s+)?(?:pdf|document|problem set|file)\b/i;

const DOCUMENT_WALK_PATTERN =
  /\bquestion by question\b|\b(?:summarize|summary of)\s+(?:this|the)\s+(?:pdf|document|problem set)\b|\b(?:entire|whole)\s+(?:pdf|document|problem set|file)\b|\bteach me this (?:pdf|document|problem set)\b/;

/** A subject question that names the open PDF, not an ordered reading of it. */
const PDF_SOURCE_PATTERN =
  /\b(?:according to|based on|based only on|based strictly on)\s+(?:the\s+|this\s+)?(?:pdf|document|problem set|file)\b/;

/** Explicit page named in the question, when an active PDF is open. */
export function namedDocumentPage(question: string): number | null {
  const match = question.match(NAMED_PAGE_PATTERN);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return null;
  return page;
}

export function classifyActiveDocumentQuestion(question: string): ActiveDocumentRoute {
  const q = question.trim().toLowerCase();
  if (!q) return 'topical';
  if (VISIBLE_PAGE_PATTERN.test(q)) return 'current_page';
  if (
    /^(?:please\s+)?(?:next(?:\s+question|\s+problem|\s+exercise)?|continue|go on|the next one)\b/.test(q) ||
    /\bnext question\b/.test(q)
  ) {
    return 'continue';
  }
  if (namedDocumentPage(q) !== null) return 'named_page';
  if (DOCUMENT_WALK_PATTERN.test(q)) return 'document_walk';
  if (PDF_SOURCE_PATTERN.test(q)) return 'pdf_source';
  return 'topical';
}

export function documentWindowRange(input: {
  route: ActiveDocumentRoute;
  visiblePage: number;
  namedPage?: number | null;
  cursor?: DocumentWindowCursor | null;
  sourceObjectId: string;
}): { pageFrom: number; pageTo: number } {
  if (input.route === 'named_page') {
    const page = input.namedPage && input.namedPage >= 1 ? input.namedPage : input.visiblePage;
    return { pageFrom: page, pageTo: page };
  }
  if (input.route === 'current_page') {
    return { pageFrom: input.visiblePage, pageTo: input.visiblePage + 1 };
  }
  if (input.route !== 'continue' && input.route !== 'document_walk') {
    return { pageFrom: input.visiblePage, pageTo: input.visiblePage };
  }
  const start =
    input.route === 'continue' &&
    input.cursor &&
    input.cursor.sourceObjectId === input.sourceObjectId &&
    input.cursor.resumeFromPage >= 1
      ? input.cursor.resumeFromPage
      : 1;
  return { pageFrom: start, pageTo: start + DOCUMENT_WINDOW_PAGE_SPAN - 1 };
}

/** Keep the visible page alone when it already has enough text. */
export function scopeCurrentPageChunks(
  chunks: DocumentWindowChunk[],
  visiblePage: number,
): DocumentWindowChunk[] {
  const onPage = chunks.filter((chunk) => chunk.pageNumber === visiblePage);
  const chars = onPage.reduce((sum, chunk) => sum + chunk.text.length, 0);
  if (chars >= VISIBLE_PAGE_SUFFICIENT_CHARS) return onPage;
  return chunks.filter(
    (chunk) => chunk.pageNumber === visiblePage || chunk.pageNumber === visiblePage + 1,
  );
}

/**
 * Page order, character budget. If a later chunk on the same page does not fit,
 * the next read starts again on that page so a question is not skipped.
 */
export function fitDocumentWindow(
  chunks: DocumentWindowChunk[],
  budget: number = ASK_COURSE_MAX_RETRIEVED_CHARS,
  fetchedHitLimit = false,
): FittedDocumentWindow {
  const ordered = [...chunks].sort((a, b) => a.pageNumber - b.pageNumber || a.chunkIndex - b.chunkIndex);
  const kept: DocumentWindowChunk[] = [];
  let chars = 0;

  for (const chunk of ordered) {
    const nextChars = chars + chunk.text.length;
    if (nextChars > budget) {
      if (kept.length === 0) {
        kept.push({ ...chunk, text: chunk.text.slice(0, budget) });
        return {
          chunks: kept,
          fromPage: chunk.pageNumber,
          toPage: chunk.pageNumber,
          resumeFromPage: chunk.pageNumber,
          partial: true,
          chars: Math.min(budget, chunk.text.length),
        };
      }
      const lastPage = kept[kept.length - 1]!.pageNumber;
      const fromPage = kept[0]!.pageNumber;
      const samePage = chunk.pageNumber === lastPage;
      return {
        chunks: kept,
        fromPage,
        toPage: lastPage,
        // Advance one page. A later page in this span is reread, not skipped.
        resumeFromPage: samePage && fromPage === lastPage ? lastPage : fromPage + 1,
        partial: samePage,
        chars,
      };
    }
    kept.push(chunk);
    chars = nextChars;
  }

  if (kept.length === 0) {
    return {
      chunks: [],
      fromPage: null,
      toPage: null,
      resumeFromPage: null,
      partial: false,
      chars: 0,
    };
  }

  const fromPage = kept[0]!.pageNumber;
  const lastPage = kept[kept.length - 1]!.pageNumber;
  const capped = fetchedHitLimit && ordered.length >= DOCUMENT_WINDOW_FETCH_LIMIT;
  return {
    chunks: kept,
    fromPage,
    toPage: lastPage,
    resumeFromPage: capped && fromPage === lastPage ? lastPage : fromPage + 1,
    partial: capped && fromPage === lastPage,
    chars,
  };
}
