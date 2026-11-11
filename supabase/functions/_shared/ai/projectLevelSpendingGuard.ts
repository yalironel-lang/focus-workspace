import { isReasoningCompatibleChatModel } from './chatCompletionsRequestPolicy.ts';
import {
  SERVER_MAX_OUTPUT_TOKENS,
  SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS,
  SERVER_REASONING_MAX_OUTPUT_TOKENS,
  SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS,
} from './bounds.ts';
/**
 * Project-Level AI Spending and Capacity Protection (Phase 6C + 6C.1).
 *
 * Legacy planning and durable admission adapter; hosted paid inference is
 * contained until a verified provider input/attempt bound is available:
 * 1. Global emergency killswitch (AI_EMERGENCY_DISABLE).
 * 2. Project-wide daily request ceiling (AI_PROJECT_MAX_DAILY_REQUESTS).
 * 3. Project-wide daily token ceiling (AI_PROJECT_MAX_DAILY_TOKENS).
 * 4. Project-wide daily dollar budget ceiling (AI_PROJECT_MAX_DAILY_BUDGET_USD_MICROS).
 * 5. Capability- and model-aware safe token estimation.
 * 6. Durable PostgreSQL store adapter (ai_gateway_project_begin / settle / release).
 * 7. Multi-isolate concurrency simulation engine for offline verification.
 *
 * Invariants:
 * - Distinguishes deterministic request/token admission limits from estimated dollar pricing.
 * - Fail-safe when model prices are unknown (gpt-5.6-luna): does NOT assume $0 cost;
 *   never treats an estimate as proof of a hard input/attempt bound.
 * - Does not replace per-user rate limits (safety_60s) or daily quotas (quota_day).
 * - Multi-isolate safety: handles crashes via automatic 5-minute reservation expiration.
 */

export type ProjectSpendingConfig = {
  /** Emergency disable flag (from AI_EMERGENCY_DISABLE). Default: false */
  emergencyDisable?: boolean;
  /** Maximum total AI requests across all users for current UTC day (from AI_PROJECT_MAX_DAILY_REQUESTS) */
  maxDailyRequests?: number | null;
  /** Maximum total tokens across all users for current UTC day (from AI_PROJECT_MAX_DAILY_TOKENS) */
  maxDailyTokens?: number | null;
  /** Maximum estimated cost in USD micros across all users for current UTC day (from AI_PROJECT_MAX_DAILY_BUDGET_USD_MICROS) */
  maxDailyCostMicros?: number | null;
};

export type ProjectDayUsageStats = {
  requestCount: number;
  totalTokens: number;
  totalCostMicros: number;
  unpricedRequestCount: number;
};

export type LoadProjectDayUsageFn = (dayStartIso: string) => Promise<ProjectDayUsageStats>;

export type InFlightReservation = {
  reserve(estimatedTokens?: number): () => void;
  getActiveCount(): number;
  getActiveTokens(): number;
};

/**
 * Planning estimate only: not proof of provider input/attempt token bounds.
 * Hosted paid dispatch must use requireVerifiedTokenReservation instead.
 */
export const SAFE_EMBEDDING_RESERVATION_TOKENS = 1_500;
export const SAFE_STANDARD_GENERATION_TOKENS = 8_500;
export const SAFE_REASONING_GENERATION_TOKENS = 16_000;
export const SAFE_EXPLAIN_SELECTION_TOKENS = 3_500;

export function isReasoningModel(model?: string): boolean {
  return Boolean(
    model &&
      (isReasoningCompatibleChatModel(model) || model.toLowerCase().includes('gemini') ||
        model.toLowerCase().includes('r1') ||
        model.toLowerCase().includes('o1') ||
        model.toLowerCase().includes('o3') ||
        model.toLowerCase().includes('gpt-5') ||
        model.toLowerCase().includes('gpt-6') ||
        model.toLowerCase().includes('luna') ||
        model.toLowerCase().includes('thinking'))
  );
}

export function getSafeTokenReservation(capability: string, model?: string): number {
  const isReasoning = isReasoningModel(model);

  if (capability === 'explain_selection') {
    if (isReasoning) {
      return SAFE_REASONING_GENERATION_TOKENS;
    }
    return SAFE_EXPLAIN_SELECTION_TOKENS;
  }

  // ask_course / general: reserves both embedding allowance and generation allowance
  if (isReasoning) {
    return SAFE_REASONING_GENERATION_TOKENS + SAFE_EMBEDDING_RESERVATION_TOKENS; // 17,500
  }

  return SAFE_STANDARD_GENERATION_TOKENS + SAFE_EMBEDDING_RESERVATION_TOKENS; // 10,000
}


export interface AuthoritativeTokenBoundResult {
  allowed: boolean;
  code?: string;
  reason?: string;
  message?: string;
  totalReservationTokens?: number;
  inputCeilingTokens?: number;
  outputCeilingTokens?: number;
  visionCeilingTokens?: number;
  attemptsMultiplier?: number;
  isAuthoritative: boolean;
}

export function evaluateAuthoritativeTokenBound(params: {
  capability: string;
  model?: string;
  declaredInputTokens?: number;
  hasVision?: boolean;
  visionTileCount?: number;
  maxAttempts?: number;
  hasAuthoritativeTokenizerProof?: boolean;
}): AuthoritativeTokenBoundResult {
  const {
    capability,
    model = '',
    declaredInputTokens,
    hasVision = false,
    visionTileCount = 0,
    maxAttempts = 1,
    hasAuthoritativeTokenizerProof = false,
  } = params;

  if (!hasAuthoritativeTokenizerProof) {
    return {
      allowed: false,
      code: 'unauthorized_inference',
      reason: 'TOKEN_INPUT_BOUND_UNVERIFIED',
      message: 'Authoritative token bounds are not established for this provider/model.',
      isAuthoritative: false,
    };
  }

  if (typeof declaredInputTokens !== 'number' || !Number.isSafeInteger(declaredInputTokens) || declaredInputTokens <= 0) {
    return {
      allowed: false,
      code: 'invalid_request',
      reason: 'INVALID_INPUT_TOKEN_BOUND',
      message: 'A verified positive integer input token bound is required.',
      isAuthoritative: false,
    };
  }

  const isReasoning = isReasoningModel(model);
  const outputCeiling = isReasoning
    ? (model.toLowerCase().includes('gemini') ? SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS : SERVER_REASONING_MAX_OUTPUT_TOKENS)
    : (capability === 'ask_course' ? SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS : SERVER_MAX_OUTPUT_TOKENS);

  // OpenAI high-detail vision: base 85 tokens + 170 tokens per 512x512 tile.
  // PDF visual selections are clamped to <= 1600px long edge, yielding at most 2x4 = 8 tiles.
  // 85 + 8 * 170 = 1,445 tokens per high-detail image crop.
  const visionCeiling = hasVision
    ? (visionTileCount && visionTileCount > 1
        ? 85 + Math.min(visionTileCount, 8) * 170
        : OPENAI_VISION_HIGH_DETAIL_MAX_TOKENS)
    : 0;
  const safeAttempts = Math.max(1, Math.min(Number.isSafeInteger(maxAttempts) ? maxAttempts : 1, 3));
  const totalReservationTokens = (declaredInputTokens + outputCeiling + visionCeiling) * safeAttempts;

  return {
    allowed: true,
    totalReservationTokens,
    inputCeilingTokens: declaredInputTokens,
    outputCeilingTokens: outputCeiling,
    visionCeilingTokens: visionCeiling,
    attemptsMultiplier: safeAttempts,
    isAuthoritative: true,
  };
}

/**
 * Maximum OpenAI token cost for a single high-detail vision input.
 * Base cost: 85 tokens. Clamped PDF selection aspect ratio fits within 8 tiles (170 tokens/tile).
 * 85 + 8 * 170 = 1,445 tokens.
 */
export const OPENAI_VISION_HIGH_DETAIL_MAX_TOKENS = 1_445;

/**
 * Verified OpenAI-compatible BPE Chat Models.
 * Each entry is backed by verified byte-level BPE tokenizer properties (where tokens <= UTF-8 bytes)
 * and known server context / output configurations:
 *
 * 1. gpt-4o:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: o200k_base (byte-level BPE)
 *    - Context limit: 128k tokens
 *    - Output ceiling: 2048 (SERVER_MAX_OUTPUT_TOKENS / SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS)
 *    - Modality: Text + Vision
 *
 * 2. gpt-4o-mini:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: o200k_base (byte-level BPE)
 *    - Context limit: 128k tokens
 *    - Output ceiling: 2048 (SERVER_MAX_OUTPUT_TOKENS / SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS)
 *    - Modality: Text + Vision
 *
 * 3. gpt-4-turbo:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: cl100k_base (byte-level BPE)
 *    - Context limit: 128k tokens
 *    - Output ceiling: 2048 (SERVER_MAX_OUTPUT_TOKENS / SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS)
 *    - Modality: Text + Vision
 *
 * 4. gpt-4:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: cl100k_base (byte-level BPE)
 *    - Context limit: 8k tokens
 *    - Output ceiling: 2048 (SERVER_MAX_OUTPUT_TOKENS / SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS)
 *    - Modality: Text only
 *
 * 5. o1:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: o200k_base (byte-level BPE)
 *    - Context limit: 200k tokens
 *    - Output ceiling: 8000 (SERVER_REASONING_MAX_OUTPUT_TOKENS via max_completion_tokens)
 *    - Modality: Text only
 *
 * 6. o3-mini:
 *    - Provider: OpenAI / OpenAI-compatible endpoint (/v1/chat/completions)
 *    - Tokenizer family: o200k_base (byte-level BPE)
 *    - Context limit: 200k tokens
 *    - Output ceiling: 8000 (SERVER_REASONING_MAX_OUTPUT_TOKENS via max_completion_tokens)
 *    - Modality: Text only
 *
 * Unverified / Synthetic models (FAIL CLOSED):
 * - gpt-5.6-luna, gpt-6-astra, o4-mini, gpt-4.1: synthetic or unverified endpoint/contracts.
 * - gemini-*: SentencePiece tokenizer (not byte-level BPE), unverified byte-bound ratio.
 */
export const VERIFIED_BPE_CHAT_MODELS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'o1',
  'o3-mini',
]);

/**
 * Verified OpenAI BPE Embedding Models.
 * 1. text-embedding-3-small: cl100k_base BPE, 1536 dimensions, max input 8191 tokens
 * 2. text-embedding-3-large: cl100k_base BPE, 1536/3072 dimensions, max input 8191 tokens
 * 3. text-embedding-ada-002: cl100k_base BPE, 1536 dimensions, max input 8191 tokens
 */
export const VERIFIED_BPE_EMBEDDING_MODELS = new Set([
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
]);

export function isAuthoritativeBpeModel(model?: string): boolean {
  if (!model) return false;
  return VERIFIED_BPE_CHAT_MODELS.has(model.trim().toLowerCase());
}

export function isAuthoritativeBpeEmbeddingModel(model?: string): boolean {
  if (!model) return false;
  return VERIFIED_BPE_EMBEDDING_MODELS.has(model.trim().toLowerCase());
}

/**
 * Calculates a provable upper bound on embedding tokens for one or more strings.
 * Under byte-level BPE, every token represents at least 1 UTF-8 byte.
 * We include 8 framing tokens per string and enforce a minimum floor of 100 tokens/chunk.
 */
export function calculateAuthoritativeEmbeddingBound(texts: string | string[], model = 'text-embedding-3-small'): number {
  if (!isAuthoritativeBpeEmbeddingModel(model)) {
    throw new Error('TOKEN_EMBEDDING_BOUND_UNVERIFIED');
  }
  const items = Array.isArray(texts) ? texts : [texts];
  if (items.length === 0) return 0;
  const encoder = new TextEncoder();
  let totalBytes = 0;
  for (const t of items) {
    if (typeof t !== 'string') {
      throw new Error('INVALID_EMBEDDING_INPUT: All batch items must be strings');
    }
    if (t.length > 0) {
      totalBytes += encoder.encode(t).length;
    }
  }
  const byteBound = totalBytes + items.length * 8;
  return Math.max(items.length * 100, byteBound);
}

/** Verified conservative ceilings for gateway admission reservation sizing. */
export const ASK_COURSE_SYSTEM_PROMPT_CEILING_BYTES = 15_000;
export const ASK_COURSE_RETRIEVAL_CEILING_BYTES = 24_000;
export const EXPLAIN_SELECTION_SYSTEM_CEILING_BYTES = 4_000;

/**
 * Measures the authoritative worst-case input token bound for an incoming request.
 * Applies strictly to verified byte-level BPE models; returns unverified for all others.
 */
export function calculateAuthoritativePayloadInputBound(
  request: unknown,
  model?: string,
): {
  isAuthoritative: boolean;
  declaredInputTokens: number;
  hasVision: boolean;
  visionTileCount: number;
} {
  if (!isAuthoritativeBpeModel(model)) {
    return {
      isAuthoritative: false,
      declaredInputTokens: 0,
      hasVision: false,
      visionTileCount: 0,
    };
  }

  if (!request || typeof request !== 'object') {
    return {
      isAuthoritative: false,
      declaredInputTokens: 0,
      hasVision: false,
      visionTileCount: 0,
    };
  }

  const req = request as Record<string, unknown>;
  const capability = req.capability;
  const encoder = new TextEncoder();

  if (capability === 'explain_selection') {
    let textBytes = EXPLAIN_SELECTION_SYSTEM_CEILING_BYTES;
    const context = req.context as Record<string, unknown> | undefined;
    if (context && typeof context === 'object') {
      const focus = context.focus as Record<string, unknown> | undefined;
      if (focus && typeof focus === 'object') {
        if (typeof focus.text === 'string') textBytes += encoder.encode(focus.text).length;
        if (typeof focus.latex === 'string') textBytes += encoder.encode(focus.latex).length;
      }
      const surroundings = context.surroundings as { blocks?: Array<{ content?: { text?: string; latex?: string; textPreview?: string } }> } | undefined;
      if (surroundings && Array.isArray(surroundings.blocks)) {
        for (const b of surroundings.blocks) {
          if (b.content?.text) textBytes += encoder.encode(b.content.text).length;
          if (b.content?.latex) textBytes += encoder.encode(b.content.latex).length;
          if (b.content?.textPreview) textBytes += encoder.encode(b.content.textPreview).length;
        }
      }
      const academic = context.academic as { sectionTitle?: string } | undefined;
      if (typeof academic?.sectionTitle === 'string') {
        textBytes += encoder.encode(academic.sectionTitle).length;
      }
    }
    const declaredInputTokens = Math.max(1000, textBytes + 500);
    return {
      isAuthoritative: true,
      declaredInputTokens,
      hasVision: false,
      visionTileCount: 0,
    };
  }

  if (capability === 'ask_course') {
    let textBytes = ASK_COURSE_SYSTEM_PROMPT_CEILING_BYTES;
    if (typeof req.question === 'string') {
      textBytes += encoder.encode(req.question).length;
    }
    if (Array.isArray(req.recentTurns)) {
      for (const t of req.recentTurns) {
        if (t && typeof t.content === 'string') {
          textBytes += encoder.encode(t.content).length + 4;
        }
      }
    }
    let hasVision = false;
    let visionTileCount = 0;
    const capture = req.capture as Record<string, unknown> | undefined;
    if (capture && typeof capture === 'object') {
      if (capture.kind === 'visual_selection') {
        hasVision = true;
        visionTileCount = 1;
      } else if (typeof capture.text === 'string') {
        textBytes += encoder.encode(capture.text).length;
      }
    }
    const embeddingQueryTokens = typeof req.question === 'string' ? Math.min(4000, encoder.encode(req.question).length) + 8 : 100;
    const framingTokens = 100;

    const declaredInputTokens = Math.max(1000, textBytes + ASK_COURSE_RETRIEVAL_CEILING_BYTES + embeddingQueryTokens + framingTokens);
    return {
      isAuthoritative: true,
      declaredInputTokens,
      hasVision,
      visionTileCount,
    };
  }

  return {
    isAuthoritative: false,
    declaredInputTokens: 0,
    hasVision: false,
    visionTileCount: 0,
  };
}

export interface VerifyFinalProviderPayloadParams {
  capability: string;
  model: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; [key: string]: unknown }> }>;
  maxTokens: number;
  reservedTokens: number;
  embeddingTokens?: number;
}

export interface VerifyFinalProviderPayloadResult {
  ok: boolean;
  error?: string;
  code?: string;
  exactInputTokens: number;
  totalRequiredTokens: number;
  reservedTokens: number;
}

/**
 * Authoritative Pre-Dispatch Verification Gate:
 * Calculates the exact token ceiling from the fully assembled request payload immediately
 * before provider dispatch, covering:
 * - System and developer instructions (including SYSTEM_V3_TUTOR and teaching mode directives).
 * - Conversation history.
 * - Retrieved knowledge chunks.
 * - PDF selections and active document context.
 * - Tool definitions, structured output instructions, and framing (4 tokens/msg + 3 preamble).
 * - Visual tile ceilings (1,445 tokens per high-detail image).
 * - Output token reservation ceiling.
 * - Embedding tokens incurred during retrieval.
 *
 * If the exact required tokens exceed the reserved liability, FAILS CLOSED before provider dispatch.
 */
export function verifyFinalProviderPayloadBound(params: VerifyFinalProviderPayloadParams): VerifyFinalProviderPayloadResult {
  const { capability, model, messages, maxTokens, reservedTokens, embeddingTokens = 0 } = params;

  if (!isAuthoritativeBpeModel(model)) {
    return {
      ok: false,
      code: 'unauthorized_inference',
      error: `TOKEN_INPUT_BOUND_UNVERIFIED: Model ${model} is not an authoritative BPE model`,
      exactInputTokens: 0,
      totalRequiredTokens: Infinity,
      reservedTokens,
    };
  }

  const encoder = new TextEncoder();
  let exactTextBytes = 0;
  let imageCount = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      exactTextBytes += encoder.encode(msg.content).length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          exactTextBytes += encoder.encode(part.text).length;
        } else if (part.type === 'image_url') {
          imageCount++;
        }
      }
    }
  }

  // OpenAI ChatML envelope framing: 4 tokens per message + 3 tokens conversation preamble
  const framingTokens = messages.length * 4 + 3;
  const visionTokens = imageCount * OPENAI_VISION_HIGH_DETAIL_MAX_TOKENS;
  const exactInputTokens = exactTextBytes + framingTokens + visionTokens;

  // Total required tokens covers input, vision, max output, and retrieval embedding tokens
  const safeEmbeddingTokens = typeof embeddingTokens === 'number' && Number.isSafeInteger(embeddingTokens) && embeddingTokens > 0
    ? embeddingTokens
    : 0;
  const totalRequiredTokens = exactInputTokens + maxTokens + safeEmbeddingTokens;

  if (totalRequiredTokens > reservedTokens) {
    return {
      ok: false,
      code: 'quota_exceeded',
      error: `RESERVATION_EXPOSURE_EXCEEDED: Assembled payload tokens (${totalRequiredTokens}) exceed reserved tokens (${reservedTokens})`,
      exactInputTokens,
      totalRequiredTokens,
      reservedTokens,
    };
  }

  return {
    ok: true,
    exactInputTokens,
    totalRequiredTokens,
    reservedTokens,
  };
}

export interface VerifiedTokenReservationOptions {
  declaredInputTokens?: number;
  hasVision?: boolean;
  visionTileCount?: number;
  maxAttempts?: number;
  hasAuthoritativeTokenizerProof?: boolean;
}

/**
 * Enforces an authoritative fail-closed gate before paid provider dispatch.
 * When called with no options or with unverified provider/model proofs, throws TOKEN_INPUT_BOUND_UNVERIFIED.
 * When supplied with verified input bounds on supported BPE models, returns the exact authoritative token reservation.
 */
export function requireVerifiedTokenReservation(
  capability: string,
  model?: string,
  options?: VerifiedTokenReservationOptions,
): number {
  const isBpe = isAuthoritativeBpeModel(model);
  const evaluation = evaluateAuthoritativeTokenBound({
    capability,
    model,
    declaredInputTokens: options?.declaredInputTokens,
    hasVision: options?.hasVision,
    visionTileCount: options?.visionTileCount,
    maxAttempts: options?.maxAttempts,
    hasAuthoritativeTokenizerProof: options?.hasAuthoritativeTokenizerProof ?? (isBpe && options?.declaredInputTokens !== undefined),
  });
  if (!evaluation.allowed) {
    throw new Error(evaluation.reason || 'TOKEN_INPUT_BOUND_UNVERIFIED');
  }
  return evaluation.totalReservationTokens!;
}


export function createInFlightTracker(): InFlightReservation {
  let activeCount = 0;
  let activeTokens = 0;

  return {
    reserve(estimatedTokens = 7_000) {
      activeCount++;
      activeTokens += estimatedTokens;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          activeCount = Math.max(0, activeCount - 1);
          activeTokens = Math.max(0, activeTokens - estimatedTokens);
        }
      };
    },
    getActiveCount() {
      return activeCount;
    },
    getActiveTokens() {
      return activeTokens;
    },
  };
}

export type ProjectSpendingStoreResult = {
  ok: boolean;
  error?: string;
};

export type ProjectGuardDecision =
  | {
      allowed: true;
      reservationId?: string | null;
      dispatchReservation?: () => Promise<ProjectSpendingStoreResult | void> | ProjectSpendingStoreResult | void;
      releaseReservation: () => Promise<ProjectSpendingStoreResult | void> | ProjectSpendingStoreResult | void;
      settleReservation: (actualTokens: number) => Promise<ProjectSpendingStoreResult | void> | ProjectSpendingStoreResult | void;
      isDispatched?: () => boolean;
    }
  | {
      allowed: false;
      code: 'ai_disabled' | 'quota_exceeded';
      reason:
        | 'emergency_disabled'
        | 'project_daily_request_limit_exceeded'
        | 'project_daily_token_limit_exceeded'
        | 'project_daily_budget_exceeded';
      message: string;
      stats?: ProjectDayUsageStats & { activeInFlightCount: number; activeInFlightTokens: number };
    };


export function getUtcDayStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

/**
 * Evaluates project-level limits before allowing an AI request to proceed.
 * Works with durable stores (Postgres / distributed simulation) or local fallback.
 */
export async function checkProjectSpendingGuard(input: {
  config: ProjectSpendingConfig;
  loadDayUsage?: LoadProjectDayUsageFn;
  inFlightTracker?: InFlightReservation;
  estimatedRequestTokens?: number;
  now?: Date;
  userId?: string;
  capability?: string;
  store?: {
    begin: (input: {
      userId: string;
      capability: string;
      config: ProjectSpendingConfig;
      estimatedTokens: number;
      now?: Date;
    }) => Promise<ProjectGuardDecision>;
  };
}): Promise<ProjectGuardDecision> {
  const {
    config,
    loadDayUsage,
    inFlightTracker,
    estimatedRequestTokens = 7_000,
    now = new Date(),
    userId,
    capability = 'ask_course',
    store,
  } = input;

  // 1. Emergency Killswitch (highest precedence, instant rejection)
  if (config.emergencyDisable) {
    return {
      allowed: false,
      code: 'ai_disabled',
      reason: 'emergency_disabled',
      message: 'AI services are temporarily disabled for maintenance.',
    };
  }

  // 2. If a durable distributed store is provided, delegate to atomic transaction
  if (store) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return {
        allowed: false,
        code: 'quota_exceeded',
        reason: 'project_daily_request_limit_exceeded',
        message: 'AI usage controls are temporarily unavailable. Try again shortly.',
      };
    }
    return store.begin({
      userId,
      capability,
      config,
      estimatedTokens: estimatedRequestTokens,
      now,
    });
  }

  // 3. Fallback: Local / legacy evaluation
  const hasRequestLimit = typeof config.maxDailyRequests === 'number' && config.maxDailyRequests > 0;
  const hasTokenLimit = typeof config.maxDailyTokens === 'number' && config.maxDailyTokens > 0;
  const hasCostLimit = typeof config.maxDailyCostMicros === 'number' && config.maxDailyCostMicros > 0;

  if (!hasRequestLimit && !hasTokenLimit && !hasCostLimit) {
    const release = inFlightTracker ? inFlightTracker.reserve(estimatedRequestTokens) : () => {};
    return {
      allowed: true,
      reservationId: null,
      releaseReservation: release,
      settleReservation: () => release(),
    };
  }

  const dayStartIso = getUtcDayStartIso(now);
  let stats: ProjectDayUsageStats = {
    requestCount: 0,
    totalTokens: 0,
    totalCostMicros: 0,
    unpricedRequestCount: 0,
  };

  if (loadDayUsage) {
    try {
      stats = await loadDayUsage(dayStartIso);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'project_spending_guard_error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      // Fail closed on metrics error if limits are configured
      return {
        allowed: false,
        code: 'quota_exceeded',
        reason: 'project_daily_request_limit_exceeded',
        message: 'AI usage controls are temporarily unavailable. Try again shortly.',
      };
    }
  }

  const inFlightCount = inFlightTracker ? inFlightTracker.getActiveCount() : 0;
  const inFlightTokens = inFlightTracker ? inFlightTracker.getActiveTokens() : 0;

  const effectiveRequests = stats.requestCount + inFlightCount;
  const effectiveTokens = stats.totalTokens + inFlightTokens + estimatedRequestTokens;

  // Request ceiling check
  if (hasRequestLimit && effectiveRequests >= config.maxDailyRequests!) {
    return {
      allowed: false,
      code: 'quota_exceeded',
      reason: 'project_daily_request_limit_exceeded',
      message: 'AI daily request capacity reached for this project. Please try again tomorrow.',
      stats: {
        ...stats,
        activeInFlightCount: inFlightCount,
        activeInFlightTokens: inFlightTokens,
      },
    };
  }

  // Token ceiling check
  if (hasTokenLimit && effectiveTokens > config.maxDailyTokens!) {
    return {
      allowed: false,
      code: 'quota_exceeded',
      reason: 'project_daily_token_limit_exceeded',
      message: 'AI daily token capacity reached for this project. Please try again tomorrow.',
      stats: {
        ...stats,
        activeInFlightCount: inFlightCount,
        activeInFlightTokens: inFlightTokens,
      },
    };
  }

  // Cost ceiling check: Fail-safe for unpriced models (gpt-5.6-luna)
  if (hasCostLimit) {
    if (stats.unpricedRequestCount > 0 && !hasTokenLimit && !hasRequestLimit) {
      return {
        allowed: false,
        code: 'quota_exceeded',
        reason: 'project_daily_budget_exceeded',
        message:
          'AI project budget ceiling cannot safely bound unpriced models without token limits. Requests paused for safety.',
        stats: {
          ...stats,
          activeInFlightCount: inFlightCount,
          activeInFlightTokens: inFlightTokens,
        },
      };
    }

    if (stats.totalCostMicros >= config.maxDailyCostMicros!) {
      return {
        allowed: false,
        code: 'quota_exceeded',
        reason: 'project_daily_budget_exceeded',
        message: 'AI daily budget limit reached for this project. Please try again tomorrow.',
        stats: {
          ...stats,
          activeInFlightCount: inFlightCount,
          activeInFlightTokens: inFlightTokens,
        },
      };
    }
  }

  // Pass: reserve capacity
  const release = inFlightTracker ? inFlightTracker.reserve(estimatedRequestTokens) : () => {};
  return {
    allowed: true,
    reservationId: null,
    releaseReservation: release,
    settleReservation: () => release(),
  };
}

/**
 * Creates a durable loader querying public.ai_usage_events using Supabase client.
 * Includes all token-consuming outcomes (success, provider_error, provider_timeout, bad_response).
 */
export function createSupabaseDayUsageLoader(supabaseAdminClient: {
  from: (table: string) => {
    select: (columns: string) => {
      gte: (col: string, val: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
      };
    };
  };
}): LoadProjectDayUsageFn {
  let cachedAt = 0;
  let cachedDayStart = '';
  let cachedStats: ProjectDayUsageStats = {
    requestCount: 0,
    totalTokens: 0,
    totalCostMicros: 0,
    unpricedRequestCount: 0,
  };

  return async (dayStartIso: string): Promise<ProjectDayUsageStats> => {
    const now = Date.now();
    if (dayStartIso === cachedDayStart && now - cachedAt < 15_000) {
      return cachedStats;
    }

    // Query all attempts that could have consumed provider tokens
    const { data, error } = await supabaseAdminClient
      .from('ai_usage_events')
      .select('total_tokens, estimated_cost_usd_micros')
      .gte('created_at', dayStartIso)
      .in('outcome', ['success', 'provider_error', 'provider_timeout', 'bad_response']);

    if (error) {
      throw new Error(`Failed to load daily project usage: ${String((error as { message?: string }).message || error)}`);
    }

    let requestCount = 0;
    let totalTokens = 0;
    let totalCostMicros = 0;
    let unpricedRequestCount = 0;

    if (Array.isArray(data)) {
      requestCount = data.length;
      for (const row of data) {
        if (typeof row.total_tokens === 'number') {
          totalTokens += row.total_tokens;
        }
        if (typeof row.estimated_cost_usd_micros === 'number') {
          totalCostMicros += row.estimated_cost_usd_micros;
        } else {
          unpricedRequestCount++;
        }
      }
    }

    cachedStats = {
      requestCount,
      totalTokens,
      totalCostMicros,
      unpricedRequestCount,
    };
    cachedDayStart = dayStartIso;
    cachedAt = now;

    return cachedStats;
  };
}

/**
 * PostgreSQL RPC client adapter for durable project spending control.
 */
export function createPostgresProjectSpendingStore(client: {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}) {
  const unavailable = (): ProjectGuardDecision => ({
    allowed: false, code: 'quota_exceeded', reason: 'project_daily_request_limit_exceeded',
    message: 'AI usage controls are temporarily unavailable. Try again shortly.',
  });
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const invalidField = Symbol('invalid accounting evidence');
  // Distinguish absent optional fields from malformed/accessor/inherited fields.
  const field = (value: unknown, key: string): unknown => {
    try {
      if (!record(value)) return invalidField;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d) return key in value ? invalidField : undefined;
      return 'value' in d ? d.value : invalidField;
    } catch { return invalidField; }
  };
  async function rpc(fn: string, args: Record<string, unknown>) {
    try {
      const result = await client.rpc(fn, args);
      const data = field(result, 'data');
      if (field(result, 'error') !== null || field(data, 'ok') !== true
          || field(data,'code')!==undefined || field(data,'error')!==undefined) return null;
      if (fn==='ai_gateway_project_dispatch' && (field(data,'dispatched')!==true || field(data,'already_dispatched_or_settled')!==undefined)) return null;
      if (fn==='ai_gateway_project_settle' && field(data,'settled_tokens')!==args.p_actual_tokens) return null;
      if (fn==='ai_gateway_project_release' && field(data,'released')!==true && field(data,'released_expired_consumed')!==true) return null;
      return data;
    } catch { return null; }
  }
  const failed = (): ProjectSpendingStoreResult => ({ok:false,error:'ACCOUNTING_UNCONFIRMED'});
  return {
    async begin(input: {
      userId: string; capability: string; config: ProjectSpendingConfig; estimatedTokens: number; now?: Date;
    }): Promise<ProjectGuardDecision> {
      const {userId,capability,config,estimatedTokens}=input;
      if (config.emergencyDisable) return {allowed:false,code:'ai_disabled',reason:'emergency_disabled',message:'AI services are temporarily disabled for maintenance.'};
      const limits=[config.maxDailyRequests,config.maxDailyTokens,config.maxDailyCostMicros];
      if (limits.some(v=>v!=null && (!Number.isSafeInteger(v) || v<0))
          || !Number.isSafeInteger(estimatedTokens) || estimatedTokens<=0) return unavailable();
      // Migration 022 has no atomic dollar reservations. Never bypass a configured
      // money limit or substitute a racy usage-log precheck/guessed model price.
      if ((config.maxDailyCostMicros??0)>0) return {
        allowed:false,code:'quota_exceeded',reason:'project_daily_budget_exceeded',
        message:'AI budget enforcement is unavailable. No request was dispatched.',
      };
      let result: unknown;
      try { result=await client.rpc('ai_gateway_project_begin',{
        p_user_id:userId,p_capability:capability,p_emergency_disable:false,
        p_max_daily_requests:config.maxDailyRequests??null,p_max_daily_tokens:config.maxDailyTokens??null,p_estimated_tokens:estimatedTokens,
      }); } catch { return unavailable(); }
      if (field(result,'error')!==null) return unavailable();
      const data=field(result,'data');
      if (field(data,'ok')!==true) {
        if (field(data,'ok')!==false) return unavailable();
        const reason=field(data,'reason');
        if (field(data,'code')==='ai_disabled' && reason==='emergency_disabled') return {allowed:false,code:'ai_disabled',reason:'emergency_disabled',message:'AI services are temporarily disabled for maintenance.'};
        if (field(data,'code')==='quota_exceeded' && (reason==='project_daily_request_limit_exceeded' || reason==='project_daily_token_limit_exceeded'))
          return {allowed:false,code:'quota_exceeded',reason,message:'AI daily limit reached. Try again tomorrow.'};
        return unavailable();
      }
      const reservation=field(data,'reservation_id');
      if (!(typeof reservation==='string' && reservation.trim().length>0) || field(data,'code')!==undefined) return unavailable();
      const reservationId=typeof reservation==='string'?reservation:null;
      let dispatched=false;
      let dispatch: Promise<ProjectSpendingStoreResult>|undefined;
      let terminal: 'settle'|'release'|undefined;
      let finalization: Promise<ProjectSpendingStoreResult>|undefined;
      let finalizedTokens: number|undefined;
      const finalize=(kind:'settle'|'release',actualTokens?:number):Promise<ProjectSpendingStoreResult>=>{
        if (finalization) return terminal===kind && (kind!=='settle' || finalizedTokens===actualTokens)?finalization:Promise.resolve(failed());
        terminal=kind; finalizedTokens=actualTokens;
        finalization=(async()=>{
          if (kind==='settle' && (typeof actualTokens!=='number' || !Number.isSafeInteger(actualTokens) || actualTokens<0)) return failed();
          if (!reservationId) return {ok:true};
          const confirmed=await rpc(`ai_gateway_project_${kind}`,kind==='settle'
            ? {p_reservation_id:reservationId,p_actual_tokens:actualTokens}
            : {p_reservation_id:reservationId});
          return confirmed?{ok:true}:failed();
        })();
        return finalization;
      };
      return {
        allowed:true,reservationId,isDispatched:()=>dispatched,
        dispatchReservation:()=>{
          if (terminal) return Promise.resolve(failed());
          if (!dispatch) {
            // Set before I/O: an uncertain mark must never release a possibly paid call.
            dispatched=true;
            dispatch=(async()=>{
              const result=await rpc('ai_gateway_project_dispatch',{p_reservation_id:reservationId});
              return result && !terminal?{ok:true}:failed();
            })();
          }
          return dispatch;
        },
        settleReservation:(tokens:number)=>finalize('settle',tokens),
        releaseReservation:()=>dispatched?finalize('settle',estimatedTokens):finalize('release'),
      };
    },
  };
}

/**
 * Multi-Isolate Concurrency Simulation Engine.
 * Simulates a shared PostgreSQL database engine accessed by N independent Edge Function isolates.
 */
export function createDistributedSimulationStore() {
  const dailyRequests = new Map<string, number>();
  const dailyTokens = new Map<string, number>();
  type SimulatedReservation = {
    id: string;
    userId: string;
    capability: string;
    reservedTokens: number;
    createdAtMs: number;
    expiresAtMs: number;
    status: 'pending' | 'dispatched' | 'settled' | 'released' | 'expired_assumed_consumed' | 'expired_undispatched';
    actualTokens?: number;
  };
  const reservations = new Map<string, SimulatedReservation>();

  let idCounter = 1;

  function pruneExpired(nowMs: number, day: string) {
    for (const [, r] of reservations.entries()) {
      if ((r.status === 'pending' || r.status === 'dispatched') && r.expiresAtMs < nowMs) {
        if (r.status === 'dispatched') {
          // Conservative crash policy: charge reservedTokens to dailyTokens
          r.status = 'expired_assumed_consumed';
          r.actualTokens = r.reservedTokens;
          const currentTok = dailyTokens.get(day) ?? 0;
          dailyTokens.set(day, currentTok + r.reservedTokens);
        } else {
          // Never dispatched: clean up and decrement dailyRequests
          r.status = 'expired_undispatched';
          r.actualTokens = 0;
          const currentReqs = dailyRequests.get(day) ?? 1;
          dailyRequests.set(day, Math.max(0, currentReqs - 1));
        }
      }
    }
  }

  function getDayStartIso(now: Date): string {
    return getUtcDayStartIso(now);
  }

  return {
    getStats(now = new Date()) {
      const day = getDayStartIso(now);
      pruneExpired(now.getTime(), day);
      let activeReservedTokens = 0;
      for (const r of reservations.values()) {
        if ((r.status === 'pending' || r.status === 'dispatched') && r.expiresAtMs >= now.getTime()) {
          activeReservedTokens += r.reservedTokens;
        }
      }
      return {
        dailyRequests: dailyRequests.get(day) ?? 0,
        settledTokens: dailyTokens.get(day) ?? 0,
        activeReservedTokens,
        activeReservationCount: Array.from(reservations.values()).filter(
          (r) => r.status === 'pending' || r.status === 'dispatched'
        ).length,
      };
    },

    /** Creates an isolated worker client connected to this shared simulated database */
    createIsolateWorker(workerId: string) {
      return {
        workerId,
        async begin(input: {
          userId: string;
          capability: string;
          config: ProjectSpendingConfig;
          estimatedTokens: number;
          now?: Date;
        }): Promise<ProjectGuardDecision> {
          const now = input.now ?? new Date();
          const nowMs = now.getTime();
          const day = getDayStartIso(now);

          // 1. Emergency killswitch
          if (input.config.emergencyDisable) {
            return {
              allowed: false,
              code: 'ai_disabled',
              reason: 'emergency_disabled',
              message: 'AI services are temporarily disabled for maintenance.',
            };
          }

          pruneExpired(nowMs, day);

          const currentRequests = dailyRequests.get(day) ?? 0;
          if (
            input.config.maxDailyRequests &&
            input.config.maxDailyRequests > 0 &&
            currentRequests >= input.config.maxDailyRequests
          ) {
            return {
              allowed: false,
              code: 'quota_exceeded',
              reason: 'project_daily_request_limit_exceeded',
              message: 'AI daily request capacity reached for this project. Please try again tomorrow.',
            };
          }

          const settledTokens = dailyTokens.get(day) ?? 0;
          let activeReservedTokens = 0;
          for (const r of reservations.values()) {
            if ((r.status === 'pending' || r.status === 'dispatched') && r.expiresAtMs >= nowMs) {
              activeReservedTokens += r.reservedTokens;
            }
          }

          if (
            input.config.maxDailyTokens &&
            input.config.maxDailyTokens > 0 &&
            settledTokens + activeReservedTokens + input.estimatedTokens > input.config.maxDailyTokens
          ) {
            return {
              allowed: false,
              code: 'quota_exceeded',
              reason: 'project_daily_token_limit_exceeded',
              message: 'AI daily token capacity reached for this project. Please try again tomorrow.',
            };
          }

          // Atomically admit
          dailyRequests.set(day, currentRequests + 1);
          const reservationId = `res-${workerId}-${idCounter++}`;
          reservations.set(reservationId, {
            id: reservationId,
            userId: input.userId,
            capability: input.capability,
            reservedTokens: input.estimatedTokens,
            createdAtMs: nowMs,
            expiresAtMs: nowMs + 5 * 60 * 1000, // 5 minutes expiration
            status: 'pending',
          });

          let isDispatched = false;
          return {
            allowed: true,
            reservationId,
            isDispatched: () => isDispatched,
            dispatchReservation: async () => {
              isDispatched = true;
              const r = reservations.get(reservationId);
              if (r && r.status === 'pending') {
                r.status = 'dispatched';
              }
              return { ok: true };
            },
            releaseReservation: async () => {
              const r = reservations.get(reservationId);
              if (!r) return { ok: true };
              if (r.status === 'settled' || r.status === 'released' || r.status === 'expired_undispatched') return { ok: true };

              if (r.status === 'dispatched' || isDispatched) {
                // Safety guard: if dispatched, settle conservatively rather than erasing billable usage
                r.status = 'settled';
                r.actualTokens = input.estimatedTokens;
                const tok = dailyTokens.get(day) ?? 0;
                dailyTokens.set(day, tok + input.estimatedTokens);
                return { ok: true };
              }

              if (r.status === 'expired_assumed_consumed') {
                r.status = 'released';
                r.actualTokens = 0;
                const tok = dailyTokens.get(day) ?? 0;
                dailyTokens.set(day, Math.max(0, tok - r.reservedTokens));
                const reqs = dailyRequests.get(day) ?? 1;
                dailyRequests.set(day, Math.max(0, reqs - 1));
                return { ok: true };
              }

              r.status = 'released';
              r.actualTokens = 0;
              const reqs = dailyRequests.get(day) ?? 1;
              dailyRequests.set(day, Math.max(0, reqs - 1));
              return { ok: true };
            },
            settleReservation: async (actualTokens: number) => {
              const r = reservations.get(reservationId);
              if (!r) return { ok: true };
              if (r.status === 'settled' || r.status === 'released' || r.status === 'expired_undispatched') return { ok: true };

              if (r.status === 'expired_assumed_consumed') {
                const adjustment = actualTokens - r.reservedTokens;
                r.status = 'settled';
                r.actualTokens = actualTokens;
                const tok = dailyTokens.get(day) ?? 0;
                dailyTokens.set(day, Math.max(0, tok + adjustment));
                return { ok: true };
              }

              r.status = 'settled';
              r.actualTokens = actualTokens;
              const tok = dailyTokens.get(day) ?? 0;
              dailyTokens.set(day, tok + actualTokens);
              return { ok: true };
            },
          };
        },
      };
    },
  };
}
