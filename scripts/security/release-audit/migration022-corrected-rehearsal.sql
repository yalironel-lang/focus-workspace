-- LOCAL REHEARSAL CANDIDATE ONLY. NOT A STAGING/PRODUCTION MIGRATION.
-- Derived from unchanged Migration 022; no application/user data is included.
-- Requires fresh disposable database and explicit later execution approval.
-- Token policy: every reservation is charged/refunded to UTC admission day.
-- Global transaction lock serializes all five ledger entry points.
-- Real PostgreSQL syntax, preservation and concurrency validation are pending.
-- =============================================================================
-- 022_ai_project_spending_guard.sql
-- =============================================================================
-- Project-Wide AI Spending and Concurrency Control (Phase 6C.1, 6C.2, 6C.3).
--
-- Provides cross-isolate atomic admission control in PostgreSQL:
-- 1. ai_project_usage_counters: Atomic daily request and settled token tracking.
-- 2. ai_project_usage_reservations: Concurrency-safe in-flight token reservations
--    with state machine:
--    - 'pending': created at beginRequest, awaiting provider dispatch.
--    - 'dispatched': provider call dispatched; if worker crashes, conservatively
--                    assumed consumed rather than erased.
--    - 'settled': completed with actual provider tokens.
--    - 'released': aborted before provider call or zero tokens used.
--    - 'expired_assumed_consumed': timed out after dispatch; charged reserved_tokens
--                                  to daily_tokens. Reconciled if late settlement arrives.
--    - 'expired_undispatched': timed out before dispatch; zero tokens charged, request
--                              counter decremented.
-- 3. ai_gateway_project_begin: Atomic project admission check + reservation
--    with strict row-level lock ordering to eliminate deadlocks and races.
-- 4. ai_gateway_project_dispatch: Marks provider call dispatched.
-- 5. ai_gateway_project_settle: Settles actual tokens used; reconciles late settlements.
-- 6. ai_gateway_project_release: Releases reservation if aborted; reconciles late releases.
-- 7. ai_gateway_project_cleanup_expired: Durable crash cleanup policy.
--
-- SECURITY:
-- - All functions SECURITY DEFINER with set search_path = public, pg_catalog.
-- - All permissions revoked from public, anon, authenticated.
-- - EXECUTE granted strictly to service_role.
-- - RLS enabled on all tables.
--
-- Not applied by this change. Deploy only with an explicit staging approval.
-- =============================================================================

begin;
do $rehearsal_guard$
begin
  if current_database() <> 'zikuk_022_rehearsal'
     or current_setting('zikuk.isolated_rehearsal', true) is distinct from 'G285_TOKEN_LEDGER_REVIEW' then
    raise exception 'STOP isolated rehearsal only';
  end if;
  -- Old code may have charged/refunded the settlement day instead of admission
  -- day. That history cannot be inferred safely from a new function definition.
  if to_regclass('public.ai_project_usage_reservations') is not null then
    if exists (
      select 1 from public.ai_project_usage_reservations
      where status in ('settled','released','expired_assumed_consumed','expired_undispatched')
        and (settled_at is null or
          (created_at at time zone 'utc')::date <> (settled_at at time zone 'utc')::date)
    ) then
      raise exception 'STOP legacy cross-day accounting requires reconciliation';
    end if;
  end if;
end;
$rehearsal_guard$;

-- -----------------------------------------------------------------------------
-- 1. Project counters table
-- -----------------------------------------------------------------------------
create table if not exists public.ai_project_usage_counters (
  window_kind text not null
    check (window_kind in ('daily_requests', 'daily_tokens')),
  window_start timestamptz not null,
  count bigint not null default 0 check (count >= 0),
  primary key (window_kind, window_start)
);

comment on table public.ai_project_usage_counters is
  'Atomic project-wide AI usage counters. Server-only writes via RPC.';

create index if not exists ai_project_usage_counters_kind_start_idx
  on public.ai_project_usage_counters (window_kind, window_start);

alter table public.ai_project_usage_counters enable row level security;

revoke all on table public.ai_project_usage_counters from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_project_usage_counters to service_role;

-- -----------------------------------------------------------------------------
-- 2. Project in-flight reservations table (crash-resilient concurrency tracking)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_project_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  reserved_tokens integer not null check (reserved_tokens > 0),
  status text not null default 'pending'
    check (status in ('pending', 'dispatched', 'settled', 'released', 'expired_assumed_consumed', 'expired_undispatched')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  dispatched_at timestamptz,
  settled_at timestamptz,
  reconciled_at timestamptz,
  actual_tokens integer check (actual_tokens is null or actual_tokens >= 0)
);

comment on table public.ai_project_usage_reservations is
  'In-flight token reservations for cross-isolate concurrency control. Self-expiring with durable crash safety.';

create index if not exists ai_project_reservations_status_expires_idx
  on public.ai_project_usage_reservations (status, expires_at, created_at);

create index if not exists ai_project_reservations_user_created_idx
  on public.ai_project_usage_reservations (user_id, created_at);

alter table public.ai_project_usage_reservations enable row level security;

revoke all on table public.ai_project_usage_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_project_usage_reservations to service_role;

-- -----------------------------------------------------------------------------
-- 3. Durable crash cleanup helper
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_project_cleanup_expired(
  p_day_start timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day_start timestamptz;
  v_dispatched_tokens bigint := 0;
  v_undispatched_count bigint := 0;
  v_rec record;
begin
  perform pg_catalog.pg_advisory_xact_lock(42085, 22);
  -- p_day_start is retained only for signature compatibility. Each charge/refund
  -- belongs to its original UTC admission window, never the caller's day.
  for v_rec in
    select id, reserved_tokens, created_at, status
    from public.ai_project_usage_reservations
    where status in ('pending', 'dispatched') and expires_at < clock_timestamp()
    order by created_at, id
    for update
  loop
    v_day_start := (date_trunc('day', v_rec.created_at at time zone 'utc') at time zone 'utc');
    if v_rec.status = 'dispatched' then
      update public.ai_project_usage_reservations
      set status = 'expired_assumed_consumed', settled_at = now(), actual_tokens = v_rec.reserved_tokens
      where id = v_rec.id;
      insert into public.ai_project_usage_counters as c (window_kind, window_start, count)
      values ('daily_tokens', v_day_start, v_rec.reserved_tokens)
      on conflict (window_kind, window_start) do update set count = c.count + v_rec.reserved_tokens;
      v_dispatched_tokens := v_dispatched_tokens + v_rec.reserved_tokens;
    else
      update public.ai_project_usage_reservations
      set status = 'expired_undispatched', settled_at = now(), actual_tokens = 0
      where id = v_rec.id;
      update public.ai_project_usage_counters set count = greatest(count - 1, 0)
      where window_kind = 'daily_requests' and window_start = v_day_start;
      v_undispatched_count := v_undispatched_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'expired_dispatched_tokens', v_dispatched_tokens,
    'expired_undispatched_count', v_undispatched_count
  );
end;
$$;

revoke all on function public.ai_gateway_project_cleanup_expired(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_cleanup_expired(timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Atomic project admission RPC (with consistent row lock ordering)
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_project_begin(
  p_user_id uuid,
  p_capability text,
  p_emergency_disable boolean default false,
  p_max_daily_requests integer default null,
  p_max_daily_tokens integer default null,
  p_estimated_tokens integer default 8500
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day_start timestamptz;
  v_current_requests bigint;
  v_settled_tokens bigint;
  v_active_reserved_tokens bigint;
  v_effective_tokens bigint;
  v_reservation_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(42085, 22);
  if p_estimated_tokens is null or p_estimated_tokens <= 0
     or (p_max_daily_requests is not null and p_max_daily_requests < 0)
     or (p_max_daily_tokens is not null and p_max_daily_tokens < 0) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  if p_user_id is null or p_capability is null or length(trim(p_capability)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- 1. Emergency killswitch check (instant zero-query denial)
  if p_emergency_disable then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_disabled',
      'reason', 'emergency_disabled',
      'message', 'AI services are temporarily disabled for maintenance.'
    );
  end if;

  -- Explicit UTC midnight
  v_day_start := (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

  -- Durable cleanup of expired reservations (crash resilience)
  perform public.ai_gateway_project_cleanup_expired(v_day_start);

  -- If no project caps are configured, pass through without reservation
  if (p_max_daily_requests is null or p_max_daily_requests <= 0) and
     (p_max_daily_tokens is null or p_max_daily_tokens <= 0) then
    return jsonb_build_object('ok', true, 'reservation_id', null);
  end if;

  -- Ensure rows exist for today in ai_project_usage_counters
  insert into public.ai_project_usage_counters (window_kind, window_start, count)
  values ('daily_requests', v_day_start, 0)
  on conflict (window_kind, window_start) do nothing;

  insert into public.ai_project_usage_counters (window_kind, window_start, count)
  values ('daily_tokens', v_day_start, 0)
  on conflict (window_kind, window_start) do nothing;

  -- Acquire row locks in consistent alphabetical order: 'daily_requests' then 'daily_tokens'
  -- Eliminates deadlocks and enforces strict serializability under concurrency
  select count into v_current_requests
  from public.ai_project_usage_counters
  where window_kind = 'daily_requests'
    and window_start = v_day_start
  for update;

  select count into v_settled_tokens
  from public.ai_project_usage_counters
  where window_kind = 'daily_tokens'
    and window_start = v_day_start
  for update;

  v_current_requests := coalesce(v_current_requests, 0);
  v_settled_tokens := coalesce(v_settled_tokens, 0);

  -- 2. Evaluate daily request ceiling
  if p_max_daily_requests is not null and p_max_daily_requests > 0 then
    if v_current_requests >= p_max_daily_requests then
      return jsonb_build_object(
        'ok', false,
        'code', 'quota_exceeded',
        'reason', 'project_daily_request_limit_exceeded',
        'message', 'AI daily request capacity reached for this project. Please try again tomorrow.',
        'current_requests', v_current_requests,
        'max_requests', p_max_daily_requests
      );
    end if;
  end if;

  -- 3. Evaluate daily token ceiling (settled + active in-flight reservations)
  if p_max_daily_tokens is not null and p_max_daily_tokens > 0 then
    select coalesce(sum(reserved_tokens), 0)
      into v_active_reserved_tokens
    from public.ai_project_usage_reservations
    where status in ('pending', 'dispatched')
      and created_at >= v_day_start;

    v_active_reserved_tokens := coalesce(v_active_reserved_tokens, 0);
    v_effective_tokens := v_settled_tokens + v_active_reserved_tokens + coalesce(p_estimated_tokens, 0);

    if v_effective_tokens > p_max_daily_tokens then
      return jsonb_build_object(
        'ok', false,
        'code', 'quota_exceeded',
        'reason', 'project_daily_token_limit_exceeded',
        'message', 'AI daily token capacity reached for this project. Please try again tomorrow.',
        'settled_tokens', v_settled_tokens,
        'active_reserved_tokens', v_active_reserved_tokens,
        'requested_tokens', p_estimated_tokens,
        'max_tokens', p_max_daily_tokens
      );
    end if;
  end if;

  -- 4. Atomically admit request and reserve capacity
  update public.ai_project_usage_counters
  set count = count + 1
  where window_kind = 'daily_requests'
    and window_start = v_day_start;

  v_current_requests := v_current_requests + 1;

  v_reservation_id := gen_random_uuid();
  insert into public.ai_project_usage_reservations (
    id,
    user_id,
    capability,
    reserved_tokens,
    status,
    created_at,
    expires_at
  ) values (
    v_reservation_id,
    p_user_id,
    p_capability,
    greatest(coalesce(p_estimated_tokens, 8500), 1),
    'pending',
    now(),
    now() + interval '5 minutes'
  );

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_reservation_id,
    'current_requests', v_current_requests,
    'reserved_tokens', p_estimated_tokens
  );
end;
$$;

revoke all on function public.ai_gateway_project_begin(uuid, text, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_begin(uuid, text, boolean, integer, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Atomic project dispatch RPC (called right before upstream provider dispatch)
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_project_dispatch(
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_res record;
begin
  perform pg_catalog.pg_advisory_xact_lock(42085, 22);
  if p_reservation_id is null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.ai_project_usage_reservations
  set status = 'dispatched',
      dispatched_at = now()
  where id = p_reservation_id
    and status = 'pending' and expires_at >= clock_timestamp()
  returning * into v_res;

  if v_res.id is null then
    return jsonb_build_object('ok', false, 'code', 'dispatch_unconfirmed');
  end if;

  return jsonb_build_object('ok', true, 'dispatched', true);
end;
$$;

revoke all on function public.ai_gateway_project_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_dispatch(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Atomic project settlement RPC (called when provider returns)
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_project_settle(
  p_reservation_id uuid,
  p_actual_tokens integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day_start timestamptz;
  v_res record;
  v_tokens integer;
  v_adjustment integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(42085, 22);
  if p_reservation_id is null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  if p_actual_tokens is null or p_actual_tokens < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  v_tokens := p_actual_tokens;
  select * into v_res
  from public.ai_project_usage_reservations
  where id = p_reservation_id
  for update;

  if v_res.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_day_start := (date_trunc('day', v_res.created_at at time zone 'utc') at time zone 'utc');

  -- 1. Idempotency: already settled or released
  if v_res.status = 'settled' then
    return jsonb_build_object('ok', v_res.actual_tokens = v_tokens and v_tokens <= v_res.reserved_tokens, 'already_settled', true, 'settled_tokens', v_res.actual_tokens);
  end if;

  if v_res.status = 'released' then
    return jsonb_build_object('ok', true, 'already_released', true);
  end if;

  if v_res.status = 'expired_undispatched' then
    return jsonb_build_object('ok', true, 'expired_undispatched', true);
  end if;

  -- 2. Late settlement: reservation was expired and assumed consumed!
  -- Reconcile difference: adjustment = v_tokens - v_res.reserved_tokens
  if v_res.status = 'expired_assumed_consumed' then
    v_adjustment := v_tokens - v_res.reserved_tokens;

    update public.ai_project_usage_reservations
    set status = 'settled',
        settled_at = now(),
        actual_tokens = v_tokens,
        reconciled_at = now()
    where id = p_reservation_id;

    if v_adjustment != 0 then
      insert into public.ai_project_usage_counters as c (window_kind, window_start, count)
      values ('daily_tokens', v_day_start, greatest(v_adjustment, 0))
      on conflict (window_kind, window_start)
      do update set count = greatest(c.count + v_adjustment, 0);
    end if;

    return jsonb_build_object(
      'ok', v_tokens <= v_res.reserved_tokens,
      'reconciled_late_settlement', true,
      'settled_tokens', v_tokens,
      'adjustment', v_adjustment
    );
  end if;

  -- 3. Normal settlement (pending or dispatched)
  update public.ai_project_usage_reservations
  set status = 'settled',
      settled_at = now(),
      actual_tokens = v_tokens
  where id = p_reservation_id;

  if v_tokens > 0 then
    insert into public.ai_project_usage_counters as c (window_kind, window_start, count)
    values ('daily_tokens', v_day_start, v_tokens)
    on conflict (window_kind, window_start)
    do update set count = c.count + v_tokens;
  end if;

  return jsonb_build_object('ok', v_tokens <= v_res.reserved_tokens, 'settled_tokens', v_tokens);
end;
$$;

revoke all on function public.ai_gateway_project_settle(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_settle(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 7. Atomic project release RPC (called when request aborts before provider)
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_project_release(
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day_start timestamptz;
  v_res record;
begin
  perform pg_catalog.pg_advisory_xact_lock(42085, 22);
  if p_reservation_id is null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  select * into v_res
  from public.ai_project_usage_reservations
  where id = p_reservation_id
  for update;

  if v_res.id is null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  if v_res.status in ('settled', 'released', 'expired_undispatched') then
    return jsonb_build_object('ok', true, 'already_settled_or_released', true);
  end if;

  v_day_start := (date_trunc('day', v_res.created_at at time zone 'utc') at time zone 'utc');
  if v_res.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'possibly_paid_reservation');
  end if;

  -- Normal release: only pending, never dispatched or conservatively charged
  update public.ai_project_usage_reservations
  set status = 'released',
      settled_at = now(),
      actual_tokens = 0
  where id = p_reservation_id;

  update public.ai_project_usage_counters
  set count = greatest(count - 1, 0)
  where window_kind = 'daily_requests'
    and window_start = v_day_start;

  return jsonb_build_object('ok', true, 'released', true);
end;
$$;

revoke all on function public.ai_gateway_project_release(uuid) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_release(uuid) to service_role;

commit;
