# Post-G2.85 release readiness — 2026-11-09

Decision: **NO-GO for production release; continue release verification.** G2.85 is an operator-reported staging acceptance milestone, not production deployment approval. No live operations were performed for this audit. No application behavior, approved policies, migrations, credentials or private journals were changed or inspected.

## Acceptance record and provenance

The operator supplied this sanitized result in the current conversation:

```json
{"mode":"ACCEPTANCE","status":"PASS","failure":null,"cleanup":"PASS","sessionCleanup":"PASS","cases":72}
```

The operator also reports staging catalog `TARGET_MATCH` and all five historical recovery runs `CLEAR`, with zero remaining rows/objects and successful read-only/visibility guards. These reports are accepted with their stated provenance; this audit did not independently execute or inspect those remote results. The exact successful-run timestamp and contemporaneous source digest were not supplied.

Current HEAD: `760470850db179821b3aa56043f5e5be3115d8d2`. The working tree contains substantial tracked modifications and untracked release/security code. HEAD therefore does not identify the source used for the successful run. `G285-CURRENT-SOURCE-SNAPSHOT.json` records current selected source hashes, **not** proof that those bytes ran live. It is not a complete release-tree manifest.

Registry reconciliation: `scripts/security/g285/core.mjs` exports 72 unique mandatory cases: six owner-positive controls, 36 cross-user Storage cases (nine operations × two buckets × two directions), and 30 section/group/item cases (five operations × three tables × two directions). Exact completion and both-actor integrity checks gate PASS. Cleanup and session cleanup are separately reported PASS by the operator.

Earlier failures remain historical failures. `scripts/security/g285/RECOVERED-RUN-RECONCILIATION.json` records the earlier 48 PASS / 24 FAIL run; it is not rescored. `REVIEWED-STORAGE-CORRECTIONS.md`, `reviewed-storage-denials.mjs`, and their adversarial tests explain the subsequent narrow corrections. HTTP 400 alone is never a denial: exact operation, logical SDK code, transport classification, strictly null data and independent state evidence are required. Download/sign composites additionally require fresh exact owner readback; post-case checks precede PASS. These establish observed non-disclosure/non-mutation, not the exact internal RLS execution branch.

Do not repeat G2.85 merely because earlier runs failed. Reopen it only for relevant runner/policy changes, a concrete evidence contradiction or a demonstrated coverage defect. Version uncertainty should first be addressed by existing sanitized records and candidate identification, without credentials or journal inspection.

## Release gate matrix

Statuses refer to the proposed release, not all historical work. PASS with operator provenance is explicitly qualified. No new exploitable vulnerability is confirmed by this bounded audit.

| Gate / functionality | Status | Severity if unresolved | Evidence | Missing work / exact acceptance criterion |
|---|---|---|---|---|
| G2.85 staging ordinary-user hierarchy and Storage isolation | PASS (operator-reported) | Critical | Result above; `scripts/security/g285/core.mjs`, `adapter.mjs`, `scope.mjs`; local regressions | Preserve result and version limitation; do not broaden it to unrelated tables or production. |
| Auth/session security in application | PARTIAL | High | `src/lib/supabase.ts`; `src/hooks/useAuth.magicLink.test.tsx`; `src/components/Auth.stagingEmail.test.tsx`; G2.85 server identity gates | On identified staging build: login, callback/PKCE, refresh, logout, account switch and expiration; no stale previous-account content; no session values in reports. Ordinary password acceptance does not prove browser magic-link UX. |
| RLS and cross-user application database coverage | PARTIAL | Critical | `security/g275/G2.81-EXECUTION-RESULT.md`, `08-G2.81-readonly-postflight.sql`; operator TARGET_MATCH | G2.85 covers sections/groups/items only. Inventory release-used tables such as free-space, notebook and knowledge data; reconcile owner policies and targeted existing isolation evidence before declaring comprehensive coverage. Do not infer exposure solely from missing evidence. |
| Storage/PDF privacy and signed URLs | PASS for G2.85 scope; PARTIAL release-wide | Critical | `core.mjs`, `transport.mjs`, `reviewed-storage-denials.mjs`; reported 72 PASS | Both private buckets and tested operations covered. Browser PDF workflows, signed-URL lifetime/expiry and all application asset paths still need identified-build functional verification. Never export URLs. |
| Notebook/document persistence | PARTIAL | Critical | `src/lib/notebookPages*`, `src/lib/notebookTiptap/`, notebook persistence and cloud tests in `vitest.config.ts` | Synthetic edit/refresh/reopen, legacy document compatibility, page add/delete, handwriting/image/PDF attachment and cross-device round trip with bounded cleanup; no existing-user writes. |
| Sync and data integrity | PARTIAL | Critical | `src/lib/focusCache/`, `src/lib/sync/`; `freeSpacePersistFlush.ts`; integration tests | Offline queue, reconnect, conflict ordering, account switch, interrupted save and pending-write upgrade tests. Mock success alone cannot prove deployed database sync. |
| PDF viewer/file workflows | PARTIAL | High | `src/components/*Pdf*`; PDF geometry, visibility, export and persistence tests | Browser synthetic upload/open/page/zoom/select/export/delete; restored object ownership and MIME/size failures; verify Safari behavior. |
| Study Mode / Tutor functionality | PARTIAL | High | `src/lib/studySession/`, `studyContinuity/`, `src/lib/ai/tutor/`; `docs/release/PHASE-7M-TUTOR-EVIDENCE-PILOT.md` | On identified frontend/gateway: capture, context, follow-up, persistence, error/cancel and provenance. Paid inference and any enabling/configuration change require separate bounded approval. No new feature work. |
| AI authorization, injection, secrets, rate limits and cost abuse | PARTIAL | Critical | `supabase/functions/ai-gateway/index.ts:156` authenticates before provider configuration; `_shared/ai/askCourse/promptAskCourse.ts` treats material as untrusted; `_shared/ai/projectLevelSpendingGuard.ts` and tests | Reconcile deployed gateway/version and required RPCs; verify unauthenticated/foreign-scope denial, injection fixtures, concurrency/quota/kill-switch behavior and sanitized logging. Presence of controls does not prove deployed configuration or immunity to prompt injection. |
| Existing-user preservation / migration 022 | BLOCKED | Critical | `supabase/migrations/022_ai_project_spending_guard.sql` is untracked; gateway uses spending RPCs | Decide exact migration inventory, baseline compatibility and gateway/schema ordering. Rehearse forward and explicit rollback on synthetic representative schema/data in separately approved isolated environment. Verify existing content/counts preserved, ACLs, concurrency and interrupted execution. Never apply merely because SQL uses IF NOT EXISTS. |
| Staging/production separation | PARTIAL | Critical | `scripts/deploy-staging.sh`; `verify-build-target.mjs`; dedicated staging docs; local bundle checks | Current local synthetic builds prove artifact separation only. Reconcile contradictory historical alias/project instructions; verify exact future deployment target and candidate digest. No production inspection in this audit. |
| Critical workflow regression | PARTIAL | High | Configured offline Vitest suite; G2.85 suite; build/type results | Resolve actual test failures first, then bounded browser workflow batch on candidate. Live test files excluded intentionally and not counted as passing. |
| Browser / supported iOS behavior | UNKNOWN | High | `vite.config.ts` PWA; `src/main.tsx` controller-change persistence flush; browser acceptance checklist | Record supported browser/device versions; desktop Chromium/WebKit and actual iOS Safari/installed-PWA lifecycle, background/resume, keyboard, PDF and upgrade-with-pending-edits. No native iOS wrapper was established by this audit. |
| Backup, rollback, recovery and observability | PARTIAL | Critical | Five recovery CLEAR reports; `security/g275/04-rollback.sql`; original `security/g270b/PRODUCTION-SCHEMA-BACKUP-PROCEDURE.md` and `g270c/OPERATOR-RUNBOOK.md` in sibling security worktree | Historical fixture cleanup and schema-only backup procedures are not current full data/Storage recovery proof. Require current backup coverage, retention, isolated restore result, app rollback artifact and schema compatibility, sanitized monitoring/rollback triggers and assigned operator. Security rollback can restore vulnerable policies; never automatic. |
| Deploy configuration / final production readiness | BLOCKED | Critical | Dirty tree and snapshot; staging deploy script; historical release docs | Freeze reviewed candidate without discarding WIP; bind frontend/gateway/schema evidence to exact bytes. Resolve duplicate-deploy fallback, verify target guards and rollout/rollback plan, then obtain separate production approval. |

## Confirmed observations and risks

- `scripts/deploy-staging.sh:122–129` can issue a second deployment when parsing the first deploy response yields no URL. An uncertain first outcome is not evidence that no deployment happened. This is a confirmed operational hazard for a controlled single-attempt deployment, not proof of a data breach. Required correction before using this route: stop on unparseable/uncertain outcome; regression test must assert one invocation and no alias change. No deploy script behavior was changed in this audit.
- The default `vitest.config.ts` includes three `*.live.test.ts` files. Those files load `.env` and can authenticate/write when configured. They were explicitly excluded here. Do not use unqualified `npm test` for a credential-free offline verification batch.
- Migration 022 creates server-only usage tables and SECURITY DEFINER RPCs and revokes ordinary-role access. Its header says not applied by this change. Whether required objects exist remotely is UNKNOWN. New RPC callers and migration rollout must be coordinated; no remote absence or defect is asserted.
- PWA activation/reload and pending local edits need upgrade verification. The current code attempts persistence flushing; that is not proof against data loss during browser termination, storage failure or deployment.
- Build chunk-size and stale Browserslist warnings are nonblocking on their own. Missing lint tooling and test/build failures, if any, are reported separately; no packages were installed.

## Ordered execution batches and approvals

1. **Candidate and local blocker batch — authorized local work.** Preserve WIP; select exact frontend/gateway/migration scope, identify deployment artifact/source mismatch, resolve demonstrated offline regressions with targeted tests, and prepare a stop-on-uncertain-outcome deployment fix with mocked CLI tests. Produce a full allowlisted release manifest and rerun affected offline suites. Security/data coverage inventory and migration static review can proceed independently. Acceptance: no unexplained local failures; explicit candidate identity; every release-used table accounted for; no hidden remote dependencies. Do not commit without approval.
2. **Data/migration and recovery batch — preparation local; infrastructure and remote actions separately approved.** Review migration 022 and existing-user compatibility; prepare isolated rehearsal and backup/restore evidence requirements. Acceptance: representative data unchanged, expected ACLs/RPCs, concurrency/crash behavior, reversible compatible application rollout; actual backup/restore proof. Do not reset, install/start services or apply a migration implicitly.
3. **Bounded staging regression batch — separate approval for authentication, synthetic writes, inference and any deployment.** Once candidate and schema compatibility are established, test auth/account-switch, notebook/PDF persistence, sync/offline/reconnect, Study Mode/Tutor and desktop/iOS PWA in one evidence-producing session. Use disposable authorized data and explicit cleanup; cap paid AI requests and restore switches. Acceptance: workflow assertions and cleanup PASS, no cross-account content, no pending-write loss, no quota bypass. No gratuitous G2.85 rerun.
4. **Release and rollback batch — explicit production approval required.** Review immutable candidate/artifacts, migration ordering, fresh authorized backup/restore evidence, target identity, rollout/rollback responsibilities and observability thresholds together. Stop on uncertain commit/deployment outcome, data-integrity concern or failed postflight. No automatic rollback that weakens security. Production deployment remains unauthorized.
5. **Defer nonblockers.** Bundle optimization, stale browser database maintenance and cosmetic documentation improvements can wait unless linked to measured functional/performance failure.

The single best next batch is **candidate and local blocker batch (1)**. Remote access is unnecessary for that work. The most valuable later operator approval is one consolidated, bounded staging application-regression session after candidate/schema readiness, not another isolation diagnostic loop.

## Local validation record

See `G285-LOCAL-VALIDATION.json` for exact completed counts and exclusions. Local builds use synthetic public placeholders, `envDir:false`, temporary output directories and outbound-network blocking; they are not deployable artifacts or live PostgreSQL correctness evidence. Lint was not run because the installed ESLint executable is absent. No dependency installation was attempted.

Completed: **205/205 G2.85 tests; 4,146/4,146 application/gateway tests across 316 files; 30 G2.85 module syntax checks; application build TypeScript; both synthetic staging/production bundles and their identity checks; eight deployment guard checks.** Zero test failures. Three live test files were excluded, not skipped-and-counted as success. This is the configured suite, not a claim that every repository test file is included.

Repeatable offline regression command, from this repository (no installation):

```bash
NODE_OPTIONS='--require=/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023/docs/release/audit-support/offline.cjs' \
  node node_modules/vitest/vitest.mjs run --config docs/release/audit-support/vitest.config.mts
node --test scripts/security/g285/*.test.mjs
node node_modules/typescript/bin/tsc -p tsconfig.build.json --incremental false
```

The offline support files are test harnesses, not application networking changes or an OS sandbox. Mocked tests can replace fetch; the process-level TCP guard remains. A future test that deliberately removes guards or uses another executable requires separate review. Temporary build artifacts are not committed or promoted.
