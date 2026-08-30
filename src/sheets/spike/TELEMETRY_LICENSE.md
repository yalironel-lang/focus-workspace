# `@univerjs/telemetry` license verification (PR 2 GATE 4)

## Question

PR 1 reported `@univerjs/telemetry` as UNKNOWN because the **published npm `package.json` has no `license` field**. That is a packaging omission, not proof of a missing or proprietary license.

## Authoritative evidence (installed 0.25.1)

1. **Installed package LICENSE file**  
   `node_modules/@univerjs/telemetry/LICENSE` is the Apache License, Version 2.0 (January 2004).

2. **Installed package source header**  
   `node_modules/@univerjs/telemetry/lib/es/index.js` includes:

   `Licensed under the Apache License, Version 2.0` — Copyright DreamNum.

3. **Official GitHub tag `v0.25.1`**  
   - `packages/telemetry/src/index.ts` Apache-2.0 header:  
     https://github.com/dream-num/univer/blob/v0.25.1/packages/telemetry/src/index.ts  
   - Repo root `LICENSE` is Apache-2.0:  
     https://github.com/dream-num/univer/blob/v0.25.1/LICENSE  
   - Note: `packages/telemetry/package.json` at tag `v0.25.1` also omits the `license` field (same packaging gap as npm). That does not override the LICENSE file / source headers.

4. **Current GitHub `dev` branch** (post-0.25.1 packaging fix)  
   https://github.com/dream-num/univer/blob/dev/packages/telemetry/package.json  
   now includes `"license": "Apache-2.0"`.

5. **Official package README**  
   `node_modules/@univerjs/telemetry/README.md` describes an **interface** (`ITelemetryService`). It is **not** an `@univerjs-pro/*` package.

6. **Why it is present**  
   Transitive OSS dependency: `@univerjs/preset-sheets-core` → `@univerjs/sheets-ui` → `@univerjs/telemetry`.  
   Focus does not add Pro packages and does not import telemetry APIs directly.

## Conclusions

| Question | Answer |
|----------|--------|
| Covered by Apache-2.0? | **Yes**, per installed LICENSE, source headers at `v0.25.1`, and repo root LICENSE. |
| Commercial / Pro license required? | **No** for this OSS interface package at 0.25.1. |
| Exclude from production OSS setup? | **Not necessary and not practical.** Transitive OSS dep of `sheets-ui`. Do not replace with Pro packages. |

**Not a production blocker.** The npm / `v0.25.1` `package.json` metadata gap is incomplete publishing metadata, overridden by LICENSE + source headers.
