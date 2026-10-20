-- =============================================================================
-- 021_ai_knowledge_pdf_source_search.sql
-- =============================================================================
-- Source-scoped similarity search for one indexed PDF.
-- Does not alter ai_knowledge_search, ai_knowledge_document_window, or rows.
-- The source identity is applied before ranking and limiting.
-- Not applied by this change. Deploy only with an explicit staging approval.
-- =============================================================================

begin;

create function public.ai_knowledge_search_pdf_source(
  p_user_id uuid,
  p_section_id uuid,
  p_source_object_id text,
  p_query_embedding extensions.vector(1536),
  p_limit integer,
  p_embedding_model text,
  p_embedding_dimensions integer
)
returns table (
  source_id uuid,
  source_kind text,
  source_object_id text,
  notebook_object_id text,
  file_name text,
  page_count integer,
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
  v_object_id text;
begin
  v_object_id := trim(coalesce(p_source_object_id, ''));
  if p_user_id is null
     or p_section_id is null
     or v_object_id = ''
     or p_query_embedding is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536 then
    return;
  end if;

  -- Same candidate cap as section search. The caller still trims to the prompt budget.
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 12);

  -- Restrict to this owner's current indexed version of this PDF before ranking.
  -- A stale source_version cannot join. Another PDF or notebook cannot join.
  return query
  select
    s.id,
    s.source_kind,
    s.source_object_id,
    s.notebook_object_id,
    s.file_name,
    s.page_count,
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
    and s.source_object_id = v_object_id
    and s.source_kind = 'free_space_pdf'
    and s.status = 'ready'
    and s.retrieval_source_version is not null
  order by e.embedding <=> p_query_embedding asc
  limit v_limit;
end;
$$;

revoke all on function public.ai_knowledge_search_pdf_source(
  uuid, uuid, text, extensions.vector, integer, text, integer
) from public;
revoke all on function public.ai_knowledge_search_pdf_source(
  uuid, uuid, text, extensions.vector, integer, text, integer
) from anon;
revoke all on function public.ai_knowledge_search_pdf_source(
  uuid, uuid, text, extensions.vector, integer, text, integer
) from authenticated;
grant execute on function public.ai_knowledge_search_pdf_source(
  uuid, uuid, text, extensions.vector, integer, text, integer
) to service_role;

commit;
