# Browser and iOS preparation — local remediation batch

No staging authentication, fixtures, session extraction, inference or remote browser test was performed.

## Implemented offline browser suite

`scripts/security/release-audit/browser/` contains a Vite harness importing the actual application modules, shared scenarios, a Playwright specification/configuration, and a programmatic runner. It does not duplicate application persistence logic. It has no credential/session input, uses fresh disposable browser contexts, blocks non-loopback page requests, disables service workers and recording, disables environment-file/config loading and binds only `127.0.0.1:4179`. It never loads the live application or its Auth workflow.

Five scenarios per engine are prepared: notebook legacy content round trip across reload; actual IndexedDB queue durability/account namespace separation; PDF geometry bounds at mobile DPR; Study Mode recovery owner scoping; Tutor draft owner scoping across reload. These are browser-runtime module tests, **not complete authenticated application workflow acceptance**. Geometry is not PDF rendering, and a local queue is not proof of deployed sync.

Commands, from repository root, without installation:

```bash
node scripts/security/release-audit/browser/run-offline.mjs
# Alternative CLI runner when compatible:
node node_modules/playwright/cli.js test --config scripts/security/release-audit/browser/playwright.config.mjs
```

Observed execution: the installed Playwright 1.52.0 CLI stalled before test execution under Node 26.7.0 and was stopped. A programmatic attempt initially hit the execution sandbox's loopback-listen restriction. With loopback binding available, Chromium launch returned fixed `BROWSER_UNAVAILABLE`; WebKit is not installed. **Zero browser assertions are claimed PASS.** No packages/browser binaries were installed, no fallback engine is silently substituted. Runner exits nonzero when an engine or harness is unavailable. Local browser/tool compatibility must be resolved separately; test preparation is complete but browser execution readiness is BLOCKED.

## Full application regression preparation

`G285-RELEASE-REGRESSION-MATRIX.md` remains the required release matrix: AUTH, PERSIST, SYNC, PDF, STUDY, TUTOR, AI, UPGRADE, NAV and CLEAN groups. Existing Vitest tests automate much of the component/domain layer. Authenticated UI automation still needs a reviewed disposable fixture bootstrap, stable selectors and a private operator Auth handoff without persisted session exports. Do not claim those flows automated by the five offline scenarios.

Bind the exact frontend/gateway/schema before a later staging batch. Desktop Chromium/WebKit may use disjoint fixtures in parallel; cross-device sync must share only its designated synthetic scope; account-switch cases are serial. Upgrade tests are a separate coordinated deployment window. Paid Tutor requests require their own finite cap and attended control restoration. No G2.85 rerun is required simply because these UI cases are missing.

## iOS checklist — attended physical device required

Record supported minimum and current iOS/iPadOS versions and actual device model privately/non-sensitive. No support floor is inferred from emulation.

- Safari browser and installed PWA: login/callback, foreground/background, logout/account switch; no stale owner content.
- Synthetic notebook typing/IME, selection, toolbar/keyboard, page operations and handwriting; orientation changes do not lose focus/content.
- Synthetic PDF open, page/zoom/scroll, text/region capture, export/download and reopen; memory pressure and background/resume.
- Offline edit/queue/reconnect, same-owner second-device convergence, explicit conflicts and pending-write indicators.
- Study Mode enter/exit, paired notebook/PDF recovery and Tutor draft/history restoration; one intentional submission only after separate inference approval.
- Service-worker candidate upgrade with pending text/ink and rollback-compatible app; no reload loop, old-chunk error or missing draft.
- Registered synthetic fixture cleanup and session cleanup verified; UNKNOWN is not PASS.

WebKit automation helps layout/logic coverage but cannot certify iOS background suspension, installed-PWA lifecycle, touch/stylus, file picker/export or actual device memory behavior. No private credentials, URLs, traces, account identifiers or real content should appear in evidence.
