/**
 * Strip internal ZIKUK metadata before any foundation-model call.
 */

import type {
  GatewayAiContext,
  GatewayFocus,
  GatewayNormalizedContent,
  GatewaySurroundingBlock,
} from './requestTypes.ts';

/** Content types that may be sent to the provider for explain_selection. */
export type ProviderFocus =
  | { kind: 'text'; text: string; blockKind: string; calloutTone?: string }
  | { kind: 'math_block'; latex: string; blockKind: 'math' }
  | { kind: 'math_inline'; latex: string; blockKind: string; calloutTone?: string }
  | {
      kind: 'table';
      mode: 'whole_table' | 'cell_text';
      rows: number;
      cols: number;
      text?: string;
    };

export type ProviderSurroundingContent =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string }
  | { type: 'table'; rows: number; cols: number; textPreview: string }
  | { type: 'empty' }
  | { type: 'image_placeholder' }
  | { type: 'handwriting_placeholder' };

export type ProviderSurroundingBlock = {
  role: 'previous' | 'current' | 'next';
  blockKind: string;
  content: ProviderSurroundingContent;
};

export type ExplainSelectionProviderPayload = {
  capability: 'explain_selection';
  courseTitle?: string;
  focus: ProviderFocus;
  surroundings: ProviderSurroundingBlock[];
};

function sanitizeContent(c: GatewayNormalizedContent): ProviderSurroundingContent {
  switch (c.type) {
    case 'text':
      return { type: 'text', text: c.text };
    case 'math':
      return { type: 'math', latex: c.latex };
    case 'table':
      return {
        type: 'table',
        rows: c.rows,
        cols: c.cols,
        textPreview: c.textPreview,
      };
    case 'empty':
      return { type: 'empty' };
    case 'image':
      return { type: 'image_placeholder' };
    case 'handwriting':
      return { type: 'handwriting_placeholder' };
    default:
      return { type: 'empty' };
  }
}

function sanitizeFocus(focus: GatewayFocus): ProviderFocus {
  switch (focus.kind) {
    case 'text':
      return {
        kind: 'text',
        text: focus.text,
        blockKind: focus.blockKind,
        ...(focus.calloutTone ? { calloutTone: focus.calloutTone } : {}),
      };
    case 'math_block':
      return { kind: 'math_block', latex: focus.latex, blockKind: 'math' };
    case 'math_inline':
      return {
        kind: 'math_inline',
        latex: focus.latex,
        blockKind: focus.blockKind,
        ...(focus.calloutTone ? { calloutTone: focus.calloutTone } : {}),
      };
    case 'table':
      return {
        kind: 'table',
        mode: focus.mode,
        rows: focus.rows,
        cols: focus.cols,
        ...(focus.text !== undefined ? { text: focus.text } : {}),
      };
    default:
      // Caller must reject image/hw/empty/unsupported before sanitize.
      throw new Error(`sanitizeFocus: unsupported focus kind ${(focus as GatewayFocus).kind}`);
  }
}

function sanitizeSurrounding(b: GatewaySurroundingBlock): ProviderSurroundingBlock {
  return {
    role: b.role,
    blockKind: b.blockKind,
    content: sanitizeContent(b.content),
  };
}

/**
 * Build the minimum provider-visible payload for explain_selection.
 * Must never include userId, sectionId, object/page keys, PM positions, assetKey, capturedAt.
 */
export function sanitizeForProvider(context: GatewayAiContext): ExplainSelectionProviderPayload {
  const payload: ExplainSelectionProviderPayload = {
    capability: 'explain_selection',
    focus: sanitizeFocus(context.focus),
    surroundings: context.surroundings.blocks.map(sanitizeSurrounding),
  };
  const title = context.academic.sectionTitle?.trim();
  if (title) payload.courseTitle = title;
  return payload;
}

/** Keys that must never appear in provider-visible JSON. */
export const FORBIDDEN_PROVIDER_PAYLOAD_KEYS = [
  'userId',
  'capturedAt',
  'sectionId',
  'notebookObjectId',
  'pageId',
  'pageKey',
  'assetKey',
  'from',
  'to',
  'identity',
  'academic',
  'surface',
  'Authorization',
  'authorization',
  'apiKey',
  'api_key',
  'access_token',
] as const;
