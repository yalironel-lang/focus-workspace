-- =============================================================================
-- 018_ai_knowledge_early_source_version.sql
-- =============================================================================
-- M1.0B B3.2.1 — Early source_version allocation for async page recovery.
--
-- Approved Option A:
--   source_version = immutable processing/text tip (allocated at NEW begin)
--   retrieval_source_version = published retrieval pointer (may lag)
--
-- PDF begin_ingest:
--   On a genuinely NEW replacement attempt, bump source_version immediately.
--   Idempotent same-hash resume does NOT bump.
--   retrieval_source_version is never changed here.
--
-- Shared finalize_ingest:
--   If chunks already exist AT p_source_version → legacy bump (Notebook +
--   pre-early-allocation PDF paths).
--   Else → use p_source_version as the write tip (early-reserved / first ingest).
--   Never double-bump an early-reserved tip.
--
-- Notebook:
--   ai_knowledge_begin_notebook_page_ingest is UNCHANGED (no early bump).
--   Shared finalize keeps Notebook replacement behavior via "chunks at tip → bump".
--
-- DOES NOT: apply recovery wiring, publish retrieval, OCR, or touch Production.
-- Apply to STAGING only after project lmgrhmyurhjlwwdedojk is ACTIVE.
-- =============================================================================

comment on column public.ai_knowledge_sources.source_version is
  'Immutable processing/text tip. Allocated at NEW begin_ingest attempt (M1.0B B3.2.1). May lead retrieval_source_version while recovery/processing is in flight.';

comment on column public.ai_knowledge_sources.retrieval_source_version is
  'Version currently eligible for semantic retrieval. Null = nothing indexed yet. Remains on N while source_version tip N+1 is processing.';

-- -----------------------------------------------------------------------------
-- 1. PDF begin_ingest — early tip allocation on NEW attempts
-- -----------------------------------------------------------------------------
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
  v_has_chunks_at_tip boolean;
  v_has_older_chunks boolean;
  v_next_status text;
  v_next_version integer;
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
    and k.source_object_id = p_source_object_id
  for update;

  if found then
    -- Idempotent: same in-flight hash while pending/processing/stale — NO bump.
    if v_existing.status in ('pending', 'processing', 'stale')
       and p_content_hash is not distinct from v_existing.pending_content_hash then
      return jsonb_build_object(
        'ok', true,
        'source_id', v_existing.id,
        'source_version', v_existing.source_version,
        'status', v_existing.status,
        'retrieval_source_version', v_existing.retrieval_source_version,
        'idempotent', true
      );
    end if;

    -- Idempotent: same ready hash while ready — NO bump.
    if v_existing.status = 'ready'
       and p_content_hash is not distinct from v_existing.content_hash then
      return jsonb_build_object(
        'ok', true,
        'source_id', v_existing.id,
        'source_version', v_existing.source_version,
        'status', v_existing.status,
        'retrieval_source_version', v_existing.retrieval_source_version,
        'idempotent', true
      );
    end if;

    select exists (
      select 1 from public.ai_knowledge_chunks c where c.source_id = v_existing.id
    ) into v_has_ready_corpus;

    select exists (
      select 1
      from public.ai_knowledge_chunks c
      where c.source_id = v_existing.id
        and c.source_version = v_existing.source_version
    ) into v_has_chunks_at_tip;

    select exists (
      select 1
      from public.ai_knowledge_chunks c
      where c.source_id = v_existing.id
        and c.source_version < v_existing.source_version
    ) into v_has_older_chunks;

    -- Preserve READY corpus: mark stale when replacing an existing ready set.
    if v_has_ready_corpus and v_existing.status in ('ready', 'stale') then
      v_next_status := 'stale';
    else
      v_next_status := 'pending';
    end if;

    -- Early allocation (Option A):
    -- - Tip already has written chunks → reserve N+1 for replacement.
    -- - Tip reserved but abandoned (older chunks exist, none at tip) + NEW hash
    --   → abandon tip and reserve N+2.
    -- - No corpus yet → keep tip (typically 1).
    v_next_version := v_existing.source_version;
    if v_has_chunks_at_tip or (v_has_older_chunks and not v_has_chunks_at_tip) then
      v_next_version := v_existing.source_version + 1;
    end if;

    -- Do NOT change retrieval_source_version (N stays active while tip advances).
    update public.ai_knowledge_sources k
    set
      storage_path = v_storage_path,
      pending_content_hash = p_content_hash,
      file_name = coalesce(v_file_name, k.file_name),
      page_count = coalesce(v_page_count, k.page_count),
      status = v_next_status,
      error_code = null,
      source_version = v_next_version,
      updated_at = now()
    where k.id = v_existing.id
    returning * into v_existing;

    return jsonb_build_object(
      'ok', true,
      'source_id', v_existing.id,
      'source_version', v_existing.source_version,
      'status', v_existing.status,
      'retrieval_source_version', v_existing.retrieval_source_version,
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
    'retrieval_source_version', v_existing.retrieval_source_version,
    'idempotent', false
  );
end;
$$;

revoke all on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_begin_ingest(uuid, uuid, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 2. Shared finalize_ingest — no double-bump of early-reserved tip
-- -----------------------------------------------------------------------------
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
  v_has_chunks_at_tip boolean;
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

  select exists (
    select 1
    from public.ai_knowledge_chunks c
    where c.source_id = p_source_id
      and c.source_version = p_source_version
  ) into v_has_chunks_at_tip;

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

    -- Preserve any existing READY corpus / retrieval. Clear only in-flight hash.
    -- Do NOT roll tip backward; abandoned tip may remain ahead of retrieval.
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
        'preserved_corpus', true,
        'retrieval_source_version', (
          select retrieval_source_version
          from public.ai_knowledge_sources
          where id = p_source_id
        )
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
      'preserved_corpus', false,
      'retrieval_source_version', null
    );
  end if;

  -- ready — validate payload before mutating
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

  -- Version write target:
  -- - chunks already at tip → legacy bump (Notebook / pre-018 PDF)
  -- - no chunks at tip → early-reserved tip or first ingest (use p_source_version)
  if v_has_chunks_at_tip then
    v_next_version := p_source_version + 1;
  else
    v_next_version := p_source_version;
  end if;

  v_new_hash := coalesce(v_source.pending_content_hash, v_source.content_hash);

  -- Advance/confirm text tip. Do NOT delete prior version chunks.
  -- Do NOT change retrieval_source_version here (B3.3 publishes later).
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
