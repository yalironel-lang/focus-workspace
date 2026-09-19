-- =============================================================================
-- 010_ai_usage_control.sql
-- =============================================================================
-- M0.4 — AI entitlements, usage events, and concurrency-safe counters.
--
-- Server-authoritative. Clients have NO write access.
-- Edge Function uses SUPABASE_SERVICE_ROLE_KEY to call RPCs / insert events.
--
-- DO NOT store: selection text, surroundings, prompts, response bodies,
-- JWT, Authorization headers, or API keys.
--
-- Apply ONLY when approved. This file is created locally; remote apply is
-- a separate explicit step.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ai_entitlements
-- -----------------------------------------------------------------------------
create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null
    check (plan in ('beta', 'pro', 'owner', 'disabled')),
  daily_request_limit integer
    check (daily_request_limit is null or daily_request_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.ai_entitlements is
  'ZIKUK AI product entitlement. Missing row = beta defaults. Server-only writes.';

alter table public.ai_entitlements enable row level security;

-- No policies for authenticated/anon → no client access via PostgREST.
-- service_role bypasses RLS.

revoke all on table public.ai_entitlements from anon, authenticated;
grant select, insert, update, delete on table public.ai_entitlements to service_role;

-- -----------------------------------------------------------------------------
-- 2. ai_usage_events (append-only metadata)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  capability text not null,
  provider_id text,
  model text,
  outcome text not null
    check (outcome in ('success', 'provider_error', 'provider_timeout', 'rate_limited', 'bad_response', 'internal_error')),
  error_code text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  reasoning_tokens integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  estimated_cost_usd_micros bigint check (estimated_cost_usd_micros is null or estimated_cost_usd_micros >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  section_id text,
  provider_request_id text
);

comment on table public.ai_usage_events is
  'ZIKUK AI usage metadata ledger. No prompts/selection/response text. Server-only writes.';

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);

create index if not exists ai_usage_events_capability_created_idx
  on public.ai_usage_events (capability, created_at desc);

alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_usage_events from anon, authenticated;
grant select, insert, update, delete on table public.ai_usage_events to service_role;

-- -----------------------------------------------------------------------------
-- 3. ai_usage_counters (hot-path enforcement)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_kind text not null
    check (window_kind in ('safety_60s', 'quota_day')),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, window_kind, window_start)
);

comment on table public.ai_usage_counters is
  'Atomic per-user AI safety/quota counters. Server-only writes via RPC.';

create index if not exists ai_usage_counters_kind_start_idx
  on public.ai_usage_counters (window_kind, window_start);

alter table public.ai_usage_counters enable row level security;

revoke all on table public.ai_usage_counters from anon, authenticated;
grant select, insert, update, delete on table public.ai_usage_counters to service_role;

-- -----------------------------------------------------------------------------
-- 4. Atomic begin-request RPC (entitlement + safety + quota)
-- -----------------------------------------------------------------------------
-- Returns jsonb:
--   { "ok": true, "plan": "...", "quota_limit": N|null, "quota_count": N|null, "safety_count": N }
--   { "ok": false, "code": "ai_disabled"|"rate_limited"|"quota_exceeded"|"invalid_request" }
--
-- Failures raise exceptions (caller must fail closed).
-- EXECUTE granted ONLY to service_role.

create or replace function public.ai_gateway_begin_request(
  p_user_id uuid,
  p_capability text default 'explain_selection'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_daily_limit integer;
  v_custom_limit integer;
  v_safety_start timestamptz;
  v_day_start timestamptz;
  v_safety_count integer;
  v_quota_count integer;
  v_safety_limit constant integer := 20;
  v_beta_default constant integer := 40;
  v_pro_default constant integer := 200;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_capability is null or length(trim(p_capability)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Entitlement: missing row => beta
  select e.plan, e.daily_request_limit
    into v_plan, v_custom_limit
  from public.ai_entitlements e
  where e.user_id = p_user_id;

  if v_plan is null then
    v_plan := 'beta';
    v_custom_limit := null;
  end if;

  if v_plan = 'disabled' then
    return jsonb_build_object('ok', false, 'code', 'ai_disabled', 'plan', v_plan);
  end if;

  -- Resolve product quota limit (null = exempt / owner)
  if v_plan = 'owner' then
    v_daily_limit := null;
  elsif v_custom_limit is not null then
    v_daily_limit := v_custom_limit;
  elsif v_plan = 'pro' then
    v_daily_limit := v_pro_default;
  else
    -- beta (and any unknown treated as beta)
    v_daily_limit := v_beta_default;
  end if;

  -- daily_request_limit = 0 must deny without allowing an INSERT of count=1
  -- (ON CONFLICT WHERE does not apply to the initial INSERT path).
  if v_daily_limit is not null and v_daily_limit <= 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'quota_exceeded',
      'plan', v_plan,
      'quota_limit', v_daily_limit
    );
  end if;

  -- Safety window: 60s buckets from Unix epoch (UTC)
  v_safety_start := to_timestamp(floor(extract(epoch from now()) / 60.0) * 60);

  insert into public.ai_usage_counters as c (user_id, window_kind, window_start, count)
  values (p_user_id, 'safety_60s', v_safety_start, 1)
  on conflict (user_id, window_kind, window_start)
  do update set count = c.count + 1
  where c.count < v_safety_limit
  returning c.count into v_safety_count;

  if v_safety_count is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'plan', v_plan
    );
  end if;

  -- Product quota (UTC day) — skip for owner
  if v_daily_limit is not null then
    -- Explicit UTC midnight as timestamptz (session TimeZone independent)
    v_day_start := (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

    insert into public.ai_usage_counters as c (user_id, window_kind, window_start, count)
    values (p_user_id, 'quota_day', v_day_start, 1)
    on conflict (user_id, window_kind, window_start)
    do update set count = c.count + 1
    where c.count < v_daily_limit
    returning c.count into v_quota_count;

    if v_quota_count is null then
      -- Roll back the safety increment for this denied request so a quota denial
      -- does not permanently burn a safety slot. Best-effort atomic within txn.
      update public.ai_usage_counters
      set count = greatest(count - 1, 0)
      where user_id = p_user_id
        and window_kind = 'safety_60s'
        and window_start = v_safety_start;

      return jsonb_build_object(
        'ok', false,
        'code', 'quota_exceeded',
        'plan', v_plan,
        'quota_limit', v_daily_limit
      );
    end if;
  else
    v_quota_count := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan', v_plan,
    'quota_limit', v_daily_limit,
    'quota_count', v_quota_count,
    'safety_count', v_safety_count
  );
end;
$$;

revoke all on function public.ai_gateway_begin_request(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_gateway_begin_request(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Record usage event RPC (metadata only)
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_record_usage(
  p_user_id uuid,
  p_capability text,
  p_provider_id text,
  p_model text,
  p_outcome text,
  p_error_code text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_reasoning_tokens integer default null,
  p_total_tokens integer default null,
  p_estimated_cost_usd_micros bigint default null,
  p_latency_ms integer default null,
  p_section_id text default null,
  p_provider_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_capability is null or p_outcome is null then
    raise exception 'invalid_usage_event';
  end if;

  if p_outcome not in (
    'success',
    'provider_error',
    'provider_timeout',
    'rate_limited',
    'bad_response',
    'internal_error'
  ) then
    raise exception 'invalid_usage_outcome';
  end if;

  insert into public.ai_usage_events (
    user_id,
    capability,
    provider_id,
    model,
    outcome,
    error_code,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    total_tokens,
    estimated_cost_usd_micros,
    latency_ms,
    section_id,
    provider_request_id
  ) values (
    p_user_id,
    p_capability,
    p_provider_id,
    p_model,
    p_outcome,
    p_error_code,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_total_tokens,
    p_estimated_cost_usd_micros,
    p_latency_ms,
    p_section_id,
    p_provider_request_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.ai_gateway_record_usage(
  uuid, text, text, text, text, text, integer, integer, integer, integer, bigint, integer, text, text
) from public, anon, authenticated;
grant execute on function public.ai_gateway_record_usage(
  uuid, text, text, text, text, text, integer, integer, integer, integer, bigint, integer, text, text
) to service_role;
