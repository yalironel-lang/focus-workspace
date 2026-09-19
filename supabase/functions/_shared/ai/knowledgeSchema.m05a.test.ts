/**
 * M0.5A — Course knowledge schema & security (static migration contract tests).
 * Does not hit remote Supabase. Does not call providers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_PATH = resolve(process.cwd(), 'supabase/migrations/011_ai_knowledge_foundation.sql');

function loadSql(): string {
  return readFileSync(SQL_PATH, 'utf8');
}

describe('M0.5A ai_knowledge migration contract', () => {
  const sql = loadSql();

  it('A. creates sources + chunks without vector/embedding column', () => {
    expect(sql).toContain('create table if not exists public.ai_knowledge_sources');
    expect(sql).toContain('create table if not exists public.ai_knowledge_chunks');
    expect(sql).not.toMatch(/create\s+extension\s+[^;]*vector/i);
    expect(sql).not.toMatch(/\bvector\s*\(/i);
    // No embedding column on either table
    expect(sql).not.toMatch(/^\s*embedding\b/m);
    expect(sql).not.toMatch(/,\s*embedding\b/i);
  });

  it('A. constrains status / source_kind / error_code / chunk order', () => {
    expect(sql).toContain("check (status in ('pending', 'processing', 'ready', 'failed', 'stale'))");
    expect(sql).toContain("check (source_kind in ('free_space_pdf'))");
    expect(sql).toContain("constraint ai_knowledge_sources_object_identity_uq");
    expect(sql).toContain('unique (source_kind, source_object_id)');
    expect(sql).toContain('constraint ai_knowledge_chunks_order_uq');
    expect(sql).toContain('unique (source_id, source_version, page_number, chunk_index)');
    expect(sql).toContain("'extract_failed'");
    expect(sql).toContain("'too_many_pages'");
  });

  it('B/C/D. ownership uses real id types and Free Space PDF FK', () => {
    // sections.id uuid, free_space_objects.id text, auth.users.id uuid
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/section_id uuid not null references public\.sections\(id\) on delete cascade/);
    expect(sql).toMatch(
      /source_object_id text not null\s+references public\.free_space_objects\(id\) on delete cascade/,
    );
    expect(sql).toContain('ai_knowledge_sources_enforce_ownership');
    expect(sql).toContain("ai_knowledge_not_pdf");
    expect(sql).toContain('ai_knowledge_ownership_mismatch');
    expect(sql).toContain('ai_knowledge_section_ownership_mismatch');
  });

  it('E/F. begin_ingest preserves READY corpus; pending_content_hash tracks in-flight', () => {
    expect(sql).toContain('create or replace function public.ai_knowledge_begin_ingest');
    expect(sql).toContain('pending_content_hash');
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("v_next_status := 'stale'");
    expect(sql).toContain('A previously READY corpus (content_hash + chunks at source_version) is NEVER');
    expect(sql).not.toContain(
      'delete from public.ai_knowledge_chunks c where c.source_id = v_existing.id',
    );
  });

  it('G/H. deletion cascades source→chunks and FKs cascade on section/object', () => {
    expect(sql).toMatch(
      /source_id uuid not null\s+references public\.ai_knowledge_sources\(id\) on delete cascade/,
    );
    expect(sql).toMatch(/section_id uuid not null references public\.sections\(id\) on delete cascade/);
    expect(sql).toMatch(
      /source_object_id text not null\s+references public\.free_space_objects\(id\) on delete cascade/,
    );
  });

  it('I/J/K/L. RLS + grants lock down anon/authenticated writes; RPC service_role only', () => {
    expect(sql).toContain('alter table public.ai_knowledge_sources enable row level security');
    expect(sql).toContain('alter table public.ai_knowledge_chunks enable row level security');
    expect(sql).toContain('revoke all on table public.ai_knowledge_sources from anon, authenticated');
    expect(sql).toContain('revoke all on table public.ai_knowledge_chunks from anon, authenticated');
    expect(sql).toContain('grant select on table public.ai_knowledge_sources to authenticated');
    expect(sql).toContain('grant select on table public.ai_knowledge_chunks to authenticated');
    // No insert/update/delete grants to authenticated
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|[^\n]*insert[^\n]*)\s+on table public\.ai_knowledge_(sources|chunks)\s+to authenticated/i,
    );
    expect(sql).toContain(
      'revoke all on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)',
    );
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain(
      'grant execute on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)',
    );
    expect(sql).toContain('to service_role');
    expect(sql).toContain('create or replace function public.ai_knowledge_finalize_ingest');
    expect(sql).toContain(
      'revoke all on function public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb)',
    );
  });

  it('M. owner SELECT policies require auth.uid match + owned section', () => {
    expect(sql).toContain('"Users can view own ai_knowledge_sources"');
    expect(sql).toContain('"Users can view own ai_knowledge_chunks"');
    expect(sql).toContain('auth.uid() = user_id');
    expect(sql).toContain('s.user_id = auth.uid()');
  });

  it('N. safe error_code constraint; no content logging triggers', () => {
    expect(sql).toContain('Safe machine-readable failure code only');
    expect(sql).not.toMatch(/raise\s+notice[\s\S]{0,80}chunk/i);
    expect(sql).not.toMatch(/raise\s+log[\s\S]{0,80}text/i);
    expect(sql).not.toContain('raise notice');
  });

  it('storage path is canonical Free Space PDF path', () => {
    expect(sql).toContain("'/pdf/'");
    expect(sql).toContain('ai_knowledge_storage_path_mismatch');
  });

  it('finalize validates chunks before delete/insert', () => {
    const finalize = sql.slice(sql.indexOf('ai_knowledge_finalize_ingest'));
    const readySection = finalize.slice(finalize.indexOf('-- ready — validate'));
    const validateIdx = readySection.indexOf('or length(v_text) = 0');
    const dupIdx = readySection.indexOf('having count(*) > 1');
    const deleteIdx = readySection.indexOf('delete from public.ai_knowledge_chunks c');
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(dupIdx).toBeGreaterThanOrEqual(0);
    expect(dupIdx).toBeLessThan(deleteIdx);
    expect(deleteIdx).toBeGreaterThan(validateIdx);
  });

  it('Release 1 gateway seam and Explain paths untouched by this migration', () => {
    expect(sql).not.toContain('ai-gateway');
    expect(sql).not.toContain('explain_selection');
    expect(sql).not.toContain('runGatewayPipeline');
  });
});

describe('M0.5A begin_ingest lifecycle semantics (documented contract)', () => {
  it('documents expected JSON result shape in SQL', () => {
    const sql = loadSql();
    expect(sql).toContain("'source_id'");
    expect(sql).toContain("'source_version'");
    expect(sql).toContain("'status'");
    expect(sql).toContain("'not_pdf'");
    expect(sql).toContain("'auth_mismatch'");
    expect(sql).toContain("'not_found'");
  });
});
