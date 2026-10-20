/**
 * Map a provider failure onto the public gateway contract.
 * Diagnostics stay in server logs. Students see only these sentences.
 */

import type { ZikukAiErrorCode } from './requestTypes.ts';
import type { ProviderFailure } from './providerTypes.ts';

export const OUTPUT_BUDGET_EXHAUSTED_MESSAGE =
  "The AI couldn't complete this explanation. Try asking for a shorter section.";

export function mapProviderFailureToClient(code: ProviderFailure['code']): {
  code: ZikukAiErrorCode;
  message: string;
} {
  if (code === 'rate_limited') {
    return { code: 'rate_limited', message: 'Too many requests. Try again shortly.' };
  }
  if (code === 'provider_timeout') {
    return { code: 'provider_timeout', message: 'The AI service timed out. Try again.' };
  }
  if (code === 'output_budget_exhausted') {
    return { code: 'output_budget_exhausted', message: OUTPUT_BUDGET_EXHAUSTED_MESSAGE };
  }
  return {
    code: 'provider_unavailable',
    message: 'The AI service is temporarily unavailable.',
  };
}
