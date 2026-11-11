# Phase 7M — Tutor evidence and quality pilot

Local implementation only. No deployment, inference, quota change, secret change,
or database migration is authorized by this document. Keep AI disabled.

## Existing path and evidence

- `FreeSpacePdfCard` / `useTutorPdfCapture` emit an owned PDF capture intent;
  `SectionPage` opens `ContextualTutorCard`. Capture action alone does not send AI.
- `useStandaloneTutor` submits one serialized authenticated `ask_course` request
  with the attachment and recent turns. The client does not automatically retry.
- Gateway checks authentication, spending controls, section/PDF ownership and
  retrieval scope. `runAskCoursePipeline` fits chunks and builds provider messages.
- Provider request IDs are already stored in `ai_usage_events`. Reservations
  include embedding plus generation tokens; do not double-count reasoning tokens.
- `knowledgeTier` is server-owned. The renderer hides numbered course citations
  for general-academic and PDF-capture tiers; the attachment page control remains.
- `selectionChars` in the existing usage log measures question length. It is NOT
  evidence of the captured PDF text. New receipt capture length is separate.

## Minimal receipt

Text-only pilot, explicitly enabled per page with `?tutorEvidence=1`. Both the
frontend origin and Supabase URL must exactly match the dedicated staging hosts.
No new secrets or feature-flag configuration are required. All existing auth,
ownership, spending, and provenance decisions remain in place.

Each request gets a fresh random comparison key in `x-zikuk-pilot-key`, and the
gateway supplies a random `requestId`. This is a diagnostic comparison key, not
an access token. Never export it or request headers in screenshots, logs or HARs.

`meta.pilotEvidence` is returned only for a successful, opted-in staging request:

- HMAC comparisons of the gateway capture, question, final provider-input
  snapshot, final answer, and returned source-reference list.
- Capture character count, page and text kind; recent-turn count.
- Final chunk citation indices, pages, character counts and per-request keyed
  fingerprints. `included` checks the exact chunk text occurs in the assembled
  provider messages, after final retrieval/window fitting.
- Returned tier, numbered citation indices and provider request ID.

The regular response already contains its authorized source references. Join
their indices to receipt chunks to identify PDFs/pages. Exact text comparison
requires the controlled fixture and that request's key, computed only in memory.
Fingerprints are not raw text, a stored prompt, or third-party attestation. They
cannot reconstruct an unavailable historical prompt or prove semantic reasoning.

One metadata-only gateway log line (`tutor_pilot`) joins requestId to
providerRequestId, which joins the existing usage event. Execution ID is supplied
by the platform's normal function-log metadata. No capture, prompt, answer,
comparison key, filename or fingerprints are added to diagnostic logs.

The client verifies its serialized capture/question and received answer/sources
against the receipt. The resulting assistant-turn DOM has `data-pilot-request-id`
and `data-pilot-verified`. `true` also requires a provider request ID and all final
chunks marked included. Missing/mismatched receipts fail the pilot, not the paid
response, and never trigger a retry. Inspect the receipt's tier/citations yourself;
the boolean does not certify academic correctness.

Render markers are memory-only, expire after ten minutes, and are excluded from
conversation persistence. Restored history has no fresh pilot marker. No global
diagnostic collector, local control socket, new persistent store or raw content
logger was added. Responses use `Cache-Control: no-store`. Browser DevTools
retention is operator-controlled: inspect in memory and clear Network afterward.

## Before any live pilot

1. Review and separately authorize staging frontend AND gateway deployment.
   No deployment or source equivalence has been established by offline tests.
2. Independently confirm the staging project, disabled switch, unchanged quotas,
   zero active reservations and a fresh usage baseline. Obtain fresh explicit
   approval for the specific supervised request count and switch window.
3. Use an authorized staging account and approved PDF. Append `tutorEvidence=1`
   to the existing staging section URL. Keep AI disabled while preparing.
4. Open Network without recording/exporting credentials. There must be no
   automatic AI request from opening, capture, mode selection or history restore.
5. An attended operator controls staging enable/disable in Dashboard. The former
   CLI watchdog is NOT a trusted restoration mechanism. No unattended window.

## Prioritized matrix — maximum five requests, one per case, no retries

Run case 1 first. Stop immediately on an evidence mismatch, false attribution,
wrong source/page, duplicate request, unsettled reservation or failed restoration.
Cases 2–5 require their own coordinated submissions; this plan is not approval.

### 1. Partial GDP selection — highest value; maximum one request

- Action: Macro, Problem Set 4 Solutions.pdf page 2; select only
  `The cyclical part of real GDP is ...`; Explain; submit once:
  `Can you explain this concept step by step?`
- Behavior: correct real GDP minus trend GDP explanation. Identify (b) only if
  the actual final context contains the option mapping. The unkeyed options
  alone do not prove the PDF explicitly declares a correct answer.
- Provenance: receipt matches the actual attachment/page, identifies final
  chunks, and agrees with displayed tier/citations. Selecting/deriving (b) from
  an unkeyed passage should be mixed; no claim of an explicit PDF answer key.
- Navigation: any enabled PDF citation must open its exact document and page.
  Attachment page control returns to page 2 without an inference request.
- Failure: option guessed without mapped evidence, strong verified-source badge
  for unsupported derivation, false key claim, missing receipt or wrong page.

### 2. Complete PDF evidence — maximum one request

- Action: new conversation; same page; attach the question and all options;
  submit once: `Quote option (b) exactly as printed. Do not solve the question.`
- Behavior: quote `real GDP less trend real GDP` without inventing an answer key.
- Provenance: PDF-selection attribution when supported by the attached text;
  course attribution only if actually grounded in retrieved material. No invented
  numbered citations. Receipt confirms the complete attachment.
- Navigation: attachment page control goes to page 2; enabled retrieved-source
  citations go to the matching open PDF/page, with no new inference.
- Failure: altered option, unsupported correctness claim, inaccurate tier or jump.

### 3. Self-contained mathematics — maximum one request

- Action: new conversation, detach the selection; submit once:
  `Real GDP is 110 and trend real GDP is 100, in the same units. Compute cyclical GDP and show the subtraction.`
- Behavior: `110 - 100 = 10`, retaining the supplied units.
- Provenance: user-supplied arithmetic/general academic knowledge; never claim
  the PDF supplied these numbers or verifies the calculation. Inspect any mixed
  tier against actual evidence rather than accepting it automatically.
- Navigation: no fabricated course-source buttons; any real displayed source
  must map correctly. No citation click may send another inference request.
- Failure: wrong arithmetic, fabricated PDF numbers, false source attribution.

### 4. General academic question unrelated to PDF — maximum one request

- Action: new conversation, selection detached; submit once:
  `In one sentence, define a covalent bond.`
- Behavior: correct general academic explanation, independent of the GDP PDF.
- Provenance: general_academic; no PDF/course citations for unsupported claims.
- Navigation: no misleading source-navigation controls on this answer.
- Failure: course-material badge, invented PDF citation, or unrelated GDP answer.

### 5. Unestablished course detail — maximum one request

- Action: new conversation, selection detached; submit once:
  `Using only the uploaded material, what exact grading weight did my professor assign to Problem Set 4? If it is absent, say it cannot be established.`
- Behavior: acknowledge uncertainty if the actual retrieved material lacks the
  grading weight. If an explicit authoritative passage exists, inspect it instead
  of forcing the expected uncertainty answer.
- Provenance: no unsupported percentage or claim that absent material verifies it.
  A self-limitation must not receive a misleading strong grounding badge.
- Navigation: only genuinely supporting sources are navigable; no fabricated key.
- Failure: invented course policy, source fabrication or unsupported certainty.

## Per-request evidence and settlement acceptance

- Obtain the requestId from the live assistant-turn DOM and require
  `data-pilot-verified=true`. A restored or unrelated answer is not sufficient.
- Inspect response meta receipt and normal result tier/source references. Link
  receipt requestId through the gateway log to the provider ID in the usage event.
- Record only non-content metadata: case, IDs, tier, pages/indices, match booleans,
  success/failure, timestamp and token counters. Never save raw prompts, headers,
  student selections or full answers in diagnostic logs.
- Restore staging disable immediately on completion, timeout or failure and
  independently verify `true`. Confirm exactly one successful event/reservation
  for that case, correct embedding-plus-generation settlement, zero active
  reservations and unchanged quotas. No automatic or manual retry under this plan.

## Known limitations

Offline tests exercise deterministic mocked model outputs and real grounding,
prompt construction, authorization, transport and render paths. They do not prove
live model compliance or correctness across arbitrary academic questions.

Cross-document and notebook navigation is not implemented in the contextual PDF
Tutor. Such citation buttons are now disabled instead of jumping to a page in the
wrong open PDF. Same-document citation navigation and attachment jumps remain.
Visual-capture proof is deliberately unsupported by this text pilot.

The historical GDP call's missing raw request/response cannot be recovered by
this implementation. Host/network failure can still prevent remote restoration;
no automated-restoration guarantee or deployment readiness claim is made.
