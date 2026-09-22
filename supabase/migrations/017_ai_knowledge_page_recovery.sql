-- =============================================================================
-- 017_ai_knowledge_page_recovery.sql
-- =============================================================================
-- M1.0B B3.1 — Durable selective page recovery foundation.
--
-- Adds:
--   - ai_knowledge_page_texts (academic evidence / provenance per page)
--   - ai_knowledge_page_recovery_jobs (async recovery execution lifecycle)
--   - service_role RPCs for upsert / enqueue / claim / commit (no worker deploy)
--
-- DOES NOT:
--   - wire production worker
--   - change finalize_ingest / retrieval publication
--   - OCR / chunk / embed
--   - enable automatic historical backfill
--
-- Apply ONLY when approved. Local create in B3.1; do not apply to Production
-- until an explicit B3 release gate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ai_knowledge_page_texts — durable page evidence
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_page_texts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null
    references public.ai_knowledge_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  source_version integer not null check (source_version >= 1),
  page_number integer not null check (page_number >= 1),
  -- Native extract always retained (may be empty for blank pages).
  native_text text not null default '',
  -- OCR recovered text when attempted; never concatenated blindly into canonical.
  recovered_text text,
  -- Exactly one downstream representation for chunking.
  canonical_text text not null default '',
  extraction_method text not null default 'native'
    check (extraction_method in ('native', 'ocr_tesseract')),
  extraction_version text not null
    check (length(trim(extraction_version)) > 0 and length(extraction_version) <= 64),
  recovery_version text
    check (recovery_version is null or (length(trim(recovery_version)) > 0 and length(recovery_version) <= 64)),
  fallback_result text
    check (
      fallback_result is null
      or fallback_result in (
        'none',
        'native_after_ocr_failed',
        'native_after_ocr_unusable'
      )
    ),
  -- Safe reason codes only (never academic content).
  detector_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(detector_reasons) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_page_texts_page_uq
    unique (source_id, source_version, page_number)
);

comment on table public.ai_knowledge_page_texts is
  'Per-page academic evidence/provenance for Course Knowledge. native + optional recovered + single canonical. Server writes.';

comment on column public.ai_knowledge_page_texts.canonical_text is
  'Sole page text consumed by downstream chunking. Never native||recovered concatenation.';

comment on column public.ai_knowledge_page_texts.detector_reasons is
  'JSON array of safe detector reason codes only. Never extracted page text.';

create index if not exists ai_knowledge_page_texts_source_version_idx
  on public.ai_knowledge_page_texts (source_id, source_version, page_number);

create index if not exists ai_knowledge_page_texts_user_section_idx
  on public.ai_knowledge_page_texts (user_id, section_id);

create or replace function public.ai_knowledge_page_texts_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_page_texts_updated_at
  on public.ai_knowledge_page_texts;
create trigger trg_ai_knowledge_page_texts_updated_at
  before update on public.ai_knowledge_page_texts
  for each row execute function public.ai_knowledge_page_texts_set_updated_at();

create or replace function public.ai_knowledge_page_texts_enforce_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_section uuid;
begin
  select s.user_id, s.section_id
    into v_user, v_section
  from public.ai_knowledge_sources s
  where s.id = new.source_id;

  if v_user is null then
    raise exception 'ai_knowledge_page_text_source_not_found';
  end if;

  if new.user_id <> v_user or new.section_id <> v_section then
    raise exception 'ai_knowledge_page_text_ownership_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_page_texts_enforce_parent
  on public.ai_knowledge_page_texts;
create trigger trg_ai_knowledge_page_texts_enforce_parent
  before insert or update on public.ai_knowledge_page_texts
  for each row execute function public.ai_knowledge_page_texts_enforce_parent();

alter table public.ai_knowledge_page_texts enable row level security;

-- Owner may SELECT own evidence (same posture as chunks). No client writes.
drop policy if exists "Users can view own ai_knowledge_page_texts"
  on public.ai_knowledge_page_texts;
create policy "Users can view own ai_knowledge_page_texts"
  on public.ai_knowledge_page_texts for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.sections s
      where s.id = ai_knowledge_page_texts.section_id
        and s.user_id = auth.uid()
    )
  );

revoke all on table public.ai_knowledge_page_texts from anon, authenticated;
grant select on table public.ai_knowledge_page_texts to authenticated;
grant select, insert, update, delete on table public.ai_knowledge_page_texts to service_role;

-- -----------------------------------------------------------------------------
-- 2. ai_knowledge_page_recovery_jobs — durable async work
-- -----------------------------------------------------------------------------
create table if not exists public.ai_knowledge_page_recovery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  source_id uuid not null
    references public.ai_knowledge_sources(id) on delete cascade,
  source_version integer not null check (source_version >= 1),
  page_number integer not null check (page_number >= 1),
  extraction_version text not null
    check (length(trim(extraction_version)) > 0 and length(extraction_version) <= 64),
  recovery_version text not null
    check (length(trim(recovery_version)) > 0 and length(recovery_version) <= 64),
  status text not null default 'queued'
    check (
      status in (
        'queued',
        'claimed',
        'succeeded',
        'unusable',
        'failed',
        'discarded_stale'
      )
    ),
  attempt_count integer not null default 0
    check (attempt_count >= 0 and attempt_count <= 32),
  detector_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(detector_reasons) = 'array'),
  error_code text
    check (
      error_code is null
      or error_code in (
        'invalid_request',
        'invalid_page',
        'source_unavailable',
        'stale_version',
        'render_failed',
        'ocr_failed',
        'timeout',
        'output_too_large',
        'internal_error',
        'retry_exhausted'
      )
    ),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_knowledge_page_recovery_jobs_identity_uq
    unique (source_id, source_version, page_number, recovery_version)
);

comment on table public.ai_knowledge_page_recovery_jobs is
  'Async OCR recovery job lifecycle. Distinct from page evidence. Service-role writes.';

comment on column public.ai_knowledge_page_recovery_jobs.detector_reasons is
  'Safe reason codes that triggered enqueue. Never academic content.';

create index if not exists ai_knowledge_page_recovery_jobs_claim_idx
  on public.ai_knowledge_page_recovery_jobs (status, available_at)
  where status in ('queued', 'claimed');

create index if not exists ai_knowledge_page_recovery_jobs_source_version_idx
  on public.ai_knowledge_page_recovery_jobs (source_id, source_version);

create or replace function public.ai_knowledge_page_recovery_jobs_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_page_recovery_jobs_updated_at
  on public.ai_knowledge_page_recovery_jobs;
create trigger trg_ai_knowledge_page_recovery_jobs_updated_at
  before update on public.ai_knowledge_page_recovery_jobs
  for each row execute function public.ai_knowledge_page_recovery_jobs_set_updated_at();

create or replace function public.ai_knowledge_page_recovery_jobs_enforce_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_section uuid;
begin
  select s.user_id, s.section_id
    into v_user, v_section
  from public.ai_knowledge_sources s
  where s.id = new.source_id;

  if v_user is null then
    raise exception 'ai_knowledge_page_recovery_job_source_not_found';
  end if;

  if new.user_id <> v_user or new.section_id <> v_section then
    raise exception 'ai_knowledge_page_recovery_job_ownership_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_knowledge_page_recovery_jobs_enforce_parent
  on public.ai_knowledge_page_recovery_jobs;
create trigger trg_ai_knowledge_page_recovery_jobs_enforce_parent
  before insert or update on public.ai_knowledge_page_recovery_jobs
  for each row execute function public.ai_knowledge_page_recovery_jobs_enforce_parent();

alter table public.ai_knowledge_page_recovery_jobs enable row level security;

-- Jobs are execution state: service_role only (no authenticated SELECT).
revoke all on table public.ai_knowledge_page_recovery_jobs from anon, authenticated;
grant select, insert, update, delete on table public.ai_knowledge_page_recovery_jobs to service_role;

-- -----------------------------------------------------------------------------
-- 3. RPC: upsert native page texts for a source version (idempotent)
-- -----------------------------------------------------------------------------
-- p_pages: [{ page_number, native_text, detector_reasons?, extraction_version }]
-- Sets canonical_text = native_text, extraction_method = native for new rows.
-- Does not clear recovered_text on conflict if already present (preserve provenance).

create or replace function public.ai_knowledge_upsert_page_texts_native(
  p_source_id uuid,
  p_source_version integer,
  p_extraction_version text,
  p_pages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_page jsonb;
  v_page_number integer;
  v_native text;
  v_reasons jsonb;
  v_count integer := 0;
begin
  if p_source_id is null
     or p_source_version is null
     or p_source_version < 1
     or p_extraction_version is null
     or length(trim(p_extraction_version)) = 0
     or p_pages is null
     or jsonb_typeof(p_pages) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  for v_page in select * from jsonb_array_elements(p_pages)
  loop
    begin
      v_page_number := (v_page->>'page_number')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end;

    if v_page_number is null or v_page_number < 1 then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    v_native := coalesce(v_page->>'native_text', '');
    v_reasons := coalesce(v_page->'detector_reasons', '[]'::jsonb);
    if jsonb_typeof(v_reasons) <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    insert into public.ai_knowledge_page_texts (
      source_id,
      user_id,
      section_id,
      source_version,
      page_number,
      native_text,
      recovered_text,
      canonical_text,
      extraction_method,
      extraction_version,
      recovery_version,
      fallback_result,
      detector_reasons
    ) values (
      p_source_id,
      v_source.user_id,
      v_source.section_id,
      p_source_version,
      v_page_number,
      v_native,
      null,
      v_native,
      'native',
      trim(p_extraction_version),
      null,
      'none',
      v_reasons
    )
    on conflict (source_id, source_version, page_number)
    do update set
      native_text = excluded.native_text,
      -- Keep recovered_text if already committed; refresh canonical only when
      -- no recovered canonical is in force.
      canonical_text = case
        when ai_knowledge_page_texts.extraction_method = 'ocr_tesseract'
          then ai_knowledge_page_texts.canonical_text
        else excluded.native_text
      end,
      extraction_version = excluded.extraction_version,
      detector_reasons = excluded.detector_reasons,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'page_count', v_count
  );
end;
$$;

revoke all on function public.ai_knowledge_upsert_page_texts_native(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_upsert_page_texts_native(uuid, integer, text, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: enqueue recovery jobs (idempotent by logical identity)
-- -----------------------------------------------------------------------------
-- Caller (Edge) applies versioned trigger policy first and passes ONLY pages
-- that must auto-recover. This RPC does not re-evaluate SPARSE_TEXT policy.

create or replace function public.ai_knowledge_enqueue_page_recovery_jobs(
  p_source_id uuid,
  p_source_version integer,
  p_extraction_version text,
  p_recovery_version text,
  p_pages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.ai_knowledge_sources%rowtype;
  v_page jsonb;
  v_page_number integer;
  v_reasons jsonb;
  v_inserted integer := 0;
  v_existing integer := 0;
  v_rowcount integer;
begin
  if p_source_id is null
     or p_source_version is null
     or p_source_version < 1
     or p_extraction_version is null
     or length(trim(p_extraction_version)) = 0
     or p_recovery_version is null
     or length(trim(p_recovery_version)) = 0
     or p_pages is null
     or jsonb_typeof(p_pages) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = p_source_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  for v_page in select * from jsonb_array_elements(p_pages)
  loop
    begin
      v_page_number := (v_page->>'page_number')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end;
    if v_page_number is null or v_page_number < 1 then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    v_reasons := coalesce(v_page->'detector_reasons', '[]'::jsonb);
    if jsonb_typeof(v_reasons) <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    -- Require page evidence row exists for this version (provenance gate).
    if not exists (
      select 1
      from public.ai_knowledge_page_texts t
      where t.source_id = p_source_id
        and t.source_version = p_source_version
        and t.page_number = v_page_number
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;

    insert into public.ai_knowledge_page_recovery_jobs (
      user_id,
      section_id,
      source_id,
      source_version,
      page_number,
      extraction_version,
      recovery_version,
      status,
      attempt_count,
      detector_reasons,
      available_at
    ) values (
      v_source.user_id,
      v_source.section_id,
      p_source_id,
      p_source_version,
      v_page_number,
      trim(p_extraction_version),
      trim(p_recovery_version),
      'queued',
      0,
      v_reasons,
      now()
    )
    on conflict (source_id, source_version, page_number, recovery_version)
    do nothing;

    get diagnostics v_rowcount = row_count;
    if v_rowcount = 1 then
      v_inserted := v_inserted + 1;
    else
      v_existing := v_existing + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source_id', p_source_id,
    'source_version', p_source_version,
    'enqueued', v_inserted,
    'already_present', v_existing
  );
end;
$$;

revoke all on function public.ai_knowledge_enqueue_page_recovery_jobs(uuid, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_enqueue_page_recovery_jobs(uuid, integer, text, text, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- 5. RPC: claim one recovery job (lease + SKIP LOCKED)
-- -----------------------------------------------------------------------------

create or replace function public.ai_knowledge_claim_page_recovery_job(
  p_lease_seconds integer default 120,
  p_max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_knowledge_page_recovery_jobs%rowtype;
  v_token uuid := gen_random_uuid();
  v_lease interval;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 32 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  v_lease := make_interval(secs => p_lease_seconds);

  select *
    into v_job
  from public.ai_knowledge_page_recovery_jobs j
  where (
      (j.status = 'queued' and j.available_at <= now())
      or (
        j.status = 'claimed'
        and j.lease_expires_at is not null
        and j.lease_expires_at < now()
      )
    )
    and j.attempt_count < p_max_attempts
  order by j.available_at asc, j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'job', null);
  end if;

  update public.ai_knowledge_page_recovery_jobs
  set status = 'claimed',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      claim_token = v_token,
      lease_expires_at = now() + v_lease,
      error_code = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'ok', true,
    'job', jsonb_build_object(
      'id', v_job.id,
      'user_id', v_job.user_id,
      'section_id', v_job.section_id,
      'source_id', v_job.source_id,
      'source_version', v_job.source_version,
      'page_number', v_job.page_number,
      'extraction_version', v_job.extraction_version,
      'recovery_version', v_job.recovery_version,
      'status', v_job.status,
      'attempt_count', v_job.attempt_count,
      'detector_reasons', v_job.detector_reasons,
      'claim_token', v_job.claim_token,
      'lease_expires_at', v_job.lease_expires_at
    )
  );
end;
$$;

revoke all on function public.ai_knowledge_claim_page_recovery_job(integer, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_claim_page_recovery_job(integer, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 6. RPC: commit recovery result (idempotent + stale-safe)
-- -----------------------------------------------------------------------------
-- p_status: recovered | unusable | failed
-- On recovered: requires p_recovered_text; sets canonical = recovered when valid.
-- On failed/unusable: canonical = native; records fallback_result.
-- Stale: source missing, claim_token mismatch, job terminal with different outcome,
--        or page evidence missing → discarded_stale / no evidence mutation.

create or replace function public.ai_knowledge_commit_page_recovery_result(
  p_job_id uuid,
  p_claim_token uuid,
  p_status text,
  p_recovered_text text default null,
  p_error_code text default null,
  p_max_attempts integer default 3,
  p_retry_base_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_knowledge_page_recovery_jobs%rowtype;
  v_source public.ai_knowledge_sources%rowtype;
  v_page public.ai_knowledge_page_texts%rowtype;
  v_meaningful integer;
  v_canonical text;
  v_method text;
  v_fallback text;
  v_retry_secs integer;
begin
  if p_job_id is null or p_claim_token is null or p_status is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_status not in ('recovered', 'unusable', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  if p_max_attempts is null or p_max_attempts < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select * into v_job
  from public.ai_knowledge_page_recovery_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Idempotent: already terminal with same logical outcome.
  if v_job.status in ('succeeded', 'unusable', 'failed', 'discarded_stale') then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', v_job.status,
      'job_id', v_job.id
    );
  end if;

  if v_job.status <> 'claimed' or v_job.claim_token is distinct from p_claim_token then
    return jsonb_build_object('ok', false, 'code', 'stale_version');
  end if;

  select * into v_source
  from public.ai_knowledge_sources s
  where s.id = v_job.source_id
  for update;

  if not found then
    update public.ai_knowledge_page_recovery_jobs
    set status = 'discarded_stale',
        error_code = 'source_unavailable',
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'discarded_stale', 'code', 'source_unavailable');
  end if;

  select * into v_page
  from public.ai_knowledge_page_texts t
  where t.source_id = v_job.source_id
    and t.source_version = v_job.source_version
    and t.page_number = v_job.page_number
  for update;

  if not found then
    update public.ai_knowledge_page_recovery_jobs
    set status = 'discarded_stale',
        error_code = 'stale_version',
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'discarded_stale', 'code', 'stale_version');
  end if;

  -- Extraction/recovery version must still match the job identity.
  if v_page.extraction_version is distinct from v_job.extraction_version then
    update public.ai_knowledge_page_recovery_jobs
    set status = 'discarded_stale',
        error_code = 'stale_version',
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'discarded_stale', 'code', 'stale_version');
  end if;

  if p_status = 'recovered' then
    if p_recovered_text is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;
    v_meaningful := length(regexp_replace(p_recovered_text, '\s+', '', 'g'));
    if v_meaningful < 8 then
      -- Treat as unusable rather than accepting empty OCR as recovered.
      p_status := 'unusable';
    end if;
  end if;

  if p_status = 'recovered' then
    v_canonical := p_recovered_text;
    v_method := 'ocr_tesseract';
    v_fallback := 'none';

    update public.ai_knowledge_page_texts
    set recovered_text = p_recovered_text,
        canonical_text = v_canonical,
        extraction_method = v_method,
        recovery_version = v_job.recovery_version,
        fallback_result = v_fallback,
        updated_at = now()
    where id = v_page.id;

    update public.ai_knowledge_page_recovery_jobs
    set status = 'succeeded',
        error_code = null,
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;

    return jsonb_build_object('ok', true, 'status', 'succeeded', 'job_id', v_job.id);
  end if;

  if p_status = 'unusable' then
    update public.ai_knowledge_page_texts
    set recovered_text = coalesce(p_recovered_text, recovered_text),
        canonical_text = native_text,
        extraction_method = 'native',
        recovery_version = v_job.recovery_version,
        fallback_result = 'native_after_ocr_unusable',
        updated_at = now()
    where id = v_page.id;

    update public.ai_knowledge_page_recovery_jobs
    set status = 'unusable',
        error_code = coalesce(p_error_code, error_code),
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;

    return jsonb_build_object('ok', true, 'status', 'unusable', 'job_id', v_job.id);
  end if;

  -- failed
  if p_error_code is null
     or p_error_code not in (
       'invalid_request',
       'invalid_page',
       'source_unavailable',
       'stale_version',
       'render_failed',
       'ocr_failed',
       'timeout',
       'output_too_large',
       'internal_error',
       'retry_exhausted'
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Non-retryable → terminal failed + native canonical
  if p_error_code in (
    'invalid_request',
    'invalid_page',
    'source_unavailable',
    'stale_version'
  ) then
    update public.ai_knowledge_page_texts
    set canonical_text = native_text,
        extraction_method = 'native',
        recovery_version = v_job.recovery_version,
        fallback_result = 'native_after_ocr_failed',
        updated_at = now()
    where id = v_page.id;

    update public.ai_knowledge_page_recovery_jobs
    set status = 'failed',
        error_code = p_error_code,
        completed_at = now(),
        claim_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id;

    return jsonb_build_object('ok', true, 'status', 'failed', 'job_id', v_job.id);
  end if;

  -- Retryable: re-queue if attempts remain
  if v_job.attempt_count < p_max_attempts then
    v_retry_secs := greatest(
      coalesce(p_retry_base_seconds, 30),
      coalesce(p_retry_base_seconds, 30) * v_job.attempt_count
    );
    update public.ai_knowledge_page_recovery_jobs
    set status = 'queued',
        error_code = p_error_code,
        available_at = now() + make_interval(secs => v_retry_secs),
        claim_token = null,
        lease_expires_at = null,
        claimed_at = null,
        updated_at = now()
    where id = v_job.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'queued',
      'retry', true,
      'job_id', v_job.id,
      'available_at_offset_seconds', v_retry_secs
    );
  end if;

  -- Exhausted
  update public.ai_knowledge_page_texts
  set canonical_text = native_text,
      extraction_method = 'native',
      recovery_version = v_job.recovery_version,
      fallback_result = 'native_after_ocr_failed',
      updated_at = now()
  where id = v_page.id;

  update public.ai_knowledge_page_recovery_jobs
  set status = 'failed',
      error_code = 'retry_exhausted',
      completed_at = now(),
      claim_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = v_job.id;

  return jsonb_build_object('ok', true, 'status', 'failed', 'code', 'retry_exhausted', 'job_id', v_job.id);
end;
$$;

revoke all on function public.ai_knowledge_commit_page_recovery_result(uuid, uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ai_knowledge_commit_page_recovery_result(uuid, uuid, text, text, text, integer, integer)
  to service_role;
