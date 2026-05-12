import type { AIUserSettings } from './types';

export function resolveBaseUrl(settings: AIUserSettings): string {
  switch (settings.providerId) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'custom':
      return settings.baseUrl.trim() || '';
    default:
      return 'https://api.openai.com/v1';
  }
}
