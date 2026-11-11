# Provider-bound evidence and readiness — local-only investigation

**Tutor cannot safely be re-enabled; production NO-GO.** No hosted configuration was read and no official documentation was fetched because external access/credentials are outside this authorization. This report distinguishes source facts from provider guarantees. It does not infer deployed settings from defaults, model-name examples, historical reports or installed Supabase SDK versions.

## Actual local request paths

1. **Hosted Tutor/Ask and Explain:** `supabase/functions/ai-gateway/index.ts` → `runGatewayPipeline.ts` → Explain generation, or Ask Course query embedding plus generation. Ask Course window/capture routes can skip query embedding; others call it. `routeModel.ts` selects server `AI_MODEL` and optional `AI_VISION_MODEL`; user-scoped QA routing may select `AI_GEMINI_TEST_MODEL`. Current production/staging values and QA activation are UNKNOWN. Text model strings and configurable provider origins are not a closed verified model registry. Vision has a code compatibility allowlist; that is not authoritative billing proof.
2. **Hosted document/notebook embeddings:** `ai-knowledge-index`, `ai-knowledge-process`, and `ai-knowledge-notebook-process` construct the embedding adapter; shared knowledge pipelines dispatch one embedding request per batch. Ingest paths can enqueue/delegate that processing. Bounds include 400 chunks, 16 chunks/24,000 characters per batch; these are document/character limits, not verified token ceilings. A logical HTTP/job workflow can make multiple distinct paid requests even without retries. No project spending reservation hook is present at the reviewed embedding dispatch loops (`knowledge/runKnowledgeIndex.ts:340`, `runKnowledgeIndexUnpublished.ts:144`). Existing ownership/job controls do not prove project-wide spending coverage. **The Tutor gate does not contain all ingestion spend.** This is an additional release accounting coverage blocker; no global ingestion shutdown was silently added because partial processing/invalidation and existing-user corpus preservation need explicit design/tests.
3. **Staging probes:** local vision/embed probe sources also call the provider adapters. Local presence does not prove deployment or authorization. They must remain outside the production deploy scope and require their own restrictions; none was invoked.
4. **Browser BYOK:** `src/lib/ai/client.ts` → `providers/openaiCompatible.ts` supports user-selected OpenAI/OpenRouter/custom endpoints and user-owned credentials. Only source was read; no saved settings or credentials were accessed. This is a separate billing/trust domain from the project service key. Do not claim project reservations cover it. Whether product policy intentionally allows/excludes it in the initial release remains a scope decision.

## Request and SDK facts

Server provider adapters use **raw fetch**, not an OpenAI or Gemini SDK. Supabase JS authenticates/queries data; its version does not establish inference limit or retry semantics. OpenAI-compatible generation emits one application-level fetch per adapter invocation with either `max_tokens` or `max_completion_tokens`; the request does not set tools/functions or multiple candidates. These facts establish serialized parameters, not that an arbitrary compatible endpoint enforces them or that redirects/proxies cannot cause additional billing.

Gemini emits `generationConfig.maxOutputTokens` and optional thinkingBudget. It can make up to three application-level attempts after 503; hosted composite fallback is explicitly disabled. Thus one logical request may contain multiple billable attempts. A 503 with missing usage is not proof of zero consumption. Query/document embeddings are additional calls and their request body contains no input-token ceiling field. Server base URLs may be overridden. Actual provider identity, exact model snapshot, hidden defaults and enforcement remain UNKNOWN.

The output policy currently requests 1,200 legacy Explain tokens, 2,048 legacy Ask tokens, 8,000 reasoning output tokens or 8,192 Gemini-reasoning output tokens. These are source request limits, not independently verified provider or billable-token maxima. Model-name examples in source (including experimental aliases) are not proof of official model existence/availability.

## Authoritative bound: not established

A context-window limit is not a logical-request spending ceiling. It does not by itself cover rejected input billing, message/system framing, cached/image/audio units, reasoning tokens, embeddings, tools, retries or a proxy's internal routing. A character/byte count or a plausible model price must not be relabeled a verified tokenizer/billing bound. Output-only maxima do not bound input.

Before admission can be enabled, bind a policy to the actual endpoint/API family/model snapshot and verify: tokenizer/counting behavior including framing and multimodal expansion; enforced input acceptance or pre-dispatch token counting; enforced output/reasoning cap; no unreserved tools/candidates; finite attempts and unknown-usage full-attempt reservations; sum across embeddings + generation + every hosted paid entry point; pricing only if a monetary ceiling is promised. Unknown model/origin/tool or incomplete proof must fail closed. The current `requireVerifiedTokenReservation` containment remains unchanged.

## Exact external evidence needed — retrieval targets, not citations

No page below was fetched or used as proof in this local task.

- OpenAI official Chat Completions API reference: `https://platform.openai.com/docs/api-reference/chat/create` — exact max_tokens/max_completion_tokens semantics for the actual model, reasoning inclusion, candidate/tool defaults, oversized/rejected requests and usage fields.
- OpenAI official model reference for the **actual configured snapshot**, token-counting guidance, image-token accounting and reasoning guide — input/context distinction and enforceable billable bounds. Do not substitute a familiar model for an unknown alias.
- OpenAI official Embeddings API reference: `https://platform.openai.com/docs/api-reference/embeddings/create` — per-input and aggregate request limits, exact tokenizer/model contract and rejection/billing semantics.
- Gemini official GenerateContent reference: `https://ai.google.dev/api/generate-content`; official token-counting guide `https://ai.google.dev/gemini-api/docs/tokens`; actual-model specification `https://ai.google.dev/gemini-api/docs/models` — input/output/thought/visual counting, maxOutputTokens enforcement, CountTokens accuracy/overhead, candidate/tool defaults and response usage.
- Actual provider's official billing/error/retry contract — especially whether 503, timeout, rejected/partial and unobserved attempts can be charged. If undocumented, reserve the entire proven allowance for every attempted request; do not assume failures are free.
- For OpenRouter/custom/proxy routes: that exact service's authoritative routing/model mapping and enforcement contract. OpenAI wire compatibility alone does not import OpenAI billing guarantees.

The next useful approval is a read-only retrieval of these **public official documents**, with no login/key/provider inference. Separately obtain one operator-controlled nonsecret configuration attestation: actual provider/API family and model IDs (text/vision/embedding), whether QA routing is active (no user list), override/proxy presence, cap enablement and monetary commitments. Do not share keys, headers, URLs containing credentials, account IDs or allowlists. Source defaults are insufficient.

## Narrow corrections completed

Gemini's internal **estimated** cumulative guard previously ran only on retries and counted unobserved prior attempts at an input floor. It now checks before every attempt, validates positive finite integer allowance, and reserves each prior attempt's full estimated input+output allowance. Retry count is restricted to the currently reviewed finite range 1–3. These corrections prevent internal allowance bypass; they still do not make the input estimate authoritative. No Tutor re-enablement, model change, cap removal or broad provider/network change occurred.

Sixteen new provider tests cover first-attempt rejection, invalid limits, full prior-attempt retention, finite attempts, output wire fields/no tools, and missing-proof containment for oversized/unicode payloads. Provider wire tests verify actual adapter requests using mocks, never provider enforcement.

## SQL review and compatibility correction

The prepared ledger still handles expired liabilities, original-day refunds, common transaction locking, duplicate/conflicting settlement and no release of possibly paid work. An additional compatibility problem was identified: original 022 may have charged/refunded legacy cross-day terminal rows to the wrong day. A replacement function cannot infer which historic counter was charged. The rehearsal candidate now rejects such ambiguous legacy states **before DDL**; a new static regression checks that gate. It neither repairs history nor proves that a nonempty ledger is compatible. Baseline reconciliation, actual SQL syntax/concurrency and preservation/rollback remain unverified.

The corrected artifact remains limited to the marked disposable database; original Migration 022 and approved ownership policies are unchanged. The rehearsal procedure now explains transaction rollback of original defect reproductions and the expected rejection of persisted ambiguous legacy fixtures. Do not start a database, bypass the stop, reset an existing environment or apply a migration here. Deployment must also prevent mixed old/new accounting execution and verify bounded lock/RPC failure behavior.

## Browser, Deno and physical iOS

Previously confirmed missing headless-shell/WebKit remain unresolved. A new **local version-only** check of installed full Chromium, with a clean environment and its own temporary profile, terminated by SIGABRT before returning a version. This narrows the issue beyond Playwright's runner; its underlying cause is still UNKNOWN. No raw crash log, personal browser profile or network payload was read. No browser page assertions passed. Public app-version/minimum-OS metadata could not be established; host OS is 15.7.4. Do not guess an OS mismatch or change quarantine/signature/sandbox settings.

Deno was not found on PATH or the checked standard/local installation locations. Strict offline source compatibility validation is available; native validation of remote-pinned Supabase 2.49.0 is not proved by installed SDK 2.105.1 declarations. Minimum prerequisites are an approved matching Deno binary and cached/pinned dependency graph, and compatible installed Chromium/WebKit artifacts. Inspect native CLI help offline before choosing cache-only flags; never allow an implicit fetch or install. No dependency/root lockfile change was made.

The existing browser module tests and full application/iOS matrix are prepared. Actual supported Safari/installed-PWA background, touch/stylus, keyboard, file/export, persistence/sync and pending-write upgrade behavior require attended physical-device evidence. Browser emulation cannot establish those results. Any later staging authentication/fixtures or paid Tutor case requires separate authorization.

## Token-only release scope

Conditional B remains the smaller proposal: defer monetary caps while retaining genuinely bounded token/request controls. It is **not currently safe/functional to release**: no authoritative input bound, ingestion reservation coverage gap, unexecuted SQL rehearsal and unavailable hosted Tutor remain blockers. Whether active users rely on a positive dollar cap or contractual ceiling is UNKNOWN; the local release docs identify variable names but contain no current attested settings or contracts. Do not read private configuration or silently clear an active cap.

For the fastest safe release, first prove the actual baseline provider/model and consider an explicitly approved narrow policy (one documented provider/model, controlled modalities/tools/attempts), rather than trying to certify arbitrary compatible endpoints. This is a proposal only; do not silently remove existing functionality. B needs no dollar-specific schema/client expansion if no monetary promise is required, but token/ingestion accounting, active configuration compatibility and documentation must still pass. If a dollar ceiling is a commitment, authoritative money accounting is required before that release.

## Successful response does not establish complete usage

Independent inspection also found that the gateway passed `response.ok` as usage-completeness proof, while Ask Course can synthesize generation totals and multi-attempt providers may report only some attempts. The gateway now omits that assertion: default conservative finalization retains at least the entire reserved amount (or higher observed usage) after dispatch. A new regression covers success-shaped partial usage. This is project token-cap accounting, not a claim of exact invoiced consumption; it can consume quota sooner. A verified per-attempt usage-provenance contract is required before reducing that conservative charge. No monetary charge or user entitlement was changed.

## Final batch record and exact next approvals

Current proposed candidate: **`local-34b07e1319c641c1`**, parent `local-2e50443a572696c2`, HEAD unchanged. The scoped inventory retains the prior reviewed allowlist and adds only this batch's test; unrelated newly present files/probes/workstreams are not silently adopted. Seven source/preparation files changed: `providerGemini.ts`, `providerGemini.test.ts`, new `providerBudget.review.test.ts`, `projectAccounting.test.ts`, `ai-gateway/index.ts`, `tokenLedgerCorrection.review.test.ts`, and `scripts/security/release-audit/migration022-corrected-rehearsal.sql`.

Evidence changed/created: this report; `G285-PROVIDER-READINESS-VALIDATION.json`; `G285-PROVIDER-READINESS-INVENTORY.json`; appended compatibility guidance in `G285-INDEPENDENT-REHEARSAL-PROCEDURE.md`. Exact paths/hashes are recorded in the inventory. No Mission Control V2 file was changed.

Final tests: **4,234/4,234** application/gateway tests across **321** files, zero failures; three live files excluded. **110/110** focused provider/accounting/SQL-contract checks pass (a subset, not additional full-suite tests). The 16 new provider checks, one partial-usage regression and one new SQL compatibility contract are included in those totals. Strict offline Edge and frontend TypeScript checks pass. No native Deno, provider-enforcement, browser-page, real-SQL concurrency or live acceptance PASS is claimed. Browser version-only execution failed SIGABRT; WebKit/native Deno prerequisites remain missing.

Root lockfile, original Migration 022, all 30 G2.85 modules and the single-attempt staging deployment script hashes remain unchanged. Prior 205 G2.85 local tests, operator-reported 72-case live PASS and 29 deployment tests remain historical supported evidence; they were not needlessly rerun. No external service, database, secret/config value, private manifest, paid inference, deployment, installation, commit or push was accessed/executed.

**Next parallel execution batch:**

1. After approval, retrieve the listed public official provider documents without login/inference, and obtain the single nonsecret operator configuration/commitment attestation for the expressly authorized target. Produce a closed endpoint/model/modality/attempt policy and complete counting proof; do not remove the gate until this succeeds.
2. Independently review the legacy-state stop, then run the prepared disposable PostgreSQL concurrency/preservation/rollback schedules only after separate approval identifying a local socket and cached immutable image. No pulls, existing-container reuse or real-user data. Do not treat the correction as production-ready from static tests.
3. In parallel, resolve installed full-Chromium's SIGABRT in a credential-free local context, and prepare exact official WebKit/Deno artifact requirements. Installation/acquisition needs approval. A single ordinary-operator-Terminal run of the existing offline browser harness can distinguish an agent execution-context issue; it uses no login or staging endpoint. Do not weaken OS trust/sandbox/TLS or inspect private crash/profile logs.

Later staging catalog access, ordinary Auth, synthetic fixture writes/cleanup, paid test requests, migrations and deployments require their own explicit approval and candidate identity checks. Production rollout remains separately unauthorized. Do not silently clear active monetary caps or accept B as compatible until the owner confirms the relevant commitments/configuration. The most efficient next approval is **public-document read access plus the sanitized configuration attestation**, not another live acceptance retry.
