-- =============================================================================
-- Migration 023: AI Project Spending Guard Hardening (Batch 3 & Batch 4)
--
-- Corrects SQL accounting defects in Migration 022 without modifying 022:
-- 1. FIX F2: Prevents phantom capacity under concurrent SKIP LOCKED cleanup.
--    In ai_gateway_project_begin, active reserved tokens sums ALL reservations
--    in ('pending', 'dispatched') for the window_start day regardless of
--    expiry timestamp, ensuring skipped rows remain counted until transferred.
-- 2. FIX F3: Prevents cross-day counter corruption and unauthorized refunds.
--    Cleanup, settle, and release strictly target the reservation's actual
--    admission window (date_trunc('day', created_at at time zone 'utc')),
--    never blindly updating the current caller's UTC day.
-- 3. GLOBAL LOCK ORDER HIERARCHY (Deadlock Prevention):
--    All transactions modifying counters and reservations MUST adhere to:
--    A. Reservation rows: Locked first (by id in settle/release, or SKIP LOCKED in cleanup).
--    B. Counter windows: When touching multiple UTC day windows, process strictly in
--       chronological ascending order: window_start ASC.
--    C. Counter kinds: Within any given window_start, acquire/update in strict order:
--       'daily_requests' BEFORE 'daily_tokens'.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Durable crash cleanup helper (F2, F3 & Lock-Order Hardened)
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
  v_win record;
  v_dispatched_tokens bigint := 0;
  v_undispatched_count bigint := 0;
begin
  -- Phase 1 & 2: Select and transition expired reservations using SKIP LOCKED,
  -- aggregate adjustments by admission window, and apply counter changes in
  -- strict global lock hierarchy:
  --   1. window_start ASC
  --   2. 'daily_requests' lock/update BEFORE 'daily_tokens' lock/update
  for v_win in
    with expired_candidates as (
      select id, status, reserved_tokens,
             (date_trunc('day', (created_at at time zone 'utc')) at time zone 'utc') as res_window_start
      from public.ai_project_usage_reservations
      where status in ('pending', 'dispatched')
        and expires_at < now()
      order by created_at, id
      for update skip locked
    ),
    updated_res as (
      update public.ai_project_usage_reservations r
      set status = case when c.status = 'dispatched' then 'expired_assumed_consumed' else 'expired_undispatched' end,
          settled_at = now(),
          actual_tokens = case when c.status = 'dispatched' then c.reserved_tokens else 0 end
      from expired_candidates c
      where r.id = c.id
      returning c.id, c.status, c.reserved_tokens, c.res_window_start
    )
    select
      res_window_start,
      count(*) filter (where status = 'pending')::bigint as pending_count,
      coalesce(sum(reserved_tokens) filter (where status = 'dispatched'), 0)::bigint as dispatched_tokens
    from updated_res
    group by res_window_start
    order by res_window_start asc
  loop
    v_undispatched_count := v_undispatched_count + v_win.pending_count;
    v_dispatched_tokens := v_dispatched_tokens + v_win.dispatched_tokens;

    -- Global Lock Hierarchy Step 1: 'daily_requests' lock / update FIRST
    -- Ensure the daily_requests counter row exists for this window before locking/updating
    insert into public.ai_project_usage_counters (window_kind, window_start, count)
    values ('daily_requests', v_win.res_window_start, 0)
    on conflict (window_kind, window_start) do nothing;

    if v_win.pending_count > 0 then
      update public.ai_project_usage_counters
      set count = greatest(count - v_win.pending_count, 0)
      where window_kind = 'daily_requests'
        and window_start = v_win.res_window_start;
    elsif v_win.dispatched_tokens > 0 then
      -- If only tokens are being incremented, explicitly lock daily_requests row first to uphold global order
      perform 1
      from public.ai_project_usage_counters
      where window_kind = 'daily_requests'
        and window_start = v_win.res_window_start
      for update;
    end if;

    -- Global Lock Hierarchy Step 2: 'daily_tokens' lock / upsert SECOND
    if v_win.dispatched_tokens > 0 then
      insert into public.ai_project_usage_counters as c (window_kind, window_start, count)
      values ('daily_tokens', v_win.res_window_start, v_win.dispatched_tokens)
      on conflict (window_kind, window_start)
      do update set count = c.count + v_win.dispatched_tokens;
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
-- 2. Atomic project admission RPC (F2 & F3 hardened)
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
  if p_user_id is null or p_capability is null or length(trim(p_capability)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- 1. Emergency killswitch check
  if p_emergency_disable then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_disabled',
      'reason', 'emergency_disabled',
      'message', 'AI services are temporarily disabled for maintenance.'
    );
  end if;

  -- Explicit UTC midnight for current day
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

  -- 3. Evaluate daily token ceiling (settled + active in-flight/unreconciled reservations)
  -- FIX F2: Sum ALL reservations in ('pending', 'dispatched') created in today's window,
  -- regardless of expires_at. If a dispatched reservation has expired but was SKIP LOCKED by cleanup,
  -- its tokens MUST remain counted as an active liability until settled or expired_assumed_consumed.
  if p_max_daily_tokens is not null and p_max_daily_tokens > 0 then
    select coalesce(sum(reserved_tokens), 0)
      into v_active_reserved_tokens
    from public.ai_project_usage_reservations
    where status in ('pending', 'dispatched')
      and created_at >= v_day_start
      and created_at < v_day_start + interval '1 day';

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
-- 3. Atomic project settlement RPC (F3 hardened)
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
  v_res_window_start timestamptz;
  v_res record;
  v_tokens integer;
  v_adjustment integer;
begin
  if p_reservation_id is null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  v_tokens := greatest(coalesce(p_actual_tokens, 0), 0);

  select * into v_res
  from public.ai_project_usage_reservations
  where id = p_reservation_id
  for update;

  if v_res.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- FIX F3: Target the reservation's actual ADMISSION DAY window, never current day.
  v_res_window_start := (date_trunc('day', (v_res.created_at at time zone 'utc')) at time zone 'utc');

  -- 1. Idempotency: already settled or released
  if v_res.status = 'settled' then
    return jsonb_build_object('ok', true, 'already_settled', true, 'settled_tokens', v_res.actual_tokens);
  end if;

  if v_res.status = 'released' then
    return jsonb_build_object('ok', true, 'already_released', true);
  end if;

  if v_res.status = 'expired_undispatched' then
    return jsonb_build_object('ok', true, 'expired_undispatched', true);
  end if;

  -- 2. Late settlement: reservation was expired and assumed consumed.
  -- Reconcile difference against the reservation's admission window.
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
      values ('daily_tokens', v_res_window_start, greatest(v_adjustment, 0))
      on conflict (window_kind, window_start)
      do update set count = greatest(c.count + v_adjustment, 0);
    end if;

    return jsonb_build_object(
      'ok', true,
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
    values ('daily_tokens', v_res_window_start, v_tokens)
    on conflict (window_kind, window_start)
    do update set count = c.count + v_tokens;
  end if;

  return jsonb_build_object('ok', true, 'settled_tokens', v_tokens);
end;
$$;

revoke all on function public.ai_gateway_project_settle(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_settle(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Atomic project release RPC (F3 hardened)
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
  v_res_window_start timestamptz;
  v_res record;
begin
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

  -- FIX F3: Target the reservation's actual ADMISSION DAY window, never current day.
  v_res_window_start := (date_trunc('day', (v_res.created_at at time zone 'utc')) at time zone 'utc');

  if v_res.status in ('settled', 'released', 'expired_undispatched') then
    return jsonb_build_object('ok', true, 'already_settled_or_released', true);
  end if;

  if v_res.status = 'expired_assumed_consumed' then
    update public.ai_project_usage_reservations
    set status = 'released',
        settled_at = now(),
        actual_tokens = 0,
        reconciled_at = now()
    where id = p_reservation_id;

    -- Global lock ordering: daily_requests BEFORE daily_tokens
    update public.ai_project_usage_counters
    set count = greatest(count - 1, 0)
    where window_kind = 'daily_requests'
      and window_start = v_res_window_start;

    update public.ai_project_usage_counters
    set count = greatest(count - v_res.reserved_tokens, 0)
    where window_kind = 'daily_tokens'
      and window_start = v_res_window_start;

    return jsonb_build_object('ok', true, 'released_expired_consumed', true);
  end if;

  -- Normal release (pending or dispatched)
  update public.ai_project_usage_reservations
  set status = 'released',
      settled_at = now(),
      actual_tokens = 0
  where id = p_reservation_id;

  update public.ai_project_usage_counters
  set count = greatest(count - 1, 0)
  where window_kind = 'daily_requests'
    and window_start = v_res_window_start;

  return jsonb_build_object('ok', true, 'released', true);
end;
$$;

revoke all on function public.ai_gateway_project_release(uuid) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_release(uuid) to service_role;

commit;
