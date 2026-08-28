-- =============================================================================
-- 007_workspace_extensions.sql
-- =============================================================================
-- Version-control the workspace extension schema already present in production:
--   sections.exam_date, deadlines, schedule_blocks, course_links
--
-- Additive and idempotent. Safe to apply to:
--   • a fresh database built from 002 → 004 → 005 → 006 → 007
--   • the existing production database where these objects already exist
--
-- Does NOT: drop/recreate tables, alter column types/nullability, mutate rows,
--           replace existing FKs, or replace existing policies.
-- Does NOT apply draft 003_proof_of_cloud.sql.
--
-- Production source of truth (verified pre-flight):
--   RLS enabled; policies auth.uid() = user_id
--   section_id FKs:
--     deadlines_section_id_fkey       → ON DELETE SET NULL
--     schedule_blocks_section_id_fkey → ON DELETE SET NULL
--     course_links_section_id_fkey    → ON DELETE CASCADE
--   course_links.created_at is nullable; schedule_blocks.day_of_week is smallint
--
-- Fresh-DB policies (created only when absent) add WITH CHECK that a non-null
-- section_id must reference a section owned by auth.uid(). Existing production
-- policies are preserved untouched.
-- =============================================================================


-- ─────────────────────────────────────────────
-- 1. sections.exam_date
-- ─────────────────────────────────────────────

alter table public.sections
  add column if not exists exam_date date;


-- ─────────────────────────────────────────────
-- 2. deadlines
-- ─────────────────────────────────────────────

create table if not exists public.deadlines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  section_id  uuid,
  title       text not null,
  type        text not null,
  due_date    date not null,
  notes       text,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deadlines_section_id_fkey'
      and conrelid = 'public.deadlines'::regclass
  ) then
    alter table public.deadlines
      add constraint deadlines_section_id_fkey
      foreign key (section_id) references public.sections(id)
      on delete set null;
  end if;
end $$;


-- ─────────────────────────────────────────────
-- 3. schedule_blocks
-- ─────────────────────────────────────────────

create table if not exists public.schedule_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  section_id   uuid,
  title        text not null,
  day_of_week  smallint not null,
  start_time   time not null,
  end_time     time not null,
  location     text,
  link         text,
  color        text not null default 'indigo',
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'schedule_blocks_section_id_fkey'
      and conrelid = 'public.schedule_blocks'::regclass
  ) then
    alter table public.schedule_blocks
      add constraint schedule_blocks_section_id_fkey
      foreign key (section_id) references public.sections(id)
      on delete set null;
  end if;
end $$;


-- ─────────────────────────────────────────────
-- 4. course_links
-- ─────────────────────────────────────────────

create table if not exists public.course_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  section_id   uuid,
  label        text not null,
  url          text not null,
  type         text not null default 'custom',
  scope        text not null default 'course',
  order_index  integer not null default 0,
  created_at   timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'course_links_section_id_fkey'
      and conrelid = 'public.course_links'::regclass
  ) then
    alter table public.course_links
      add constraint course_links_section_id_fkey
      foreign key (section_id) references public.sections(id)
      on delete cascade;
  end if;
end $$;


-- ─────────────────────────────────────────────
-- 5. RLS + grants (match verified production ownership model)
-- ─────────────────────────────────────────────

alter table public.deadlines        enable row level security;
alter table public.schedule_blocks  enable row level security;
alter table public.course_links     enable row level security;

grant select, insert, update, delete on public.deadlines        to authenticated;
grant select, insert, update, delete on public.schedule_blocks  to authenticated;
grant select, insert, update, delete on public.course_links     to authenticated;

-- Policies: create only when absent. Existing production policies are untouched.
-- Fresh-DB WITH CHECK also requires non-null section_id to belong to auth.uid().

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'deadlines'
      and policyname = 'Users manage own deadlines'
  ) then
    create policy "Users manage own deadlines"
      on public.deadlines
      for all
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and (
          section_id is null
          or exists (
            select 1 from public.sections s
            where s.id = section_id
              and s.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_blocks'
      and policyname = 'Users manage own schedule blocks'
  ) then
    create policy "Users manage own schedule blocks"
      on public.schedule_blocks
      for all
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and (
          section_id is null
          or exists (
            select 1 from public.sections s
            where s.id = section_id
              and s.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'course_links'
      and policyname = 'Users manage own course links'
  ) then
    create policy "Users manage own course links"
      on public.course_links
      for all
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and (
          section_id is null
          or exists (
            select 1 from public.sections s
            where s.id = section_id
              and s.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;
