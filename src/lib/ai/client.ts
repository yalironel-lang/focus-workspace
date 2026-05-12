import { computeAIAvailability } from './availability';
import { resolveBaseUrl } from './config';
import { chatCompletionsUrl, postChatCompletion } from './providers/openaiCompatible';
import { loadAIUserSettings } from './storage';
import type { AIUserSettings, AICompletionResult, ChatMessage } from './types';

export { resolveBaseUrl } from './config';

function openRouterHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return {
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Focus Workspace',
  };
}

export function mapFetchError(status: number, message: string): AICompletionResult {
  if (status === 429) return { ok: false, error: 'Rate limited. Try again in a moment.', code: 'rate_limit', status };
  if (status === 401 || status === 403)
    return { ok: false, error: 'Key rejected or forbidden. Check Intelligence → Advanced.', code: 'bad_response', status };
  if (status === 0) {
    if (/abort|cancel/i.test(message)) return { ok: false, error: message, code: 'abort' };
    return { ok: false, error: message || 'Network error.', code: 'network' };
  }
  return { ok: false, error: message || 'Something went wrong.', code: 'bad_response', status };
}

/**
 * Single non-streaming completion. User-triggered only; no background calls.
 */
export async function aiComplete(params: {
  messages: ChatMessage[];
  settingsOverride?: AIUserSettings;
  signal?: AbortSignal;
}): Promise<AICompletionResult> {
  const settings = params.settingsOverride ?? loadAIUserSettings();
  const avail = computeAIAvailability(settings);
  if (!avail.enabled) return { ok: false, error: avail.unavailableReason ?? 'Cloud model help is off.', code: 'off' };
  if (!avail.configured) return { ok: false, error: avail.unavailableReason ?? 'Cloud model help is not set up.', code: 'no_key' };
  const base = resolveBaseUrl(settings).trim();
  if (!base) return { ok: false, error: 'Set a base URL for custom provider.', code: 'no_key' };
  const url = chatCompletionsUrl(base);
  const extra = settings.providerId === 'openrouter' ? openRouterHeaders() : undefined;
  const r = await postChatCompletion({
    url,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim() || 'gpt-4o-mini',
    messages: params.messages,
    signal: params.signal,
    extraHeaders: extra,
  });
  if (r.ok) return { ok: true, text: r.text };
  return mapFetchError(r.status, r.error);
}
