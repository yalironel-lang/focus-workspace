/**
 * Server-only Google Gemini provider adapter.
 * Do not import this into the browser bundle.
 */

import type {
  AiProvider,
  ProviderCompleteInput,
  ProviderFailureDiagnostics,
  ProviderResult,
  ProviderUsage,
} from './providerTypes.ts';
import type { ChatMessage } from './promptExplainSelection.ts';
import type { OpenAiVisionContentPart } from './visualCapture/visionModelCompatibility.ts';
import { createOpenAICompatibleProvider, type OpenAICompatibleConfig } from './providerOpenAICompatible.ts';
import { estimateCostUsdMicros } from './aiPricing.ts';

/** Conservative estimated floor cost per gemini-3.6-flash attempt: 2000 input @ $1.50/M + 8192 output @ $7.50/M = 65,000 USD micros ($0.065) */
export const CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS = 65_000;

/**
 * Estimates input tokens for an attempt from prompt characters and visual captures.
 */
export function estimateAttemptInputTokens(input: ProviderCompleteInput): number {
  let promptChars = 0;
  let imageParts = 0;
  for (const msg of input.messages) {
    if (typeof msg.content === 'string') {
      promptChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as OpenAiVisionContentPart[]) {
        if (part.type === 'text' && part.text) {
          promptChars += part.text.length;
        } else if (part.type === 'image_url') {
          imageParts++;
        }
      }
    }
  }
  return Math.max(500, Math.ceil(promptChars / 2) + imageParts * 1000);
}

/**
 * Estimates conservative maximum tokens for a single attempt,
 * covering both estimated input tokens and full configured/default output tokens
 * (including potential reasoning/thoughts tokens).
 */
export function estimateAttemptMaxTokens(input: ProviderCompleteInput): number {
  const inputTokens = estimateAttemptInputTokens(input);
  const maxOutputTokens = input.maxTokens && input.maxTokens > 0 ? input.maxTokens : 8192;
  return inputTokens + maxOutputTokens;
}

/**
 * Dynamically calculates the conservative cost reservation for a provider attempt.
 * Does not assume a fixed 2,000 input tokens ceiling; inspects actual input messages,
 * accounting for large PDF excerpts (up to 4,500 chars) and visual captures (up to 512KB).
 * Floor is set to CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS (65,000 micros).
 */
export function estimateConservativeAttemptCostMicros(input: ProviderCompleteInput): number {
  let promptChars = 0;
  let imageParts = 0;
  for (const msg of input.messages) {
    if (typeof msg.content === 'string') {
      promptChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as OpenAiVisionContentPart[]) {
        if (part.type === 'text' && part.text) {
          promptChars += part.text.length;
        } else if (part.type === 'image_url') {
          imageParts++;
        }
      }
    }
  }
  // Conservative token estimation: 1 token per 2 characters (standard text is ~4 chars/token) + 1,000 tokens per visual capture tile
  const estimatedInputTokens = Math.max(2000, Math.ceil(promptChars / 2) + imageParts * 1000);
  const maxOutputTokens = input.maxTokens || 8192;

  // Pricing: input $1.50/M, output $7.50/M
  const inputMicros = Math.ceil((estimatedInputTokens * 1_500_000) / 1_000_000);
  const outputMicros = Math.ceil((maxOutputTokens * 7_500_000) / 1_000_000);
  return Math.max(CONSERVATIVE_GEMINI_ATTEMPT_COST_USD_MICROS, inputMicros + outputMicros);
}

export type GeminiHttpStatusClassification =
  | { retryable: true; reason: 'capacity_shedding_503' }
  | {
      retryable: false;
      reason:
        | 'success_200'
        | 'rate_limit_429'
        | 'auth_error'
        | 'client_error'
        | 'server_error_non_503';
    };

export function classifyGeminiHttpStatus(status: number): GeminiHttpStatusClassification {
  if (status === 200) {
    return { retryable: false, reason: 'success_200' };
  }
  if (status === 503) {
    return { retryable: true, reason: 'capacity_shedding_503' };
  }
  if (status === 429) {
    return { retryable: false, reason: 'rate_limit_429' };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, reason: 'auth_error' };
  }
  if (status >= 400 && status < 500) {
    return { retryable: false, reason: 'client_error' };
  }
  return { retryable: false, reason: 'server_error_non_503' };
}

export function calculateBoundedJitterBackoff(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 10000,
  jitterRatio = 0.2,
  randomFn: () => number = Math.random,
): number {
  const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = (randomFn() * 2 - 1) * jitterRatio * expDelay;
  return Math.max(0, Math.floor(expDelay + jitter));
}

export async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}

export function mergeUsage(target: ProviderUsage, addition?: ProviderUsage): ProviderUsage {
  if (!addition) return target;
  return {
    inputTokens: (target.inputTokens ?? 0) + (addition.inputTokens ?? 0),
    outputTokens: (target.outputTokens ?? 0) + (addition.outputTokens ?? 0),
    reasoningTokens: (target.reasoningTokens ?? 0) + (addition.reasoningTokens ?? 0),
    totalTokens: (target.totalTokens ?? 0) + (addition.totalTokens ?? 0),
  };
}

export type GeminiResilienceConfig = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  minAttemptBudgetMs?: number;
  maxSpendAllowanceUsdMicros?: number;
  checkSpendAllowance?: (estimatedCostUsdMicros: number) => boolean;
  /** Maximum cumulative tokens allowed across all attempts of a single request */
  maxCumulativeTokens?: number;
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  jitterRatio?: number;
  randomFn?: () => number;
};

export type GeminiProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  resilience?: GeminiResilienceConfig;
  /** Optional configurable thinking budget in tokens. When undefined, dynamic thinking is preserved. */
  thinkingBudget?: number;
};


export function isThoughtPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false;
  const p = part as Record<string, unknown>;
  return Boolean(p.thought || p.type === 'thought');
}

export function extractNonThoughtText(candidate: unknown): string {
  if (!candidate || typeof candidate !== 'object') return '';
  const c = candidate as { content?: { parts?: unknown[] } };
  const parts = c.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => typeof (p as Record<string, unknown>).text === 'string' && !isThoughtPart(p))
    .map((p) => String((p as Record<string, unknown>).text))
    .join('');
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asNonNegInt(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.floor(v);
  return n >= 0 ? n : undefined;
}

export function normalizeGeminiUsage(usageMetadata: unknown): ProviderUsage | undefined {
  if (!usageMetadata || typeof usageMetadata !== 'object') return undefined;
  const u = usageMetadata as Record<string, unknown>;
  const inputTokens = asNonNegInt(u.promptTokenCount);
  const candidatesTokens = asNonNegInt(u.candidatesTokenCount);
  const thoughtsTokens = asNonNegInt(u.thoughtsTokenCount) ?? 0;
  const totalTokens = asNonNegInt(u.totalTokenCount);

  if (
    inputTokens === undefined &&
    candidatesTokens === undefined &&
    thoughtsTokens === 0 &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  const normalized: ProviderUsage = {};
  if (inputTokens !== undefined) normalized.inputTokens = inputTokens;
  if (thoughtsTokens > 0) normalized.reasoningTokens = thoughtsTokens;

  const inputSum = inputTokens ?? 0;
  const candSum = candidatesTokens ?? 0;

  // Mathematical detection of Gemini API token semantics:
  // In real Gemini v1beta API: totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount
  // (candidatesTokenCount counts visible response tokens and excludes thoughts).
  // If inputSum + candSum === totalTokens, candidatesTokenCount already encompasses thoughtsTokenCount.
  if (totalTokens !== undefined && inputTokens !== undefined && candidatesTokens !== undefined) {
    if (inputSum + candSum === totalTokens) {
      normalized.outputTokens = candSum;
    } else {
      normalized.outputTokens = candSum + thoughtsTokens;
    }
    normalized.totalTokens = totalTokens;
  } else {
    normalized.outputTokens = candSum + thoughtsTokens;
    normalized.totalTokens = totalTokens ?? (inputSum + normalized.outputTokens);
  }

  return normalized;
}

export function buildGeminiFailureDiagnostics(input: {
  status: number;
  model: string;
  requestId?: string | null;
  errorType?: unknown;
  errorCode?: unknown;
  finishReason?: unknown;
  emptyText?: boolean;
}): ProviderFailureDiagnostics {
  const diagnostics: ProviderFailureDiagnostics = {
    providerHttpStatus: input.status,
    model: input.model,
    endpoint: 'gemini_generate_content',
  };
  const type = asNonEmptyString(input.errorType);
  const code = asNonEmptyString(input.errorCode);
  const requestId = asNonEmptyString(input.requestId ?? undefined);
  const finishReason = asNonEmptyString(input.finishReason);
  if (type) diagnostics.providerErrorType = type;
  if (code) diagnostics.providerErrorCode = code;
  if (requestId) diagnostics.requestId = requestId;
  if (finishReason) diagnostics.finishReason = finishReason;
  if (input.emptyText) diagnostics.emptyText = true;
  return diagnostics;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export type GeminiGenerateContentBody = {
  contents: GeminiContent[];
  systemInstruction?: { parts: [{ text: string }] };
  generationConfig: {
    maxOutputTokens: number;
    temperature?: number;
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  };
};


/**
 * Converts standard ChatMessage[] into Gemini's generateContent payload format.
 * Separates system messages into systemInstruction and parses image_url data URIs.
 */
export function buildGeminiRequestBody(input: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  thinkingBudget?: number;
}): GeminiGenerateContentBody {
  let systemText = '';
  const contents: GeminiContent[] = [];

  for (const msg of input.messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : '';
      systemText = systemText ? `${systemText}\n\n${text}` : text;
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];

    if (typeof msg.content === 'string') {
      if (msg.content.trim()) {
        parts.push({ text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as OpenAiVisionContentPart[]) {
        if (part.type === 'text') {
          if (part.text && part.text.trim()) {
            parts.push({ text: part.text });
          }
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  // Gemini requires at least one content entry
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '' }] });
  }

  const body: GeminiGenerateContentBody = {
    contents,
    generationConfig: {
      maxOutputTokens: input.maxTokens,
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(input.thinkingBudget !== undefined && input.thinkingBudget >= 0
        ? { thinkingConfig: { thinkingBudget: input.thinkingBudget } }
        : {}),
    },
  };


  if (systemText.trim()) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  return body;
}

async function callGeminiSingleAttempt(
  input: ProviderCompleteInput,
  config: GeminiProviderConfig,
  signal?: AbortSignal,
): Promise<ProviderResult> {
  const started = Date.now();
  const baseUrl = (config.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;

  try {
    const bodyPayload = buildGeminiRequestBody({
      messages: input.messages,
      maxTokens: input.maxTokens,
      temperature: 0.0,
      thinkingBudget: config.thinkingBudget,
    });


    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify(bodyPayload),
    });

    const latencyMs = Date.now() - started;
    const requestId = res.headers.get('x-request-id') || res.headers.get('request-id');

    let json: Record<string, unknown> = {};
    let jsonOk = true;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      jsonOk = false;
    }

    if (!jsonOk) {
      return {
        ok: false,
        code: 'bad_response',
        message: 'Invalid JSON response from Gemini provider.',
        status: res.status,
        latencyMs,
        providerRequestId: requestId ?? undefined,
        diagnostics: buildGeminiFailureDiagnostics({
          status: res.status,
          model: input.model,
          requestId,
        }),
      };
    }

    const usage = normalizeGeminiUsage(json.usageMetadata);

    if (res.status === 429) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'The model provider rate-limited this request.',
        status: 429,
        latencyMs,
        providerRequestId: requestId ?? undefined,
        usage,
        diagnostics: buildGeminiFailureDiagnostics({
          status: 429,
          model: input.model,
          requestId,
          errorCode: 'RESOURCE_EXHAUSTED',
        }),
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        code: res.status >= 500 ? 'provider_unavailable' : 'bad_response',
        message: 'The model provider could not complete this request.',
        status: res.status,
        latencyMs,
        providerRequestId: requestId ?? undefined,
        usage,
        diagnostics: buildGeminiFailureDiagnostics({
          status: res.status,
          model: input.model,
          requestId,
        }),
      };
    }

    const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
    const candidate = candidates?.[0];
    const finishReason = candidate?.finishReason ? String(candidate.finishReason) : undefined;
    const text = extractNonThoughtText(candidate).trim();

    if (!text) {
      const isLengthExhaustion = finishReason === 'MAX_TOKENS';
      return {
        ok: false,
        code: isLengthExhaustion ? 'output_budget_exhausted' : 'bad_response',
        message: isLengthExhaustion
          ? 'Model output token budget exhausted.'
          : 'Empty response from model provider.',
        status: res.status,
        latencyMs,
        providerRequestId: requestId ?? undefined,
        usage,
        diagnostics: buildGeminiFailureDiagnostics({
          status: res.status,
          model: input.model,
          requestId,
          finishReason,
          emptyText: true,
        }),
      };
    }

    return {
      ok: true,
      text,
      usage,
      rawModel: input.model,
      latencyMs,
      providerRequestId: requestId ?? undefined,
      ...(finishReason === 'MAX_TOKENS' ? { generationIncomplete: true } : {}),
    };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const name = e instanceof Error ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError' || /abort|timeout/i.test(msg)) {
      return {
        ok: false,
        code: 'provider_timeout',
        message: 'The model provider timed out.',
        latencyMs,
      };
    }
    return {
      ok: false,
      code: 'provider_unavailable',
      message: 'The model provider is unavailable.',
      latencyMs,
    };
  }
}

export function createGeminiProvider(config: GeminiProviderConfig): AiProvider {
  const maxAttempts = config.resilience?.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error('INVALID_ATTEMPT_LIMIT');
  }
  const baseDelayMs = config.resilience?.baseDelayMs ?? 1000;
  const maxDelayMs = config.resilience?.maxDelayMs ?? 10000;
  const minAttemptBudgetMs = config.resilience?.minAttemptBudgetMs ?? 5000;
  const sleepFn = config.resilience?.sleepFn ?? sleepWithSignal;
  const randomFn = config.resilience?.randomFn ?? Math.random;

  return {
    async complete(input: ProviderCompleteInput): Promise<ProviderResult> {
      const started = Date.now();
      let cumulativeUsage: ProviderUsage = {};
      let lastResult: ProviderResult | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // 1. Check parent cancellation
        if (input.signal?.aborted) {
          return {
            ok: false,
            code: 'provider_timeout',
            message: 'The model provider timed out.',
            latencyMs: Date.now() - started,
            usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
            retryAttempts: attempt - 1,
          };
        }

        // 2. Check remaining request deadline
        if (input.requestStartedAt !== undefined) {
          const elapsedSinceStart = Date.now() - input.requestStartedAt;
          const totalDeadline = input.deadlineMs ?? (150_000 - 20_000);
          const remainingMs = totalDeadline - elapsedSinceStart;
          if (remainingMs < minAttemptBudgetMs) {
            return {
              ok: false,
              code: 'provider_timeout',
              message: 'Request deadline exceeded before provider attempt.',
              latencyMs: Date.now() - started,
              usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
              retryAttempts: attempt - 1,
            };
          }
        }

        // 3. Check spend allowance before attempt
        // Conservative cost accounts for all previous dispatches plus the upcoming attempt
        // Dynamic estimation accounts for large context windows, PDF excerpts, and visual captures
        // Do not assume 503 requests are free
        const nextAttemptCost = estimateConservativeAttemptCostMicros(input);
        const previousConservativeCost = (attempt - 1) * nextAttemptCost;
        const currentActualCost = estimateCostUsdMicros(input.model, cumulativeUsage) ?? 0;
        const currentSpentCost = Math.max(previousConservativeCost, currentActualCost);
        const projectedTotalCost = currentSpentCost + nextAttemptCost;

        if (config.resilience?.maxSpendAllowanceUsdMicros !== undefined) {
          if (projectedTotalCost > config.resilience.maxSpendAllowanceUsdMicros) {
            return {
              ok: false,
              code: 'provider_unavailable',
              message: 'Spending allowance exceeded before retry attempt.',
              latencyMs: Date.now() - started,
              usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
              retryAttempts: attempt - 1,
            };
          }
        }
        if (config.resilience?.checkSpendAllowance) {
          if (!config.resilience.checkSpendAllowance(projectedTotalCost)) {
            return {
              ok: false,
              code: 'provider_unavailable',
              message: 'Spending allowance guard rejected retry attempt.',
              latencyMs: Date.now() - started,
              usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
              retryAttempts: attempt - 1,
            };
          }
        }

        // 3.5 Check estimated cumulative allowance before EVERY attempt.
        // This estimate is not an authoritative provider input-token proof.
        // Before launching a retry, account conservatively for:
        // 1. Observed cumulative tokens or full previous-attempt allowances when unobservable
        // 2. Maximum possible input AND output tokens for the next attempt
        if (config.resilience?.maxCumulativeTokens !== undefined) {
          const priorDispatches = attempt - 1;
          const estimatedPriorMaxTokens = priorDispatches * estimateAttemptMaxTokens(input);
          const conservativePriorTokens = Math.max(cumulativeUsage.totalTokens ?? 0, estimatedPriorMaxTokens);
          const nextAttemptMaxTokens = estimateAttemptMaxTokens(input);
          const projectedTotalTokens = conservativePriorTokens + nextAttemptMaxTokens;

          if (!Number.isSafeInteger(config.resilience.maxCumulativeTokens) || config.resilience.maxCumulativeTokens <= 0
              || projectedTotalTokens > config.resilience.maxCumulativeTokens) {
            return {
              ok: false,
              code: 'provider_unavailable',
              message: 'Token reservation allowance exceeded before retry attempt.',
              latencyMs: Date.now() - started,
              usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
              retryAttempts: attempt - 1,
            };
          }
        }

        // 4. Dispatch attempt
        const result = await callGeminiSingleAttempt(input, config, input.signal);
        cumulativeUsage = mergeUsage(cumulativeUsage, result.usage);
        lastResult = result;

        // 5. On success -> return immediately
        if (result.ok) {
          return {
            ...result,
            usage: cumulativeUsage.totalTokens ? cumulativeUsage : result.usage,
            latencyMs: Date.now() - started,
            retryAttempts: attempt,
          };
        }

        // 6. Stop immediately if not HTTP 503 or max attempts reached
        const is503 = result.status === 503 || result.diagnostics?.providerHttpStatus === 503;
        if (!is503 || attempt >= maxAttempts) {
          return {
            ...result,
            usage: cumulativeUsage.totalTokens ? cumulativeUsage : result.usage,
            latencyMs: Date.now() - started,
            retryAttempts: attempt,
          };
        }

        // 7. Calculate bounded jitter backoff
        const delayMs = calculateBoundedJitterBackoff(
          attempt,
          baseDelayMs,
          maxDelayMs,
          config.resilience?.jitterRatio ?? 0.2,
          randomFn,
        );

        // Check if remaining deadline allows sleeping + minAttemptBudgetMs
        if (input.requestStartedAt !== undefined) {
          const elapsedSinceStart = Date.now() - input.requestStartedAt;
          const totalDeadline = input.deadlineMs ?? (150_000 - 20_000);
          const remainingMs = totalDeadline - elapsedSinceStart;
          if (remainingMs - delayMs < minAttemptBudgetMs) {
            return {
              ...result,
              usage: cumulativeUsage.totalTokens ? cumulativeUsage : result.usage,
              latencyMs: Date.now() - started,
              retryAttempts: attempt,
            };
          }
        }

        // 8. Sleep with cancellation signal
        try {
          await sleepFn(delayMs, input.signal);
        } catch {
          return {
            ok: false,
            code: 'provider_timeout',
            message: 'The model provider timed out.',
            latencyMs: Date.now() - started,
            usage: cumulativeUsage.totalTokens ? cumulativeUsage : undefined,
            retryAttempts: attempt,
          };
        }
      }

      return lastResult ?? {
        ok: false,
        code: 'provider_unavailable',
        message: 'The model provider is unavailable.',
        latencyMs: Date.now() - started,
        retryAttempts: maxAttempts,
      };
    },
  };
}

export type FallbackAuditEvent = {
  timestamp: string;
  originalModel: string;
  fallbackModel: string;
  reason: 'gemini_503_exhausted';
  geminiAttempts: number;
  geminiDiagnostics?: ProviderFailureDiagnostics;
  geminiUsage?: ProviderUsage;
};

export type CompositeProviderConfig = {
  openAi?: OpenAICompatibleConfig;
  gemini?: GeminiProviderConfig;
  /** Strictly false by default. When true, falls back to OpenAI only upon Gemini 503 exhaustion. */
  enableFallback?: boolean;
  /** Target model for fallback. Defaults to 'gpt-4o-mini'. */
  fallbackModel?: string;
  /** Audit log callback invoked when fallback is triggered. */
  onFallbackAudit?: (event: FallbackAuditEvent) => void;
};

export function createCompositeProvider(config: CompositeProviderConfig): AiProvider {
  const openAiProvider = config.openAi?.apiKey
    ? createOpenAICompatibleProvider({
        apiKey: config.openAi.apiKey,
        baseUrl: config.openAi.baseUrl?.trim() || 'https://api.openai.com',
      })
    : null;
  const geminiProvider = config.gemini?.apiKey
    ? createGeminiProvider(config.gemini)
    : null;

  return {
    async complete(input: ProviderCompleteInput): Promise<ProviderResult> {
      if (input.model.trim().toLowerCase().startsWith('gemini-')) {
        if (!geminiProvider) {
          return {
            ok: false,
            code: 'provider_unavailable',
            message: 'Gemini provider is not configured.',
            latencyMs: 0,
          };
        }

        const geminiResult = await geminiProvider.complete(input);
        if (geminiResult.ok) {
          return geminiResult;
        }

        // Safe Fallback Circuit-Breaker: STRICTLY disabled by default
        if (!config.enableFallback) {
          return geminiResult;
        }

        // Only trigger on 503 exhaustion; never on 400, 401, 403, 404, 429, safety blocks, or length exhaustion
        const is503 = geminiResult.status === 503 || geminiResult.diagnostics?.providerHttpStatus === 503;
        if (!is503 || !openAiProvider) {
          return geminiResult;
        }

        const fallbackModel = config.fallbackModel ?? 'gpt-4o-mini';

        // Audit log event
        if (config.onFallbackAudit) {
          config.onFallbackAudit({
            timestamp: new Date().toISOString(),
            originalModel: input.model,
            fallbackModel,
            reason: 'gemini_503_exhausted',
            geminiAttempts: geminiResult.retryAttempts ?? 1,
            geminiDiagnostics: geminiResult.diagnostics,
            geminiUsage: geminiResult.usage,
          });
        }

        // Check remaining deadline before dispatching fallback
        if (input.requestStartedAt !== undefined) {
          const elapsed = Date.now() - input.requestStartedAt;
          const totalDeadline = input.deadlineMs ?? (150_000 - 20_000);
          const remainingMs = totalDeadline - elapsed;
          if (remainingMs < 5000) {
            return geminiResult;
          }
        }

        // Dispatch fallback to OpenAI
        const fallbackResult = await openAiProvider.complete({
          ...input,
          model: fallbackModel,
          maxTokens: Math.min(input.maxTokens, 4096),
        });

        // Merge usages across both providers for full transparency
        const mergedUsage = mergeUsage(geminiResult.usage ?? {}, fallbackResult.usage);

        if (fallbackResult.ok) {
          return {
            ...fallbackResult,
            usage: mergedUsage.totalTokens ? mergedUsage : fallbackResult.usage,
            latencyMs: (geminiResult.latencyMs || 0) + fallbackResult.latencyMs,
            fallbackTriggered: true,
            originalModel: input.model,
            retryAttempts: geminiResult.retryAttempts,
          };
        }

        return {
          ...fallbackResult,
          usage: mergedUsage.totalTokens ? mergedUsage : fallbackResult.usage,
          latencyMs: (geminiResult.latencyMs || 0) + fallbackResult.latencyMs,
          fallbackTriggered: true,
          originalModel: input.model,
          retryAttempts: geminiResult.retryAttempts,
        };
      }

      if (!openAiProvider) {
        return {
          ok: false,
          code: 'provider_unavailable',
          message: 'OpenAI provider is not configured.',
          latencyMs: 0,
        };
      }
      return openAiProvider.complete(input);
    },
  };
}

