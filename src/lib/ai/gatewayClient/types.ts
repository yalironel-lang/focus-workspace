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

export type ZikukAiAskCourseRequest = {
  version: 1;
  capability: 'ask_course';
  sectionId: string;
  question: string;
};

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

export type ZikukAiResponse =
  | {
      version: 1;
      ok: true;
      result: { type: 'text'; text: string };
      meta?: { capability: 'explain_selection'; latencyMs?: number };
    }
  | {
      version: 1;
      ok: true;
      result: {
        type: 'ask_course';
        text: string;
        sources: AskCourseSourceRef[];
      };
      meta?: {
        capability: 'ask_course';
        latencyMs?: number;
        retrievalHitCount?: number;
      };
    }
  | {
      version: 1;
      ok: false;
      error: { code: ZikukAiErrorCode; message: string };
    };

export const AI_GATEWAY_FUNCTION_NAME = 'ai-gateway';
