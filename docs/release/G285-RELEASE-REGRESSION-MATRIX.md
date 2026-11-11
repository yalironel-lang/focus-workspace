# Candidate release regression matrix — preparation only

Every case below is required unless explicitly marked conditional. No case has been run live by this audit. Use only authorized disposable staging accounts and uniquely marked synthetic data. Preserve the G2.85 72-case milestone; this matrix covers application workflows it does not establish.

## Common gates and evidence

Before execution, bind frontend assets, gateway source, schema state and browser/device versions to the candidate manifest. Independently confirm staging project `lmgrhmyurhjlwwdedojk`; verify the app never sends requests to a production host. Confirm Auth redirect handling and disposable accounts privately. Require known-compatible schema, tested backup/rollback and a fixture-scope cleanup plan. Unknown identity, foreign content, unexpected mutation, lost/unknown saved state, TLS/credential failures or incomplete cleanup stops the affected batch and release progression.

Platforms: **C** desktop Chromium (installed Playwright revision recorded); **W** desktop WebKit (revision recorded); **I** actual supported iPhone/iPad Safari plus installed PWA (exact OS/device/version recorded). Browser emulation is not actual iOS evidence. Support minimum OS/browser versions must be explicitly selected; absence of a published support floor remains UNKNOWN.

Automation: **L** existing local synthetic tests can cover the logic; **P** prepare/run Playwright only after scoped staging authorization; **O** attended operator/device action. P/O are not executed or authorized by this document. For each case report only case ID, platform/build labels, fixed assertion booleans, status, duration and cleanup status. No emails, UUIDs, URLs carrying tokens, HARs, session dumps, prompts or user content. Synthetic screenshots must omit private Auth UI/network data.

| ID | Platforms / method | Exact actions and PASS criterion |
|---|---|---|
| AUTH-1 | C/W/I; L/P/O | Existing supported login → callback → dashboard. One correct authenticated identity; no callback/reload loop or duplicate exchange. Operator handles magic links privately. |
| AUTH-2 | C/W/I; L/P/O | Refresh, foreground/background and expired-session recovery. Correct account restored or explicit sign-in required; no stale privileged action. |
| AUTH-3 | C/W/I; L/P/O | A signs out, B signs in on same device. A's notebook/PDF/Tutor history never appears under B; pending A writes never enqueue as B. |
| AUTH-4 | C/W; L/P | Unauthenticated/invalid-session gateway request and foreign scope using mocks first; after approval bounded staging denial. No provider dispatch and no private response data. |
| PERSIST-1 | C/W/I; L/P/O | Create synthetic notebook; type formatted text, refresh and reopen. Exact document structure/content retained once. |
| PERSIST-2 | C/W/I; L/P/O | Add/switch/reorder/delete pages, undo/redo and reopen. Correct page ownership/order; no unintended page/document deletion. |
| PERSIST-3 | C/W/I; L/P/O | Add handwriting, image and PDF attachment, change geometry, close/reopen. Exact content/asset references and geometry retained. |
| PERSIST-4 | C/W/I; L/P/O | Open synthetic representative legacy notebook and modify a separate fixture copy. Migration is stable/idempotent; no missing content, pages or references. Never open an existing real user's notebook for this test. |
| PERSIST-5 | C/W/I; L/P/O | Simulated quota/storage failure, interrupted save and route change. Explicit failure/pending state; no false saved indicator or silent loss. |
| SYNC-1 | C/W + I; L/P/O | Two sessions of same authorized owner edit/read synthetic fixture. Committed content converges after refresh/reconnect with documented conflict ordering. |
| SYNC-2 | C/W/I; L/P/O | Offline edits → close/resume → reconnect. Pending queue survives and drains once; no dropped/duplicated edits or duplicate creates. |
| SYNC-3 | C/W/I; L/P/O | Concurrent edits/deletion, delayed/out-of-order responses. No resurrection after confirmed deletion; newer content not overwritten by stale response. |
| SYNC-4 | C/W/I; L/P/O | Account switch with pending queue. Flush/recovery remains bound to original owner or fails explicitly; no cross-account transmission. |
| PDF-1 | C/W/I; L/P/O | Synthetic PDF upload/open/page navigation/zoom/rotate and refresh. Correct file/pages; no blank or clipped persistent render. |
| PDF-2 | C/W/I; L/P/O | Text selection and region capture across zoom/orientation. Correct selected page/region; no accidental duplicate selection/submission. |
| PDF-3 | C/W/I; L/P/O | Owner reopens private file; signed URL expires and is renewed through owner flow. No public bucket fallback, leaked URL or URL in reports. G2.85 isolation result is reused. |
| PDF-4 | C/W/I; L/P/O | Invalid/oversized file, download/export and deletion of registered synthetic fixture. Clear errors, expected bytes/type, no unrelated reference/object deletion. |
| STUDY-1 | C/W/I; L/P/O | Enter/exit Study Mode and change views/sections. Expected navigation/focus, preserved local draft and correct current context. |
| STUDY-2 | C/W/I; L/P/O | Start/pause/resume/reopen session and restore continuity. Correct owner/course/item; no stale session or duplicate timer/action. |
| STUDY-3 | C/W/I; L/P/O | Keyboard, touch/stylus, scrolling, overlays and narrow landscape/portrait. Critical controls remain reachable; no frozen surface or lost focus/input. |
| TUTOR-1 | C/W/I; L/P/O | Open/capture/select mode/restore history with AI disabled/mock provider. Zero automatic provider requests; draft/history correct and owner scoped. |
| TUTOR-2 | C/W/I; L/P/O | Submit once with owned PDF context and a known synthetic question. One dispatch; correct page/source/tier/provenance; no fabricated source. Paid inference conditional on separate capped approval. |
| TUTOR-3 | C/W/I; L/P/O | Follow-up in same thread, refresh and new thread. Context follows correct owner/document; restored history is not a fresh verified receipt. |
| TUTOR-4 | C/W/I; L/P/O | Cancel, timeout, provider failure and quota denial. No blind retries/duplicate spending; input recoverable and UI exits loading state. |
| AI-1 | C/W; L/P | Injection instructions in synthetic course material/image/history. No authority change, foreign retrieval, secret disclosure or fabricated access. Semantic answer review is attended; prompt boilerplate alone is not PASS. |
| AI-2 | Local isolated rehearsal + bounded staging; L/P/O | Invalid entitlement, safety rate cap, request/token cap and any advertised dollar cap; parallel admission. Expected denials, bounded dispatches and no quota over-admission. Requires spending-control fixes first. |
| AI-3 | Local isolated rehearsal + bounded staging; L/P/O | Provider error/interruption, dispatch/settle/release rejection and late settlement. Conservative, observable accounting; no false lifecycle success or double dispatch. |
| UPGRADE-1 | C/W/I installed PWA; L/P/O | Candidate activation while a synthetic edit/handwriting save is pending. Saved draft survives SW update/reload; no old-chunk failure or reload loop. Requires separately approved staging deployment window. |
| UPGRADE-2 | C/W/I; L/P/O | Cached old app reopen, offline/online transition and rollback-compatible app build. No stale API/auth cache, missing lazy chunks or incompatible persisted format. |
| NAV-1 | C/W/I; P/O | Dashboard → course/section → notebook/PDF → Mission Control → Study/Tutor → back/deep-link/refresh. No dead critical routes or content loss. |
| RELEASE-1 | C/W/I; P/O | Verify candidate asset/build identity, staging host separation and sanitized errors/metrics. No production traffic or private data in diagnostic output. |
| CLEAN-1 | All exercised sessions; P/O | Verify each recorded synthetic fixture, delete only after scoped authorization, independently verify absence and sign out. Unknown/failed cleanup is not PASS; recovery manifests remain private. |

## Efficient scheduling and approval points

- **Parallel now, local-only:** spending/type regression fixes; migration static/rollback preparation; Playwright scenario preparation; source-manifest reconciliation. They must not edit the same production modules concurrently without coordination. No dependency installation or database service startup is implicit.
- **First remote batch, separately approved:** candidate identity/non-secret schema readiness; deploy/migrate only if separately needed and approved. Stop before authenticated fixture work on mismatch.
- **Functional batch after approval:** C and W can run on disjoint synthetic scopes; I can run concurrently on another scope. AUTH-3/SYNC-1–4 intentionally share only their own designated pair/scope and must run serially within that group. All mutation cases depend on successful identity/owner-positive controls. No real-user data.
- **AI batch after control fixes:** run mocked failure cases first; then a separately capped attended inference set, no retries, with pre/post accounting and switch-state verification. AI-2/3 concurrency/expiration stress belongs first in a disposable local database, not unbounded staging calls. No exact paid request count is approved by this preparation.
- **Upgrade batch last:** requires an explicitly approved deployment/rollback window and disposable pending-edit fixtures. Do not change the build under other regression groups mid-run.
- **Final gate:** all applicable cases PASS on the identified candidate and supported platforms, migration/backup/restore/rollback evidence accepted, cleanup verified, and explicit production approval. BLOCKED/UNKNOWN does not satisfy a gate. Optional future features, visual polish, bundle optimization and lint restoration are not substitutes for these results.
