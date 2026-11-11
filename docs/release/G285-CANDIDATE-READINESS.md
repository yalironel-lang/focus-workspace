# Local candidate-readiness batch — 2026-11-09

**Release decision: NO-GO.** The staging G2.85 ACCEPTANCE 72-case PASS, cleanup/session cleanup PASS and five historical recovery CLEAR results remain operator-reported milestones. No new isolation run is required by this batch. No remote operations, credential/journal access, migration, commit or deployment occurred.

## Exact candidate and change inventory

- Worktree: `/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023`.
- Detached HEAD: `760470850db179821b3aa56043f5e5be3115d8d2`.
- Base Git tree: `ba8cd255b2ba7ab9c0cde99719069dc8dcb0144b`.
- Proposed current candidate: `local-32acfd93b25ed0ae` (1,313 fingerprinted files; 158 relevant modified/untracked paths). See `G285-CANDIDATE-INVENTORY.json` for the authoritative candidate ID, full scoped SHA-256 manifest and every relevant modified/untracked path. The manifest includes current source, public assets, dependencies, build configuration, migrations and verification tooling. It is not a Git commit, a signed artifact, a complete repository snapshot, or a successful-live-run source attestation.
- All pre-existing changes are retained. No reset, checkout, staging, commit or deletion was performed. Runtime changes include authentication UI, PDF capture/viewer, Tutor/session/provenance, gateway routing and retrieval, provider/visual capture code, and project spending controls. Package changes add release commands; the root dependency graph was not changed in this batch.
- Untracked runtime modules are necessary candidate inputs, not disposable files. The staging-only vision probe, historical rollback snapshots, scratch/benchmark experiments, generated dist directories, environment/tool state and private material are explicitly outside the proposed deploy scope. The new probe stanza in `supabase/config.toml` is not authorization to deploy that function. Deploy functions explicitly, never all functions by default.
- Deployment scope must be bound to this manifest before authorization; HEAD alone is insufficient. Selecting this proposed candidate does not prove it matches the currently deployed frontend/gateway or the operator's successful G2.85 source. Preserve the original report; reconcile available sanitized deployment/source records instead of inventing correspondence.

## Completed deployment safety correction

`scripts/deploy-staging.sh` now submits exactly one deploy command. Nonzero CLI exit, malformed/missing metadata, unsupported URL structure, missing deployment ID or missing/unverified READY state stops before aliasing or HTTP verification. It emits a fixed uncertain-outcome message and never logs/replays raw CLI output. No fallback deploy remains. Existing opt-in, production-ref refusal, project guards and bundle checks are retained.

`.vercelignore` additionally excludes scratch, fixture/evidence/security directories and named local layout captures. These were outside the proposed source manifest but not all were excluded from the upload. No excluded file was opened, modified or deleted by this change. Ignore-rule tests verify the intended entries; no real Vercel packaging/upload occurred.

`scripts/test-deploy-staging-outcomes.test.mjs` executes the actual script in a synthetic checkout with fake npx/curl/git, a clean environment and no credentials. It checks uncertain responses with alias opt-in on/off, CLI failure after possible submission, malformed URL/readiness/ID, arbitrary output suppression and the success paths. This protects against an automatic duplicate submission **within one invocation**; it does not provide provider-level idempotency across operator reruns. After UNKNOWN, inspect the existing attempt read-only and require a fresh approval before any new deployment. Do not rerun this script to attach an alias to an existing deployment: this entrypoint always submits a new deployment.

The installed/authorized Vercel CLI's actual response contract and target project still require verification before live execution. Synthetic CLI success is not proof that `--format json` is supported by the intended CLI. No CLI was installed or invoked against Vercel.

## Migration 022 and gateway reconciliation

Files: `supabase/migrations/022_ai_project_spending_guard.sql`; `supabase/functions/_shared/ai/projectLevelSpendingGuard.ts`; `supabase/functions/ai-gateway/index.ts`.

The current gateway constructs a PostgreSQL spending store and calls `ai_gateway_project_begin` before provider work, even with unset caps (unless the emergency switch rejects first). It subsequently uses dispatch, settle and release RPCs. Migration 022 defines those four functions and the cleanup helper, backed by two new usage tables. Missing begin RPC fails closed and makes AI unavailable; there is no safe assumption that the gateway can precede its schema dependency.

Function signatures are aligned at the parameter-name level: begin(user UUID, capability text, emergency boolean, request/token integer limits, estimated integer tokens); dispatch/release(reservation UUID); settle(reservation UUID, actual integer tokens); cleanup(optional timestamp). SQL revokes ordinary-role access and grants service_role. All five functions are SECURITY DEFINER with a fixed search_path; both tables enable RLS. Ownership/default privileges and dependency collisions still need baseline-specific checks.

### Confirmed local limitations — not repaired silently

1. **Dollar cap bypass in the durable path (high financial-control risk).** `checkProjectSpendingGuard` delegates directly to `store.begin` before the legacy dollar-budget evaluator (`projectLevelSpendingGuard.ts:189`). The RPC adapter does not send `maxDailyCostMicros` (`:412`); SQL has no dollar-budget parameter and returns allowed without reservation when request/token limits are unset (`022:215`). A synthetic reproduction with a cost-only cap admits the request and never invokes the usage loader. This does not prove current staging/production cap values or observed overspend. An AI-enabled release must resolve the advertised control mismatch or explicitly establish an approved hard request/token bound and an accurate cost-control contract; do not assume those limits are configured.
2. **Application-level settlement rejection ignored (high accounting-reliability risk).** The adapter checks the SDK error but not the settlement RPC's JSON `ok` (`projectLevelSpendingGuard.ts:470–485`). A synthetic `{data:{ok:false,code:'not_found'},error:null}` is returned as `{ok:true}`. Gateway finally also does not inspect settlement results (`ai-gateway/index.ts:506–515`). The evidence test reproduces the misleading result; it does not prove actual reservation loss. Repair must validate every lifecycle response and define conservative accounting/monitoring on rejection without retrying provider calls.
3. **Gateway type contract failure (release build gate).** Frontend `tsc -p tsconfig.build.json` excludes Edge Functions. An additional offline strict TypeScript inspection finds the dispatch callback at `ai-gateway/index.ts:503` returning a result object where the pipeline accepts only void/Promise<void>, and `pipelineResult` used before assignment at `:506`. It also reports Ask Course return/narrowing/union issues. Missing Deno/global remote-import typings are tooling diagnostics and are not counted as runtime bugs. There is no installed Deno executable in this environment; an authoritative Edge type/build check remains outstanding. Do not call the gateway type-clean because Vitest transpilation passes.

`candidateReadiness.audit.test.ts` contains three evidence tests: the two confirmed limitations above and missing-RPC fail-closed admission. The first and third tests intentionally reproduce current undesirable behavior; their passing does **not** close those findings.

### Preservation and sequencing prerequisites

Migration 022 has transactional DDL, new usage-table DML and no explicit DELETE/TRUNCATE of existing notebook, section/group/item or Storage content. That source observation is not a live preservation proof. `CREATE TABLE IF NOT EXISTS` does not validate an existing table's schema; `CREATE OR REPLACE FUNCTION` can overwrite an existing definition. Required preflight: exact existing names/definitions, constraints/indexes, owners/ACLs, dependencies, PostgreSQL version and privileges, and whether 022 is already present. No guessed ledger identifier should substitute for catalog evidence.

Before application: capture the actual baseline, resolve the control/type findings, rehearse on an isolated synthetic representative schema, and approve a baseline-specific rollback. Test simultaneous admission, pending/dispatched expiration, duplicate settlement/release, late settlement, UTC midnight rollover and lock order/deadlock behavior. The current `scripts/test_postgres_migration022.sh` is **not** an approved safe launcher: it targets an operator-selected container, prints reservation details and truncates its usage tables. It was inspected, not executed; use a new guarded disposable rehearsal procedure instead.

Order after separate approvals: verify/capture baseline and recoverability → rehearse reviewed migration and rollback → apply only if actually needed → catalog/privilege postflight → deploy the schema-compatible gateway → bounded smoke/regression → frontend promotion. Application rollback should preserve usage accounting tables and records by default; dropping them or restoring older privileges requires its own data/compatibility review. No staging or production application is authorized here.

## ESLint assessment

`package.json` advertises lint, but ESLint is absent from devDependencies, the lockfile and installed binaries. No ESLint configuration or tracked CI lint gate was located. This is a **pre-existing tooling gap**, not a demonstrated security/runtime defect and not by itself a mandatory production blocker. Do not represent lint as PASS. Restoring lint requires selecting a compatible TypeScript/React configuration and pinned packages with separate dependency review; simply installing the latest eslint is not a meaningful release check. A newly discovered mandatory organizational lint gate would change this assessment. The gateway type failures above are separate from lint and must not be waived as a tooling gap.

## Exact next execution batch

**Local AI-control/type-contract remediation and guarded rehearsal preparation.** Resolve the two reproduced spending lifecycle defects and the concrete gateway/shared type errors with targeted regression tests; prepare an offline Edge typing setup using approved tooling; prepare a baseline-capturing, disposable-only migration rehearsal and rollback specification. No live inference or schema operation is needed for code corrections. Do not silently change pricing semantics: document the chosen enforceable contract. In parallel, prepare Playwright/browser automation from `G285-RELEASE-REGRESSION-MATRIX.md`, using synthetic fixtures and offline provider mocks.

After those pass, request one consolidated staging authorization identifying exact candidate/artifacts, whether a migration or gateway/frontend deployment is actually needed, disposable-account use, synthetic writes/cleanup, bounded paid inference and device testing. Separate production authorization remains mandatory after staging, backup/restore and rollback gates pass. No G2.85 rerun unless a relevant policy/runner change or concrete coverage defect justifies it.

## Final local verification and changes

- 4,149/4,149 offline application/gateway tests in 317 files; three live suites excluded.
- 205/205 G2.85 tests; all 30 G2.85 source modules unchanged against the previous audit snapshot.
- 29/29 deployment-outcome/exclusion tests and eight existing staging deployment guard checks.
- Frontend build TypeScript PASS; shell and new JavaScript syntax checks PASS; touched deployment diff whitespace check PASS.
- Additional offline strict Edge inspection: 27 diagnostics, including missing Deno/remote module typings and concrete source type-contract failures. This check is not the native Deno build and is not PASS.
- Root package lock unchanged. No package installation or live request occurred. Previous synthetic bundle build evidence remains applicable to unchanged application behavior; deployment/test/documentation changes were verified with their targeted tests rather than rebuilding identical bundles.

Changed by this batch: `scripts/deploy-staging.sh`, `.vercelignore`, new `scripts/test-deploy-staging-outcomes.test.mjs`, new `supabase/functions/_shared/ai/candidateReadiness.audit.test.ts`, and the four `docs/release/G285-CANDIDATE-*` / `G285-RELEASE-REGRESSION-MATRIX.md` evidence files. Other working-tree changes predate this batch and were preserved. The manifest enumerates the full relevant dirty candidate, not just this batch's patch.

Review conclusion: no auto-resubmission branch remains; both alias modes are exercised by mocks; response parsing fails closed before alias/network verification; G2.85 source and root dependencies are unchanged. Ignore-rule coverage is static, not an actual Vercel upload rehearsal. No claim of full AI gateway safety or production readiness is made while the reproduced findings remain open.
