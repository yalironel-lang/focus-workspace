import { describe, expect, it } from 'vitest';
import { classifyCallbackFailure, classifyMagicLinkError, isPlausibleEmail } from './stagingMagicLink';

describe('staging magic-link classification', () => {
  it('accepts a normal address and rejects malformed input', () => {
    expect(isPlausibleEmail('student@university.edu')).toBe(true);
    expect(isPlausibleEmail('  student@university.edu  ')).toBe(true);
    expect(isPlausibleEmail('not-an-email')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
  });

  it('hides whether an address is registered', () => {
    expect(classifyMagicLinkError({ code: 'user_not_found', message: 'User not found', status: 400 })).toBe('sent');
    expect(classifyMagicLinkError({ message: 'Signups not allowed for otp', status: 422 })).toBe('sent');
    expect(classifyMagicLinkError({ code: 'otp_disabled', status: 400 })).toBe('sent');
  });

  it('reports rate limits, invalid addresses, and other failures', () => {
    expect(classifyMagicLinkError({ status: 429, code: 'over_email_send_rate_limit', message: 'Rate limit' })).toBe(
      'rate_limited',
    );
    expect(classifyMagicLinkError({ code: 'validation_failed', message: 'Unable to validate email address' })).toBe(
      'invalid_email',
    );
    expect(classifyMagicLinkError({ status: 500, message: 'unexpected' })).toBe('failed');
  });

  it('classifies an expired callback without treating a clean url as a failure', () => {
    expect(
      classifyCallbackFailure(
        'https://zikuk-staging.vercel.app/dashboard?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired',
      ),
    ).toBe('expired');
    expect(classifyCallbackFailure('https://zikuk-staging.vercel.app/dashboard?error=server_error')).toBe('failed');
    expect(classifyCallbackFailure('https://zikuk-staging.vercel.app/dashboard')).toBeNull();
  });
});
