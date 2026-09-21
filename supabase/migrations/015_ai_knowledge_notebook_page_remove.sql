-- =============================================================================
-- 015_ai_knowledge_notebook_page_remove.sql
-- =============================================================================
-- M0.8E — Authoritative remove of notebook_page knowledge on page soft-delete.
-- Cascades chunks/embeddings/version_index via source FK.
-- DO NOT apply to Production in this milestone.
-- =============================================================================

create or replace function public.ai_knowledge_remove_notebook_page_source(
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
  v_deleted integer := 0;
begin
  if p_user_id is null
     or p_section_id is null
     or p_notebook_object_id is null
     or length(trim(p_notebook_object_id)) = 0
     or p_page_id is null
     or length(trim(p_page_id)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  delete from public.ai_knowledge_sources k
  where k.source_kind = 'notebook_page'
    and k.notebook_object_id = trim(p_notebook_object_id)
    and k.source_object_id = trim(p_page_id)
    and k.user_id = p_user_id
    and k.section_id = p_section_id;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted > 0,
    'deleted_count', v_deleted
  );
end;
$$;

revoke all on function public.ai_knowledge_remove_notebook_page_source(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.ai_knowledge_remove_notebook_page_source(
  uuid, uuid, text, text
) to service_role;
