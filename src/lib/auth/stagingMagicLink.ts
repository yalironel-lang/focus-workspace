/**
 * Staging-only magic-link helpers.
 * The login form is compiled in only when VITE_STAGING_EMAIL_AUTH === 'true'.
 * These helpers never log emails or tokens.
 */

export type MagicLinkStatus = 'invalid_email' | 'sent' | 'rate_limited' | 'failed';

export type MagicLinkNotice = 'expired' | 'failed';

export interface MagicLinkErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 320 && EMAIL_PATTERN.test(email);
}

/**
 * Missing-account and signup-disabled responses are reported as `sent`
 * so the UI does not reveal whether the address is registered.
 */
export function classifyMagicLinkError(error: MagicLinkErrorLike): MagicLinkStatus {
  const code = (error.code ?? '').toLowerCase();
  const message = (error.message ?? '').toLowerCase();

  if (error.status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return 'rate_limited';
  }

  if (
    code === 'validation_failed' ||
    message.includes('unable to validate email') ||
    message.includes('invalid email')
  ) {
    return 'invalid_email';
  }

  if (
    code === 'user_not_found' ||
    code === 'signup_disabled' ||
    code === 'otp_disabled' ||
    message.includes('user not found') ||
    message.includes('signups not allowed')
  ) {
    return 'sent';
  }

  return 'failed';
}

export function classifyCallbackFailure(href: string): MagicLinkNotice | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const code = (url.searchParams.get('error_code') ?? '').toLowerCase();
  const error = url.searchParams.get('error');
  const description = (url.searchParams.get('error_description') ?? '').toLowerCase();
  const hash = url.hash.toLowerCase();
  const hashHasError = /(?:^|[#&])error=/.test(hash);
  if (!error && !code && !hashHasError) return null;
  if (code === 'otp_expired' || description.includes('expired') || hash.includes('expired')) {
    return 'expired';
  }
  return 'failed';
}
