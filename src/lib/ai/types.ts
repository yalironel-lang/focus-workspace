/** User-chosen backend; all use OpenAI-compatible chat completions for Phase 1. */
export type AIProviderId = 'openai' | 'openrouter' | 'custom';

export interface AIUserSettings {
  /** Master switch — app works fully when false. */
  enabled: boolean;
  providerId: AIProviderId;
  /** Stored only in localStorage on this device. */
  apiKey: string;
  /** Used when providerId is `custom` (OpenAI-compatible base, e.g. http://localhost:11434/v1). */
  baseUrl: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AIUserSettings = {
  enabled: false,
  providerId: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
};

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AIErrorCode = 'off' | 'no_key' | 'network' | 'rate_limit' | 'bad_response' | 'abort' | 'unknown';

export type AICompletionResult =
  | { ok: true; text: string }
  | { ok: false; error: string; code?: AIErrorCode; status?: number };

export interface AIAvailability {
  enabled: boolean;
  configured: boolean;
  /** Active provider id (OpenAI-compatible for Phase 1). */
  provider: AIProviderId;
  model: string;
  baseUrlResolved: string;
  /** When optional cloud model help cannot run; local Intelligence is unaffected. */
  unavailableReason: string | null;
}
