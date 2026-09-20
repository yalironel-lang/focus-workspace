/**
 * M0.5C Phase 1 — Semantic index foundation (static migration contract tests).
 * Does not hit remote Supabase. Does not call providers. Does not enable vector remotely.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from './knowledge/bounds.ts';

const SQL_011 = resolve(process.cwd(), 'supabase/migrations/011_ai_knowledge_foundation.sql');
const SQL_012 = resolve(process.cwd(), 'supabase/migrations/012_ai_knowledge_semantic_index.sql');

function load(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('M0.5C migration 012 schema contract', () => {
  const sql = load(SQL_012);

  it('declares vector extension in extensions schema; no ANN indexes', () => {
    expect(sql).toMatch(
      /create\s+extension\s+if\s+not\s+exists\s+vector\s+with\s+schema\s+extensions/i,
    );
    // Forbid creating ANN indexes (comments may mention HNSW/IVFFlat as excluded).
    expect(sql).not.toMatch(/create\s+(unique\s+)?index[\s\S]{0,120}\bhnsw\b/i);
    expect(sql).not.toMatch(/create\s+(unique\s+)?index[\s\S]{0,120}\bivfflat\b/i);
    expect(sql).not.toMatch(/using\s+hnsw/i);
    expect(sql).not.toMatch(/using\s+ivfflat/i);
  });

  it('uses single V1 dimension contract matching TS constant', () => {
    expect(KNOWLEDGE_EMBEDDING_DIMENSIONS).toBe(1536);
    expect(sql).toContain('extensions.vector(1536)');
    expect(sql).toContain('embedding_dimensions = 1536');
    expect(sql).toContain('KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536');
    // No alternate widths encoded
    expect(sql).not.toMatch(/vector\(384\)/);
    expect(sql).not.toMatch(/vector\(768\)/);
    expect(sql).not.toMatch(/vector\(3072\)/);
  });

  it('keeps embeddings separate from chunks with FK uniqueness and cascade', () => {
    expect(sql).toContain('create table if not exists public.ai_knowledge_embeddings');
    expect(sql).toMatch(
      /chunk_id uuid not null\s+references public\.ai_knowledge_chunks\(id\) on delete cascade/,
    );
    expect(sql).toContain('constraint ai_knowledge_embeddings_chunk_model_uq');
    expect(sql).toContain('unique (chunk_id, embedding_model, embedding_dimensions)');
    expect(sql).toContain('ai_knowledge_embeddings_enforce_parent');
  });

  it('uses per-version index state (not ambiguous source-level index_status)', () => {
    expect(sql).toContain('create table if not exists public.ai_knowledge_version_index');
    expect(sql).toContain("check (status in ('unindexed', 'indexing', 'indexed', 'index_failed'))");
    expect(sql).toContain('primary key (source_id, source_version)');
    expect(sql).toContain('add column if not exists retrieval_source_version');
    // Must not invent a second competing source-level index_status column
    expect(sql).not.toMatch(/add column if not exists index_status/);
  });

  it('RLS + grants: vectors never client-readable; RPCs service_role only', () => {
    expect(sql).toContain('alter table public.ai_knowledge_embeddings enable row level security');
    expect(sql).toContain('alter table public.ai_knowledge_version_index enable row level security');
    expect(sql).toContain('revoke all on table public.ai_knowledge_embeddings from anon, authenticated');
    expect(sql).toContain(
      'revoke all on table public.ai_knowledge_version_index from anon, authenticated',
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on table public\.ai_knowledge_embeddings\s+to authenticated/i,
    );
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.ai_knowledge_embeddings to service_role',
    );

    for (const fn of [
      'ai_knowledge_begin_index',
      'ai_knowledge_finalize_index_success',
      'ai_knowledge_finalize_index_failure',
      'ai_knowledge_upsert_embeddings',
      'ai_knowledge_gc_non_retrieval_versions',
      'ai_knowledge_search',
    ]) {
      expect(sql).toContain(`create or replace function public.${fn}`);
      expect(sql).toContain(`revoke all on function public.${fn}`);
      expect(sql).toContain('from public, anon, authenticated');
      expect(sql).toContain(`grant execute on function public.${fn}`);
      expect(sql).toContain('to service_role');
    }
  });

  it('search filters by user/section/retrieval version/model; never returns vectors', () => {
    const search = sql.slice(sql.indexOf('create or replace function public.ai_knowledge_search'));
    expect(search).toContain('s.user_id = p_user_id');
    expect(search).toContain('s.section_id = p_section_id');
    expect(search).toContain('s.retrieval_source_version is not null');
    expect(search).toContain('c.source_version = s.retrieval_source_version');
    expect(search).toContain("vi.status = 'indexed'");
    expect(search).toContain('vi.embedding_model = trim(p_embedding_model)');
    expect(search).toContain('1.0::double precision - (e.embedding <=> p_query_embedding)');
    expect(search).toContain('limit v_limit');
    expect(search).toContain('least(greatest(coalesce(p_limit, 8), 1), 12)');
    expect(search).toMatch(/set search_path = public,\s*extensions/);
    // Result columns — no vector / storage_path / user_id / content_hash
    expect(search).toContain('source_object_id text');
    expect(search).toContain('file_name text');
    expect(search).toContain('page_number integer');
    expect(search).toContain('chunk_index integer');
    expect(search).toContain('similarity double precision');
    expect(search).not.toMatch(/returns table[\s\S]{0,400}\bembedding\b/);
    expect(search).not.toContain('storage_path');
    expect(search).not.toContain('content_hash');
    expect(search).not.toMatch(/returns table[\s\S]{0,400}\buser_id\b/);
  });

  it('index lifecycle validates job/version and does not GC on flip', () => {
    const success = sql.slice(
      sql.indexOf('create or replace function public.ai_knowledge_finalize_index_success'),
    );
    const successBody = success.slice(
      0,
      success.indexOf('create or replace function public.ai_knowledge_finalize_index_failure'),
    );
    expect(successBody).toContain("'stale_job'");
    expect(successBody).toContain("'incomplete_embeddings'");
    expect(successBody).toContain('retrieval_source_version = p_source_version');
    expect(successBody).toContain('Atomic retrieval flip only');
    expect(successBody).not.toContain('delete from public.ai_knowledge_chunks');

    const fail = sql.slice(
      sql.indexOf('create or replace function public.ai_knowledge_finalize_index_failure'),
    );
    const failBody = fail.slice(
      0,
      fail.indexOf('create or replace function public.ai_knowledge_gc_non_retrieval_versions'),
    );
    expect(failBody).toContain("status = 'index_failed'");
    expect(failBody).toContain('retrieval_source_version unchanged');

    expect(sql).toContain('create or replace function public.ai_knowledge_gc_non_retrieval_versions');
  });

  it('finalize_ingest retains prior versions and accepts server page_count', () => {
    const fin = sql.slice(sql.indexOf('create or replace function public.ai_knowledge_finalize_ingest'));
    const finBody = fin.slice(0, fin.indexOf('create or replace function public.ai_knowledge_begin_index'));
    expect(finBody).toContain('p_page_count integer default null');
    expect(finBody).toContain('page_count = coalesce(v_page_count, page_count)');
    expect(finBody).toContain('v_page_count > 50');
    // Retention: no delete-all of chunks on ready
    expect(finBody).not.toContain('delete from public.ai_knowledge_chunks');
    expect(finBody).toContain("status = 'unindexed'");
    expect(finBody).toContain("'retrieval_source_version'");
    // Explicit: do not flip retrieval on text finalize
    expect(finBody).toContain('Do NOT change retrieval_source_version here');
  });

  it('chunk parent trigger allows retained prior versions', () => {
    expect(sql).toContain('create or replace function public.ai_knowledge_chunks_enforce_parent');
    expect(sql).toContain('new.source_version > v_version');
    expect(sql).toContain('prior text versions may be retained');
  });

  it('privacy: no content logging in migration', () => {
    expect(sql).not.toMatch(/raise\s+notice/i);
    expect(sql).not.toMatch(/raise\s+log/i);
    expect(sql).not.toContain('ai-gateway');
    expect(sql).not.toContain('explain_selection');
  });

  it('011 remains the applied text foundation; 012 is additive', () => {
    const sql011 = load(SQL_011);
    expect(sql011).toContain('create table if not exists public.ai_knowledge_sources');
    expect(sql011).not.toMatch(/create\s+extension\s+[^;]*vector/i);
    expect(sql).toContain('DO NOT apply remotely in Phase 1');
  });
});
