/**
 * OpenAI-compatible embeddings adapter (server-only).
 * Reuses AI_PROVIDER_API_KEY + AI_PROVIDER_BASE_URL; does not use chat complete().
 */

import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from './bounds.ts';
import type {
  AiEmbeddingProvider,
  EmbeddingProviderFailure,
  EmbeddingProviderResult,
  EmbeddingProviderUsage,
} from './embeddingTypes.ts';

export type OpenAICompatibleEmbeddingConfig = {
  apiKey: string;
  baseUrl: string;
  /** Default fetch timeout when no AbortSignal provided (ms). */
  timeoutMs?: number;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

export function embeddingsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (/\/v1$/i.test(b)) return joinUrl(b, 'embeddings');
  return joinUrl(b, 'v1/embeddings');
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function fail(
  code: EmbeddingProviderFailure['code'],
  message: string,
  started: number,
  extra?: Partial<EmbeddingProviderFailure>,
): EmbeddingProviderFailure {
  return {
    ok: false,
    code,
    message,
    latencyMs: Date.now() - started,
    retryable: extra?.retryable ?? false,
    providerHttpStatus: extra?.providerHttpStatus,
    providerRequestId: extra?.providerRequestId,
  };
}

function parseUsage(raw: unknown): EmbeddingProviderUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const usage: EmbeddingProviderUsage = {};
  if (typeof o.prompt_tokens === 'number' && Number.isFinite(o.prompt_tokens) && o.prompt_tokens >= 0) {
    usage.inputTokens = Math.floor(o.prompt_tokens);
  }
  if (typeof o.total_tokens === 'number' && Number.isFinite(o.total_tokens) && o.total_tokens >= 0) {
    usage.totalTokens = Math.floor(o.total_tokens);
  }
  return usage.inputTokens !== undefined || usage.totalTokens !== undefined ? usage : undefined;
}

/**
 * Validate untrusted provider JSON into ordered float vectors.
 * Rejects NaN/Infinity, wrong length, missing/duplicate/extra indexes.
 */
export function validateEmbeddingsResponse(input: {
  body: unknown;
  expectedCount: number;
  expectedDimensions: number;
}):
  | { ok: true; embeddings: number[][]; model?: string; usage?: EmbeddingProviderUsage }
  | { ok: false; reason: string } {
  const { body, expectedCount, expectedDimensions } = input;
  if (!body || typeof body !== 'object') return { ok: false, reason: 'not_object' };
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.data)) return { ok: false, reason: 'missing_data' };
  if (o.data.length !== expectedCount) return { ok: false, reason: 'count_mismatch' };

  const byIndex = new Map<number, number[]>();
  for (const item of o.data) {
    if (!item || typeof item !== 'object') return { ok: false, reason: 'item_not_object' };
    const row = item as Record<string, unknown>;
    if (typeof row.index !== 'number' || !Number.isInteger(row.index)) {
      return { ok: false, reason: 'bad_index' };
    }
    if (row.index < 0 || row.index >= expectedCount) return { ok: false, reason: 'index_oob' };
    if (byIndex.has(row.index)) return { ok: false, reason: 'duplicate_index' };
    if (!Array.isArray(row.embedding)) return { ok: false, reason: 'missing_embedding' };
    if (row.embedding.length !== expectedDimensions) {
      return { ok: false, reason: 'wrong_dimensions' };
    }
    const vec: number[] = [];
    for (const n of row.embedding) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        return { ok: false, reason: 'non_finite' };
      }
      vec.push(n);
    }
    byIndex.set(row.index, vec);
  }

  if (byIndex.size !== expectedCount) return { ok: false, reason: 'missing_index' };
  const embeddings: number[][] = [];
  for (let i = 0; i < expectedCount; i++) {
    const v = byIndex.get(i);
    if (!v) return { ok: false, reason: 'missing_index' };
    embeddings.push(v);
  }

  const model = asNonEmptyString(o.model);
  const usage = parseUsage(o.usage);
  return { ok: true, embeddings, ...(model ? { model } : {}), ...(usage ? { usage } : {}) };
}

/** Privacy-safe embedding diagnostic log (no text/vectors/bodies). */
export function formatEmbeddingDiagnosticLog(input: {
  ok: boolean;
  code?: string;
  model: string;
  dimensions: number;
  inputCount: number;
  providerHttpStatus?: number;
  latencyMs: number;
  providerRequestId?: string;
}): string {
  return JSON.stringify({
    event: 'zikuk_ai_embedding',
    ok: input.ok,
    ...(input.code ? { code: input.code } : {}),
    model: input.model,
    dimensions: input.dimensions,
    inputCount: input.inputCount,
    ...(typeof input.providerHttpStatus === 'number'
      ? { providerHttpStatus: input.providerHttpStatus }
      : {}),
    latencyMs: input.latencyMs,
    ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
  });
}

export function createOpenAICompatibleEmbeddingProvider(
  config: OpenAICompatibleEmbeddingConfig,
): AiEmbeddingProvider {
  const timeoutMs = config.timeoutMs ?? 60_000;

  return {
    async embed(input): Promise<EmbeddingProviderResult> {
      const started = Date.now();
      if (!Array.isArray(input.inputs) || input.inputs.length === 0) {
        return fail('embedding_invalid_response', 'Empty embedding input.', started);
      }
      if (input.dimensions !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
        return fail('embedding_invalid_response', 'Unsupported embedding dimensions.', started);
      }
      for (const t of input.inputs) {
        if (typeof t !== 'string' || t.length === 0) {
          return fail('embedding_invalid_response', 'Invalid embedding input text.', started);
        }
      }

      const url = embeddingsUrl(config.baseUrl);
      const body = {
        model: input.model,
        input: input.inputs,
        dimensions: input.dimensions,
        encoding_format: 'float' as const,
      };

      let signal = input.signal;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (!signal) {
        const ctrl = new AbortController();
        signal = ctrl.signal;
        timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
        });
        const requestId = res.headers.get('x-request-id') ?? undefined;

        if (res.status === 429) {
          return fail('embedding_rate_limited', 'Embedding rate limited.', started, {
            retryable: true,
            providerHttpStatus: 429,
            providerRequestId: requestId,
          });
        }
        if (res.status === 401) {
          return fail('embedding_provider_unavailable', 'Embedding provider unauthorized.', started, {
            retryable: false,
            providerHttpStatus: 401,
            providerRequestId: requestId,
          });
        }
        if (res.status === 402) {
          return fail('embedding_quota_exceeded', 'Embedding quota exceeded.', started, {
            retryable: false,
            providerHttpStatus: 402,
            providerRequestId: requestId,
          });
        }
        if (res.status === 403) {
          return fail('embedding_provider_unavailable', 'Embedding provider forbidden.', started, {
            retryable: false,
            providerHttpStatus: 403,
            providerRequestId: requestId,
          });
        }
        if (!res.ok) {
          // Drain body without logging content
          try {
            await res.arrayBuffer();
          } catch {
            /* ignore */
          }
          const retryable = res.status >= 500;
          return fail(
            retryable ? 'embedding_provider_unavailable' : 'embedding_invalid_response',
            'Embedding provider error.',
            started,
            {
              retryable,
              providerHttpStatus: res.status,
              providerRequestId: requestId,
            },
          );
        }

        let json: unknown;
        try {
          json = await res.json();
        } catch {
          return fail('embedding_invalid_response', 'Embedding response not JSON.', started, {
            retryable: true,
            providerHttpStatus: res.status,
            providerRequestId: requestId,
          });
        }

        const validated = validateEmbeddingsResponse({
          body: json,
          expectedCount: input.inputs.length,
          expectedDimensions: input.dimensions,
        });
        if (!validated.ok) {
          return fail('embedding_invalid_response', 'Embedding response invalid.', started, {
            retryable: false,
            providerHttpStatus: res.status,
            providerRequestId: requestId,
          });
        }

        return {
          ok: true,
          embeddings: validated.embeddings,
          model: validated.model ?? input.model,
          dimensions: input.dimensions,
          usage: validated.usage,
          latencyMs: Date.now() - started,
          providerRequestId: requestId,
          retryable: false,
        };
      } catch (e) {
        const aborted =
          (e instanceof Error && e.name === 'AbortError') ||
          (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError');
        if (aborted) {
          return fail('embedding_timeout', 'Embedding request timed out.', started, {
            retryable: true,
          });
        }
        return fail('embedding_provider_unavailable', 'Embedding provider unreachable.', started, {
          retryable: true,
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
  };
}
