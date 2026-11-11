# M4 — Dedicated Staging Vercel Project Setup

**Status:** Preparation only. No remote project/env/alias/deploy changes are authorized by this document alone.  
**RC:** `/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023`  
**Local meta:** `deploy/staging/vercel-project.meta.json`  
**Local link pointer:** `.vercel-staging/project.json` → existing `zikuk-staging`

---

## Findings (inspection)

| Item | Value |
|---|---|
| Vercel user / team | `yalironel-4532` / `yalironel-4532s-projects` |
| Production project | `focus-workspace` (`prj_uBdZ12jILWA40tZUVWH92nFCKbkh`) |
| Existing dedicated staging | **`zikuk-staging`** (`prj_x3693ooh2g0Ppu306hR04OZyy6q1`) |
| Name `focus-workspace-staging` as new project | **Available** (not in team project list) |
| `https://zikuk-staging.vercel.app` | Staging Supabase + staging email UI (**good**) |
| `https://focus-workspace-staging.vercel.app` | Same deployment as `zikuk.com` (`focus-workspace-468k0q3dp…`) — **prod-connected** |
| `focus-workspace` env | `VITE_SUPABASE_*` on **production + preview** (Preview inherits prod) |
| `zikuk-staging` env | `VITE_SUPABASE_*` + `VITE_STAGING_EMAIL_AUTH` on production/preview/development |

**Recommendation:** Reuse **`zikuk-staging`**. Do not create a second staging project unless a rename is required. Transfer the `focus-workspace-staging.vercel.app` alias only after an M4 RC deploy is verified on `zikuk-staging.vercel.app`.

---

## Exact staging-only environment variables

Set **only** on the dedicated staging project (`zikuk-staging` already has these names):

| Name | Required value |
|---|---|
| `VITE_SUPABASE_URL` | `https://lmgrhmyurhjlwwdedojk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Staging anon key (dashboard; never commit) |
| `VITE_STAGING_EMAIL_AUTH` | `true` |

Optional (rare): `VITE_AUTH_REDIRECT_ORIGIN=https://focus-workspace-staging.vercel.app` if a canonical host must override `window.location.origin`.

Must **not** appear in the staging project: production ref `comxmviofnotfwzbupxg`, production keys, or staging email flag unset.

---

## Build / output settings (match existing `zikuk-staging`)

| Setting | Value |
|---|---|
| Framework | Vite |
| Node | 24.x |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install | `npm install` |
| Root | `.` |

Local fail-closed rehearsal (already green on RC):

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023
npm run build:release:staging
# expect: embeds lmgrhmyurhjlwwdedojk only; staging UI present; no production ref
```

---

## Domain / alias migration (authorized step later)

**Goal:** Point `focus-workspace-staging.vercel.app` at a verified staging deployment **without** changing production aliases.

### Pre-transfer proof

1. Deploy M4 RC to **`zikuk-staging`** (authorization required).
2. Verify `https://zikuk-staging.vercel.app`:
   - JS contains `lmgrhmyurhjlwwdedojk`
   - JS lacks `comxmviofnotfwzbupxg`
   - JS contains `staging-magic-link-form`
3. Record production fingerprint (must stay unchanged):

```bash
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
# preflight baseline: assets/index-Cng6QXAI.js
```

### Transfer (only this hostname)

```bash
# After a READY staging deployment URL is known:
npx vercel alias set <STAGING_DEPLOYMENT_URL> focus-workspace-staging.vercel.app \
  --scope yalironel-4532s-projects
```

**STOP if** the command would touch `zikuk.com`, `www.zikuk.com`, or `focus-workspace-one.vercel.app`.

### Post-transfer

1. Re-verify `focus-workspace-staging.vercel.app` identity checks.
2. Re-verify `zikuk.com` asset unchanged.
3. Keep `zikuk-staging.vercel.app` as a secondary known-good URL.

Until transfer is authorized, **preserve** the current (incorrect) staging alias — do not delete it early.

---

## Supabase Auth redirects

Client uses `window.location.origin + '/dashboard'` (see `src/lib/authRedirect.ts`).

When the stable alias moves to the dedicated project, staging Supabase **Redirect URLs** must allow:

- `https://zikuk-staging.vercel.app/**` (already in use)
- `https://focus-workspace-staging.vercel.app/**` (add before relying on that host for login)
- Preview URL pattern if magic links are opened on ephemeral Preview hosts

Site URL for staging project should remain a staging host (not `zikuk.com`).  
Public Auth settings API does not expose the allow-list — confirm in Supabase dashboard.

---

## Staging Edge Function (`ai-gateway`) vs M4

| Check | Result |
|---|---|
| Function present on staging | Yes (responds; unauthenticated → `Sign in required`) |
| DB RPCs 020/021 present | Yes (service_role-only) |
| Deployed Edge revision == RC `7604708` + SKE1 fix | **Unverified** (no revision hash via anon) |

M4 Ask Course needs document-window / pdf-source routes in Edge shared modules. Treat **staging `ai-gateway` redeploy from this RC** as a separate authorized step before tutor acceptance on staging.

---

## Operator sequence requiring authorization

1. **Authorize:** Deploy current RC frontend to existing project `zikuk-staging` (do not touch `focus-workspace`).
2. Verify bundle on `https://zikuk-staging.vercel.app`.
3. Confirm Supabase redirect URLs include both staging hosts.
4. **Authorize:** `vercel alias set … focus-workspace-staging.vercel.app` only.
5. Verify staging alias + production unchanged.
6. **Authorize (separate):** Deploy staging Edge `ai-gateway` from RC if tutor paths fail revision checks.

Optional (usually unnecessary): create new project named `focus-workspace-staging` — only if renaming away from `zikuk-staging`.

---

## Local pointer usage (no remote effect)

```bash
# Inspect only — do not vercel link the RC tree to focus-workspace
cat .vercel-staging/project.json
cat deploy/staging/vercel-project.meta.json
```

Do **not** overwrite `.vercel/` with the production project link while preparing staging deploys.
