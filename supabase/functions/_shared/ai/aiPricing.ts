/**
 * M0.4 — single server-side pricing abstraction.
 * Tokens remain durable truth. Unknown model → null estimate (never guess).
 */

export type TokenUsageForPricing = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

/**
 * Explicit per-model USD micros per 1M tokens.
 * Empty by default — populate only from authoritative config/ops, never invent.
 *
 * Shape: { inputPer1M, outputPer1M } in USD micros (1 USD = 1_000_000 micros).
 */
export type ModelPriceMicrosPer1M = {
  inputPer1M: number;
  outputPer1M: number;
};

/** Authoritative map — intentionally empty until ops supplies verified prices. */
export const AI_MODEL_PRICE_USD_MICROS_PER_1M: Readonly<
  Record<string, ModelPriceMicrosPer1M>
> = Object.freeze({});

/**
 * Estimate cost in USD micros. Returns null when pricing is unknown or usage incomplete.
 */
export function estimateCostUsdMicros(
  model: string | null | undefined,
  usage: TokenUsageForPricing,
  priceTable: Readonly<Record<string, ModelPriceMicrosPer1M>> = AI_MODEL_PRICE_USD_MICROS_PER_1M,
): number | null {
  if (!model || typeof model !== 'string') return null;
  const price = priceTable[model];
  if (!price) return null;

  const input = typeof usage.inputTokens === 'number' ? usage.inputTokens : null;
  const output = typeof usage.outputTokens === 'number' ? usage.outputTokens : null;
  if (input === null && output === null) return null;

  let micros = 0;
  if (input !== null) {
    micros += Math.round((input * price.inputPer1M) / 1_000_000);
  }
  if (output !== null) {
    micros += Math.round((output * price.outputPer1M) / 1_000_000);
  }
  return micros >= 0 ? micros : null;
}
