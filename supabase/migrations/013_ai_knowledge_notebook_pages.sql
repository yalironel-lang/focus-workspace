-- =============================================================================
-- 013_ai_knowledge_notebook_pages.sql
-- =============================================================================
-- M0.8B — Notebook page knowledge source foundation (schema + ownership only).
--
-- Extends Course Knowledge to allow:
--   source_kind = 'notebook_page'
--   source_object_id = stable NotebookPage.id (NOT an FSO id)
--   notebook_object_id = parent notebook free_space_objects.id
--
-- Preserves live free_space_pdf integrity:
--   - PDF ownership / storage_path rules unchanged
--   - PDF FSO delete still removes PDF knowledge (explicit cascade trigger)
--   - begin_ingest remains PDF-only (fail-closed for notebook_page)
--   - ai_knowledge_search remains PDF-only until M0.8F (fail-closed)
--
-- Soft-deleted Notebook pages are removed from content.pages (client tombstone
-- in IndexedDB). Nested page delete cannot cascade via FK; M0.8E+ lifecycle
-- must delete the notebook_page knowledge source explicitly. Parent Notebook
-- FSO delete cascades all page sources via notebook_object_id FK.
--
-- NO extraction. NO embeddings. NO client handoff. NO provider calls.
-- DO NOT apply to Production in this milestone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns + kind constraint
-- -----------------------------------------------------------------------------

-- Parent notebook FSO for notebook_page sources. NULL for free_space_pdf.
alter table public.ai_knowledge_sources
  add column if not exists notebook_object_id text;

comment on column public.ai_knowledge_sources.notebook_object_id is
  'Parent notebook free_space_objects.id for source_kind=notebook_page. NULL for free_space_pdf. Titles derived at retrieval from canonical FSO.';

-- Drop PDF-only source_kind check (name is PostgreSQL default from 011).
alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_source_kind_check;

alter table public.ai_knowledge_sources
  add constraint ai_knowledge_sources_source_kind_check
  check (source_kind in ('free_space_pdf', 'notebook_page'));

-- storage_path is PDF-only. Notebook pages have no Storage object.
alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_storage_path_check;

alter table public.ai_knowledge_sources
  alter column storage_path drop not null;

-- Kind-aware identity / storage shape (defense in depth with ownership trigger).
alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_kind_shape_check;

alter table public.ai_knowledge_sources
  add constraint ai_knowledge_sources_kind_shape_check
  check (
    (
      source_kind = 'free_space_pdf'
      and notebook_object_id is null
      and storage_path is not null
      and length(trim(storage_path)) > 0
    )
    or
    (
      source_kind = 'notebook_page'
      and notebook_object_id is not null
      and length(trim(notebook_object_id)) > 0
      and storage_path is null
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Foreign keys / cascade
-- -----------------------------------------------------------------------------
-- Polymorphic identity:
--   free_space_pdf.source_object_id  = PDF FSO id
--   notebook_page.source_object_id   = NotebookPage.id (not an FSO row)
-- PostgreSQL cannot express a conditional FK on source_object_id cleanly.
-- Therefore:
--   - Drop source_object_id → free_space_objects FK
--   - Add notebook_object_id → free_space_objects ON DELETE CASCADE (notebook pages)
--   - AFTER DELETE on free_space_objects removes free_space_pdf rows by source_object_id
-- PDF ownership trigger still proves source_object_id is a live PDF FSO.

alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_source_object_id_fkey;

-- Attach parent-FSO FK for notebook pages (idempotent: drop then add).
alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_notebook_object_id_fkey;

alter table public.ai_knowledge_sources
  add constraint ai_knowledge_sources_notebook_object_id_fkey
  foreign key (notebook_object_id)
  references public.free_space_objects(id)
  on delete cascade;

create index if not exists ai_knowledge_sources_notebook_object_idx
  on public.ai_knowledge_sources (notebook_object_id)
  where notebook_object_id is not null;

-- PDF cascade replacement for the dropped source_object_id FK.
create or replace function public.ai_knowledge_sources_cascade_pdf_fso_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_knowledge_sources k
  where k.source_kind = 'free_space_pdf'
    and k.source_object_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_ai_knowledge_sources_cascade_pdf_fso_delete
  on public.free_space_objects;
create trigger trg_ai_knowledge_sources_cascade_pdf_fso_delete
  after delete on public.free_space_objects
  for each row
  execute function public.ai_knowledge_sources_cascade_pdf_fso_delete();

revoke all on function public.ai_knowledge_sources_cascade_pdf_fso_delete()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Uniqueness / identity
-- -----------------------------------------------------------------------------
-- Page IDs are generated as `page-${Date.now()}-${seq}` and legacy `page-1`.
-- Not provably globally unique across notebooks → scope by parent notebook.
-- PDF identity remains (source_kind, source_object_id).

alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_object_identity_uq;

create unique index if not exists ai_knowledge_sources_pdf_identity_uq
  on public.ai_knowledge_sources (source_kind, source_object_id)
  where source_kind = 'free_space_pdf';

create unique index if not exists ai_knowledge_sources_notebook_page_identity_uq
  on public.ai_knowledge_sources (source_kind, notebook_object_id, source_object_id)
  where source_kind = 'notebook_page';

-- -----------------------------------------------------------------------------
-- 4. Page membership helper (canonical FSO JSON)
-- -----------------------------------------------------------------------------
-- Free Space payload shape: object = ProjectSpaceObject JSON
--   object.type = 'notebook'
--   object.content.pages = NotebookPage[] (live pages only)
-- Soft-deleted pages are removed from content.pages (tombstone is client IDB).

create or replace function public.ai_knowledge_notebook_page_is_live(
  p_object jsonb,
  p_page_id text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_page_id is not null
    and length(trim(p_page_id)) > 0
    and p_object is not null
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_object->'content'->'pages') = 'array'
            then p_object->'content'->'pages'
          else '[]'::jsonb
        end
      ) page
      where page->>'id' = p_page_id
    );
$$;

revoke all on function public.ai_knowledge_notebook_page_is_live(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_notebook_page_is_live(jsonb, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 5. Kind-aware ownership trigger
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_sources_enforce_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fso_user uuid;
  v_fso_section uuid;
  v_fso_type text;
  v_fso_object jsonb;
  v_section_owner uuid;
  v_expected_path text;
  v_parent_id text;
begin
  if new.source_kind = 'free_space_pdf' then
    if new.notebook_object_id is not null then
      raise exception 'ai_knowledge_invalid_notebook_object_id';
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
  end if;

  if new.source_kind = 'notebook_page' then
    if new.notebook_object_id is null or length(trim(new.notebook_object_id)) = 0 then
      raise exception 'ai_knowledge_notebook_object_required';
    end if;

    if new.storage_path is not null then
      raise exception 'ai_knowledge_storage_path_mismatch';
    end if;

    if new.source_object_id is null or length(trim(new.source_object_id)) = 0 then
      raise exception 'ai_knowledge_page_id_required';
    end if;

    -- Parent notebook FSO is authoritative for ownership (not client-forged pairs alone).
    v_parent_id := trim(new.notebook_object_id);

    select f.user_id, f.section_id, f.object->>'type', f.object
      into v_fso_user, v_fso_section, v_fso_type, v_fso_object
    from public.free_space_objects f
    where f.id = v_parent_id;

    if v_fso_user is null then
      raise exception 'ai_knowledge_notebook_object_not_found';
    end if;

    if v_fso_user <> new.user_id or v_fso_section <> new.section_id then
      raise exception 'ai_knowledge_ownership_mismatch';
    end if;

    if v_fso_type is distinct from 'notebook' then
      raise exception 'ai_knowledge_not_notebook';
    end if;

    select s.user_id into v_section_owner
    from public.sections s
    where s.id = new.section_id;

    if v_section_owner is null or v_section_owner <> new.user_id then
      raise exception 'ai_knowledge_section_ownership_mismatch';
    end if;

    -- Page must exist in canonical live Notebook JSON (tombstoned pages are absent).
    if not public.ai_knowledge_notebook_page_is_live(v_fso_object, new.source_object_id) then
      raise exception 'ai_knowledge_page_not_found';
    end if;

    return new;
  end if;

  raise exception 'ai_knowledge_invalid_source_kind';
end;
$$;

-- Trigger already exists from 011; replace function body above is sufficient.
drop trigger if exists trg_ai_knowledge_sources_enforce_ownership
  on public.ai_knowledge_sources;
create trigger trg_ai_knowledge_sources_enforce_ownership
  before insert or update on public.ai_knowledge_sources
  for each row execute function public.ai_knowledge_sources_enforce_ownership();

-- -----------------------------------------------------------------------------
-- 6. Search fail-closed for notebook_page until M0.8F
-- -----------------------------------------------------------------------------
-- PDF retrieval behavior unchanged; notebook_page rows cannot surface even if
-- mistakenly indexed before citation/extraction work lands.

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
  -- M0.8B: PDF-only until Notebook extraction + citations land (M0.8F).
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
    and s.source_kind = 'free_space_pdf'
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

-- -----------------------------------------------------------------------------
-- 7. Grants unchanged (reaffirm mutation lock-down)
-- -----------------------------------------------------------------------------
revoke all on table public.ai_knowledge_sources from anon, authenticated;
grant select on table public.ai_knowledge_sources to authenticated;
grant select, insert, update, delete on table public.ai_knowledge_sources to service_role;

-- begin_ingest / finalize / index RPCs intentionally unchanged (PDF-only seams).
-- Notebook ingest RPC arrives in M0.8C after dialect extraction exists.
