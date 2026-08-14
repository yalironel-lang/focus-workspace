-- =============================================================================
-- 005_free_space_objects_realtime.sql
-- =============================================================================
-- PR7b: enable Supabase Realtime postgres_changes for free_space_objects.
--
-- Additive only. Idempotent: safe if the table is already in supabase_realtime.
-- Does NOT set REPLICA IDENTITY FULL (DELETE events are ignored by the client).
-- Does NOT change RLS, grants, or DELETE semantics.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'free_space_objects'
  ) then
    execute 'alter publication supabase_realtime add table public.free_space_objects';
  end if;
end $$;
