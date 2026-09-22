/**
 * M1.0B B3.2.1 — static contract for migration 018 early source_version.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_018 = resolve(
  process.cwd(),
  'supabase/migrations/018_ai_knowledge_early_source_version.sql',
);
const SQL_014 = resolve(
  process.cwd(),
  'supabase/migrations/014_ai_knowledge_notebook_page_ingest.sql',
);

describe('M1.0B B3.2.1 migration 018 early source_version contract', () => {
  const sql = readFileSync(SQL_018, 'utf8');
  const nb = readFileSync(SQL_014, 'utf8');

  it('replaces PDF begin_ingest with early tip allocation and no retrieval flip', () => {
    expect(sql).toContain('create or replace function public.ai_knowledge_begin_ingest');
    expect(sql).toContain('v_next_version := v_existing.source_version + 1');
    expect(sql).toContain('source_version = v_next_version');
    expect(sql).toContain('Do NOT change retrieval_source_version');
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("retrieval_source_version', v_existing.retrieval_source_version");
  });

  it('finalize uses tip-without-chunks as write version (no double bump)', () => {
    expect(sql).toContain('create or replace function public.ai_knowledge_finalize_ingest');
    expect(sql).toContain('v_has_chunks_at_tip');
    expect(sql).toContain('v_next_version := p_source_version + 1');
    expect(sql).toContain('v_next_version := p_source_version');
    expect(sql).toContain('Do NOT change retrieval_source_version here');
  });

  it('does not rewrite notebook begin (014 remains the notebook contract)', () => {
    expect(sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.ai_knowledge_begin_notebook_page_ingest/i,
    );
    expect(nb).toContain('create or replace function public.ai_knowledge_begin_notebook_page_ingest');
  });

  it('is staging-oriented and does not claim Production apply', () => {
    expect(sql).toContain('Apply to STAGING only');
    expect(sql).toContain('lmgrhmyurhjlwwdedojk');
  });
});
