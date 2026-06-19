-- =============================================================================
-- 003_proof_of_cloud.sql   —   DRAFT / NOT YET APPLIED
-- =============================================================================
-- Phase 0.5 "Proof of Cloud" — smallest cloud-source-of-truth vertical slice.
--
--   ⚠️  DO NOT APPLY THIS YET.
--   ⚠️  Draft for review only. Do not run in Supabase SQL Editor or via CLI.
--   ⚠️  When approved, apply in STAGING first, then a prod smoke with a test
--       account — never blind to production.
--
-- What this file is:
--   The minimal, additive subset of the approved Phase 0 schema needed to prove
--   the end-to-end cloud round-trip for ONE object type ('note'):
--       section (existing = workspace) → free_space_boards → free_space_objects
--   plus the versioning sequence, the membership table, the RLS helper, and RLS.
--
-- Safety properties:
--   • ADDITIVE ONLY. Creates new objects; ALTERs nothing that already exists.
--   • The ONLY references to existing objects are FOREIGN KEYS to public.sections
--     and auth.users — no columns added, no data written, no triggers attached
--     to existing tables.
--   • IDEMPOTENT. Safe to run multiple times (IF NOT EXISTS / OR REPLACE /
--     DROP POLICY IF EXISTS before CREATE).
--   • NO DATA WRITES. No seeding/backfill. Test users enroll themselves into a
--     workspace they already own via the membership INSERT policy below.
--   • Fully rollbackable — see the ROLLBACK section at the bottom (comments).
--
-- Out of scope for this file (intentionally absent): notebook_pages,
-- notebook_ink, attachments, pdf_study_marks, custom_blocks, workspace_layouts,
-- study_sessions, user_view_state, migration ledger tables, and Storage buckets.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. VERSIONING SEQUENCE
-- -----------------------------------------------------------------------------
-- Single global, monotonically increasing source for every synced row's
-- `row_version`. A client keeps one cursor per workspace = max row_version seen,
-- and pulls "rows where row_version > cursor". One shared sequence gives a total
-- order across all synced tables with a single cursor value.
create sequence if not exists public.global_row_version;

-- The `authenticated` role must be able to draw from the sequence because the
-- bump trigger below runs as the invoking user (SECURITY INVOKER) on INSERT/UPDATE.
-- Only USAGE is granted: it is sufficient for nextval(). SELECT (currval/lastval)
-- is intentionally NOT granted — minimal privilege.
grant usage on sequence public.global_row_version to authenticated;


-- -----------------------------------------------------------------------------
-- 2. ROW-VERSION / UPDATED_AT TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
-- Attached BEFORE INSERT OR UPDATE on every synced table. It:
--   • stamps row_version from the global sequence (strictly increasing), and
--   • sets updated_at to the SERVER clock (never trust device clocks — this is
--     what makes Last-Write-Wins and incremental sync correct across devices).
-- HARDENING: search_path is pinned to '' so name resolution can't be hijacked by
-- a schema earlier in a caller's search_path. All references are fully qualified
-- (public.global_row_version); now() lives in pg_catalog, which is always implicitly
-- searched, so it still resolves under an empty search_path. This function is
-- SECURITY INVOKER (default) — it runs as the writing user, hence the USAGE grant
-- on the sequence below.
create or replace function public.bump_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.row_version := nextval('public.global_row_version');
  new.updated_at  := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. MEMBERSHIP RLS HELPER
-- -----------------------------------------------------------------------------
-- Authorization boundary is the WORKSPACE (a `sections` row), not the user.
-- This keeps every content policy a one-liner and makes future collaboration a
-- data change (insert more workspace_members) rather than a schema/RLS rewrite.
--
-- SECURITY DEFINER + a pinned search_path so the function reads workspace_members
-- without re-triggering RLS (no recursion) and runs cheaply inside policies.
--
-- OWNERSHIP ASSUMPTION (important): this function relies on being owned by a role
-- that BYPASSES row level security on public.workspace_members (in Supabase the
-- default owner is `postgres`, a superuser, which bypasses RLS). That is what
-- lets it read membership rows directly without RLS re-applying — guaranteeing
-- no recursion when the policies below call it. If this object were ever recreated
-- under a non-superuser/non-table-owner role, RLS would apply inside the function
-- and could break the membership check. Keep it owned by the migration/admin role.
create or replace function public.is_workspace_member(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = w
      and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 3b. OBJECT↔BOARD WORKSPACE INTEGRITY GUARD
-- -----------------------------------------------------------------------------
-- A CHECK constraint cannot subquery, so this trigger enforces that a
-- free_space_objects row's denormalized workspace_id MATCHES the workspace_id of
-- the board it references. Without it, a member of workspace A could insert an
-- object with workspace_id = A but board_id pointing at a board in workspace B
-- (the FK check bypasses RLS). That leaks no data (the victim filters reads by
-- their own workspace_id) but corrupts referential integrity — this closes it.
--
-- SECURITY DEFINER + search_path '' so it reads the board's TRUE workspace_id
-- directly, regardless of the caller's RLS visibility, and raises a precise error
-- on mismatch. Same OWNERSHIP ASSUMPTION as is_workspace_member() above: must be
-- owned by a role that bypasses RLS on public.free_space_boards (Supabase default
-- `postgres`). It is read-only and performs no privileged writes.
create or replace function public.enforce_object_board_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  board_ws uuid;
begin
  select b.workspace_id
    into board_ws
    from public.free_space_boards b
   where b.id = new.board_id;

  if board_ws is null then
    raise exception
      'free_space_objects.board_id % does not reference an existing board', new.board_id
      using errcode = 'foreign_key_violation';
  end if;

  if board_ws <> new.workspace_id then
    raise exception
      'free_space_objects.workspace_id (%) must equal its board''s workspace_id (%)',
      new.workspace_id, board_ws
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. workspace_members  (NEW)
-- -----------------------------------------------------------------------------
-- The membership/ownership boundary. Phase 0.5: a user is the sole 'owner' of
-- their own section. No backfill here — the test user self-enrolls into a
-- section they already own via the INSERT policy below (so this migration writes
-- no data and cannot touch existing users' content).
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),  -- client may supply UUIDv7
  workspace_id  uuid not null references public.sections(id)   on delete cascade,
  user_id       uuid not null references auth.users(id)        on delete cascade,
  role          text not null default 'owner'
                  check (role in ('owner','editor','viewer')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- set by trigger
  row_version   bigint not null,                     -- set by trigger
  unique (workspace_id, user_id)                     -- one membership per user/workspace
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);


-- -----------------------------------------------------------------------------
-- 5. free_space_boards  (NEW)
-- -----------------------------------------------------------------------------
-- A board within a workspace. Objects hang off a board. Viewport/zoom are NOT
-- here — those are personal (future user_view_state), so collaboration never
-- fights over them. `prefs` is shared board config (grid/snap).
create table if not exists public.free_space_boards (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.sections(id) on delete cascade,
  title         text not null default '',
  prefs         jsonb not null default '{}'::jsonb,
  order_index   integer not null default 0,
  created_by    uuid references auth.users(id),  -- authorship only, never authz
  updated_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- trigger
  deleted_at    timestamptz,                          -- soft delete (tombstone wins LWW)
  row_version   bigint not null                       -- trigger
);

-- Incremental sync cursor: "boards in workspace changed since my cursor".
create index if not exists free_space_boards_ws_ver_idx
  on public.free_space_boards (workspace_id, row_version);

-- Live-board listing (excludes tombstoned rows).
create index if not exists free_space_boards_ws_live_idx
  on public.free_space_boards (workspace_id)
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- 6. free_space_objects  (NEW)
-- -----------------------------------------------------------------------------
-- THIN manifest row. Phase 0.5 uses only type='note' (content = { body, ... }).
-- The full CHECK list is kept so this is the REAL table, not a throwaway.
-- Heavy bodies (notebook pages, binaries) are intentionally NOT stored here —
-- they live in their own tables/Storage in later phases. `content` holds only
-- light data (note body, object metadata). Every element inside `content`
-- should carry a stable id + rev (app convention) to enable future merge.
create table if not exists public.free_space_objects (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.free_space_boards(id) on delete cascade,
  workspace_id   uuid not null references public.sections(id)          on delete cascade,  -- denormalized for RLS + realtime filter
  type           text not null
                   check (type in ('notebook','note','image','pdf')),
  title          text not null default '',
  content        jsonb not null default '{}'::jsonb,   -- light only (note body, metadata)
  position       jsonb not null default '{}'::jsonb,   -- {x,y,w,h,rotation} — shared layout
  z_index        integer not null default 0,
  thumbnail_path text,                                  -- future Storage preview
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),    -- trigger
  deleted_at     timestamptz,                            -- soft delete
  row_version    bigint not null                         -- trigger
);

-- Live objects on a board (board cold-load).
create index if not exists free_space_objects_board_live_idx
  on public.free_space_objects (board_id)
  where deleted_at is null;

-- Incremental sync cursor per workspace.
create index if not exists free_space_objects_ws_ver_idx
  on public.free_space_objects (workspace_id, row_version);


-- -----------------------------------------------------------------------------
-- 7. TRIGGERS  (attach bump_row_version to the NEW tables only)
-- -----------------------------------------------------------------------------
-- NOTE: no triggers are attached to any pre-existing table in this file.
drop trigger if exists trg_workspace_members_version on public.workspace_members;
create trigger trg_workspace_members_version
  before insert or update on public.workspace_members
  for each row execute function public.bump_row_version();

drop trigger if exists trg_free_space_boards_version on public.free_space_boards;
create trigger trg_free_space_boards_version
  before insert or update on public.free_space_boards
  for each row execute function public.bump_row_version();

drop trigger if exists trg_free_space_objects_version on public.free_space_objects;
create trigger trg_free_space_objects_version
  before insert or update on public.free_space_objects
  for each row execute function public.bump_row_version();

-- Integrity guard: object.workspace_id must match its board's workspace_id.
-- (Order vs the version trigger is irrelevant; this guard does not read row_version.)
drop trigger if exists trg_free_space_objects_ws_guard on public.free_space_objects;
create trigger trg_free_space_objects_ws_guard
  before insert or update on public.free_space_objects
  for each row execute function public.enforce_object_board_workspace();


-- -----------------------------------------------------------------------------
-- 8. TABLE GRANTS  (RLS still gates every row; grants only allow the attempt)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.workspace_members  to authenticated;
grant select, insert, update, delete on public.free_space_boards  to authenticated;
grant select, insert, update, delete on public.free_space_objects to authenticated;


-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.workspace_members  enable row level security;
alter table public.free_space_boards  enable row level security;
alter table public.free_space_objects enable row level security;

-- 9a. workspace_members — Phase 0.5 minimal (single-user) policies.
--     A user sees only their own membership rows, and may enroll themselves
--     ONLY into a section they already own (sections.user_id = auth.uid()).
--     This is what lets the dev page create a membership without any backfill.
drop policy if exists "members select own"  on public.workspace_members;
drop policy if exists "members insert self" on public.workspace_members;
drop policy if exists "members update own"  on public.workspace_members;
drop policy if exists "members delete own"  on public.workspace_members;

create policy "members select own"
  on public.workspace_members for select
  using (user_id = auth.uid());

create policy "members insert self"
  on public.workspace_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.sections s
      where s.id = workspace_id
        and s.user_id = auth.uid()   -- may only join a workspace you own
    )
  );

create policy "members update own"
  on public.workspace_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "members delete own"
  on public.workspace_members for delete
  using (user_id = auth.uid());

-- 9b. free_space_boards — membership-gated (collaboration-ready one-liners).
drop policy if exists "boards select member" on public.free_space_boards;
drop policy if exists "boards insert member" on public.free_space_boards;
drop policy if exists "boards update member" on public.free_space_boards;
drop policy if exists "boards delete member" on public.free_space_boards;

create policy "boards select member"
  on public.free_space_boards for select
  using (public.is_workspace_member(workspace_id));

create policy "boards insert member"
  on public.free_space_boards for insert
  with check (public.is_workspace_member(workspace_id));

create policy "boards update member"
  on public.free_space_boards for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "boards delete member"
  on public.free_space_boards for delete
  using (public.is_workspace_member(workspace_id));

-- 9c. free_space_objects — same membership gate.
drop policy if exists "objects select member" on public.free_space_objects;
drop policy if exists "objects insert member" on public.free_space_objects;
drop policy if exists "objects update member" on public.free_space_objects;
drop policy if exists "objects delete member" on public.free_space_objects;

create policy "objects select member"
  on public.free_space_objects for select
  using (public.is_workspace_member(workspace_id));

create policy "objects insert member"
  on public.free_space_objects for insert
  with check (public.is_workspace_member(workspace_id));

create policy "objects update member"
  on public.free_space_objects for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "objects delete member"
  on public.free_space_objects for delete
  using (public.is_workspace_member(workspace_id));


-- =============================================================================
-- VALIDATION QUERIES  (comments only — run manually AFTER applying in staging)
-- =============================================================================
-- -- (a) Structure present?
-- select table_name from information_schema.tables
--   where table_schema='public'
--     and table_name in ('workspace_members','free_space_boards','free_space_objects');
--
-- -- (b) RLS enabled on all three?
-- select relname, relrowsecurity from pg_class
--   where relname in ('workspace_members','free_space_boards','free_space_objects');
--
-- -- (c) Sequence + helper exist?
-- select 1 from pg_sequences where schemaname='public' and sequencename='global_row_version';
-- select public.is_workspace_member('00000000-0000-0000-0000-000000000000'::uuid); -- expect false
--
-- -- (d) End-to-end as an AUTHENTICATED test user (run in app/PostgREST context,
-- --     where auth.uid() is set; :sid = a section the user owns):
--   -- 1. enroll self:
--   --   insert into workspace_members (workspace_id, user_id)
--   --     values (:sid, auth.uid());
--   -- 2. create a board:
--   --   insert into free_space_boards (workspace_id, title)
--   --     values (:sid, 'Proof board') returning id, row_version;
--   -- 3. create a note object:
--   --   insert into free_space_objects (board_id, workspace_id, type, content)
--   --     values (:bid, :sid, 'note', '{"body":"hello cloud"}') returning id, row_version;
--   -- 4. read it back:
--   --   select id, type, content, row_version, updated_at
--   --     from free_space_objects where board_id = :bid and deleted_at is null;
--
-- -- (e) row_version strictly increases on update; updated_at server-set:
--   -- update free_space_objects set content='{"body":"edit 1"}' where id=:oid
--   --   returning row_version, updated_at;   -- row_version must be > previous
--
-- -- (f) RLS isolation: as a DIFFERENT user, the same select returns 0 rows;
--   --   insert/update with that user_id's missing membership is rejected.
--
-- -- (g) Integrity guard: object.workspace_id must equal its board's workspace_id.
--   -- As an authenticated member of BOTH :sid_a and :sid_b (or run as owner):
--   --   given board :bid_a belongs to workspace :sid_a, this must FAIL with
--   --   errcode 23514 (check_violation):
--   --     insert into public.free_space_objects (board_id, workspace_id, type, content)
--   --       values (:bid_a, :sid_b, 'note', '{"body":"mismatch"}');
--   --   and the matching-workspace insert must SUCCEED:
--   --     insert into public.free_space_objects (board_id, workspace_id, type, content)
--   --       values (:bid_a, :sid_a, 'note', '{"body":"ok"}');
--   --   A non-existent board_id must FAIL with errcode 23503 (foreign_key_violation).
-- =============================================================================


-- =============================================================================
-- ROLLBACK PLAN  (comments only — drops everything this file created, in order)
-- =============================================================================
-- -- Safe because this file is purely additive: dropping these objects returns
-- -- the database to its exact pre-003 state. No existing table/column/row of the
-- -- current app is touched, so nothing of the live app is lost on rollback.
-- --
-- -- Run in reverse dependency order:
-- --
-- -- drop policy if exists "objects select member" on public.free_space_objects;
-- -- drop policy if exists "objects insert member" on public.free_space_objects;
-- -- drop policy if exists "objects update member" on public.free_space_objects;
-- -- drop policy if exists "objects delete member" on public.free_space_objects;
-- -- drop policy if exists "boards select member" on public.free_space_boards;
-- -- drop policy if exists "boards insert member" on public.free_space_boards;
-- -- drop policy if exists "boards update member" on public.free_space_boards;
-- -- drop policy if exists "boards delete member" on public.free_space_boards;
-- -- drop policy if exists "members select own"  on public.workspace_members;
-- -- drop policy if exists "members insert self" on public.workspace_members;
-- -- drop policy if exists "members update own"  on public.workspace_members;
-- -- drop policy if exists "members delete own"  on public.workspace_members;
-- --
-- -- drop table if exists public.free_space_objects;   -- (cascades BOTH its triggers + indexes)
-- -- drop table if exists public.free_space_boards;
-- -- drop table if exists public.workspace_members;
-- --
-- -- drop function if exists public.enforce_object_board_workspace();  -- (its trigger went with the table above)
-- -- drop function if exists public.is_workspace_member(uuid);
-- -- drop function if exists public.bump_row_version();
-- -- drop sequence if exists public.global_row_version;
-- --
-- -- (public.sections and auth.users are untouched — only FK references are removed
-- --  when the child tables are dropped.)
-- =============================================================================
