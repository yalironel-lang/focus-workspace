-- =============================================================================
-- 004_free_space_objects_v1.sql
-- =============================================================================
-- Queue-compatible cloud destination for Free Space object CREATE ops.
--
-- Matches PR 3 pending_operations payload:
--   entityType = 'free_space_object'
--   entityId   = local ProjectSpaceObject.id (text, NOT uuid)
--   workspaceId := sectionId
--   payload    = { boardId: text, object: jsonb }
--
-- Intentionally does NOT apply draft 003_proof_of_cloud.sql (uuid PK, boards FK,
-- membership, narrow type CHECK — incompatible with queued local ids).
--
-- Additive only. Idempotent. Solo-owner RLS via sections.user_id = auth.uid().
-- =============================================================================

create table if not exists public.free_space_objects (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  section_id  uuid not null references public.sections(id) on delete cascade,
  board_id    text not null default '',
  object      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists free_space_objects_section_idx
  on public.free_space_objects (section_id);

create index if not exists free_space_objects_user_idx
  on public.free_space_objects (user_id);

-- Keep updated_at honest on UPDATE (server clock).
create or replace function public.free_space_objects_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_free_space_objects_updated_at on public.free_space_objects;
create trigger trg_free_space_objects_updated_at
  before update on public.free_space_objects
  for each row execute function public.free_space_objects_set_updated_at();

alter table public.free_space_objects enable row level security;

grant select, insert, update, delete on public.free_space_objects to authenticated;

-- Ownership: caller must be the row user AND own the section (defense in depth).
drop policy if exists "Users can view own free_space_objects" on public.free_space_objects;
drop policy if exists "Users can insert own free_space_objects" on public.free_space_objects;
drop policy if exists "Users can update own free_space_objects" on public.free_space_objects;
drop policy if exists "Users can delete own free_space_objects" on public.free_space_objects;

create policy "Users can view own free_space_objects"
  on public.free_space_objects for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_objects.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can insert own free_space_objects"
  on public.free_space_objects for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_objects.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can update own free_space_objects"
  on public.free_space_objects for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_objects.section_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_objects.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can delete own free_space_objects"
  on public.free_space_objects for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_objects.section_id
        and s.user_id = auth.uid()
    )
  );
