-- 008_user_content_storage.sql
--
-- Private Supabase Storage bucket for FOCUS user-content binaries
-- (handwriting, notebook images, Free Space PDFs, spatial images).
--
-- Does NOT modify the existing `pdfs` checklist-item bucket.
-- Does NOT create application tables.
-- Does NOT migrate existing local blobs (later PRs).
--
-- Path convention (enforced by policies via first folder = auth.uid()):
--   {userId}/{sectionId}/{objectId}/{assetType}/{assetId}
--
-- file_size_limit: 25 MiB (26214400) — V1 global ceiling (PDF/office max).
-- Feature PRs keep tighter client-side caps (e.g. images 4–8 MB).

-- ── Bucket ───────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-content', 'user-content', false, 26214400)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit;

-- ── Policies (idempotent: drop-if-exists then create) ─────────────────────────

drop policy if exists "Users can upload own user-content" on storage.objects;
drop policy if exists "Users can view own user-content" on storage.objects;
drop policy if exists "Users can update own user-content" on storage.objects;
drop policy if exists "Users can delete own user-content" on storage.objects;

create policy "Users can upload own user-content"
  on storage.objects for insert
  with check (
    bucket_id = 'user-content'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own user-content"
  on storage.objects for select
  using (
    bucket_id = 'user-content'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own user-content"
  on storage.objects for update
  using (
    bucket_id = 'user-content'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'user-content'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own user-content"
  on storage.objects for delete
  using (
    bucket_id = 'user-content'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
