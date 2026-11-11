# M4 Staging Deployment — Operator Runbook

**RC worktree:** `/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023`  
**Base commit:** `760470850db179821b3aa56043f5e5be3115d8d2`  
**Staging Supabase ref:** `lmgrhmyurhjlwwdedojk`  
**Production Supabase ref:** `comxmviofnotfwzbupxg`  
**Stable staging alias:** `https://focus-workspace-staging.vercel.app`

Do **not** run the deploy section until a later message explicitly authorizes staging deployment.  
Never print anon keys, service-role keys, or Vercel tokens into chat or tickets.

---

## 0. Architecture choice (recommended)

**Recommended:** reuse existing dedicated project **`zikuk-staging`** (see `M4-DEDICATED-STAGING-PROJECT-SETUP.md`). Do not create a duplicate unless renaming is required.

| Option | Verdict |
|---|---|
| **A. Preview env in shared `focus-workspace`** | Usable only after operator proves Preview env is staging-only. Higher risk: shared aliases, shared CLI defaults, Preview env changes affect all future Preview builds. |
| **B. Dedicated staging Vercel project** | **Preferred.** No Production env in the project; `vercel deploy` cannot target Production of the prod project; alias blast radius is isolated. |

If using **A**, complete §2A before any deploy. If using **B**, complete §2B.

---

## 1. Prerequisites

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023
git rev-parse HEAD
# expect: 760470850db179821b3aa56043f5e5be3115d8d2  (or later RC commit with SKE1 fix)

# Local green gate
npm test
npm run build:release:both
npm run test:deploy-staging-guards

# Auth for deploy tooling (operator machine)
npx vercel whoami
# Must succeed. Current preflight found invalid Vercel token → login required.
```

Record production fingerprint **before** any alias change:

```bash
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
curl -sS https://focus-workspace-one.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
# Preflight observed: assets/index-Cng6QXAI.js on both + staging alias (prod-connected)
```

---

## 2. Required remote configuration

### 2A — Shared project Preview path (conditional)

In Vercel project `focus-workspace` → Settings → Environment Variables:

**Production** (do not change during staging recovery):

| Variable | Required value |
|---|---|
| `VITE_SUPABASE_URL` | `https://comxmviofnotfwzbupxg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production anon (dashboard only) |
| `VITE_STAGING_EMAIL_AUTH` | unset / not `true` |

**Preview:**

| Variable | Required value |
|---|---|
| `VITE_SUPABASE_URL` | `https://lmgrhmyurhjlwwdedojk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Staging anon (dashboard only) |
| `VITE_STAGING_EMAIL_AUTH` | `true` |

Notes:

- Changing Preview env does **not** rebuild existing deployments; it affects **new** Preview builds.
- It does **not** change Production builds when scopes are correct.
- Current public staging alias still serves the **production** bundle (`index-Cng6QXAI.js` + prod ref). Env fix alone is insufficient until a new Preview deploy is aliased.

### 2B — Dedicated staging project path (recommended)

1. Create Vercel project `focus-workspace-staging` (or equivalent).
2. Set **only** staging `VITE_*` values (same Preview table above) on Production *of that project* (that project's "production" is still staging Supabase — name carefully).
3. Move/point alias `focus-workspace-staging.vercel.app` to this project.
4. Adapt deploy command to `vercel --cwd … --scope …` / link to the staging project — **never** link this worktree to the production project when deploying staging.
5. Keep `zikuk.com` / `focus-workspace-one.vercel.app` exclusively on the production project.

### Staging Supabase Auth redirects (dashboard)

Confirm redirect allow-list includes:

- `https://focus-workspace-staging.vercel.app/**`
- The Preview deployment URL pattern if used for magic links

Public Auth settings API does **not** expose redirect URLs — operator must verify in Supabase dashboard.

---

## 3. Exact safe commands (when authorized)

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023

# Clear any local bake-in that could confuse operators
unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_STAGING_EMAIL_AUTH

# Explicit opt-in — required
export ZIKUK_ALLOW_STAGING_DEPLOY=1

# Shared-project Preview path (script as written):
npm run deploy:staging
```

For a **dedicated** staging project, do **not** run the shared-project script until it is retargeted/linked to that project. Prefer:

```bash
# Example shape only — operator fills project link after creating the staging project
npx vercel link --project focus-workspace-staging   # interactive; confirm name
npx vercel deploy --yes                             # NO --prod against the production project
npx vercel alias set <preview-url> focus-workspace-staging.vercel.app
# Then run the same curl identity checks as §7
```

---

## 4. Expected output

From `npm run deploy:staging` (shared path):

- Opt-in accepted; no `--prod`
- Deployment URL under `*-yalironel-4532s-projects.vercel.app` (Preview)
- `Bundle identity check PASS (... lmgrhmyurhjlwwdedojk ..., staging UI present)`
- `[deploy:staging] SUCCESS` with staging alias URL

---

## 5. STOP conditions

Stop and do **not** retry blindly if:

- Vercel CLI auth fails
- Script exits before `Bundle identity check PASS`
- Bundle still contains `comxmviofnotfwzbupxg`
- Bundle lacks `lmgrhmyurhjlwwdedojk` or `staging-magic-link-form`
- Any command would require `--prod` on the production project
- Production index asset on `zikuk.com` changes unexpectedly
- Staging Auth redirects still point only at production hosts

---

## 6. Staging deployment

Authorized operator only. Use §3. Prefer dedicated project (§2B) for the first recovery.

---

## 7. Bundle fingerprint verification

```bash
STAGING=https://focus-workspace-staging.vercel.app
JS=$(curl -fsSL "$STAGING/" | grep -Eo '/assets/index-[^"]+\.js' | head -1)
echo "STAGING_JS=$JS"
curl -fsSL "$STAGING$JS" -o /tmp/staging-index.js
grep -q lmgrhmyurhjlwwdedojk /tmp/staging-index.js && echo STAGING_REF=OK || echo STAGING_REF=FAIL
grep -q comxmviofnotfwzbupxg /tmp/staging-index.js && echo PROD_REF_LEAK=FAIL || echo PROD_REF_LEAK=OK
grep -q staging-magic-link-form /tmp/staging-index.js && echo STAGING_UI=OK || echo STAGING_UI=FAIL
```

All three: `STAGING_REF=OK`, `PROD_REF_LEAK=OK`, `STAGING_UI=OK`.

---

## 8. Production unchanged verification

```bash
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
curl -sS https://focus-workspace-one.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
# Expect same pre-deploy asset (preflight: index-Cng6QXAI.js) unless an authorized prod deploy occurred
```

Browser on production: no staging magic-link form.

---

## 9. Staging authentication smoke test

On `https://focus-workspace-staging.vercel.app`:

1. Confirm staging email / magic-link UI is visible (`VITE_STAGING_EMAIL_AUTH`).
2. Complete sign-in against **staging** Auth only.
3. DevTools → Network: all Supabase calls to `lmgrhmyurhjlwwdedojk.supabase.co`.
4. Confirm production `zikuk.com` still Google-oriented / no staging email form.

---

## 10. Acceptance tests (staging)

- [ ] PDF open / page navigation
- [ ] Notebook edit + refresh persist
- [ ] AI Tutor / Ask Course smoke (Edge `ai-gateway` present; knowledge RPCs are service_role)
- [ ] PDF recovery path smoke if workers configured
- [ ] Mission Control smoke
- [ ] Two-user isolation: user B cannot read user A PDF objects

---

## 11. Staging rollback

1. Do **not** touch production aliases.
2. Point `focus-workspace-staging.vercel.app` back to the last known-good **Preview** deployment URL (Vercel dashboard → Domains/Aliases), **or** leave alias unchanged and fix Preview env then redeploy.
3. Never alias staging hostname to a Production deployment of `focus-workspace`.
4. Re-run §7 until PASS.

---

## Staging Supabase dependency snapshot (preflight)

Verified read-only via anon key (no writes):

| Capability | Evidence |
|---|---|
| `ai_knowledge_document_window` (020) | Exists (`42501` permission denied for anon — service_role only) |
| `ai_knowledge_search_pdf_source` (021) | Exists (`42501`) |
| `ai_knowledge_search` | Exists (`42501`) |
| Knowledge tables | Present (`401`/`42501`, not missing) |
| Page recovery claim RPC | Present |
| Edge `ai-gateway` | Present (GET → `POST required`) |
| Storage bucket listing as anon | Empty list (buckets not enumerable anonymously; do not treat as missing) |
| Auth email provider | Enabled; signup disabled |
| Auth redirect allow-list | **Not visible** via public API — operator dashboard check required |

Edge function revision/hash: **not visible** via anon — confirm in Supabase dashboard before tutor acceptance.
