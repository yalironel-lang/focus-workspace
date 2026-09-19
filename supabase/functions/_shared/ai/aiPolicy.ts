/**
 * M0.4 — server AI product policy defaults (configurable constants).
 * Not permanent public pricing; Edge/env may override later.
 */

export type AiPlan = 'beta' | 'pro' | 'owner' | 'disabled';

/** Product quota: beta requests per UTC day. */
export const AI_QUOTA_BETA_REQUESTS_PER_DAY = 40;

/** Product quota: pro requests per UTC day (architecture support; Pro not sold yet). */
export const AI_QUOTA_PRO_REQUESTS_PER_DAY = 200;

/** Safety rate limit: max requests per window for ALL plans including owner. */
export const AI_SAFETY_REQUESTS_PER_WINDOW = 20;

/** Safety window length in seconds. */
export const AI_SAFETY_WINDOW_SECONDS = 60;

export function defaultDailyRequestLimit(plan: AiPlan): number | null {
  switch (plan) {
    case 'owner':
      return null; // exempt
    case 'pro':
      return AI_QUOTA_PRO_REQUESTS_PER_DAY;
    case 'disabled':
      return 0;
    case 'beta':
    default:
      return AI_QUOTA_BETA_REQUESTS_PER_DAY;
  }
}

/**
 * Resolve effective daily limit from entitlement row.
 * Missing row → caller should pass plan='beta', dailyRequestLimit=null.
 */
export function resolveDailyRequestLimit(input: {
  plan: AiPlan;
  dailyRequestLimit: number | null | undefined;
}): number | null {
  if (input.plan === 'owner') return null;
  if (input.plan === 'disabled') return 0;
  if (
    typeof input.dailyRequestLimit === 'number' &&
    Number.isFinite(input.dailyRequestLimit) &&
    input.dailyRequestLimit >= 0
  ) {
    return Math.floor(input.dailyRequestLimit);
  }
  return defaultDailyRequestLimit(input.plan);
}
