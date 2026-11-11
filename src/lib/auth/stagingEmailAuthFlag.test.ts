import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStagingEmailAuthEnabled } from './stagingEmailAuthFlag';

describe('isStagingEmailAuthEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when the staging flag is unset or not exactly true', () => {
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', '');
    expect(isStagingEmailAuthEnabled()).toBe(false);
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', 'false');
    expect(isStagingEmailAuthEnabled()).toBe(false);
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', '1');
    expect(isStagingEmailAuthEnabled()).toBe(false);
  });

  it('is true only when the staging flag is exactly true', () => {
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', 'true');
    expect(isStagingEmailAuthEnabled()).toBe(true);
  });
});
