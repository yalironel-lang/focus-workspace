# Independent local release security review — 2026-11-09

**Verdict: BLOCKED; production NO-GO.** Reviewed actual source for candidate `local-ed1c32525a4880a2`; all 1,324 scoped fingerprints match. No application/SQL/runtime dependency was modified by this review. New files are review evidence and a synthetic review test only. The G2.85 operator-reported 72-case staging acceptance milestone remains valid within its reported scope and is not repeated.

## What the accounting remediation establishes

- `projectLevelSpendingGuard.ts:432–460` rejects unsupported dollar caps and missing reservation IDs in the actual PostgreSQL adapter. The gateway constructs that adapter itself; clients cannot choose a permissive store. This establishes mandatory reservation confirmation before the callback used by paid provider calls.
- `projectAccounting.ts:14–26` gates dispatch and final response on explicit confirmation. Missing/failed/ambiguous settlement does not return a successful paid response. Own-property validation rejects accessor/inherited contradictions without reading getters.
- Adapter lines 462–494 coalesce duplicate dispatch and identical finalization within one request; conflicting terminal operations fail; late dispatch cannot reopen finalized state. This is not a cross-request/provider idempotency key.
- Unknown/incomplete usage retains at least the estimated reservation. That is conservative only if the estimate is itself a genuine bound. It does not prove the correctness of that bound or the SQL lifecycle.
- Independent tests exercise the real adapter/helper: a valid token request completes, concurrent duplicates issue one dispatch/settlement, rejected settlement remains rejected without release/retry, unknown paid usage charges its estimate, and a dollar-capped request never calls the admission RPC.

The previous application-level false-success and silent dollar-bypass defects are contained locally. They do not establish that the entire token-based system is release-safe.

## Release-critical findings

### F1 — HIGH: reservation estimate can be below permitted output

**Reproduced from actual functions.** `getSafeTokenReservation('explain_selection','o4-mini')` returns 3,500, while `resolveServerMaxOutputTokens('o4-mini','explain_selection')` returns 8,000. The former classifier includes o1/o3 but omits o4 (`projectLevelSpendingGuard.ts:56–77`); the latter explicitly accepts every o-number family (`chatCompletionsRequestPolicy.ts:38–66`). This is a supported configuration path, not proof that production uses that model.

A pool with 3,500 tokens remaining can admit an operation whose output alone can exceed the reservation. Later actual settlement cannot retroactively prevent overspending. Required correction: one authoritative supported-model/token policy, a defensible bound for input + output + embeddings + allowed attempts, and admission against that bound or fail-closed unsupported configurations. Do not fix only this model string and assume all other estimates are proved.

### F2 — HIGH: skipped expired reservations disappear from admission accounting

**Source-confirmed schedule; actual PostgreSQL replay pending.** Migration 022 cleanup uses `FOR UPDATE SKIP LOCKED` on expired dispatched rows (`022:111–117`). Admission then sums only rows whose expiry has not passed (`:261–268`).

Counterexample: token cap=100; settled=0; an expired dispatched reservation holds 100 tokens; another transaction locks that row. Cleanup skips it, admission excludes it, and a new 100-token request can be admitted while the possibly paid original 100 remains unsettled. The consistent daily-counter lock does not protect a row excluded from both calculations.

Required correction: expired but unreconciled potential spend must remain counted until it is atomically transferred to a settled/conservative bucket. A lock skip or transaction failure must not create capacity. Verify with two real connections and explicit barriers; the existing JavaScript simulation is not this test.

### F3 — HIGH: old pending work can refund today's request counter

**Source-confirmed logic; actual PostgreSQL replay pending.** Cleanup scans pending expired reservations without restricting their creation day (`022:137–147`) and subtracts their number from the caller/current day's request counter (`:153–157`). Release likewise derives current day, not admission day (`:476,519–522`).

Counterexample: today's request cap/counter is 5; one yesterday-created pending reservation expires. Today's begin runs cleanup, subtracts one from today's counter, then admits another request and increments it back to 5. Six requests have actually been admitted today. Refunds must apply to the original admission window; token settlement/expiry windows also need an explicit, consistent policy (`:385,422–446`).

### F4 — availability/recovery gap: current protective configuration can disable existing workflows

All positive dollar-cap configurations are denied. If neither request nor token cap is configured, 022 returns a null reservation (`:215–218`), which the new adapter denies. This is a real compatibility behavior, but whether active users/configurations encounter it is **UNKNOWN** because no remote configuration was accessed.

No local RPC deadline or automatic reconciliation worker is present in this adapter; provider deadlines do not bound admission/finalization. Failure stays closed, but an indefinitely pending RPC depends on platform termination. Expiry cleanup runs when admission is invoked, and dollar rejection happens before that invocation. Recovery therefore requires a verified bounded accounting/alert/reconciliation plan; generic HTTP failure is not complete recovery evidence. Do not add blind settlement or provider retries.

### Lock-order warning requiring rehearsal, not a claimed observed incident

Cleanup acquires reservation/token-counter locks before admission later acquires request-counter then token-counter locks (`022:117,129–132,153–157,232–242`). This does not establish a globally consistent lock order. An expiry-cleanup transaction holding the token row and then requesting the request row can oppose an admission transaction holding the request row and requesting the token row. Rehearse the explicit interleaving; no real deadlock was observed in this local review.

No cross-user disclosure, production exploit or actual overspend was demonstrated. The findings concern the proposed release accounting controls; do not reinterpret G2.85 isolation PASS as failed.

## Dollar-budget scope decision

**Recommend conditional B for the smallest release, not approval to clear a cap now.** Study Mode does not require a new atomic dollar ledger as a product feature. Shipping corrected, bounded token/request controls can avoid the scope and migration risk of A. But B is not safe to enable on the present candidate until F1–F3 and recovery evidence are addressed.

A gives an enforceable money ceiling only with atomic settled-plus-reserved money accounting, authoritative prices/unknown-price rejection, attempt bounds, concurrent admission and crash/late settlement. It needs additional schema/RPC design and rehearsal; a usage-log precheck is insufficient. A becomes necessary if existing product commitments or operators require a strict dollar ceiling. Those commitments are not established locally.

B must explicitly declare monetary caps unsupported and preserve working request/token admission. There is no located frontend binding for the server `AI_PROJECT_MAX_DAILY_BUDGET_USD_MICROS` setting; no public request payload parameter is used for that cap. Disabling this capability therefore does not inherently require a new UI or client API shape. Keep the server rejection for a positive unsupported cap, document the operational capability, and do not silently ignore the setting.

However, an active positive dollar cap must not be removed without its owner's explicit approval of a replacement control contract. Existing uncapped configurations must not suddenly lose AI without a planned, tested supported configuration. Required operator evidence later is nonsecret: whether these configurations are active, which supported model/capability policies apply, whether positive request/token limits fit SQL integer constraints, and whether users have monetary-limit commitments. No credentials, personal identities or user content are needed.

B needs no *dollar-specific* schema/UI/API expansion, but safe token accounting still needs corrections and rehearsal of Migration 022 (or a follow-up migration if already applied). Never rewrite applied migration history blindly. Whether 022 is applied/currently compatible is UNKNOWN. UI copy/docs must be corrected if any user-facing dollar guarantee is later identified.

## Migration and preservation

022 is transactional and does not explicitly delete existing section/group/item/notebook/Storage data. It creates usage tables, overwrites matching function definitions, changes ACLs and references auth.users. IF NOT EXISTS does not validate existing table shape. These are code observations, not proof of current production compatibility or a baseline-specific rollback.

`G285-INDEPENDENT-REHEARSAL-PROCEDURE.md` gives the concrete isolation envelope, ordered execution and adversarial replay criteria. It is prepared, **not authorized or executed**. Do not use the older configurable-container/truncation script. Before any production/staging application, capture the actual approved catalog baseline, confirm owners/dependencies/ACLs, and prepare exact rollback that retains accounting records. Schema-only backups do not protect all user data and Storage bytes.

## Browser and native runtime investigation

Host is macOS arm64. Local Playwright registry metadata confirms executable full Chromium exists, **chromium-headless-shell does not**, and **WebKit does not**. Playwright 1.52.0 `chromium.js:313–316` selects headless-shell for default headless launches, explaining that specific missing-executable failure. Full Chromium explicitly selected exits early; no missing executable/library or explicit permission cause was established. It remains an unresolved local engine failure, not an application defect. No browser content, profile, credential or raw launch log was inspected.

No Deno, psql or postgres binary was located on PATH; Docker CLI exists, but its daemon, context, local images and PostgreSQL version were not inspected or started. No inference from the Docker CLI's presence proves rehearsal readiness.

The strict offline gateway check passes using typed local Deno declarations and installed Supabase 2.105.1 types. Actual gateway import is pinned to remote 2.49.0. This is a source-compatibility check, **not native pinned-runtime proof**. Without an approved Deno executable and matching cached dependencies, native validation cannot be completed offline here. Do not suppress the mismatch or silently fetch/upgrade dependencies.

Safe preparation without installation: retain the existing five real-module browser scenarios, strict checker, full application regression matrix and physical-iOS checklist; collect bounded sanitized local launch categories or inspect installed artifact metadata. Running WebKit/native Deno requires approved availability of the missing artifacts. Supported physical iOS/PWA lifecycle cannot be established by desktop emulation.

## Verification and next parallel batch

This review ran five independent source-based challenges: **four control checks passed; one confirmed-defect reproduction passed**. The reproduction is evidence of F1, not a remediation PASS. Existing focused accounting suite **64/64**, G2.85 **205/205**, eight deployment guards and strict offline Edge/frontend TypeScript checks passed. Prior 4,187-test full-suite evidence remains tied to this unchanged source fingerprint; no need to repeat it without changes.

Next batch, after explicit approval to change release-critical behavior:

1. Correct authoritative token reservation/model bounds and unknown paid-usage policy with targeted tests; preserve mandatory reservation and failed-settlement behavior.
2. Independently prepare token-ledger SQL corrections for F2/F3/global lock ordering and review them against the actual baseline. Do not start/apply the rehearsal until explicitly approved.
3. In parallel without changing application behavior: diagnose installed full-Chromium launch and prepare native-runtime artifact/version requirements; no dependency installation. Keep browser/device regression scopes ready.
4. Operator later confirms only nonsecret active cap/model capabilities and whether a dollar ceiling is a contractual release requirement. Choose conditional B only after that compatibility decision; otherwise A remains required.

No staging/production action, installation, database startup, SQL application, account access, commit, push or deployment occurred. Production remains NO-GO.
