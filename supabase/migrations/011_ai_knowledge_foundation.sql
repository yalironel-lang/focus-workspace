-- =============================================================================
-- 011_ai_knowledge_foundation.sql
-- =============================================================================
-- M0.5A — Course knowledge source identity, lifecycle, chunk storage shape,
-- and server-authoritative security.
--
-- NO pgvector. NO embedding column. NO extraction. NO retrieval.
--
-- Server-authoritative. Clients cannot forge ownership or mutate the corpus.
-- Edge / service_role will call begin/finalize RPCs in M0.5B+.
--
-- DO NOT store prompts, responses, JWT, or API keys.
-- error_code is a safe machine code — never raw exception/provider text.
--
-- Apply ONLY when approved. Local create only in M0.5A.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ai_knowledge_sources
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('free_space_pdf')),
  -- free_space_objects.id is text (local ProjectSpaceObject id), not uuid.
  source_object_id text not null
    references public.free_space_objects(id) on delete cascade,
  storage_path text not null
    check (length(trim(storage_path)) > 0),
  -- Hash of the last READY corpus (null until first successful finalize).
  content_hash text,
  -- Hash of an in-flight ingest. READY corpus (content_hash + chunks) is preserved
  -- until finalize succeeds; begin never destroys a usable corpus.
  pending_content_hash text,
  file_name text,
  page_count integer
    check (page_count is null or page_count >= 1),
  status text not null
    check (status in ('pending', 'processing', 'ready', 'failed', 'stale')),
  error_code text
    check (
      error_code is null
      or error_code in (
        'invalid_request',
        'not_found',
        'not_pdf',
        'auth_mismatch',
        'extract_failed',
        'too_large',
        'too_many_pages',
        'internal_error'
      )
    ),
  source_version integer not null default 1
    check (source_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One knowledge source identity per Free Space object (V1: free_space_pdf only).
  constraint ai_knowledge_sources_object_identity_uq
    unique (source_kind, source_object_id)
);

comment on table public.ai_knowledge_sources is
  'ZIKUK AI course knowledge source identity + lifecycle. Server-authoritative. No embeddings.';

comment on column public.ai_knowledge_sources.error_code is
  'Safe machine-readable failure code only. Never raw exception or provider text.';

comment on column public.ai_knowledge_sources.pending_content_hash is
  'In-flight ingest hash. READY content_hash/chunks remain until finalize succeeds.';

create index if not exists ai_knowledge_sources_user_section_idx
  on public.ai_knowledge_sources (user_id, section_id);

create index if not exists ai_knowledge_sources_section_status_idx
  on public.ai_knowledge_sources (section_id, status);

create index if not exists ai_knowledge_sources_object_idx
  on public.ai_knowledge_sources (source_object_id);

create or replace function public.ai_knowledge_sources_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_sources_updated_at on public.ai_knowledge_sources;
create trigger trg_ai_knowledge_sources_updated_at
  before update on public.ai_knowledge_sources
  for each row execute function public.ai_knowledge_sources_set_updated_at();

-- Compound ownership + PDF type enforcement (defense in depth beyond FKs).
create or replace function public.ai_knowledge_sources_enforce_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fso_user uuid;
  v_fso_section uuid;
  v_fso_type text;
  v_section_owner uuid;
  v_expected_path text;
begin
  if new.source_kind <> 'free_space_pdf' then
    raise exception 'ai_knowledge_invalid_source_kind';
  end if;

  select f.user_id, f.section_id, f.object->>'type'
    into v_fso_user, v_fso_section, v_fso_type
  from public.free_space_objects f
  where f.id = new.source_object_id;

  if v_fso_user is null then
    raise exception 'ai_knowledge_source_object_not_found';
  end if;

  if v_fso_user <> new.user_id or v_fso_section <> new.section_id then
    raise exception 'ai_knowledge_ownership_mismatch';
  end if;

  if v_fso_type is distinct from 'pdf' then
    raise exception 'ai_knowledge_not_pdf';
  end if;

  select s.user_id into v_section_owner
  from public.sections s
  where s.id = new.section_id;

  if v_section_owner is null or v_section_owner <> new.user_id then
    raise exception 'ai_knowledge_section_ownership_mismatch';
  end if;

  -- Canonical Free Space PDF path: {userId}/{sectionId}/{objectId}/pdf/{objectId}
  v_expected_path :=
    new.user_id::text || '/' ||
    new.section_id::text || '/' ||
    new.source_object_id || '/pdf/' ||
    new.source_object_id;

  if new.storage_path is distinct from v_expected_path then
    raise exception 'ai_knowledge_storage_path_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_sources_enforce_ownership
  on public.ai_knowledge_sources;
create trigger trg_ai_knowledge_sources_enforce_ownership
  before insert or update on public.ai_knowledge_sources
  for each row execute function public.ai_knowledge_sources_enforce_ownership();

alter table public.ai_knowledge_sources enable row level security;

-- Defense-in-depth: owners may SELECT their own rows; no client writes.
drop policy if exists "Users can view own ai_knowledge_sources"
  on public.ai_knowledge_sources;
create policy "Users can view own ai_knowledge_sources"
  on public.ai_knowledge_sources for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = ai_knowledge_sources.section_id
        and s.user_id = auth.uid()
    )
  );

revoke all on table public.ai_knowledge_sources from anon, authenticated;
grant select on table public.ai_knowledge_sources to authenticated;
grant select, insert, update, delete on table public.ai_knowledge_sources to service_role;

-- -----------------------------------------------------------------------------
-- 2. ai_knowledge_chunks (text corpus shape for M0.5B; no embeddings)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null
    references public.ai_knowledge_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  text text not null check (length(text) > 0),
  char_count integer not null check (char_count >= 1),
  source_version integer not null check (source_version >= 1),
  created_at timestamptz not null default now(),
  constraint ai_knowledge_chunks_order_uq
    unique (source_id, source_version, page_number, chunk_index),
  constraint ai_knowledge_chunks_char_count_matches
    check (char_count = char_length(text))
);

comment on table public.ai_knowledge_chunks is
  'Page-traceable extracted text chunks. No embeddings in M0.5A. Server-authoritative writes.';

create index if not exists ai_knowledge_chunks_source_version_idx
  on public.ai_knowledge_chunks (source_id, source_version, page_number, chunk_index);

create index if not exists ai_knowledge_chunks_user_section_idx
  on public.ai_knowledge_chunks (user_id, section_id);

-- Keep denormalized ownership aligned with parent source.
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

  if new.source_version <> v_version then
    raise exception 'ai_knowledge_chunk_version_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_chunks_enforce_parent
  on public.ai_knowledge_chunks;
create trigger trg_ai_knowledge_chunks_enforce_parent
  before insert or update on public.ai_knowledge_chunks
  for each row execute function public.ai_knowledge_chunks_enforce_parent();

alter table public.ai_knowledge_chunks enable row level security;

drop policy if exists "Users can view own ai_knowledge_chunks"
  on public.ai_knowledge_chunks;
create policy "Users can view own ai_knowledge_chunks"
  on public.ai_knowledge_chunks for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = ai_knowledge_chunks.section_id
        and s.user_id = auth.uid()
    )
  );

revoke all on table public.ai_knowledge_chunks from anon, authenticated;
grant select on table public.ai_knowledge_chunks to authenticated;
grant select, insert, update, delete on table public.ai_knowledge_chunks to service_role;

-- -----------------------------------------------------------------------------
-- 3. ai_knowledge_begin_ingest — service_role only
-- -----------------------------------------------------------------------------
-- Validates user + section + Free Space PDF ownership and starts/restarts ingest.
--
-- Lifecycle invariant:
--   A previously READY corpus (content_hash + chunks at source_version) is NEVER
--   deleted by begin_ingest. Replacement destroys old chunks only inside a
--   successful finalize_ingest(ready) after the new payload is validated.
--
-- Does NOT download PDF, extract text, or call AI.

create or replace function public.ai_knowledge_begin_ingest(
  p_user_id uuid,
  p_section_id uuid,
  p_source_object_id text,
  p_content_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fso public.free_space_objects%rowtype;
  v_section_owner uuid;
  v_file_name text;
  v_page_count integer;
  v_storage_path text;
  v_existing public.ai_knowledge_sources%rowtype;
  v_has_ready_corpus boolean;
  v_next_status text;
begin
  if p_user_id is null
     or p_section_id is null
     or p_source_object_id is null
     or length(trim(p_source_object_id)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_content_hash is not null and length(trim(p_content_hash)) = 0 then
    p_content_hash := null;
  end if;

  select s.user_id into v_section_owner
  from public.sections s
  where s.id = p_section_id;

  if v_section_owner is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_section_owner <> p_user_id then
    return jsonb_build_object('ok', false, 'code', 'auth_mismatch');
  end if;

  select * into v_fso
  from public.free_space_objects f
  where f.id = p_source_object_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_fso.user_id <> p_user_id or v_fso.section_id <> p_section_id then
    return jsonb_build_object('ok', false, 'code', 'auth_mismatch');
  end if;

  if coalesce(v_fso.object->>'type', '') <> 'pdf' then
    return jsonb_build_object('ok', false, 'code', 'not_pdf');
  end if;

  v_file_name := nullif(trim(coalesce(v_fso.object->'content'->>'fileName', '')), '');
  begin
    v_page_count := nullif(v_fso.object->'content'->>'pageCount', '')::integer;
  exception when others then
    v_page_count := null;
  end;
  if v_page_count is not null and v_page_count < 1 then
    v_page_count := null;
  end if;

  v_storage_path :=
    p_user_id::text || '/' ||
    p_section_id::text || '/' ||
    p_source_object_id || '/pdf/' ||
    p_source_object_id;

  select * into v_existing
  from public.ai_knowledge_sources k
  where k.source_kind = 'free_space_pdf'
    and k.source_object_id = p_source_object_id;

  if found then
    -- Idempotent: same in-flight hash while pending/processing/stale
    if v_existing.status in ('pending', 'processing', 'stale')
       and p_content_hash is not distinct from v_existing.pending_content_hash then
      return jsonb_build_object(
        'ok', true,
        'source_id', v_existing.id,
        'source_version', v_existing.source_version,
        'status', v_existing.status,
        'idempotent', true
      );
    end if;

    -- Idempotent: same ready hash while ready
    if v_existing.status = 'ready'
       and p_content_hash is not distinct from v_existing.content_hash then
      return jsonb_build_object(
        'ok', true,
        'source_id', v_existing.id,
        'source_version', v_existing.source_version,
        'status', v_existing.status,
        'idempotent', true
      );
    end if;

    select exists (
      select 1 from public.ai_knowledge_chunks c where c.source_id = v_existing.id
    ) into v_has_ready_corpus;

    -- Preserve READY corpus: mark stale when replacing an existing ready set.
    if v_has_ready_corpus and v_existing.status in ('ready', 'stale') then
      v_next_status := 'stale';
    else
      v_next_status := 'pending';
    end if;

    update public.ai_knowledge_sources k
    set
      storage_path = v_storage_path,
      pending_content_hash = p_content_hash,
      file_name = coalesce(v_file_name, k.file_name),
      page_count = coalesce(v_page_count, k.page_count),
      status = v_next_status,
      error_code = null,
      updated_at = now()
    where k.id = v_existing.id
    returning * into v_existing;

    return jsonb_build_object(
      'ok', true,
      'source_id', v_existing.id,
      'source_version', v_existing.source_version,
      'status', v_existing.status,
      'idempotent', false
    );
  end if;

  insert into public.ai_knowledge_sources (
    user_id,
    section_id,
    source_kind,
    source_object_id,
    storage_path,
    content_hash,
    pending_content_hash,
    file_name,
    page_count,
    status,
    error_code,
    source_version
  ) values (
    p_user_id,
    p_section_id,
    'free_space_pdf',
    p_source_object_id,
    v_storage_path,
    null,
    p_content_hash,
    v_file_name,
    v_page_count,
    'pending',
    null,
    1
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok', true,
    'source_id', v_existing.id,
    'source_version', v_existing.source_version,
    'status', v_existing.status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 4. ai_knowledge_finalize_ingest — service_role only
-- -----------------------------------------------------------------------------
-- Atomic corpus replace for a successful ready finalize, or mark failed while
-- preserving any previously READY corpus.
--
-- p_source_version must match the current source_version (ready corpus version).
-- On ready success, source_version is incremented only when replacing an
-- existing corpus; first successful finalize keeps version 1.
--
-- Does not call AI.

create or replace function public.ai_knowledge_finalize_ingest(
  p_source_id uuid,
  p_source_version integer,
  p_status text,
  p_error_code text default null,
  p_chunks jsonb default null
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
begin
  if p_source_id is null or p_source_version is null or p_status is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_status not in ('ready', 'failed') then
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

    -- Preserve any existing READY corpus. Clear only the in-flight hash.
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

  -- ready — validate the full payload before mutating the corpus
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Reject duplicate (page_number, chunk_index) before any corpus mutation.
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

  -- Bump version first so parent trigger accepts new chunk rows; then replace
  -- corpus. Entire function runs in one transaction — failure rolls back.
  update public.ai_knowledge_sources
  set source_version = v_next_version,
      content_hash = v_new_hash,
      pending_content_hash = null,
      error_code = null,
      updated_at = now()
  where id = p_source_id;

  delete from public.ai_knowledge_chunks c
  where c.source_id = p_source_id;

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

  update public.ai_knowledge_sources
  set status = 'ready',
      updated_at = now()
  where id = p_source_id;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', v_next_version,
    'status', 'ready',
    'chunk_count', v_inserted
  );
end;
$$;

revoke all on function public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_finalize_ingest(uuid, integer, text, text, jsonb)
  to service_role;
