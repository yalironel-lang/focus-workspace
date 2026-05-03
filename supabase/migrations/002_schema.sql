-- =============================================================
-- Focus App — Complete Schema
-- Safe to run multiple times (idempotent).
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
-- =============================================================


-- ─────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────

create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections(id) on delete cascade,
  title       text not null,
  order_index integer not null default 0
);

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  type        text not null check (type in ('task', 'file', 'link', 'note')),
  title       text not null,
  content     text,
  file_path   text,
  completed   boolean not null default false,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);


-- ─────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────

create index if not exists sections_user_id_idx       on public.sections(user_id);
create index if not exists groups_section_id_idx      on public.groups(section_id);
create index if not exists items_group_id_idx         on public.items(group_id);
create index if not exists items_group_order_idx      on public.items(group_id, order_index);


-- ─────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

alter table public.sections enable row level security;
alter table public.groups    enable row level security;
alter table public.items     enable row level security;


-- sections policies
drop policy if exists "Users can view own sections"   on public.sections;
drop policy if exists "Users can insert own sections" on public.sections;
drop policy if exists "Users can update own sections" on public.sections;
drop policy if exists "Users can delete own sections" on public.sections;

create policy "Users can view own sections"
  on public.sections for select
  using (auth.uid() = user_id);

create policy "Users can insert own sections"
  on public.sections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sections"
  on public.sections for update
  using (auth.uid() = user_id);

create policy "Users can delete own sections"
  on public.sections for delete
  using (auth.uid() = user_id);


-- groups policies
drop policy if exists "Users can view groups in own sections"   on public.groups;
drop policy if exists "Users can insert groups in own sections" on public.groups;
drop policy if exists "Users can update groups in own sections" on public.groups;
drop policy if exists "Users can delete groups in own sections" on public.groups;

create policy "Users can view groups in own sections"
  on public.groups for select
  using (
    exists (
      select 1 from public.sections
      where sections.id = groups.section_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can insert groups in own sections"
  on public.groups for insert
  with check (
    exists (
      select 1 from public.sections
      where sections.id = groups.section_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can update groups in own sections"
  on public.groups for update
  using (
    exists (
      select 1 from public.sections
      where sections.id = groups.section_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can delete groups in own sections"
  on public.groups for delete
  using (
    exists (
      select 1 from public.sections
      where sections.id = groups.section_id
        and sections.user_id = auth.uid()
    )
  );


-- items policies
drop policy if exists "Users can view items in own sections"   on public.items;
drop policy if exists "Users can insert items in own sections" on public.items;
drop policy if exists "Users can update items in own sections" on public.items;
drop policy if exists "Users can delete items in own sections" on public.items;

create policy "Users can view items in own sections"
  on public.items for select
  using (
    exists (
      select 1 from public.groups
      join public.sections on sections.id = groups.section_id
      where groups.id = items.group_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can insert items in own sections"
  on public.items for insert
  with check (
    exists (
      select 1 from public.groups
      join public.sections on sections.id = groups.section_id
      where groups.id = items.group_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can update items in own sections"
  on public.items for update
  using (
    exists (
      select 1 from public.groups
      join public.sections on sections.id = groups.section_id
      where groups.id = items.group_id
        and sections.user_id = auth.uid()
    )
  );

create policy "Users can delete items in own sections"
  on public.items for delete
  using (
    exists (
      select 1 from public.groups
      join public.sections on sections.id = groups.section_id
      where groups.id = items.group_id
        and sections.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- 4. STORAGE — pdfs bucket
-- ─────────────────────────────────────────────

-- Create bucket (no-op if it already exists)
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Storage policies
-- Files are stored as: {user_id}/{section_id}/{group_id}/{item_id}.pdf
-- The first path segment is the owner's user_id.
drop policy if exists "Users can upload own PDFs"  on storage.objects;
drop policy if exists "Users can view own PDFs"    on storage.objects;
drop policy if exists "Users can update own PDFs"  on storage.objects;
drop policy if exists "Users can delete own PDFs"  on storage.objects;

create policy "Users can upload own PDFs"
  on storage.objects for insert
  with check (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own PDFs"
  on storage.objects for select
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own PDFs"
  on storage.objects for update
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own PDFs"
  on storage.objects for delete
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
