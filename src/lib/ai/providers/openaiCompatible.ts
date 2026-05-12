import type { ChatMessage } from '../types';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

/** Normalize user/base to chat completions URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (/\/v1$/i.test(b)) return joinUrl(b, 'chat/completions');
  return joinUrl(b, 'v1/chat/completions');
}

export interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function postChatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
}): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {
  const { url, apiKey, model, messages, signal, extraHeaders } = params;
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 1200 }),
    });
    const status = res.status;
    let json: ChatCompletionResponse;
    try {
      json = (await res.json()) as ChatCompletionResponse;
    } catch {
      return { ok: false, error: 'Invalid response from server.', status };
    }
    if (!res.ok) {
      const msg = json.error?.message ?? res.statusText ?? 'Request failed';
      return { ok: false, error: msg, status };
    }
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return { ok: false, error: 'Empty response from model.', status };
    return { ok: true, text };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Cancelled.', status: 0 };
    }
    return { ok: false, error: err, status: 0 };
  }
}
