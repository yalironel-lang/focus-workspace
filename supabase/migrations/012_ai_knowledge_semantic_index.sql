-- =============================================================================
-- 012_ai_knowledge_semantic_index.sql
-- =============================================================================
-- M0.5C Phase 1 — Semantic index foundation (LOCAL ONLY until explicitly applied).
--
-- Adds:
--   - vector extension (schema extensions)
--   - retrieval_source_version (distinct from source_version)
--   - per-version index state table (avoids ambiguous source-level index_status)
--   - ai_knowledge_embeddings (separate from text chunks; never client-readable)
--   - service_role index lifecycle + search RPCs
--   - finalize_ingest: retain prior text versions (no retrieval blackout) + page_count
--   - optional GC helper for non-retrieval/non-current versions
--
-- NO HNSW. NO IVFFlat. V1 search = exact scan.
-- NO provider calls. DO NOT apply remotely in Phase 1.
--
-- V1 dimension contract (single schema width):
--   KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536
-- Provider/model availability is NOT verified in this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extension (local migration only — do not apply remotely in Phase 1)
-- -----------------------------------------------------------------------------
create extension if not exists vector with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Source: retrieval version pointer (text version remains source_version)
-- -----------------------------------------------------------------------------
alter table public.ai_knowledge_sources
  add column if not exists retrieval_source_version integer
    check (
      retrieval_source_version is null
      or retrieval_source_version >= 1
    );

comment on column public.ai_knowledge_sources.retrieval_source_version is
  'Version currently eligible for semantic retrieval. Null = nothing indexed yet. May lag source_version during re-index.';

comment on column public.ai_knowledge_sources.source_version is
  'Current extracted text corpus version. Distinct from retrieval_source_version.';

-- -----------------------------------------------------------------------------
-- 2. Per-version index state (source-level index_status would be ambiguous when
--    source_version=2, retrieval_source_version=1, and v2 indexing fails)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_version_index (
  source_id uuid not null
    references public.ai_knowledge_sources(id) on delete cascade,
  source_version integer not null
    check (source_version >= 1),
  status text not null
    check (status in ('unindexed', 'indexing', 'indexed', 'index_failed')),
  error_code text
    check (
      error_code is null
      or error_code in (
        'invalid_request',
        'not_found',
        'stale_job',
        'incomplete_embeddings',
        'provider_unavailable',
        'provider_timeout',
        'rate_limited',
        'internal_error'
      )
    ),
  embedding_model text,
  embedding_dimensions integer
    check (
      embedding_dimensions is null
      or embedding_dimensions = 1536
    ),
  job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, source_version),
  constraint ai_knowledge_version_index_model_dims_when_active
    check (
      status in ('unindexed', 'index_failed')
      or (
        embedding_model is not null
        and length(trim(embedding_model)) > 0
        and embedding_dimensions = 1536
      )
    )
);

comment on table public.ai_knowledge_version_index is
  'Per (source, text version) embedding index attempt state. Separates current text version from retrieval-active version.';

create index if not exists ai_knowledge_version_index_status_idx
  on public.ai_knowledge_version_index (source_id, status);

create or replace function public.ai_knowledge_version_index_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_version_index_updated_at
  on public.ai_knowledge_version_index;
create trigger trg_ai_knowledge_version_index_updated_at
  before update on public.ai_knowledge_version_index
  for each row execute function public.ai_knowledge_version_index_set_updated_at();

alter table public.ai_knowledge_version_index enable row level security;

revoke all on table public.ai_knowledge_version_index from anon, authenticated;
grant select, insert, update, delete on table public.ai_knowledge_version_index to service_role;

-- -----------------------------------------------------------------------------
-- 3. Embeddings (never client-readable)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null
    references public.ai_knowledge_chunks(id) on delete cascade,
  source_id uuid not null
    references public.ai_knowledge_sources(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  section_id uuid not null
    references public.sections(id) on delete cascade,
  source_version integer not null
    check (source_version >= 1),
  embedding_model text not null
    check (length(trim(embedding_model)) > 0),
  embedding_dimensions integer not null
    check (embedding_dimensions = 1536),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  constraint ai_knowledge_embeddings_chunk_model_uq
    unique (chunk_id, embedding_model, embedding_dimensions)
);

comment on table public.ai_knowledge_embeddings is
  'Chunk embeddings. Server-only. Vectors never granted to authenticated/anon. Width contract: 1536.';

create index if not exists ai_knowledge_embeddings_retrieval_idx
  on public.ai_knowledge_embeddings (user_id, section_id, source_id, source_version);

create or replace function public.ai_knowledge_embeddings_enforce_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_section uuid;
  v_source uuid;
  v_version integer;
begin
  select c.user_id, c.section_id, c.source_id, c.source_version
    into v_user, v_section, v_source, v_version
  from public.ai_knowledge_chunks c
  where c.id = new.chunk_id;

  if v_user is null then
    raise exception 'ai_knowledge_embedding_chunk_not_found';
  end if;

  if new.user_id <> v_user
     or new.section_id <> v_section
     or new.source_id <> v_source
     or new.source_version <> v_version then
    raise exception 'ai_knowledge_embedding_parent_mismatch';
  end if;

  if new.embedding_dimensions <> 1536 then
    raise exception 'ai_knowledge_embedding_dimensions_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_embeddings_enforce_parent
  on public.ai_knowledge_embeddings;
create trigger trg_ai_knowledge_embeddings_enforce_parent
  before insert or update on public.ai_knowledge_embeddings
  for each row execute function public.ai_knowledge_embeddings_enforce_parent();

alter table public.ai_knowledge_embeddings enable row level security;

-- No policies for authenticated/anon → no client SELECT of vectors.
revoke all on table public.ai_knowledge_embeddings from anon, authenticated;
grant select, insert, update, delete on table public.ai_knowledge_embeddings to service_role;

-- -----------------------------------------------------------------------------
-- 4. Relax chunk parent trigger: allow retained prior versions (<= current)
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_chunks_enforce_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_section uuid;
  v_version integer;
begin
  select s.user_id, s.section_id, s.source_version
    into v_user, v_section, v_version
  from public.ai_knowledge_sources s
  where s.id = new.source_id;

  if v_user is null then
    raise exception 'ai_knowledge_chunk_source_not_found';
  end if;

  if new.user_id <> v_user or new.section_id <> v_section then
    raise exception 'ai_knowledge_chunk_ownership_mismatch';
  end if;

  -- M0.5C: prior text versions may be retained while source_version advances.
  if new.source_version < 1 or new.source_version > v_version then
    raise exception 'ai_knowledge_chunk_version_mismatch';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Replace finalize_ingest: retain prior versions + optional page_count
-- -----------------------------------------------------------------------------
-- Drop prior signature from 011 (page_count added; retention replaces delete-all).
drop function if exists public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb);

create or replace function public.ai_knowledge_finalize_ingest(
  p_source_id uuid,
  p_source_version integer,
  p_status text,
  p_error_code text default null,
  p_chunks jsonb default null,
  p_page_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_chunk jsonb;
  v_page integer;
  v_index integer;
  v_text text;
  v_inserted integer := 0;
  v_has_corpus boolean;
  v_next_version integer;
  v_new_hash text;
  v_page_count integer;
begin
  if p_source_id is null or p_source_version is null or p_status is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_status not in ('ready', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Server-derived page count only; ignore non-positive / oversized values.
  v_page_count := p_page_count;
  if v_page_count is not null and (v_page_count < 1 or v_page_count > 50) then
    v_page_count := null;
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_source.source_version <> p_source_version then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select exists (
    select 1 from public.ai_knowledge_chunks c where c.source_id = p_source_id
  ) into v_has_corpus;

  if p_status = 'failed' then
    if p_error_code is null
       or p_error_code not in (
         'invalid_request',
         'not_found',
         'not_pdf',
         'auth_mismatch',
         'extract_failed',
         'too_large',
         'too_many_pages',
         'internal_error'
       ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    if v_has_corpus then
      update public.ai_knowledge_sources
      set status = 'ready',
          pending_content_hash = null,
          error_code = p_error_code,
          updated_at = now()
      where id = p_source_id;

      return jsonb_build_object(
        'ok', true,
        'source_id', p_source_id,
        'source_version', p_source_version,
        'status', 'ready',
        'preserved_corpus', true
      );
    end if;

    update public.ai_knowledge_sources
    set status = 'failed',
        pending_content_hash = null,
        error_code = p_error_code,
        updated_at = now()
    where id = p_source_id;

    return jsonb_build_object(
      'ok', true,
      'source_id', p_source_id,
      'source_version', p_source_version,
      'status', 'failed',
      'preserved_corpus', false
    );
  end if;

  -- ready — validate full payload before mutating
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_chunks) elem
    group by (elem->>'page_number'), (elem->>'chunk_index')
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  for v_chunk in select * from jsonb_array_elements(p_chunks)
  loop
    begin
      v_page := (v_chunk->>'page_number')::integer;
      v_index := (v_chunk->>'chunk_index')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end;

    v_text := v_chunk->>'text';
    if v_page is null or v_page < 1
       or v_index is null or v_index < 0
       or v_text is null or length(v_text) = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;
  end loop;

  v_next_version := case when v_has_corpus then p_source_version + 1 else p_source_version end;
  v_new_hash := coalesce(v_source.pending_content_hash, v_source.content_hash);

  -- Advance text version. Do NOT delete prior version chunks (no retrieval blackout).
  -- Do NOT change retrieval_source_version here.
  update public.ai_knowledge_sources
  set source_version = v_next_version,
      content_hash = v_new_hash,
      pending_content_hash = null,
      error_code = null,
      page_count = coalesce(v_page_count, page_count),
      status = 'ready',
      updated_at = now()
  where id = p_source_id;

  for v_chunk in select * from jsonb_array_elements(p_chunks)
  loop
    v_page := (v_chunk->>'page_number')::integer;
    v_index := (v_chunk->>'chunk_index')::integer;
    v_text := v_chunk->>'text';

    insert into public.ai_knowledge_chunks (
      source_id,
      user_id,
      section_id,
      page_number,
      chunk_index,
      text,
      char_count,
      source_version
    ) values (
      p_source_id,
      v_source.user_id,
      v_source.section_id,
      v_page,
      v_index,
      v_text,
      char_length(v_text),
      v_next_version
    );
    v_inserted := v_inserted + 1;
  end loop;

  insert into public.ai_knowledge_version_index (
    source_id,
    source_version,
    status,
    error_code,
    embedding_model,
    embedding_dimensions,
    job_id
  ) values (
    p_source_id,
    v_next_version,
    'unindexed',
    null,
    null,
    null,
    null
  )
  on conflict (source_id, source_version) do update
  set status = 'unindexed',
      error_code = null,
      embedding_model = null,
      embedding_dimensions = null,
      job_id = null,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', v_next_version,
    'status', 'ready',
    'chunk_count', v_inserted,
    'retrieval_source_version', (
      select retrieval_source_version
      from public.ai_knowledge_sources
      where id = p_source_id
    ),
    'page_count', (
      select page_count from public.ai_knowledge_sources where id = p_source_id
    )
  );
end;
$$;

revoke all on function public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 6. Index lifecycle RPCs
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_begin_index(
  p_source_id uuid,
  p_source_version integer,
  p_embedding_model text,
  p_embedding_dimensions integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_job uuid;
  v_chunk_count integer;
begin
  if p_source_id is null
     or p_source_version is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_source.status <> 'ready' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Only the current text version may be indexed (prevents stale jobs).
  if v_source.source_version <> p_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  select count(*)::integer into v_chunk_count
  from public.ai_knowledge_chunks c
  where c.source_id = p_source_id
    and c.source_version = p_source_version;

  if v_chunk_count is null or v_chunk_count < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  v_job := gen_random_uuid();

  insert into public.ai_knowledge_version_index (
    source_id,
    source_version,
    status,
    error_code,
    embedding_model,
    embedding_dimensions,
    job_id
  ) values (
    p_source_id,
    p_source_version,
    'indexing',
    null,
    trim(p_embedding_model),
    1536,
    v_job
  )
  on conflict (source_id, source_version) do update
  set status = 'indexing',
      error_code = null,
      embedding_model = trim(p_embedding_model),
      embedding_dimensions = 1536,
      job_id = v_job,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'job_id', v_job,
    'chunk_count', v_chunk_count,
    'embedding_model', trim(p_embedding_model),
    'embedding_dimensions', 1536,
    'retrieval_source_version', v_source.retrieval_source_version
  );
end;
$$;

revoke all on function public.ai_knowledge_begin_index(uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_begin_index(uuid, integer, text, integer)
  to service_role;

create or replace function public.ai_knowledge_finalize_index_success(
  p_source_id uuid,
  p_source_version integer,
  p_job_id uuid,
  p_embedding_model text,
  p_embedding_dimensions integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_idx public.ai_knowledge_version_index%rowtype;
  v_chunk_count integer;
  v_embed_count integer;
  v_prev_retrieval integer;
begin
  if p_source_id is null
     or p_source_version is null
     or p_job_id is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Stale job: source advanced past this version → must not flip retrieval.
  if v_source.source_version <> p_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  select * into v_idx
  from public.ai_knowledge_version_index i
  where i.source_id = p_source_id
    and i.source_version = p_source_version
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_idx.job_id is distinct from p_job_id
     or v_idx.status <> 'indexing'
     or v_idx.embedding_model is distinct from trim(p_embedding_model)
     or v_idx.embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  select count(*)::integer into v_chunk_count
  from public.ai_knowledge_chunks c
  where c.source_id = p_source_id
    and c.source_version = p_source_version;

  select count(*)::integer into v_embed_count
  from public.ai_knowledge_embeddings e
  where e.source_id = p_source_id
    and e.source_version = p_source_version
    and e.embedding_model = trim(p_embedding_model)
    and e.embedding_dimensions = 1536;

  if v_chunk_count < 1 or v_embed_count is distinct from v_chunk_count then
    return jsonb_build_object('ok', false, 'code', 'incomplete_embeddings');
  end if;

  -- Every chunk must have exactly one embedding for this model/dims (uniqueness + count).
  if exists (
    select 1
    from public.ai_knowledge_chunks c
    where c.source_id = p_source_id
      and c.source_version = p_source_version
      and not exists (
        select 1
        from public.ai_knowledge_embeddings e
        where e.chunk_id = c.id
          and e.embedding_model = trim(p_embedding_model)
          and e.embedding_dimensions = 1536
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'incomplete_embeddings');
  end if;

  v_prev_retrieval := v_source.retrieval_source_version;

  update public.ai_knowledge_version_index
  set status = 'indexed',
      error_code = null,
      updated_at = now()
  where source_id = p_source_id
    and source_version = p_source_version;

  -- Atomic retrieval flip only. GC is a separate helper.
  update public.ai_knowledge_sources
  set retrieval_source_version = p_source_version,
      updated_at = now()
  where id = p_source_id;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'retrieval_source_version', p_source_version,
    'previous_retrieval_source_version', v_prev_retrieval,
    'chunk_count', v_chunk_count,
    'gc_eligible_prior_versions', coalesce(v_prev_retrieval is not null
      and v_prev_retrieval is distinct from p_source_version, false)
  );
end;
$$;

revoke all on function public.ai_knowledge_finalize_index_success(uuid, integer, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_finalize_index_success(uuid, integer, uuid, text, integer)
  to service_role;

create or replace function public.ai_knowledge_finalize_index_failure(
  p_source_id uuid,
  p_source_version integer,
  p_job_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_idx public.ai_knowledge_version_index%rowtype;
begin
  if p_source_id is null
     or p_source_version is null
     or p_job_id is null
     or p_error_code is null
     or p_error_code not in (
       'invalid_request',
       'not_found',
       'stale_job',
       'incomplete_embeddings',
       'provider_unavailable',
       'provider_timeout',
       'rate_limited',
       'internal_error'
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select * into v_idx
  from public.ai_knowledge_version_index i
  where i.source_id = p_source_id
    and i.source_version = p_source_version
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Stale / mismatched job: do not mutate retrieval; report stale.
  if v_source.source_version <> p_source_version
     or v_idx.job_id is distinct from p_job_id
     or v_idx.status <> 'indexing' then
    return jsonb_build_object(
      'ok', true,
      'code', 'stale_job',
      'source_id', p_source_id,
      'retrieval_source_version', v_source.retrieval_source_version,
      'ignored', true
    );
  end if;

  update public.ai_knowledge_version_index
  set status = 'index_failed',
      error_code = p_error_code,
      updated_at = now()
  where source_id = p_source_id
    and source_version = p_source_version;

  -- Explicit: retrieval_source_version unchanged.
  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'status', 'index_failed',
    'error_code', p_error_code,
    'retrieval_source_version', v_source.retrieval_source_version
  );
end;
$$;

revoke all on function public.ai_knowledge_finalize_index_failure(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_finalize_index_failure(uuid, integer, uuid, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 6b. Job-scoped embedding upsert (Phase 2 — stale-job safe persistence)
-- -----------------------------------------------------------------------------
-- Persists provider vectors only while the matching index job is actively
-- `indexing` for the current source_version. Late writes from superseded jobs
-- return stale_job and do not mutate embeddings.
create or replace function public.ai_knowledge_upsert_embeddings(
  p_source_id uuid,
  p_source_version integer,
  p_job_id uuid,
  p_embedding_model text,
  p_embedding_dimensions integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_idx public.ai_knowledge_version_index%rowtype;
  v_row jsonb;
  v_chunk_id uuid;
  v_embedding text;
  v_chunk public.ai_knowledge_chunks%rowtype;
  v_upserted integer := 0;
begin
  if p_source_id is null
     or p_source_version is null
     or p_job_id is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536
     or p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_source.source_version <> p_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  select * into v_idx
  from public.ai_knowledge_version_index i
  where i.source_id = p_source_id
    and i.source_version = p_source_version
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_idx.status <> 'indexing'
     or v_idx.job_id is distinct from p_job_id
     or v_idx.embedding_model is distinct from trim(p_embedding_model)
     or v_idx.embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_chunk_id := (v_row->>'chunk_id')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end;

    if v_chunk_id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    if v_row->'embedding' is null or jsonb_typeof(v_row->'embedding') <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    if jsonb_array_length(v_row->'embedding') <> 1536 then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    select * into v_chunk
    from public.ai_knowledge_chunks c
    where c.id = v_chunk_id;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    if v_chunk.source_id <> p_source_id
       or v_chunk.source_version <> p_source_version
       or v_chunk.user_id <> v_source.user_id
       or v_chunk.section_id <> v_source.section_id then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    -- pgvector text form: [1,2,...]
    select string_agg(elem::text, ',' order by ord)
      into v_embedding
    from jsonb_array_elements_text(v_row->'embedding') with ordinality as t(elem, ord);

    if v_embedding is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;
    v_embedding := '[' || v_embedding || ']';

    insert into public.ai_knowledge_embeddings (
      chunk_id,
      source_id,
      user_id,
      section_id,
      source_version,
      embedding_model,
      embedding_dimensions,
      embedding
    ) values (
      v_chunk_id,
      p_source_id,
      v_source.user_id,
      v_source.section_id,
      p_source_version,
      trim(p_embedding_model),
      1536,
      v_embedding::extensions.vector(1536)
    )
    on conflict (chunk_id, embedding_model, embedding_dimensions) do update
    set embedding = excluded.embedding,
        source_id = excluded.source_id,
        user_id = excluded.user_id,
        section_id = excluded.section_id,
        source_version = excluded.source_version,
        created_at = now();

    v_upserted := v_upserted + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'job_id', p_job_id,
    'upserted', v_upserted
  );
end;
$$;

revoke all on function public.ai_knowledge_upsert_embeddings(
  uuid, integer, uuid, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.ai_knowledge_upsert_embeddings(
  uuid, integer, uuid, text, integer, jsonb
) to service_role;

-- -----------------------------------------------------------------------------
-- 7. GC helper (separate from retrieval flip)
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_gc_non_retrieval_versions(
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_deleted integer := 0;
begin
  if p_source_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Keep current text version and active retrieval version. Delete all others.
  -- Embeddings cascade from chunk delete.
  with doomed as (
    delete from public.ai_knowledge_chunks c
    where c.source_id = p_source_id
      and c.source_version is distinct from v_source.source_version
      and c.source_version is distinct from v_source.retrieval_source_version
    returning c.source_version
  )
  select count(*)::integer into v_deleted from doomed;

  delete from public.ai_knowledge_version_index i
  where i.source_id = p_source_id
    and i.source_version is distinct from v_source.source_version
    and i.source_version is distinct from v_source.retrieval_source_version;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'deleted_chunk_rows', v_deleted,
    'source_version', v_source.source_version,
    'retrieval_source_version', v_source.retrieval_source_version
  );
end;
$$;

revoke all on function public.ai_knowledge_gc_non_retrieval_versions(uuid)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_gc_non_retrieval_versions(uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- 8. Secure search RPC (service_role only; exact cosine scan)
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_search(
  p_user_id uuid,
  p_section_id uuid,
  p_query_embedding extensions.vector(1536),
  p_limit integer,
  p_embedding_model text,
  p_embedding_dimensions integer
)
returns table (
  source_id uuid,
  source_object_id text,
  file_name text,
  page_number integer,
  chunk_index integer,
  text text,
  similarity double precision
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer;
begin
  if p_user_id is null
     or p_section_id is null
     or p_query_embedding is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536 then
    return;
  end if;

  -- Hard bounds: never dump an entire course.
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 12);

  -- Avoid OUT-param name conflicts (text/similarity) by positional RETURN QUERY.
  return query
  select
    s.id,
    s.source_object_id,
    s.file_name,
    c.page_number,
    c.chunk_index,
    c.text,
    (1.0::double precision - (e.embedding <=> p_query_embedding))
  from public.ai_knowledge_sources s
  inner join public.ai_knowledge_version_index vi
    on vi.source_id = s.id
   and vi.source_version = s.retrieval_source_version
   and vi.status = 'indexed'
   and vi.embedding_model = trim(p_embedding_model)
   and vi.embedding_dimensions = 1536
  inner join public.ai_knowledge_chunks c
    on c.source_id = s.id
   and c.source_version = s.retrieval_source_version
   and c.user_id = p_user_id
   and c.section_id = p_section_id
  inner join public.ai_knowledge_embeddings e
    on e.chunk_id = c.id
   and e.source_id = s.id
   and e.source_version = s.retrieval_source_version
   and e.user_id = p_user_id
   and e.section_id = p_section_id
   and e.embedding_model = trim(p_embedding_model)
   and e.embedding_dimensions = 1536
  where s.user_id = p_user_id
    and s.section_id = p_section_id
    and s.status = 'ready'
    and s.retrieval_source_version is not null
  order by e.embedding <=> p_query_embedding asc
  limit v_limit;
end;
$$;

revoke all on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) from public, anon, authenticated;
grant execute on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) to service_role;
