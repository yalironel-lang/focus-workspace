/**
 * Bound one chat completion inside the hosted Edge request idle timeout.
 *
 * Supabase hosted limits (https://supabase.com/docs/guides/functions/limits):
 * a response must be sent within 150s or the platform returns 504.
 * Wall clock is 150s on Free and 400s on paid plans, and it is shared by the
 * worker. The idle timeout is the tighter per-request ceiling on both plans.
 * supabase/config.toml does not override it.
 *
 * The deadline is measured from request start so auth, embeddings, and
 * retrieval consume the same budget. Headroom is reserved so grounding and
 * the JSON response can still be sent after the provider is aborted.
 */

import type { AiProvider, ProviderCompleteInput, ProviderResult } from './providerTypes.ts';

/** Hosted request idle timeout. Response must be sent before this elapses. */
export const EDGE_REQUEST_IDLE_TIMEOUT_MS = 150_000;

/** Time left for grounding, usage accounting, and the JSON response. */
export const GATEWAY_CHAT_RESPONSE_HEADROOM_MS = 20_000;

/** Skip the provider call when less than this remains. */
export const GATEWAY_CHAT_MIN_ATTEMPT_MS = 5_000;

export function chatAttemptBudgetMs(requestStartedAt: number, now = Date.now()): number {
  const deadline =
    requestStartedAt + EDGE_REQUEST_IDLE_TIMEOUT_MS - GATEWAY_CHAT_RESPONSE_HEADROOM_MS;
  return deadline - now;
}

export type ChatAttempt = {
  signal: AbortSignal;
  budgetMs: number;
  /** Remaining time cannot fit a provider call plus cleanup. */
  skipped: boolean;
  parentAborted: boolean;
  timedOut: () => boolean;
  dispose: () => void;
};

export function openChatAttempt(input: {
  requestStartedAt: number;
  parent?: AbortSignal;
  now?: number;
}): ChatAttempt {
  const budgetMs = chatAttemptBudgetMs(input.requestStartedAt, input.now);
  const ctrl = new AbortController();
  let timedOut = false;

  if (input.parent?.aborted) {
    ctrl.abort();
    return {
      signal: ctrl.signal,
      budgetMs,
      skipped: false,
      parentAborted: true,
      timedOut: () => false,
      dispose() {},
    };
  }

  if (budgetMs < GATEWAY_CHAT_MIN_ATTEMPT_MS) {
    return {
      signal: ctrl.signal,
      budgetMs,
      skipped: true,
      parentAborted: false,
      timedOut: () => false,
      dispose() {},
    };
  }

  const onParent = () => ctrl.abort();
  input.parent?.addEventListener('abort', onParent);
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, budgetMs);

  return {
    signal: ctrl.signal,
    budgetMs,
    skipped: false,
    parentAborted: false,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      input.parent?.removeEventListener('abort', onParent);
    },
  };
}

const TIMEOUT_RESULT: ProviderResult = {
  ok: false,
  code: 'provider_timeout',
  message: 'The model provider timed out.',
  latencyMs: 0,
};

/**
 * One provider call. A deadline abort or a parent abort becomes one
 * provider_timeout result. The timer is cleared before the caller continues,
 * so cleanup cannot start a second call.
 */
export async function completeChatWithinDeadline(
  provider: AiProvider,
  input: ProviderCompleteInput,
  timing: { requestStartedAt?: number; parent?: AbortSignal },
): Promise<ProviderResult> {
  if (timing.requestStartedAt === undefined) {
    return provider.complete({ ...input, signal: timing.parent ?? input.signal });
  }
  const attempt = openChatAttempt({
    requestStartedAt: timing.requestStartedAt,
    parent: timing.parent ?? input.signal,
  });
  try {
    if (attempt.parentAborted || attempt.skipped) {
      return { ...TIMEOUT_RESULT, latencyMs: Math.max(0, Date.now() - timing.requestStartedAt) };
    }
    return await provider.complete({ ...input, signal: attempt.signal });
  } finally {
    attempt.dispose();
  }
}
