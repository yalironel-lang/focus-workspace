/**
 * Server-side ZIKUK AI Gateway wire types (M0.2 + M0.5D ask_course).
 * Must stay aligned with src/lib/ai/gatewayClient/types.ts (client contract).
 * No provider SDKs, no TipTap, no secrets.
 */

/** Release 1 + M0.5D. */
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

/** Structural mirror of M0.1 ZikukAiContext for server validation (no Editor). */
export type GatewayNotebookSurface = {
  type: 'notebook';
  notebookObjectId: string;
  pageId: string;
  pageKey: string;
};

export type GatewayFocus =
  | { kind: 'empty' }
  | {
      kind: 'text';
      text: string;
      from: number;
      to: number;
      blockKind: string;
      calloutTone?: string;
    }
  | {
      kind: 'math_block';
      latex: string;
      from: number;
      to: number;
      blockKind: 'math';
    }
  | {
      kind: 'math_inline';
      latex: string;
      from: number;
      to: number;
      blockKind: string;
      calloutTone?: string;
    }
  | {
      kind: 'image';
      assetKey: string;
      alt: string;
      from: number;
      to: number;
    }
  | {
      kind: 'handwriting';
      assetKey: string;
      from: number;
      to: number;
    }
  | {
      kind: 'table';
      mode: 'whole_table' | 'cell_text';
      rows: number;
      cols: number;
      text?: string;
      from: number;
      to: number;
    }
  | {
      kind: 'unsupported';
      reason: string;
      from: number;
      to: number;
    };

export type GatewayNormalizedContent =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string }
  | { type: 'image'; assetKey: string; alt?: string }
  | { type: 'handwriting'; assetKey: string }
  | { type: 'table'; rows: number; cols: number; textPreview: string }
  | { type: 'empty' };

export type GatewaySurroundingBlock = {
  role: 'previous' | 'current' | 'next';
  blockKind: string;
  content: GatewayNormalizedContent;
};

export type GatewayAiContext = {
  version: 1;
  capturedAt: string;
  identity: { userId: string };
  academic: { sectionId: string; sectionTitle?: string };
  surface: GatewayNotebookSurface;
  focus: GatewayFocus;
  surroundings: { blocks: GatewaySurroundingBlock[]; truncated: boolean };
};

export type ZikukAiExplainSelectionRequest = {
  version: 1;
  capability: 'explain_selection';
  context: GatewayAiContext;
};

export type ZikukAiAskCourseRequest = {
  version: 1;
  capability: 'ask_course';
  sectionId: string;
  question: string;
};

export type ZikukAiRequest = ZikukAiExplainSelectionRequest | ZikukAiAskCourseRequest;

export type AskCourseSourceRef = {
  index: number;
  sourceObjectId: string;
  fileName: string | null;
  pageNumber: number;
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

/**
 * Forbidden client-control / authority fields — presence → invalid_request.
 * ask_course also uses a strict allowlist of keys.
 */
export const FORBIDDEN_CLIENT_CONTROL_KEYS = [
  'provider',
  'model',
  'apiKey',
  'api_key',
  'temperature',
  'messages',
  'max_tokens',
  'maxTokens',
  'baseUrl',
  'base_url',
  'plan',
  'owner',
  'quota',
  'quotaLimit',
  'daily_request_limit',
  'dailyRequestLimit',
  'entitlement',
  'isOwner',
  'is_owner',
  'userId',
  'user_id',
  'embeddingModel',
  'embedding_model',
  'embeddingDimensions',
  'embedding_dimensions',
  'dimensions',
  'topK',
  'top_k',
  'limit',
  'similarityThreshold',
  'similarity_threshold',
  'threshold',
  'vectors',
  'vector',
  'chunks',
  'sources',
  'sourceIds',
  'source_ids',
  'sourceObjectIds',
  'source_object_ids',
  'retrievedContext',
  'retrieved_context',
  'systemPrompt',
  'system_prompt',
] as const;

/** Strict allowlist for ask_course request objects. */
export const ASK_COURSE_ALLOWED_KEYS = ['version', 'capability', 'sectionId', 'question'] as const;
