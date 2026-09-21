-- =============================================================================
-- 016_ai_knowledge_mixed_course_search.sql
-- =============================================================================
-- M0.8F — Mixed course search: free_space_pdf + notebook_page in one ranking.
--
-- Extends ai_knowledge_search (do NOT edit 013–015).
-- Scope remains authenticated user + authorized section only.
-- Returns source_kind + notebook_object_id; never returns vectors.
-- Titles for notebook citations are resolved from live FSO at Ask time.
--
-- RETURNS TABLE shape changes vs Production/012/013, so CREATE OR REPLACE is
-- insufficient. Replacement MUST be atomic: DROP + CREATE + grants in one txn.
-- If CREATE or GRANT fails, the transaction aborts and the old function remains.
-- =============================================================================

begin;

-- Exact Production input signature (uuid, uuid, vector, integer, text, integer).
drop function if exists public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
);

create function public.ai_knowledge_search(
  p_user_id uuid,
  p_section_id uuid,
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

  -- Single section-scoped similarity ranking across eligible indexed chunks.
  -- Eligible kinds: free_space_pdf + notebook_page (current retrieval version only).
  return query
  select
    s.id,
    s.source_kind,
    s.source_object_id,
    s.notebook_object_id,
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
    and s.source_kind in ('free_space_pdf', 'notebook_page')
    and s.status = 'ready'
    and s.retrieval_source_version is not null
    and (
      s.source_kind = 'free_space_pdf'
      or (
        s.source_kind = 'notebook_page'
        and s.notebook_object_id is not null
        and length(trim(s.notebook_object_id)) > 0
      )
    )
  order by e.embedding <=> p_query_embedding asc
  limit v_limit;
end;
$$;

revoke all on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) from public;
revoke all on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) from anon;
revoke all on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) from authenticated;
grant execute on function public.ai_knowledge_search(
  uuid, uuid, extensions.vector, integer, text, integer
) to service_role;

commit;
