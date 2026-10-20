-- =============================================================================
-- 020_ai_knowledge_document_window.sql
-- =============================================================================
-- M2.5b — page-ordered window over an already indexed PDF.
-- Does not alter ai_knowledge_search, embeddings, or knowledge rows.
-- Not applied by this change. Deploy only with an explicit staging approval.
-- =============================================================================

begin;

create function public.ai_knowledge_document_window(
  p_user_id uuid,
  p_section_id uuid,
  p_source_object_id text,
  p_page_from integer,
  p_page_to integer,
  p_limit integer
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
set search_path = public
as $$
declare
  v_limit integer;
  v_object_id text;
begin
  v_object_id := trim(coalesce(p_source_object_id, ''));
  if p_user_id is null
     or p_section_id is null
     or v_object_id = ''
     or p_page_from is null
     or p_page_to is null
     or p_page_from < 1
     or p_page_to < p_page_from
     or p_page_to > 10000 then
    return;
  end if;

  -- Never return an entire PDF. The caller also trims to the prompt budget.
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 24);

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
    1.0::double precision
  from public.ai_knowledge_sources s
  inner join public.ai_knowledge_version_index vi
    on vi.source_id = s.id
   and vi.source_version = s.retrieval_source_version
   and vi.status = 'indexed'
  inner join public.ai_knowledge_chunks c
    on c.source_id = s.id
   and c.source_version = s.retrieval_source_version
   and c.user_id = p_user_id
   and c.section_id = p_section_id
   and c.page_number between p_page_from and p_page_to
  where s.user_id = p_user_id
    and s.section_id = p_section_id
    and s.source_object_id = v_object_id
    and s.source_kind = 'free_space_pdf'
    and s.status = 'ready'
    and s.retrieval_source_version is not null
  order by c.page_number asc, c.chunk_index asc
  limit v_limit;
end;
$$;

revoke all on function public.ai_knowledge_document_window(
  uuid, uuid, text, integer, integer, integer
) from public;
revoke all on function public.ai_knowledge_document_window(
  uuid, uuid, text, integer, integer, integer
) from anon;
revoke all on function public.ai_knowledge_document_window(
  uuid, uuid, text, integer, integer, integer
) from authenticated;
grant execute on function public.ai_knowledge_document_window(
  uuid, uuid, text, integer, integer, integer
) to service_role;

commit;
