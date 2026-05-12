import { DEFAULT_AI_SETTINGS, type AIUserSettings } from './types';

export const AI_SETTINGS_STORAGE_KEY = 'fw_ai_user_settings_v1';

export function emitIntelligenceChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('fw-intelligence-changed'));
}

export function loadAIUserSettings(): AIUserSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const o = JSON.parse(raw) as Record<string, unknown>;
    const enabled = typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_AI_SETTINGS.enabled;
    const pid = o.providerId;
    const providerId =
      pid === 'openrouter' || pid === 'custom' || pid === 'openai' ? pid : DEFAULT_AI_SETTINGS.providerId;
    const apiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
    const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl : '';
    const model = typeof o.model === 'string' && o.model.trim() ? o.model.trim() : DEFAULT_AI_SETTINGS.model;
    return { enabled, providerId, apiKey, baseUrl, model };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAIUserSettings(next: AIUserSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    emitIntelligenceChanged();
  } catch {
    /* quota */
  }
}
