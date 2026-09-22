/**
 * Server-side request validation. Client M0.1 bounds are UX; these are security/cost.
 */

import {
  MAX_BLOCK_CHARS,
  MAX_SELECTION_CHARS,
  MAX_SURROUNDING_BLOCKS,
  MAX_TABLE_PREVIEW_CHARS,
} from './bounds.ts';
import { MAX_ASK_COURSE_QUESTION_CHARS } from './askCourse/bounds.ts';
import { normalizeAskCourseRecentTurns } from './askCourse/normalizeRecentTurns.ts';
import {
  ASK_COURSE_ALLOWED_KEYS_V1,
  ASK_COURSE_ALLOWED_KEYS_V2,
  FORBIDDEN_CLIENT_CONTROL_KEYS,
  type GatewayAiContext,
  type ZikukAiAskCourseRequestV1,
  type ZikukAiAskCourseRequestV2,
  type ZikukAiRequest,
} from './requestTypes.ts';
import type { ZikukAiErrorCode } from './requestTypes.ts';

export type ValidateOk = { ok: true; request: ZikukAiRequest };
export type ValidateErr = { ok: false; code: ZikukAiErrorCode; message: string };
export type ValidateResult = ValidateOk | ValidateErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasForbiddenControlKeys(body: Record<string, unknown>): string | null {
  for (const key of FORBIDDEN_CLIENT_CONTROL_KEYS) {
    if (key in body) return key;
  }
  return null;
}

function strLen(v: unknown): number {
  return typeof v === 'string' ? v.length : 0;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateFocusContent(focus: GatewayAiContext['focus']): ValidateErr | null {
  if (focus.kind === 'empty') {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Nothing is selected to explain.',
    };
  }
  if (focus.kind === 'image' || focus.kind === 'handwriting') {
    return {
      ok: false,
      code: 'unsupported_content',
      message:
        focus.kind === 'image'
          ? 'Explaining images is not available yet.'
          : 'Explaining handwriting is not available yet.',
    };
  }
  if (focus.kind === 'unsupported') {
    return {
      ok: false,
      code: 'unsupported_content',
      message: 'This selection cannot be explained yet.',
    };
  }
  if (focus.kind === 'text') {
    if (!focus.text.trim()) {
      return { ok: false, code: 'invalid_request', message: 'Selected text is empty.' };
    }
    if (focus.text.length > MAX_SELECTION_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Selected text exceeds the maximum allowed size.',
      };
    }
  }
  if (focus.kind === 'math_block' || focus.kind === 'math_inline') {
    if (!focus.latex.trim()) {
      return { ok: false, code: 'invalid_request', message: 'Selected math is empty.' };
    }
    if (focus.latex.length > MAX_SELECTION_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Selected math exceeds the maximum allowed size.',
      };
    }
  }
  if (focus.kind === 'table') {
    const text = focus.text ?? '';
    if (focus.mode === 'cell_text' && !text.trim()) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Selected table cell text is empty.',
      };
    }
    if (text.length > MAX_SELECTION_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Selected table text exceeds the maximum allowed size.',
      };
    }
  }
  return null;
}

function validateSurroundings(ctx: GatewayAiContext): ValidateErr | null {
  const blocks = ctx.surroundings?.blocks;
  if (!Array.isArray(blocks)) {
    return { ok: false, code: 'invalid_request', message: 'Invalid surroundings.' };
  }
  if (blocks.length > MAX_SURROUNDING_BLOCKS) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Too many surrounding blocks.',
    };
  }
  for (const b of blocks) {
    if (!b || typeof b !== 'object') {
      return { ok: false, code: 'invalid_request', message: 'Invalid surrounding block.' };
    }
    const c = b.content;
    if (!c || typeof c !== 'object') {
      return { ok: false, code: 'invalid_request', message: 'Invalid surrounding content.' };
    }
    if (c.type === 'text' && strLen(c.text) > MAX_BLOCK_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Surrounding text exceeds the maximum allowed size.',
      };
    }
    if (c.type === 'math' && strLen(c.latex) > MAX_BLOCK_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Surrounding math exceeds the maximum allowed size.',
      };
    }
    if (c.type === 'table' && strLen(c.textPreview) > MAX_TABLE_PREVIEW_CHARS) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Table preview exceeds the maximum allowed size.',
      };
    }
  }
  return null;
}

function validateAskCourse(body: Record<string, unknown>): ValidateResult {
  const forbidden = hasForbiddenControlKeys(body);
  if (forbidden) {
    return {
      ok: false,
      code: 'invalid_request',
      message: `Unsupported field: ${forbidden}.`,
    };
  }

  if (body.capability !== 'ask_course') {
    return {
      ok: false,
      code: 'unsupported_capability',
      message: 'This AI capability is not available.',
    };
  }

  const version = body.version;
  if (version !== 1 && version !== 2) {
    return { ok: false, code: 'invalid_request', message: 'Unsupported request version.' };
  }

  const allowed =
    version === 1 ? ASK_COURSE_ALLOWED_KEYS_V1 : ASK_COURSE_ALLOWED_KEYS_V2;
  const keys = Object.keys(body);
  for (const k of keys) {
    if (!(allowed as readonly string[]).includes(k)) {
      return {
        ok: false,
        code: 'invalid_request',
        message: `Unsupported field: ${k}.`,
      };
    }
  }

  if (typeof body.sectionId !== 'string' || !body.sectionId.trim()) {
    return { ok: false, code: 'invalid_request', message: 'Invalid sectionId.' };
  }
  const sectionId = body.sectionId.trim();
  if (!UUID_RE.test(sectionId)) {
    return { ok: false, code: 'invalid_request', message: 'Invalid sectionId.' };
  }
  if (typeof body.question !== 'string') {
    return { ok: false, code: 'invalid_request', message: 'Invalid question.' };
  }
  const question = body.question.trim();
  if (!question) {
    return { ok: false, code: 'invalid_request', message: 'Question is empty.' };
  }
  if (question.length > MAX_ASK_COURSE_QUESTION_CHARS) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Question exceeds the maximum allowed size.',
    };
  }

  if (version === 1) {
    const request: ZikukAiAskCourseRequestV1 = {
      version: 1,
      capability: 'ask_course',
      sectionId,
      question,
    };
    return { ok: true, request };
  }

  // v2 — recentTurns optional; wrong type fails; malformed entries degrade to [].
  if ('recentTurns' in body && body.recentTurns !== undefined) {
    if (!Array.isArray(body.recentTurns)) {
      return {
        ok: false,
        code: 'invalid_request',
        message: 'Invalid recentTurns.',
      };
    }
  }

  const recentTurns = normalizeAskCourseRecentTurns(body.recentTurns);
  const request: ZikukAiAskCourseRequestV2 = {
    version: 2,
    capability: 'ask_course',
    sectionId,
    question,
    ...(recentTurns.length > 0 ? { recentTurns } : {}),
  };
  return { ok: true, request };
}

function validateExplainSelection(body: Record<string, unknown>): ValidateResult {
  const forbidden = hasForbiddenControlKeys(body);
  if (forbidden) {
    return {
      ok: false,
      code: 'invalid_request',
      message: `Unsupported field: ${forbidden}.`,
    };
  }

  if (body.version !== 1) {
    return { ok: false, code: 'invalid_request', message: 'Unsupported request version.' };
  }

  if (body.capability !== 'explain_selection') {
    return {
      ok: false,
      code: 'unsupported_capability',
      message: 'This AI capability is not available.',
    };
  }

  const context = body.context;
  if (!isRecord(context)) {
    return { ok: false, code: 'invalid_request', message: 'Missing context.' };
  }
  if (context.version !== 1) {
    return { ok: false, code: 'invalid_request', message: 'Unsupported context version.' };
  }

  const identity = context.identity;
  const academic = context.academic;
  const surface = context.surface;
  const focus = context.focus;
  const surroundings = context.surroundings;

  if (!isRecord(identity) || typeof identity.userId !== 'string') {
    return { ok: false, code: 'invalid_request', message: 'Invalid identity.' };
  }
  if (!isRecord(academic) || typeof academic.sectionId !== 'string' || !academic.sectionId) {
    return { ok: false, code: 'invalid_request', message: 'Invalid academic context.' };
  }
  if (
    !isRecord(surface) ||
    surface.type !== 'notebook' ||
    typeof surface.notebookObjectId !== 'string' ||
    typeof surface.pageId !== 'string' ||
    typeof surface.pageKey !== 'string'
  ) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'Only notebook surface is supported for explain_selection.',
    };
  }
  if (!isRecord(focus) || typeof focus.kind !== 'string') {
    return { ok: false, code: 'invalid_request', message: 'Invalid focus.' };
  }
  if (!isRecord(surroundings) || !Array.isArray(surroundings.blocks)) {
    return { ok: false, code: 'invalid_request', message: 'Invalid surroundings.' };
  }
  if (typeof context.capturedAt !== 'string') {
    return { ok: false, code: 'invalid_request', message: 'Invalid capturedAt.' };
  }

  const request = body as unknown as ZikukAiRequest;

  if (request.capability !== 'explain_selection') {
    return {
      ok: false,
      code: 'unsupported_capability',
      message: 'This AI capability is not available.',
    };
  }

  const focusErr = validateFocusContent(request.context.focus);
  if (focusErr) return focusErr;

  const surrErr = validateSurroundings(request.context);
  if (surrErr) return surrErr;

  return { ok: true, request };
}

/**
 * Validate unknown JSON body into a ZikukAiRequest.
 * Strict: rejects forbidden provider-control keys and unsupported shapes.
 */
export function validateZikukAiRequest(body: unknown): ValidateResult {
  if (!isRecord(body)) {
    return { ok: false, code: 'invalid_request', message: 'Request must be a JSON object.' };
  }

  if (body.capability === 'ask_course') {
    return validateAskCourse(body);
  }

  if (body.capability === 'explain_selection') {
    return validateExplainSelection(body);
  }

  // Unknown capability — still reject forbidden keys first when present
  const forbidden = hasForbiddenControlKeys(body);
  if (forbidden) {
    return {
      ok: false,
      code: 'invalid_request',
      message: `Unsupported field: ${forbidden}.`,
    };
  }

  return {
    ok: false,
    code: 'unsupported_capability',
    message: 'This AI capability is not available.',
  };
}
