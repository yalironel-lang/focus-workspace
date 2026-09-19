# ZIKUK AI Gateway — Supabase Edge Function

Server-only secrets (never `VITE_`, never commit values):

```bash
supabase secrets set AI_PROVIDER_API_KEY=...
supabase secrets set AI_PROVIDER_BASE_URL=https://api.openai.com/v1
supabase secrets set AI_MODEL=gpt-5.6-luna
```

Also required (provided automatically to Edge Functions on hosted Supabase; must be available for M0.4):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — JWT `auth.getUser()` only
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only** enforcement RPCs / usage writes  
  Never expose via `VITE_`. Never log. Never return to clients.

`verify_jwt` remains enabled.

---

## Architecture (M0.2 → M0.4)

```
authenticated browser
  → gatewayClient (zikukAiRequest)
  → ai-gateway Edge Function
  → auth.getUser() (anon + caller JWT)
  → preflight (authz + validate)
  → AI_* config gate
  → ai_gateway_begin_request (service role)  ← entitlement + safety + quota
  → sanitize / prompt / route / provider
  → ai_gateway_record_usage (service role)   ← metadata only
  → privacy-safe console log
  → normalized ZikukAiResponse
```

There is **one** AI backend: this gateway.

---

## M0.4 — Usage & cost control

### Plans (`ai_entitlements`)

| Plan | Product quota | Safety limit |
|------|---------------|--------------|
| *(missing row)* | **beta** defaults | yes |
| `beta` | 40 requests / UTC day | 20 / 60s |
| `pro` | 200 / UTC day (architecture; not sold yet) | 20 / 60s |
| `owner` | **exempt** | 20 / 60s (**not** exempt) |
| `disabled` | denied (`ai_disabled`) | n/a |

Optional `daily_request_limit` on the row overrides the plan default (owner stays exempt).

### Quota vs safety

- **Product quota** — longer-window allowance (UTC day request count in V1).
- **Safety rate limit** — short burst protection for **all** users including owner.

Tokens are **recorded** for cost visibility; they are **not** enforced as a quota in V1.

### Fail-closed enforcement

If entitlement / safety / quota storage or RPC fails → **do not call the provider** → `internal_error`.

### Fail-open analytics

If the provider succeeds but `ai_usage_events` insert fails → log privacy-safe error → **still return success** to the user.

If quota was consumed and the provider was attempted, a provider failure **still consumes** the quota slot in V1.

### Privacy — never store / never log

- selection text, surroundings text, prompts, AI response body
- JWT / Authorization headers / API keys / service role key

Allowed metadata: user id, capability, timestamps, provider/model, token counts, estimated cost micros (when known), latency, outcome, normalized error codes, optional section id / provider request id.

### Cost estimation

Single module `aiPricing.ts`. Tokens are durable truth.  
Unknown model pricing → `estimated_cost_usd_micros = null` (never invent prices).

### Client errors

| Code | HTTP |
|------|------|
| `rate_limited` | 429 |
| `quota_exceeded` | 429 |
| `ai_disabled` | 403 |

---

## Owner assignment runbook (manual — do not embed UUIDs in the repo)

1. Apply migration `010_ai_usage_control.sql` to the project (explicit ops step).
2. Look up the owner’s Auth user UUID in the Supabase Dashboard (Auth → Users).
3. As a privileged SQL role / service role:

```sql
insert into public.ai_entitlements (user_id, plan, daily_request_limit, updated_by)
values ('<OWNER_USER_UUID>', 'owner', null, 'manual_ops')
on conflict (user_id) do update
  set plan = 'owner',
      daily_request_limit = null,
      updated_at = now(),
      updated_by = 'manual_ops';
```

4. Do **not** put the real UUID into git, frontend, or docs.
5. Confirm Explain still works; fire a rapid burst to confirm safety limiting still applies.

---

## Migration

Local file: `supabase/migrations/010_ai_usage_control.sql`  
**Do not apply / deploy until explicitly approved.**
