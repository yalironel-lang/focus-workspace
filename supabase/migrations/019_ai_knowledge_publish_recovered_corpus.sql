-- =============================================================================
-- 019_ai_knowledge_publish_recovered_corpus.sql
-- =============================================================================
-- M1.0B B3.3B — Atomic retrieval publication for recovered PDF corpus.
--
-- Dedicated transactional RPC (does NOT evolve finalize_index_success):
--   - PDF / free_space_pdf only (Notebook keeps finalize_index_success)
--   - Revalidates tip authority, page ledger 1..P, recovery terminal,
--     chunk/embedding completeness INSIDE one transaction
--   - Flips retrieval_source_version N → N+1 only on full success
--   - Marks version_index indexed
--   - Idempotent when already published to expected version
--   - Never deletes prior N artifacts
--
-- Apply to STAGING only (lmgrhmyurhjlwwdedojk). Do NOT apply Production here.
-- =============================================================================

comment on column public.ai_knowledge_sources.retrieval_source_version is
  'Version currently eligible for semantic retrieval. Null = nothing indexed yet. Advanced only by finalize_index_success (generic) or ai_knowledge_publish_recovered_corpus (PDF B3.3B).';

create or replace function public.ai_knowledge_publish_recovered_corpus(
  p_source_id uuid,
  p_expected_source_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_idx public.ai_knowledge_version_index%rowtype;
  v_page_count integer;
  v_page_rows integer;
  v_dup_pages integer;
  v_chunk_count integer;
  v_embed_count integer;
  v_prev_retrieval integer;
  v_model text;
  v_p integer;
  v_reasons jsonb;
  v_needs_recovery boolean;
  v_job_count integer;
begin
  if p_source_id is null
     or p_expected_source_version is null
     or p_expected_source_version < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Linearization: lock source row for the duration of publication.
  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_source.source_kind is distinct from 'free_space_pdf' then
    return jsonb_build_object('ok', false, 'code', 'not_pdf');
  end if;

  v_prev_retrieval := v_source.retrieval_source_version;

  -- Idempotent success: already published to the expected version.
  if v_prev_retrieval is not distinct from p_expected_source_version then
    select * into v_idx
    from public.ai_knowledge_version_index i
    where i.source_id = p_source_id
      and i.source_version = p_expected_source_version
    for update;

    if not found or v_idx.status is distinct from 'indexed' then
      return jsonb_build_object('ok', false, 'code', 'incomplete_index');
    end if;

    select count(*)::integer into v_chunk_count
    from public.ai_knowledge_chunks c
    where c.source_id = p_source_id
      and c.source_version = p_expected_source_version;

    select count(*)::integer into v_embed_count
    from public.ai_knowledge_embeddings e
    where e.source_id = p_source_id
      and e.source_version = p_expected_source_version
      and e.embedding_model = v_idx.embedding_model
      and e.embedding_dimensions = 1536;

    if v_chunk_count < 1 or v_embed_count is distinct from v_chunk_count then
      return jsonb_build_object('ok', false, 'code', 'incomplete_embeddings');
    end if;

    return jsonb_build_object(
      'ok', true,
      'already_published', true,
      'source_id', p_source_id,
      'source_version', p_expected_source_version,
      'retrieval_source_version', p_expected_source_version,
      'previous_retrieval_source_version', v_prev_retrieval,
      'chunk_count', v_chunk_count
    );
  end if;

  -- Never move the pointer backward or publish a superseded tip.
  if v_prev_retrieval is not null and v_prev_retrieval > p_expected_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_processing_version');
  end if;

  -- Fresh publish requires expected version to still be the processing tip.
  if v_source.source_version is distinct from p_expected_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_processing_version');
  end if;

  if v_source.status is distinct from 'ready' then
    return jsonb_build_object('ok', false, 'code', 'not_ready');
  end if;

  v_page_count := v_source.page_count;
  if v_page_count is null or v_page_count < 1 then
    return jsonb_build_object('ok', false, 'code', 'missing_page_count');
  end if;

  -- Canonical page ledger: exact 1..P, no duplicates, exact version.
  select count(*)::integer into v_page_rows
  from public.ai_knowledge_page_texts t
  where t.source_id = p_source_id
    and t.source_version = p_expected_source_version;

  if v_page_rows is distinct from v_page_count then
    return jsonb_build_object('ok', false, 'code', 'missing_page');
  end if;

  select count(*)::integer into v_dup_pages
  from (
    select t.page_number
    from public.ai_knowledge_page_texts t
    where t.source_id = p_source_id
      and t.source_version = p_expected_source_version
    group by t.page_number
    having count(*) > 1
  ) d;

  if coalesce(v_dup_pages, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'duplicate_page');
  end if;

  for v_p in 1..v_page_count loop
    if not exists (
      select 1
      from public.ai_knowledge_page_texts t
      where t.source_id = p_source_id
        and t.source_version = p_expected_source_version
        and t.page_number = v_p
    ) then
      return jsonb_build_object('ok', false, 'code', 'missing_page');
    end if;
  end loop;

  if exists (
    select 1
    from public.ai_knowledge_page_texts t
    where t.source_id = p_source_id
      and t.source_version = p_expected_source_version
      and t.page_number > v_page_count
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Recovery terminal gate (mirrors page-recovery-policy-v1 AUTO triggers).
  if exists (
    select 1
    from public.ai_knowledge_page_recovery_jobs j
    where j.source_id = p_source_id
      and j.source_version = p_expected_source_version
      and j.status = 'discarded_stale'
  ) then
    return jsonb_build_object('ok', false, 'code', 'discarded_stale_authority');
  end if;

  if exists (
    select 1
    from public.ai_knowledge_page_recovery_jobs j
    where j.source_id = p_source_id
      and j.source_version = p_expected_source_version
      and j.status not in ('succeeded', 'unusable', 'failed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'recovery_not_terminal');
  end if;

  for v_p, v_reasons in
    select t.page_number, t.detector_reasons
    from public.ai_knowledge_page_texts t
    where t.source_id = p_source_id
      and t.source_version = p_expected_source_version
  loop
    v_needs_recovery := exists (
      select 1
      from jsonb_array_elements_text(coalesce(v_reasons, '[]'::jsonb)) as reason(val)
      where reason.val in ('SHELL_WITH_MISSING_CONTENT', 'LOW_TEXT_ITEM_COUNT')
    );
    if v_needs_recovery then
      select count(*)::integer
        into v_job_count
      from public.ai_knowledge_page_recovery_jobs j
      where j.source_id = p_source_id
        and j.source_version = p_expected_source_version
        and j.page_number = v_p;

      if coalesce(v_job_count, 0) < 1 then
        return jsonb_build_object('ok', false, 'code', 'missing_required_job');
      end if;
    end if;
  end loop;

  -- Version index + embedding completeness (B3.3A leaves status=indexing).
  select * into v_idx
  from public.ai_knowledge_version_index i
  where i.source_id = p_source_id
    and i.source_version = p_expected_source_version
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'incomplete_index');
  end if;

  if v_idx.status = 'index_failed' or v_idx.status = 'unindexed' then
    return jsonb_build_object('ok', false, 'code', 'incomplete_index');
  end if;

  if v_idx.status not in ('indexing', 'indexed') then
    return jsonb_build_object('ok', false, 'code', 'incomplete_index');
  end if;

  if v_idx.embedding_model is null
     or length(trim(v_idx.embedding_model)) = 0
     or v_idx.embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'incomplete_index');
  end if;

  v_model := trim(v_idx.embedding_model);

  select count(*)::integer into v_chunk_count
  from public.ai_knowledge_chunks c
  where c.source_id = p_source_id
    and c.source_version = p_expected_source_version;

  select count(*)::integer into v_embed_count
  from public.ai_knowledge_embeddings e
  where e.source_id = p_source_id
    and e.source_version = p_expected_source_version
    and e.embedding_model = v_model
    and e.embedding_dimensions = 1536;

  if v_chunk_count < 1 or v_embed_count is distinct from v_chunk_count then
    return jsonb_build_object('ok', false, 'code', 'incomplete_embeddings');
  end if;

  if exists (
    select 1
    from public.ai_knowledge_chunks c
    where c.source_id = p_source_id
      and c.source_version = p_expected_source_version
      and not exists (
        select 1
        from public.ai_knowledge_embeddings e
        where e.chunk_id = c.id
          and e.embedding_model = v_model
          and e.embedding_dimensions = 1536
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'incomplete_embeddings');
  end if;

  -- Commit publication: indexed + retrieval flip in this transaction only.
  update public.ai_knowledge_version_index
  set status = 'indexed',
      error_code = null,
      updated_at = now()
  where source_id = p_source_id
    and source_version = p_expected_source_version;

  update public.ai_knowledge_sources
  set retrieval_source_version = p_expected_source_version,
      updated_at = now()
  where id = p_source_id;

  return jsonb_build_object(
    'ok', true,
    'already_published', false,
    'source_id', p_source_id,
    'source_version', p_expected_source_version,
    'retrieval_source_version', p_expected_source_version,
    'previous_retrieval_source_version', v_prev_retrieval,
    'chunk_count', v_chunk_count,
    'page_count', v_page_count
  );
end;
$$;

revoke all on function public.ai_knowledge_publish_recovered_corpus(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_publish_recovered_corpus(uuid, integer)
  to service_role;
