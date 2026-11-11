# Release blocker remediation — 2026-11-09

**Production NO-GO.** Local corrections are ready for independent source review; no live acceptance, migration, deployment, credential access, private journal access or paid inference occurred. The operator-reported G2.85 ACCEPTANCE 72 PASS / cleanup PASS / sessionCleanup PASS remains unchanged. The single-attempt staging deploy script was not modified by this batch.

## Corrections and root causes

### Authoritative billing admission

`createPostgresProjectSpendingStore.begin` previously sent only request/token limits to Migration 022; the durable guard returned before the legacy dollar evaluator. It now rejects invalid limits and **fails closed whenever a positive dollar cap is configured**. The adapter itself enforces this so direct adapter callers cannot bypass the gate. There is no racy metrics precheck, guessed price, UI-only enforcement or fallback to per-process counters. The gateway no longer constructs the unused legacy day-loader/in-flight evaluator.

This is a protective stop, not full atomic dollar-budget support. Migration 022 has no money reservation fields/arguments. Authorized requests with supported request/token caps and a valid reservation still proceed; configured dollar-cap requests remain unavailable until an independently reviewed authoritative money ledger exists. The adapter also denies no-reservation admission, including the SQL's uncapped/null-reservation response: paid calls must have durable accounting. Never clear a dollar cap or invent a token conversion automatically to make tests green. Current remote configuration is UNKNOWN; this compatibility/availability impact must be checked before any rollout.

### Lifecycle confirmation and idempotency

The project adapter previously trusted SDK `error:null` without checking RPC JSON `ok`, and the gateway ignored returned failure objects. The adapter now requires own, non-accessor success evidence, rejects missing/malformed/contradictory responses, emits only fixed failure codes and never copies raw RPC messages or reservation identifiers to diagnostics.

`projectAccounting.ts` is wired into the actual gateway: dispatch confirmation is awaited before provider calls; unconfirmed dispatch throws and prevents paid inference. Finalization must be explicitly confirmed before a successful response can be returned. Unknown/failed finalization returns a sanitized internal failure through the existing gateway catch. It never releases possibly dispatched work to zero or retries provider/RPC calls.

Repeated concurrent dispatch and identical finalization coalesce into one RPC; conflicting terminal actions/token amounts fail. Late dispatch confirmation cannot reopen a finalized reservation. Incomplete usage after dispatch settles conservatively to at least the reserved estimate, not just a partial embedding count. Complete positive usage settles its actual token total. A lost settlement acknowledgment remains failed and leaves durable accounting for the reviewed crash/reconciliation path; no actual monetary double charge is introduced.

Architectural limit: local tests cannot prove remote reservation expiry, atomic concurrency, quota configuration, unknown-price upper bounds or recovery semantics. Existing SQL cleanup/UTC-day policy and real concurrent transactions still require isolated PostgreSQL rehearsal. This batch does not certify a strict dollar ceiling or change user pricing.

### Strict Edge types

- Explicit retrieval success/error union fixes optional-property narrowing in `runAskCourse.ts`; the v1 request path reads teachingMode only when present.
- `pipelineResult` explicitly permits the pre-result failure state. Typed accounting wrappers satisfy the dispatch callback's void/Promise<void> contract while checking its result.
- `supabaseEnforcement.ts` now accepts the SDK's actual PromiseLike RPC surface, rather than requiring unsupported catch/finally methods. No any casts, diagnostic suppression or weakened strict mode were introduced to fix these errors.
- `scripts/security/release-audit/tsconfig.edge.json` checks the real gateway/import tree with strict mode and **skipLibCheck:false**. The minimal offline Deno API declaration is typed; the remote Supabase import maps to installed 2.105.1 SDK declarations. This passes locally but is **not a native Deno check of the pinned remote 2.49.0 runtime**. That remaining version/tooling validation is explicit, not silently waived.

## Regression evidence

The previous `candidateReadiness.audit.test.ts` reproductions were changed to assert denial/failure. They no longer pass by reproducing the defects. `projectAccounting.test.ts` adds malformed/rejected/contradictory RPC cases, zero paid dispatch after failure, concurrent dollar-cap denial, request-cap outcome handling, one-RPC duplicate behavior, conflicting finalization, late dispatch, absent reservation, sanitized errors and partial/unknown usage. Existing distributed-store concurrency tests remain. Mocked atomic server outcomes do not prove PostgreSQL lock behavior.

See `G285-BLOCKER-VALIDATION.json` for exact final results, including browser execution failures. Initial focused tests failed because old assertions expected a post-settlement release and arbitrary raw RPC errors; assertions now require no second terminal mutation and fixed sanitized errors. No assertion was relaxed to accept malformed success.

## Migration and browser preparation

`G285-MIGRATION022-REHEARSAL.md` defines baseline capture, prerequisites, R01–R11 preservation/concurrency/failure/rollback cases and sequencing. `scripts/security/release-audit/migration022-catalog.sql` is a prepared read-only metadata query, not executed. Current production compatibility remains UNKNOWN; a baseline-specific rollback cannot be invented. Existing user content has not been read or changed.

`G285-BROWSER-IOS-PREPARATION.md` records the implemented actual-module browser suite, observed launch blockers and physical-iOS checklist. The full application matrix in `G285-RELEASE-REGRESSION-MATRIX.md` remains required. Five module-level browser scenarios are not full authenticated persistence/sync/PDF/Study/Tutor workflow acceptance. No test account/session was used.

## Updated release gate matrix

| Gate | Current result | Remaining requirement |
|---|---|---|
| G2.85 hierarchy/Storage isolation | PASS, operator-reported | Preserve provenance; no rerun solely for these unrelated gateway edits. |
| Single-attempt deployment safety | Local PASS, preserved | Actual approved CLI response contract and exact target before deployment. |
| Durable dollar-budget bypass | Locally contained fail-closed; functional BLOCKED | Atomic dollar-reservation design/rehearsal or explicit reviewed release contract. Do not silently remove configured limits. |
| Dispatch/settlement false success | Local regression PASS | Independent review and real database lifecycle/concurrency rehearsal. |
| Strict gateway source types | Offline compatibility check PASS | Native pinned-runtime Deno/SDK check; no install/cache fetch authorized here. |
| Migration 022 / existing-user preservation | BLOCKED | Actual authorized baseline, isolated rehearsal and baseline-specific rollback/restore proof. |
| Browser/PWA/application regression | BLOCKED | Compatible local browser tooling, then separately approved candidate-bound staging workflow batch. |
| Physical iOS | UNKNOWN | Supported-device/version checklist with synthetic data and approved session. |
| Source identity | Current scoped fingerprint recorded | New manifest supersedes candidate local-32acfd93b25ed0ae; no claim it is deployed or matches the historical live run. |
| Backup/rollback/production observability | PARTIAL | Current recovery coverage, isolated restore and controlled rollout/rollback evidence. |
| ESLint | Existing tooling gap | No independent mandatory release gate found; not counted as PASS. |

## Ordered remaining blockers and next batch

1. **Critical/financial:** review fail-closed dollar/no-reservation compatibility impact and decide the authoritative money-accounting contract. No supported monetary enforcement can be created solely by local prechecks.
2. **Critical/data integrity:** authorized schema baseline, synthetic real-PostgreSQL concurrency/UTC-day/rollback rehearsal and recovery proof. No production current-schema compatibility assertion is made from local migrations.
3. **High/runtime:** native pinned Edge runtime compatibility; restore a working local browser execution toolchain without unapproved installations.
4. **High/functional:** exact candidate-bound staged application regression and actual supported iOS/PWA acceptance, including pending-write upgrades.
5. **Critical/release governance:** current backup/restore, rollback artifact and observability, exact deployment identity and separate production approval.

**Next executable batch:** independent local source review of the accounting state machine and strict-check harness, plus a separately approved disposable PostgreSQL rehearsal using R01–R11 (requires explicit local service/application authorization; no existing container reuse). In parallel, diagnose the local browser launcher without credentials or downloads and prepare the remaining authenticated UI fixture bootstrap. Do not infer SQL correctness from the passing mocks.

Approval boundaries: obtaining any staging catalog evidence; installing runtime/browser dependencies; starting isolated database infrastructure and applying SQL there; staging migration or gateway/frontend deployment; ordinary-account authentication/fixture mutation/cleanup; finite paid inference; and production rollout each need explicit scope/approval. No request to execute live G2.85 is made.

## Final validation and exact batch changes

Current proposed source candidate: **`local-ed1c32525a4880a2`**, superseding `local-32acfd93b25ed0ae`. The new scoped manifest fingerprints 1324 files; HEAD remains unchanged. It does not attest a deployment or retroactively identify the G2.85 live-run source.

Final local results: **4,187/4,187** application/gateway tests across **318** files; **205/205** G2.85 tests; **29/29** deployment adversarial tests; **8/8** deployment guards. Three live test files were excluded, not counted as passes. Strict offline gateway and frontend TypeScript checks pass. Browser execution has **zero PASS assertions**, with the launch/prerequisite failures recorded separately. No package was installed. Root lockfile, Migration 022 and staging deployment script hashes are unchanged.

Source/tooling changed by this batch:
- `scripts/security/release-audit/browser/index.html`
- `scripts/security/release-audit/browser/offline.spec.mjs`
- `scripts/security/release-audit/browser/playwright.config.mjs`
- `scripts/security/release-audit/browser/run-offline.mjs`
- `scripts/security/release-audit/browser/scenarios.mjs`
- `scripts/security/release-audit/browser/server.mjs`
- `scripts/security/release-audit/edge-runtime.d.ts`
- `scripts/security/release-audit/migration022-catalog.sql`
- `scripts/security/release-audit/tsconfig.edge.json`
- `supabase/functions/_shared/ai/askCourse/runAskCourse.ts`
- `supabase/functions/_shared/ai/candidateReadiness.audit.test.ts`
- `supabase/functions/_shared/ai/projectAccounting.test.ts`
- `supabase/functions/_shared/ai/projectAccounting.ts`
- `supabase/functions/_shared/ai/projectLevelSpendingGuard.test.ts`
- `supabase/functions/_shared/ai/projectLevelSpendingGuard.ts`
- `supabase/functions/_shared/ai/supabaseEnforcement.ts`
- `supabase/functions/ai-gateway/index.ts`

New evidence: this report, `G285-BLOCKER-VALIDATION.json`, `G285-REMEDIATED-CANDIDATE-INVENTORY.json`, `G285-MIGRATION022-REHEARSAL.md`, `G285-BROWSER-IOS-PREPARATION.md`. All other working-tree changes were preserved.

Additional adversarial review distinguished absent optional fields from accessor/inherited contradiction fields; those now fail without executing getters. Settlement confirmation must include the requested token amount, and dispatch must explicitly confirm the dispatched transition. The final suite includes **38 new accounting adversarial cases** plus three converted defect regressions; no reproduced defect is counted as a remediation success. Metadata-only Migration 022 preparation was not SQL-executed or database-parser validated.
