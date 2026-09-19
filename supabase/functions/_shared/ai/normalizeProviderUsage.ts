/**
 * M0.4 — normalize OpenAI-compatible usage into provider-independent fields.
 */

export type NormalizedProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

function asNonNegInt(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.floor(v);
  return n >= 0 ? n : undefined;
}

/**
 * Extract usage from a raw chat-completions-style JSON body.
 * Safe when fields are missing; never throws on shape variance.
 */
export function normalizeProviderUsage(rawUsage: unknown): NormalizedProviderUsage | undefined {
  if (!rawUsage || typeof rawUsage !== 'object') return undefined;
  const u = rawUsage as Record<string, unknown>;

  const inputTokens = asNonNegInt(u.prompt_tokens);
  const outputTokens = asNonNegInt(u.completion_tokens);
  const totalTokens = asNonNegInt(u.total_tokens);

  let reasoningTokens: number | undefined;
  const details = u.completion_tokens_details;
  if (details && typeof details === 'object') {
    reasoningTokens = asNonNegInt((details as Record<string, unknown>).reasoning_tokens);
  }

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    reasoningTokens === undefined
  ) {
    return undefined;
  }

  const normalized: NormalizedProviderUsage = {};
  if (inputTokens !== undefined) normalized.inputTokens = inputTokens;
  if (outputTokens !== undefined) normalized.outputTokens = outputTokens;
  if (reasoningTokens !== undefined) normalized.reasoningTokens = reasoningTokens;

  if (totalTokens !== undefined) {
    normalized.totalTokens = totalTokens;
  } else if (inputTokens !== undefined || outputTokens !== undefined) {
    normalized.totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  }

  return normalized;
}
