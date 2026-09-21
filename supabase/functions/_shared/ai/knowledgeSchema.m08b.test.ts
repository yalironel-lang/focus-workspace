/**
 * M0.8B — Notebook page knowledge source foundation (static migration contract).
 * Does not hit remote Supabase. Does not call providers. Does not mutate Production.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_011 = resolve(process.cwd(), 'supabase/migrations/011_ai_knowledge_foundation.sql');
const SQL_012 = resolve(process.cwd(), 'supabase/migrations/012_ai_knowledge_semantic_index.sql');
const SQL_013 = resolve(process.cwd(), 'supabase/migrations/013_ai_knowledge_notebook_pages.sql');
const PAGE_OPS = resolve(process.cwd(), 'src/lib/notebookPages/operations.ts');
const PAGE_TYPES = resolve(process.cwd(), 'src/lib/notebookPages/types.ts');
const PAGE_RECOVERY = resolve(process.cwd(), 'src/lib/knowledge/notebookPageRecovery.ts');

function load(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('M0.8B Notebook page ID / JSON evidence (product model)', () => {
  it('page IDs are not globally unique FSO ids — scoped uniqueness required', () => {
    const ops = load(PAGE_OPS);
    const types = load(PAGE_TYPES);
    expect(ops).toContain('export function newNotebookPageId()');
    expect(ops).toMatch(/return `page-\$\{Date\.now\(\)\}-\$\{idSeq\}`/);
    expect(types).toContain("export const LEGACY_DEFAULT_PAGE_ID = 'page-1'");
    // FSO ids use a different generator prefix.
    expect(ops).not.toMatch(/ps-notebook/);
  });

  it('soft-delete removes page from live Notebook JSON (tombstone is client-side)', () => {
    const recovery = load(PAGE_RECOVERY);
    expect(recovery).toContain('writeNotebookPageTombstone');
    expect(recovery).toContain('deleteNotebookPage');
    expect(recovery).toMatch(/Tombstone is durable[\s\S]*remove from live Notebook/);
  });
});

describe('M0.8B migration 013 schema contract', () => {
  const sql = load(SQL_013);
  const sql011 = load(SQL_011);
  const sql012 = load(SQL_012);

  it('1–5. PDF regression: preserves PDF ownership codes and begin_ingest PDF-only seam', () => {
    expect(sql011).toContain("check (source_kind in ('free_space_pdf'))");
    expect(sql).toContain("check (source_kind in ('free_space_pdf', 'notebook_page'))");
    expect(sql).toContain("if new.source_kind = 'free_space_pdf' then");
    expect(sql).toContain('ai_knowledge_not_pdf');
    expect(sql).toContain('ai_knowledge_storage_path_mismatch');
    expect(sql).toContain('ai_knowledge_ownership_mismatch');
    expect(sql).toContain('ai_knowledge_section_ownership_mismatch');
    // begin_ingest not redefined — remains PDF-only from 011
    expect(sql).not.toContain('create or replace function public.ai_knowledge_begin_ingest');
    expect(sql011).toContain("coalesce(v_fso.object->>'type', '') <> 'pdf'");
  });

  it('PDF cascade: drops source_object_id FK and replaces with PDF delete trigger', () => {
    expect(sql).toContain('drop constraint if exists ai_knowledge_sources_source_object_id_fkey');
    expect(sql).toContain('ai_knowledge_sources_cascade_pdf_fso_delete');
    expect(sql).toContain("k.source_kind = 'free_space_pdf'");
    expect(sql).toContain('k.source_object_id = old.id');
    expect(sql).toContain('after delete on public.free_space_objects');
  });

  it('6–12. notebook_page ownership validates parent FSO + live page membership', () => {
    expect(sql).toContain("source_kind = 'notebook_page'");
    expect(sql).toContain('notebook_object_id');
    expect(sql).toContain('ai_knowledge_notebook_object_required');
    expect(sql).toContain('ai_knowledge_notebook_object_not_found');
    expect(sql).toContain('ai_knowledge_not_notebook');
    expect(sql).toContain("v_fso_type is distinct from 'notebook'");
    expect(sql).toContain('ai_knowledge_page_not_found');
    expect(sql).toContain('ai_knowledge_notebook_page_is_live');
    expect(sql).toContain("p_object->'content'->'pages'");
    expect(sql).toContain("page->>'id' = p_page_id");
    // Forged parent/page rejected: parent must own section/user AND page must be live in that object
    expect(sql).toContain('ai_knowledge_ownership_mismatch');
  });

  it('13–15. parent cascade FK + scoped uniqueness for pages', () => {
    expect(sql).toContain('ai_knowledge_sources_notebook_object_id_fkey');
    expect(sql).toContain('references public.free_space_objects(id)');
    expect(sql).toContain('on delete cascade');
    expect(sql).toContain('drop constraint if exists ai_knowledge_sources_object_identity_uq');
    expect(sql).toContain('ai_knowledge_sources_pdf_identity_uq');
    expect(sql).toContain(
      'on public.ai_knowledge_sources (source_kind, source_object_id)\n  where source_kind = \'free_space_pdf\'',
    );
    expect(sql).toContain('ai_knowledge_sources_notebook_page_identity_uq');
    expect(sql).toContain(
      'on public.ai_knowledge_sources (source_kind, notebook_object_id, source_object_id)\n  where source_kind = \'notebook_page\'',
    );
  });

  it('16–18. mutation lock-down + grants reaffirmed; no client write grants', () => {
    expect(sql).toContain('revoke all on table public.ai_knowledge_sources from anon, authenticated');
    expect(sql).toContain('grant select on table public.ai_knowledge_sources to authenticated');
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.ai_knowledge_sources to service_role',
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)\s+on table public\.ai_knowledge_sources\s+to authenticated/i,
    );
    expect(sql).toContain(
      'revoke all on function public.ai_knowledge_notebook_page_is_live(jsonb, text)',
    );
    expect(sql).toContain(
      'grant execute on function public.ai_knowledge_notebook_page_is_live(jsonb, text)\n  to service_role',
    );
  });

  it('17–20. cross-kind shape check + retrieval_source_version / index RPCs untouched', () => {
    expect(sql).toContain('ai_knowledge_sources_kind_shape_check');
    expect(sql).toContain("source_kind = 'free_space_pdf'");
    expect(sql).toContain('notebook_object_id is null');
    expect(sql).toContain('storage_path is null');
    // Index lifecycle RPCs not redefined here
    expect(sql).not.toContain('create or replace function public.ai_knowledge_begin_index');
    expect(sql).not.toContain('create or replace function public.ai_knowledge_finalize_index_success');
    expect(sql).not.toContain('create or replace function public.ai_knowledge_upsert_embeddings');
    // 012 still owns retrieval_source_version column
    expect(sql012).toContain('retrieval_source_version');
  });

  it('I. search fail-closed: PDF-only filter added; grants remain service_role', () => {
    const search = sql.slice(sql.indexOf('create or replace function public.ai_knowledge_search'));
    expect(search).toContain("s.source_kind = 'free_space_pdf'");
    expect(search).toContain('s.user_id = p_user_id');
    expect(search).toContain('s.section_id = p_section_id');
    expect(search).toContain('s.retrieval_source_version is not null');
    expect(search).toContain(
      'revoke all on function public.ai_knowledge_search(\n  uuid, uuid, extensions.vector, integer, text, integer\n) from public, anon, authenticated',
    );
    expect(search).toContain('to service_role');
  });

  it('documents soft page-delete vs parent FSO cascade boundary', () => {
    expect(sql).toContain('Nested page delete cannot cascade via FK');
    expect(sql).toContain('M0.8E+ lifecycle');
    expect(sql).toContain('Parent Notebook');
  });

  it('does not introduce provider / client handoff / extraction', () => {
    expect(sql).not.toContain('openai');
    expect(sql).not.toContain('embedding provider');
    expect(sql).not.toContain('needsProcess');
    expect(sql).not.toContain('documentBody');
    expect(sql).not.toContain('tiptap');
  });

  it('security definer cascade trigger uses empty search_path', () => {
    expect(sql).toContain('ai_knowledge_sources_cascade_pdf_fso_delete');
    expect(sql).toMatch(
      /create or replace function public\.ai_knowledge_sources_cascade_pdf_fso_delete\(\)[\s\S]*?set search_path = ''/,
    );
    expect(sql).toMatch(
      /create or replace function public\.ai_knowledge_sources_enforce_ownership\(\)[\s\S]*?set search_path = ''/,
    );
  });
});

describe('M0.8B PDF historical migrations remain intact', () => {
  it('011 still documents original PDF FK (historical); 013 supersedes carefully', () => {
    const sql011 = load(SQL_011);
    expect(sql011).toMatch(
      /source_object_id text not null\s+references public\.free_space_objects\(id\) on delete cascade/,
    );
    const sql013 = load(SQL_013);
    expect(sql013).toContain('Drop source_object_id → free_space_objects FK');
    expect(sql013).toContain('PDF ownership trigger still proves');
  });
});
