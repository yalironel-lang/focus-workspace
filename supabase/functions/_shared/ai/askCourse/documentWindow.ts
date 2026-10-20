import { ASK_COURSE_MAX_RETRIEVED_CHARS } from './bounds.ts';

export const DOCUMENT_WINDOW_PAGE_SPAN = 6;
export const DOCUMENT_WINDOW_FETCH_LIMIT = 24;
export const VISIBLE_PAGE_SUFFICIENT_CHARS = 800;

export type ActiveDocumentRoute = 'current_page' | 'document_walk' | 'continue' | 'topical';

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
 * window cursor. A deictic PDF request starts at page 1. A page request stays
 * on the visible page.
 */
const VISIBLE_PAGE_PATTERN =
  /\b(?:on this page|this page|current page|this pdf page|the open page|(?:currently\s+)?visible(?:\s+pdf)?\s+page|the page (?:i'm|i am) (?:looking at|viewing)|the page on my screen)\b/;

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
  if (
    /\b(this pdf|this document|this problem set|question by question|entire pdf|entire document|whole pdf|whole document)\b/.test(q) ||
    /\bsummarize this (?:pdf|document|problem set)\b/.test(q)
  ) {
    return 'document_walk';
  }
  return 'topical';
}

export function documentWindowRange(input: {
  route: ActiveDocumentRoute;
  visiblePage: number;
  cursor?: DocumentWindowCursor | null;
  sourceObjectId: string;
}): { pageFrom: number; pageTo: number } {
  if (input.route === 'current_page') {
    return { pageFrom: input.visiblePage, pageTo: input.visiblePage + 1 };
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
