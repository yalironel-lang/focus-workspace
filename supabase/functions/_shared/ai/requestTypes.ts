/**
 * Server-side ZIKUK AI Gateway wire types (M0.2).
 * Must stay aligned with src/lib/ai/gatewayClient/types.ts (client contract).
 * No provider SDKs, no TipTap, no secrets.
 */

/** M0.2: only explain_selection. */
export type ZikukAiCapability = 'explain_selection';

export type ZikukAiErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'invalid_request'
  | 'unsupported_capability'
  | 'unsupported_content'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'quota_exceeded'
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

export type ZikukAiRequest = {
  version: 1;
  capability: ZikukAiCapability;
  context: GatewayAiContext;
};

export type ZikukAiResponse =
  | {
      version: 1;
      ok: true;
      result: { type: 'text'; text: string };
      meta?: { capability: ZikukAiCapability; latencyMs?: number };
    }
  | {
      version: 1;
      ok: false;
      error: { code: ZikukAiErrorCode; message: string };
    };

/** Forbidden client-control fields — presence → invalid_request. */
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
] as const;
