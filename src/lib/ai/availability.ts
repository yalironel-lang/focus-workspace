import { resolveBaseUrl } from './config';
import { loadAIUserSettings } from './storage';
import type { AIAvailability, AIUserSettings } from './types';

export function computeAIAvailability(settings: AIUserSettings): AIAvailability {
  const baseUrlResolved = resolveBaseUrl(settings);
  if (!settings.enabled) {
    return {
      enabled: false,
      configured: false,
      provider: settings.providerId,
      model: settings.model,
      baseUrlResolved,
      unavailableReason:
        'Cloud model help is off. Mistake cards, reviews, and your canvas still work locally in this app.',
    };
  }
  if (!settings.apiKey.trim()) {
    return {
      enabled: true,
      configured: false,
      provider: settings.providerId,
      model: settings.model,
      baseUrlResolved,
      unavailableReason:
        'Cloud model help is optional. Open Intelligence → Advanced only if you want to connect a provider.',
    };
  }
  return {
    enabled: true,
    configured: true,
    provider: settings.providerId,
    model: settings.model,
    baseUrlResolved,
    unavailableReason: null,
  };
}

export function getAIAvailabilitySnapshot(): AIAvailability {
  return computeAIAvailability(loadAIUserSettings());
}
