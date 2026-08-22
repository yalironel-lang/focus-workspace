-- =============================================================================
-- 006_free_space_boards_v1.sql
-- =============================================================================
-- Cloud source of truth for Free Space board/space definitions (section-scoped).
--
-- Composite PK (section_id, id): `main` is canonical per section.
-- Aligns with free_space_objects.board_id text ids (no FK — objects may predate board row).
-- Additive, idempotent. Solo-owner RLS via sections.user_id = auth.uid().
-- =============================================================================

create table if not exists public.free_space_boards (
  section_id  uuid not null references public.sections(id) on delete cascade,
  id          text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (section_id, id)
);

create index if not exists free_space_boards_section_idx
  on public.free_space_boards (section_id);

create index if not exists free_space_boards_user_idx
  on public.free_space_boards (user_id);

create or replace function public.free_space_boards_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_free_space_boards_updated_at on public.free_space_boards;
create trigger trg_free_space_boards_updated_at
  before update on public.free_space_boards
  for each row execute function public.free_space_boards_set_updated_at();

alter table public.free_space_boards enable row level security;

grant select, insert, update, delete on public.free_space_boards to authenticated;

drop policy if exists "Users can view own free_space_boards" on public.free_space_boards;
drop policy if exists "Users can insert own free_space_boards" on public.free_space_boards;
drop policy if exists "Users can update own free_space_boards" on public.free_space_boards;
drop policy if exists "Users can delete own free_space_boards" on public.free_space_boards;

create policy "Users can view own free_space_boards"
  on public.free_space_boards for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_boards.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can insert own free_space_boards"
  on public.free_space_boards for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_boards.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can update own free_space_boards"
  on public.free_space_boards for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_boards.section_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = free_space_boards.section_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can delete own free_space_boards"
  on public.free_space_boards for delete
  using (
    auth.uid() = user_id
    and id <> 'main'
    and exists (
      select 1 from public.sections s
      where s.id = free_space_boards.section_id
        and s.user_id = auth.uid()
    )
  );

-- Realtime publication (same pattern as 005).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'free_space_boards'
  ) then
    execute 'alter publication supabase_realtime add table public.free_space_boards';
  end if;
end $$;
