# Resumed independent review and hardening — 2026-11-09

**Production NO-GO. Current local candidate `local-2e50443a572696c2`.** The prior `local-ed1c32525a4880a2` and its reported test/live provenance are retained, not retroactively rescored. HEAD is still `760470850db179821b3aa56043f5e5be3115d8d2`; no commit or deployment occurred.

## Where the interruption stopped

The independent review Markdown was complete. Its referenced disposable rehearsal procedure did not exist; it is now created as `G285-INDEPENDENT-REHEARSAL-PROCEDURE.md`. The independent synthetic test was retained in review-support. No partial application correction was present from that interrupted review. Comparing the prior candidate's scoped files now finds only this batch's two intended runtime edits; no Mission Control V2 file was changed. All pre-existing work remains.

## Conclusions and correction status

1. **Mandatory reservation and failed settlement controls held in review.** The actual adapter/helper rejects missing reservations, failed/ambiguous settlement and conflicting terminal operations; duplicate operations coalesce within an invocation. Partial paid usage is conservatively finalized, but only a genuine whole-request upper bound could make that a hard ceiling. There is no claim of end-to-end cross-request/provider idempotency.
2. **Model mismatch was demonstrated and corrected at the classifier.** o4-mini previously reserved 3,500 tokens while permitting 8,000 output tokens. The planner now uses the same o-series classifier as output policy; it no longer undercuts that output limit. The unchanged planning constants are explicitly estimates, not proofs of input/embedding/visual/retry bounds.
3. **Complete input/attempt bounds are unavailable locally.** No reviewed authoritative counting/bounding artifact was established. The hosted gateway now calls `requireVerifiedTokenReservation` before admission/provider construction; it intentionally fails closed with fixed `TOKEN_INPUT_BOUND_UNVERIFIED`. There is no environment override, guessed byte/token conversion or caller-supplied proof. **This blocks all hosted paid inference in this local candidate. It is containment, not a working Tutor release. Do not deploy it as availability-compatible.** A reviewed tokenizer/provider policy covering input wrappers, text/visual data, embeddings, output/reasoning and every allowed attempt is required to remove the gate safely.
4. **Expired-reservation exclusion is a source-confirmed logic flaw; live overspend was not observed.** The proposed SQL eliminates SKIP LOCKED cleanup and removes expiry from active-liability summation. One common transaction advisory lock is acquired first by all five ledger functions. Expired dispatched work transfers atomically into a full conservative charge; lock contention cannot silently create capacity. The corrected SQL is prepared, not applied or PostgreSQL-validated.
5. **Wrong-day refund was source-confirmed.** The proposed SQL applies every refund/settlement to the original UTC admission day derived from the reservation. Yesterday's pending work cannot reduce today's request counter. This explicitly defines an admission-day token/request ledger, not a provider invoice-day money guarantee.
6. **Additional lifecycle safeguards in the SQL candidate:** reject dispatch after actual expiry; never refund a dispatched or conservatively charged reservation through release; reject invalid amounts; record actual spend above reservation but return failure; reject conflicting repeat settlement. Global ledger serialization addresses the review's lock-order concern, but real contention/deadlock tests remain mandatory. No actual deadlock was observed.

The original `supabase/migrations/022_ai_project_spending_guard.sql` is unchanged. The new SQL is `scripts/security/release-audit/migration022-corrected-rehearsal.sql`, guarded to database `zikuk_022_rehearsal` and explicit session marker. It is **not a staging/production migration**. Unknown applied state and baseline dependencies prohibit rewriting live history or inventing a rollback.

## Existing users and dollar-budget scope

**Recommend conditional B: defer unsupported monetary caps, retain proven token/request controls.** A full atomic dollar ledger is not intrinsically required for Study Mode, but it is required if existing commitments demand a dollar ceiling. No such commitments or current live configurations were inspected.

B is not yet releasable: the input-bound gate blocks hosted AI, and the SQL correction needs rehearsal. Keeping that outage merely because it is secure would not satisfy the release goal. Existing users were not changed because nothing was deployed. Before rollout, confirm nonsecret active model/capability/cap settings and existing monetary commitments privately; never silently clear a positive monetary cap. Uncapped/null-reservation configurations also require an explicitly approved compatible bounded policy. Do not change pricing or entitlements in this batch.

No dollar-specific client payload/UI/schema expansion is inherently needed for B; the located cap is server configuration. Update operational capability/copy if needed and preserve rejection of unsupported positive caps. Token-ledger repairs still require a reviewed migration or follow-up correction depending on actual applied state. A is the larger alternative with atomic money reservation, verified prices/unknown-price rejection and additional schema tests.

## Browser/native-runtime readiness

The missing default Chromium headless shell and missing WebKit were already confirmed. Full Chromium is an executable macOS arm64 binary; its direct binary has no quarantine attribute, but early exit cause remains UNKNOWN. No private browser profile/raw launch log was read. The harness now deliberately selects the installed full Chromium channel, with no shell fallback/download/retry, and uses fixed allowlisted launch categories. Six synthetic diagnostic tests pass. No new browser page assertions were executed because those infrastructure failures were not resolved by an authorized installation or environment change.

Native Deno remains unavailable. Strict offline gateway validation passes with typed local Deno API declarations and installed SDK 2.105.1, while the hosted import is pinned to 2.49.0. This mismatch remains explicit: it is not native Deno/pinned-runtime proof. No package, browser, database image or runtime was installed. The physical-iOS checklist/full application matrix remain required; desktop/module tests cannot substitute for them.

## Verification — no reused failure counted as remediation

- Full offline application/gateway suite: **4,216 passed, 0 failed**, 320 files, 127.48 seconds; three live test files excluded.
- New bound tests: **21 passed**, covering classification and the explicit no-proof/no-paid-call containment. They do not establish functional hosted AI availability.
- SQL preparation checks: **8 passed** — six static source contracts and two independent arithmetic design replays. **No SQL parser/database/concurrency execution PASS is claimed.**
- Browser diagnostic mocks: **6 passed**, no raw sensitive output; browser page assertions: zero executed.
- Strict offline Edge and frontend TypeScript: PASS; touched runtime/script syntax and whitespace checks: PASS.
- Eight deployment guards: PASS. Single-attempt deployment script hash unchanged; prior 29 deployment outcome tests retained without unnecessary repetition.
- All 30 G2.85 modules unchanged; prior 205 local tests and operator-reported 72 live PASS preserved. They were not rerun because this batch changes no isolation runner, ownership policies or fixture behavior.
- Root lockfile and original Migration 022 unchanged. No staging/production connection, account/fixture mutation, paid inference, database startup, migration application, installation, commit, push or merge occurred.

## Exact files changed this batch

Runtime: `supabase/functions/_shared/ai/projectLevelSpendingGuard.ts`; `supabase/functions/ai-gateway/index.ts`.

Tests/preparation: `supabase/functions/_shared/ai/tokenBounds.review.test.ts`; `supabase/functions/_shared/ai/tokenLedgerCorrection.review.test.ts`; `scripts/security/release-audit/migration022-corrected-rehearsal.sql`; browser `launch-diagnostics.mjs`, `launch-diagnostics.test.mjs`, `run-offline.mjs`, `playwright.config.mjs`.

Evidence: this report, `G285-RESUMED-HARDENING-VALIDATION.json`, `G285-RESUMED-CANDIDATE-INVENTORY.json`, and the completed `G285-INDEPENDENT-REHEARSAL-PROCEDURE.md`. The prior independent review is preserved as historical evidence.

## Updated release gates and next efficient batch

- G2.85 isolation: reported PASS within original scope; no new rerun trigger identified.
- Gateway settlement/idempotency: local regression PASS; real ledger lifecycle still unverified.
- Full inference token bound / hosted AI availability: **BLOCKED, highest priority**.
- Dollar-budget scope: conditional B recommendation; active configuration/commitments UNKNOWN; no silent scope reduction.
- Expiry/refund/concurrency SQL: correction prepared; **BLOCKED on isolated PostgreSQL execution and independent review**.
- Existing-user preservation/current production compatibility: UNKNOWN; requires approved baseline and actual restore/rollback proof.
- Native runtime, browser/UI/device: BLOCKED/UNVERIFIED as above.
- Deployment safeguard: local PASS preserved; production rollout unauthorized.

**Next parallel batch:** (1) establish an authoritative provider input/attempt bound and review how supported token-only requests can become functional before removing the paid gate; (2) independently review and, after explicit approval, run the disposable SQL rehearsal with the expiry, midnight, concurrency, preservation and rollback schedules; (3) resolve the full-Chromium launch context and prepare exact official runtime/browser artifacts without installing them. Keep Mission Control V2 separate.

Approvals required: any dependency/image acquisition or installation; starting the one expressly disposable database and applying SQL there; authoritative tokenizer/provider-artifact acquisition where outside local evidence; any staging catalog access, authentication, synthetic writes/cleanup, paid requests, migration or deployment; and a separate final production rollout. No real credentials or private manifests are needed for the synthetic rehearsal. Do not authorize a new hosted acceptance run until functionality and ledger prerequisites pass.
