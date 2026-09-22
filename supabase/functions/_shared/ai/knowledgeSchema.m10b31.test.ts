/**
 * M1.0B B3.1 — static migration contract for page texts + recovery jobs.
 * Does not hit remote Supabase. Does not apply the migration.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
  KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
  KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
} from './knowledge/bounds.ts';

const SQL_PATH = resolve(
  process.cwd(),
  'supabase/migrations/017_ai_knowledge_page_recovery.sql',
);

function loadSql(): string {
  return readFileSync(SQL_PATH, 'utf8');
}

describe('M1.0B B3.1 migration 017 schema contract', () => {
  const sql = loadSql();

  it('creates separate page_texts and recovery_jobs tables', () => {
    expect(sql).toContain('create table if not exists public.ai_knowledge_page_texts');
    expect(sql).toContain('create table if not exists public.ai_knowledge_page_recovery_jobs');
    expect(sql).toContain('constraint ai_knowledge_page_texts_page_uq');
    expect(sql).toContain('unique (source_id, source_version, page_number)');
    expect(sql).toContain('constraint ai_knowledge_page_recovery_jobs_identity_uq');
    expect(sql).toContain(
      'unique (source_id, source_version, page_number, recovery_version)',
    );
  });

  it('keeps native + recovered + single canonical without concatenation policy', () => {
    expect(sql).toContain('native_text text not null');
    expect(sql).toContain('recovered_text text');
    expect(sql).toContain('canonical_text text not null');
    expect(sql).toContain("check (extraction_method in ('native', 'ocr_tesseract'))");
    expect(sql).toContain('Never native||recovered concatenation');
  });

  it('defines job statuses, lease fields, and bounded error codes', () => {
    expect(sql).toContain("'queued'");
    expect(sql).toContain("'claimed'");
    expect(sql).toContain("'succeeded'");
    expect(sql).toContain("'unusable'");
    expect(sql).toContain("'failed'");
    expect(sql).toContain("'discarded_stale'");
    expect(sql).toContain('claim_token uuid');
    expect(sql).toContain('lease_expires_at timestamptz');
    expect(sql).toContain('available_at timestamptz');
    expect(sql).toContain("'stale_version'");
    expect(sql).toContain("'retry_exhausted'");
  });

  it('RLS: page_texts owner SELECT; jobs service_role only; RPCs service_role only', () => {
    expect(sql).toContain('alter table public.ai_knowledge_page_texts enable row level security');
    expect(sql).toContain(
      'alter table public.ai_knowledge_page_recovery_jobs enable row level security',
    );
    expect(sql).toContain('grant select on table public.ai_knowledge_page_texts to authenticated');
    expect(sql).toContain(
      'revoke all on table public.ai_knowledge_page_recovery_jobs from anon, authenticated',
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on table public\.ai_knowledge_page_recovery_jobs\s+to authenticated/i,
    );

    for (const fn of [
      'ai_knowledge_upsert_page_texts_native',
      'ai_knowledge_enqueue_page_recovery_jobs',
      'ai_knowledge_claim_page_recovery_job',
      'ai_knowledge_commit_page_recovery_result',
    ]) {
      expect(sql).toContain(`create or replace function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
      expect(sql).toContain('to service_role');
    }
  });

  it('claim uses SKIP LOCKED; commit enforces claim_token + stale discard', () => {
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('claim_token is distinct from p_claim_token');
    expect(sql).toContain("'discarded_stale'");
    expect(sql).toContain("'idempotent', true");
  });

  it('does not wire worker deploy, finalize_ingest, or retrieval flip', () => {
    expect(sql).not.toContain('create or replace function public.ai_knowledge_finalize_ingest');
    expect(sql).not.toContain('retrieval_source_version');
    expect(sql).not.toMatch(/spawn|child_process|tesseract\.exe/i);
    expect(sql).toContain('DOES NOT:');
    expect(sql).toContain('wire production worker');
  });

  it('TS policy constants remain aligned with B2 recovery version + attempt bound', () => {
    expect(KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION).toBe('page-ocr-recovery-v1');
    expect(KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION).toBe('page-recovery-policy-v1');
    expect(KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS).toBe(3);
  });
});
