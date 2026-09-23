/**
 * @vitest-environment node
 *
 * M1.1E — recovery worker config fail-closed tests.
 */

import { describe, expect, it } from 'vitest';
import {
  parseRecoveryWorkerConfig,
  ZIKUK_PRODUCTION_PROJECT_REF,
  ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE,
  ZIKUK_STAGING_PROJECT_REF,
} from '../src/workerConfig.ts';

const STAGING_URL = `https://${ZIKUK_STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${ZIKUK_PRODUCTION_PROJECT_REF}.supabase.co`;
const KEY = 'service-role-key-at-least-twenty-chars';

describe('parseRecoveryWorkerConfig', () => {
  it('1. accepts staging without production confirm', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_STAGING_PROJECT_REF,
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.allowProduction).toBe(false);
    expect(r.config.concurrency).toBe(1);
    expect(r.config.idleMs).toBe(5000);
  });

  it('2. Production requires explicit confirm', () => {
    const missing = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'production',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_PRODUCTION_PROJECT_REF,
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe('production_confirm_required');
  });

  it('3. wrong project refused (staging env + prod ref)', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_PRODUCTION_PROJECT_REF,
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('staging_ref_mismatch');
  });

  it('4. missing service credentials refused', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_STAGING_PROJECT_REF,
      SUPABASE_URL: STAGING_URL,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('missing_service_role');
  });

  it('refuses URL/ref mismatch', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_STAGING_PROJECT_REF,
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('project_ref_url_mismatch');
  });

  it('16. staging remains possible without Production opt-in', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_STAGING_PROJECT_REF,
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      ZIKUK_RECOVERY_CONCURRENCY: '2',
      ZIKUK_RECOVERY_IDLE_MS: '3000',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.env).toBe('staging');
    expect(r.config.allowProduction).toBe(false);
    expect(r.config.concurrency).toBe(2);
  });

  it('Production accepts with exact confirm', () => {
    const r = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'production',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_PRODUCTION_PROJECT_REF,
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      ZIKUK_RECOVERY_PRODUCTION_CONFIRM: ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.allowProduction).toBe(true);
  });

  it('bounds concurrency to 1–2', () => {
    const bad = parseRecoveryWorkerConfig({
      ZIKUK_RECOVERY_ENV: 'staging',
      ZIKUK_RECOVERY_PROJECT_REF: ZIKUK_STAGING_PROJECT_REF,
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      ZIKUK_RECOVERY_CONCURRENCY: '8',
    });
    expect(bad.ok).toBe(false);
  });
});
