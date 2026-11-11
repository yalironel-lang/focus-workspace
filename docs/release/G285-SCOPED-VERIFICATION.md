# Scoped verification — 2026-11-09

Candidate `local-34b07e1319c641c1`; production **NO-GO**. This supplements, rather than replaces, the earlier provider readiness record. No application behavior, candidate SQL, root dependency, or G2.85 acceptance source was changed in this batch.

## Official provider evidence

- OpenAI Chat Completions `max_completion_tokens` caps generated completion tokens, including reasoning. `n` defaults to one; multiple choices add generated usage. This establishes an output parameter contract, not a logical-request/input bound or free failed attempts. [API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
- Official o4-mini and gpt-5.6-luna model pages exist. A public model listing does not establish the configured or deployed model, entitlement, or an override endpoint's behavior. [o4-mini](https://developers.openai.com/api/docs/models/o4-mini), [gpt-5.6-luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
- OpenAI exact input counting is documented for Responses-format requests. Local tokenizer estimates have modality/framing limitations. The existing Chat Completions adapter cannot simply assume identical serialization. [Counting guide](https://developers.openai.com/api/docs/guides/token-counting).
- Embeddings accept at most 8,192 tokens per input and 300,000 tokens summed across a request, with prompt/total usage fields. These accepted-request limits do not prove rejected-attempt billing or cover arbitrary compatible proxies. Local document character/chunk caps are not token counting. [Embedding reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create).
- Gemini GenerateContent documents `maxOutputTokens` per candidate; usage includes prompt, thoughts, tool-use prompt and candidates. The official 3.6 Flash model page documents input/output limits, but actual routing remains unknown. [GenerateContent](https://aistudio.google.com/api-reference/generate-content), [model](https://aistudio.google.com/docs/models/gemini-3.6-flash).
- The current Gemini thinking guide explicitly describes a hard combined thinking/output cutoff for **Interactions** `max_output_tokens`. That is not proof for the runner's distinct GenerateContent `generationConfig.maxOutputTokens` contract. Do not transfer API/model guarantees implicitly. [Thinking guide](https://aistudio.google.com/docs/thinking), [token guide](https://aistudio.google.com/docs/tokens).

Server adapters use raw fetch. Gemini can make three application attempts after 503; provider failure or missing usage does not establish zero billable consumption. No authoritative guarantee covering all failed attempts was established. Hosted configuration and proxies were not inspected. Thus a complete enforceable input/output/attempt bound remains unproven and Tutor stays contained. Embedding ingestion remains outside the reviewed Tutor reservation hooks; it requires separate authoritative coverage before enablement. Usage fields are evidence when complete, not proof that an interrupted response had no cost.

## Executed isolated PostgreSQL rehearsal

See `G285-PG-REHEARSAL-RESULT.json` and `../../scripts/security/release-audit/run-pg-rehearsal.py`. Cached immutable official postgres image, PostgreSQL 17.11, unique new container, network NONE, no published ports/bind mounts, tmpfs-only data, read-only root filesystem. Identity and isolation checked before SQL; all SQL used the container's Unix socket and generated synthetic fixtures. No real backup/user data was imported. Cleanup of the newly owned resource passed; no existing resources were changed.

27 recorded checks PASS: **25 validation checks plus two successful reproductions of unsafe original behavior**, not 27 security acceptance assertions. Corrected expiry liability, wrong-day refunds, lock timeout, delayed/conflicting/duplicate settlement and unsafe release passed. Twenty concurrent admissions admitted exactly two of capacity two; eight duplicate settlements did not double charge. Above-reservation spend was recorded but returned failure. Original/corrected function restoration preserved synthetic ledger and canaries. Wrong marker and incompatible legacy state stopped before DDL. Ordinary-role ACL denials and service-role execution passed.

Original Migration 022 unchanged. Actual production schema, legacy ledger history, real Storage service and full backup/restore were NOT validated. Synthetic preservation is not production compatibility. The historical isolated rehearsal plan's “not yet executed” status is superseded only for this fixture.

## Browser/runtime

Node 26.7.0; installed full Chromium exits before page assertions, including the approved clean-environment run outside the restricted sandbox. Root cause remains UNKNOWN. Default headless shell and WebKit are absent; Deno absent. Vite dependency-scan shutdown errors occurred after launch failure and are not established as its cause. No OS security control was relaxed. No browser scenario PASS is claimed. Native Deno validation cannot be replaced by the offline TypeScript shim.

Current checks: Python harness compiled in memory; six browser error-classifier tests PASS; browser entry point syntax PASS; strict offline Edge TypeScript PASS. Previous unchanged-candidate 4,234 application/gateway tests and 110 focused subset remain historical results, not rerun totals. Candidate inventory hashes were rechecked with zero mismatches. No need to repeat unchanged live G2.85 acceptance or deployment checks.

## Minimum next gates

1. Obtain one sanitized operator attestation from the authorized environment owner: exact provider/API/model identifiers for text, vision and embeddings; official origin versus custom/proxy (boolean, no secret URL); QA override enabled/disabled; modalities/tools/candidate and attempt limits; configured token/request/dollar cap presence; whether existing users/contracts require money caps. Never provide keys, values of secret variables, user records, payloads or connection strings. No remote access is authorized by this template.
2. Based on that closed configuration, implement a reviewed authoritative bound and cover ingestion admission before paid dispatch, including failed/multiple attempts and conservative settlement. Do not re-enable Tutor/ingestion from documentation alone.
3. Approve acquisition of matching official browser/WebKit and native Deno artifacts only after selecting pinned versions and dependency plan. No installation occurred here. Physical iOS acceptance and browser persistence/sync/PDF/Study Mode/Tutor remain pending.
4. A token-only release is conditional, not approved: it must preserve any active dollar cap or contractual commitment. If such a commitment exists, authoritative monetary accounting is required. Production compatibility evidence, separately authorized staging migration/regression and eventual production approval remain distinct gates.

No staging/production connection, paid inference, credential/private-manifest access, installation, remote mutation, deployment, commit or push occurred. Only the expressly approved disposable local PostgreSQL instance was started and stopped.
