-- =============================================================================
-- 009_user_workspace_state.sql
-- =============================================================================
-- Account- and section-scoped structured workspace state (Desk canvas, Math Zone).
--
-- scope:
--   desk       — account-level MAIN/Dashboard canvas (workspace_id MUST = user_id::text)
--   math_zone  — section-scoped math notebooks (workspace_id MUST = owned section UUID)
--
-- Client LWW on updated_at_ms (bigint ms). Additive, idempotent.
-- Does NOT apply to production automatically.
--
-- PRODUCTION STATUS (2026-08-28): APPLIED + VERIFIED on comxmviofnotfwzbupxg.
-- Required for Desk/Main + Math Zone cloud sync (Storage / Sync V1).
-- See supabase/migrations/README.md
-- =============================================================================

create table if not exists public.user_workspace_state (
  user_id       uuid not null references auth.users(id) on delete cascade,
  scope         text not null,
  workspace_id  text not null,
  state         jsonb not null default '{}'::jsonb,
  updated_at_ms bigint not null default 0,
  primary key (user_id, scope, workspace_id)
);

-- Scope whitelist (idempotent).
do $$
begin
  alter table public.user_workspace_state
    add constraint user_workspace_state_scope_check
    check (scope in ('desk', 'math_zone'));
exception
  when duplicate_object then null;
end $$;

create index if not exists user_workspace_state_user_idx
  on public.user_workspace_state (user_id);

create index if not exists user_workspace_state_scope_idx
  on public.user_workspace_state (scope, workspace_id);

alter table public.user_workspace_state enable row level security;

grant select, insert, update, delete on public.user_workspace_state to authenticated;

-- Semantic validation shared by INSERT/UPDATE WITH CHECK.
-- desk:      workspace_id must equal caller uid text (account scope).
-- math_zone: workspace_id must be a section UUID owned by caller.
create or replace function public.user_workspace_state_row_valid(
  p_user_id uuid,
  p_scope text,
  p_workspace_id text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_scope in ('desk', 'math_zone')
    and p_workspace_id is not null
    and length(trim(p_workspace_id)) > 0
    and (
      (
        p_scope = 'desk'
        and p_workspace_id = p_user_id::text
      )
      or (
        p_scope = 'math_zone'
        and exists (
          select 1
          from public.sections s
          where s.id::text = p_workspace_id
            and s.user_id = p_user_id
        )
      )
    );
$$;

drop policy if exists "Users can view own workspace state" on public.user_workspace_state;
drop policy if exists "Users can insert own workspace state" on public.user_workspace_state;
drop policy if exists "Users can update own workspace state" on public.user_workspace_state;
drop policy if exists "Users can delete own workspace state" on public.user_workspace_state;

create policy "Users can view own workspace state"
  on public.user_workspace_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own workspace state"
  on public.user_workspace_state for insert
  with check (
    auth.uid() = user_id
    and public.user_workspace_state_row_valid(user_id, scope, workspace_id)
  );

create policy "Users can update own workspace state"
  on public.user_workspace_state for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.user_workspace_state_row_valid(user_id, scope, workspace_id)
  );

create policy "Users can delete own workspace state"
  on public.user_workspace_state for delete
  using (auth.uid() = user_id);
