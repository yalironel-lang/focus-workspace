-- =============================================================================
-- Migration 024: Fail-Closed AI Entitlements & Knowledge Authorization
--
-- Objective:
-- Harden ZIKUK AI authorization architecture so missing entitlements fail closed:
-- 1. ai_gateway_begin_request: Users without an explicit row in public.ai_entitlements
--    are assigned plan = 'disabled' and denied (code: 'ai_disabled') instead of
--    defaulting to 'beta'. Explicitly enabled plans ('owner', 'pro', 'beta')
--    remain authorized with their configured quotas.
-- 2. ai_knowledge_begin_index: Verifies that the source owner has an active,
--    non-disabled entitlement before issuing an embedding job or allowing
--    background provider embedding.
-- 3. ai_gateway_project_begin: Verifies entitlement before acquiring row locks
--    or creating pending token reservations in ai_project_usage_reservations.
--
-- SECURITY & GOVERNANCE:
-- - Preserves existing owner entitlement and user data intact.
-- - All functions SECURITY DEFINER with set search_path = public, pg_catalog.
-- - REVOKE from public, anon, authenticated; strictly GRANT to service_role.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Fail-closed user entitlement & quota begin RPC
-- -----------------------------------------------------------------------------
create or replace function public.ai_gateway_begin_request(
  p_user_id uuid,
  p_capability text default 'explain_selection'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
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

  -- Entitlement lookup: missing row => 'disabled' (fail-closed)
  select e.plan, e.daily_request_limit
    into v_plan, v_custom_limit
  from public.ai_entitlements e
  where e.user_id = p_user_id;

  if v_plan is null then
    v_plan := 'disabled';
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
  elsif v_plan = 'beta' then
    v_daily_limit := v_beta_default;
  else
    -- Unknown plan treated as disabled fail-closed
    return jsonb_build_object('ok', false, 'code', 'ai_disabled', 'plan', v_plan);
  end if;

  -- daily_request_limit = 0 must deny without allowing an INSERT of count=1
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
-- 2. Fail-closed knowledge indexing begin RPC (Preserves Migration 012 verbatim)
-- -----------------------------------------------------------------------------
create or replace function public.ai_knowledge_begin_index(
  p_source_id uuid,
  p_source_version integer,
  p_embedding_model text,
  p_embedding_dimensions integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_job uuid;
  v_chunk_count integer;
begin
  if p_source_id is null
     or p_source_version is null
     or p_embedding_model is null
     or length(trim(p_embedding_model)) = 0
     or p_embedding_dimensions is distinct from 1536 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Entitlement check: source owner must have an active non-disabled entitlement
  if not exists (
    select 1 from public.ai_entitlements e
    where e.user_id = v_source.user_id
      and e.plan in ('owner', 'pro', 'beta')
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_disabled',
      'reason', 'entitlement_disabled'
    );
  end if;

  if v_source.status <> 'ready' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Only the current text version may be indexed (prevents stale jobs).
  if v_source.source_version <> p_source_version then
    return jsonb_build_object('ok', false, 'code', 'stale_job');
  end if;

  select count(*)::integer into v_chunk_count
  from public.ai_knowledge_chunks c
  where c.source_id = p_source_id
    and c.source_version = p_source_version;

  if v_chunk_count is null or v_chunk_count < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  v_job := gen_random_uuid();

  insert into public.ai_knowledge_version_index (
    source_id,
    source_version,
    status,
    error_code,
    embedding_model,
    embedding_dimensions,
    job_id
  ) values (
    p_source_id,
    p_source_version,
    'indexing',
    null,
    trim(p_embedding_model),
    1536,
    v_job
  )
  on conflict (source_id, source_version) do update
  set status = 'indexing',
      error_code = null,
      embedding_model = trim(p_embedding_model),
      embedding_dimensions = 1536,
      job_id = v_job,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'job_id', v_job,
    'chunk_count', v_chunk_count,
    'embedding_model', trim(p_embedding_model),
    'embedding_dimensions', 1536,
    'retrieval_source_version', v_source.retrieval_source_version
  );
end;
$$;

revoke all on function public.ai_knowledge_begin_index(uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_begin_index(uuid, integer, text, integer)
  to service_role;


-- -----------------------------------------------------------------------------
-- 3. Fail-closed project spending admission RPC (Hardened with F2, F3 & Lock-Order)
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
  v_user_plan text;
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

  -- 1b. Fail-closed entitlement check: Reject unentitled callers before row locks
  select e.plan into v_user_plan
  from public.ai_entitlements e
  where e.user_id = p_user_id;

  if v_user_plan is null or v_user_plan = 'disabled' then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_disabled',
      'reason', 'entitlement_disabled',
      'message', 'AI services are not enabled for this account.'
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
    actual_tokens,
    status,
    created_at,
    expires_at
  )
  values (
    v_reservation_id,
    p_user_id,
    p_capability,
    coalesce(p_estimated_tokens, 0),
    0,
    'pending',
    now(),
    now() + interval '5 minutes'
  );

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_reservation_id,
    'current_requests', v_current_requests,
    'settled_tokens', v_settled_tokens,
    'reserved_tokens', coalesce(p_estimated_tokens, 0)
  );
end;
$$;

revoke all on function public.ai_gateway_project_begin(uuid, text, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_gateway_project_begin(uuid, text, boolean, integer, integer, integer) to service_role;

commit;
