/**
 * Client-facing ZIKUK AI Gateway contracts (M0.2 + M0.5D ask_course).
 * Provider-independent. No secrets, models, or provider SDKs.
 *
 * Wire shape must stay aligned with supabase/functions/_shared/ai/requestTypes.ts.
 */

import type { ZikukAiContext } from '../context/types';

export type ZikukAiCapability = 'explain_selection' | 'ask_course';

export type ZikukAiErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'not_found'
  | 'invalid_request'
  | 'unsupported_capability'
  | 'unsupported_content'
  | 'knowledge_not_found'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'output_budget_exhausted'
  | 'quota_exceeded'
  | 'ai_disabled'
  | 'internal_error';

/**
 * Provider-independent request. Client must NOT include provider/model/apiKey/messages.
 */
export type ZikukAiExplainSelectionRequest = {
  version: 1;
  capability: 'explain_selection';
  context: ZikukAiContext;
};

export type ZikukAiAskCourseRequestV1 = {
  version: 1;
  capability: 'ask_course';
  sectionId: string;
  question: string;
};

export type AskCourseRecentTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type TeachingMode = 'explain' | 'teach_me' | 'just_answer' | 'exam_prep';

/**
 * Open PDF identity. Not a capture and not document text.
 * Must stay aligned with supabase/functions/_shared/ai/requestTypes.ts.
 */
export type ActivePdfDocument = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  pageNumber: number;
};

export type DocumentWindowCursor = {
  sourceObjectId: string;
  resumeFromPage: number;
};

export type DocumentWindowCoverage = {
  sourceObjectId: string;
  fileName: string | null;
  pageCount: number | null;
  fromPage: number;
  toPage: number;
  resumeFromPage: number;
  partial: boolean;
};

export type ZikukAiAskCourseRequestV2 = {
  version: 2;
  capability: 'ask_course';
  sectionId: string;
  question: string;
  recentTurns?: AskCourseRecentTurn[];
  teachingMode?: TeachingMode;
  /** Optional. Ask ZIKUK omits it. Older Tutor clients omit it. */
  activeDocument?: ActivePdfDocument;
  documentCursor?: DocumentWindowCursor;
};

export type PdfCaptureAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  text: string;
};

export type ZikukAiAskCourseRequestV3 = Omit<ZikukAiAskCourseRequestV2, 'version'> & {
  version: 3;
  capture: PdfCaptureAttachment;
};

export type ZikukAiAskCourseRequest =
  | ZikukAiAskCourseRequestV1
  | ZikukAiAskCourseRequestV2
  | ZikukAiAskCourseRequestV3;

export type ZikukAiRequest = ZikukAiExplainSelectionRequest | ZikukAiAskCourseRequest;

export type AskCourseSourceRef =
  | {
      index: number;
      sourceKind: 'free_space_pdf';
      sourceObjectId: string;
      fileName: string | null;
      pageNumber: number;
    }
  | {
      index: number;
      sourceKind: 'notebook_page';
      notebookObjectId: string;
      pageId: string;
      notebookTitle: string | null;
      pageTitle: string | null;
    };

export type KnowledgeTier =
  | 'course_material'
  | 'pdf_selection'
  | 'general_academic'
  | 'mixed';

export type ContextAvailable = {
  hasIndexedChunks: boolean;
  hasPdfCapture: boolean;
};

export type ZikukAiResponse =
  | {
      version: 1;
      ok: true;
      result: { type: 'text'; text: string; generationIncomplete?: boolean };
      meta?: { capability: 'explain_selection'; latencyMs?: number };
    }
  | {
      version: 1;
      ok: true;
      result: {
        type: 'ask_course';
        text: string;
        sources: AskCourseSourceRef[];
        knowledgeTier?: KnowledgeTier;
        contextAvailable?: ContextAvailable;
        /** True when visible text exists and the provider stopped for length. */
        generationIncomplete?: boolean;
        documentWindow?: DocumentWindowCoverage;
      };
      meta?: {
        capability: 'ask_course';
        latencyMs?: number;
        retrievalHitCount?: number;
        knowledgeTier?: KnowledgeTier;
        contextAvailable?: ContextAvailable;
      };
    }
  | {
      version: 1;
      ok: false;
      error: { code: ZikukAiErrorCode; message: string };
    };

export const AI_GATEWAY_FUNCTION_NAME = 'ai-gateway';
