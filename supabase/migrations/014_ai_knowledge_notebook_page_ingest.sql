-- =============================================================================
-- 014_ai_knowledge_notebook_page_ingest.sql
-- =============================================================================
-- M0.8C — Notebook page begin-ingest + blank invalidation RPCs.
--
-- Requires 013_ai_knowledge_notebook_pages.sql (schema foundation).
-- Reuses ai_knowledge_finalize_ingest for ready/failed corpus writes.
--
-- NO embeddings. NO search widening. NO Production apply in M0.8C.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. begin notebook page ingest (service_role)
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_begin_notebook_page_ingest(
  p_user_id uuid,
  p_section_id uuid,
  p_notebook_object_id text,
  p_page_id text,
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
  v_existing public.ai_knowledge_sources%rowtype;
  v_has_ready_corpus boolean;
  v_next_status text;
  v_file_name text;
begin
  if p_user_id is null
     or p_section_id is null
     or p_notebook_object_id is null
     or length(trim(p_notebook_object_id)) = 0
     or p_page_id is null
     or length(trim(p_page_id)) = 0 then
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
  where f.id = trim(p_notebook_object_id);

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_fso.user_id <> p_user_id or v_fso.section_id <> p_section_id then
    return jsonb_build_object('ok', false, 'code', 'auth_mismatch');
  end if;

  if coalesce(v_fso.object->>'type', '') <> 'notebook' then
    return jsonb_build_object('ok', false, 'code', 'not_notebook');
  end if;

  if not public.ai_knowledge_notebook_page_is_live(v_fso.object, trim(p_page_id)) then
    return jsonb_build_object('ok', false, 'code', 'notebook_page_not_found');
  end if;

  v_file_name := nullif(trim(coalesce(v_fso.object->>'title', '')), '');

  select * into v_existing
  from public.ai_knowledge_sources k
  where k.source_kind = 'notebook_page'
    and k.notebook_object_id = trim(p_notebook_object_id)
    and k.source_object_id = trim(p_page_id);

  if found then
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

    if v_has_ready_corpus and v_existing.status in ('ready', 'stale') then
      v_next_status := 'stale';
    else
      v_next_status := 'pending';
    end if;

    -- Do NOT change retrieval_source_version here (no blackout).
    update public.ai_knowledge_sources k
    set
      pending_content_hash = p_content_hash,
      file_name = coalesce(v_file_name, k.file_name),
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
      'retrieval_source_version', v_existing.retrieval_source_version,
      'idempotent', false
    );
  end if;

  insert into public.ai_knowledge_sources (
    user_id,
    section_id,
    source_kind,
    source_object_id,
    notebook_object_id,
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
    'notebook_page',
    trim(p_page_id),
    trim(p_notebook_object_id),
    null,
    null,
    p_content_hash,
    v_file_name,
    1,
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

revoke all on function public.ai_knowledge_begin_notebook_page_ingest(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.ai_knowledge_begin_notebook_page_ingest(
  uuid, uuid, text, text, text
) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Invalidate notebook page corpus (blank / cleared content)
-- -----------------------------------------------------------------------------
-- Clears retrieval_source_version so Ask cannot return stale text after a page
-- becomes blank/image-only/handwriting-only. Does not require client text.
-- Deletes non-retrieval safety: search already requires retrieval_source_version.

create or replace function public.ai_knowledge_invalidate_notebook_page_corpus(
  p_user_id uuid,
  p_section_id uuid,
  p_notebook_object_id text,
  p_page_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.ai_knowledge_sources%rowtype;
  v_had_retrieval boolean;
begin
  if p_user_id is null
     or p_section_id is null
     or p_notebook_object_id is null
     or length(trim(p_notebook_object_id)) = 0
     or p_page_id is null
     or length(trim(p_page_id)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_existing
  from public.ai_knowledge_sources k
  where k.source_kind = 'notebook_page'
    and k.notebook_object_id = trim(p_notebook_object_id)
    and k.source_object_id = trim(p_page_id)
    and k.user_id = p_user_id
    and k.section_id = p_section_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'cleared', false, 'source_id', null);
  end if;

  v_had_retrieval := v_existing.retrieval_source_version is not null;

  update public.ai_knowledge_sources
  set
    retrieval_source_version = null,
    pending_content_hash = null,
    content_hash = null,
    status = 'failed',
    error_code = 'extract_failed',
    updated_at = now()
  where id = v_existing.id;

  return jsonb_build_object(
    'ok', true,
    'cleared', v_had_retrieval,
    'source_id', v_existing.id
  );
end;
$$;

revoke all on function public.ai_knowledge_invalidate_notebook_page_corpus(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.ai_knowledge_invalidate_notebook_page_corpus(
  uuid, uuid, text, text
) to service_role;
