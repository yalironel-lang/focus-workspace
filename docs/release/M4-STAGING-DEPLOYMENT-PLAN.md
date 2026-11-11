# M4 Release Candidate — Staging Deployment Plan (Operator)

**Status:** Instructions only. Remote deploy is **not** authorized by the M4 Phase A RC work.  
**Source worktree:** `/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023`  
**Exact commit:** `760470850db179821b3aa56043f5e5be3115d8d2`

**Canonical operator runbook (preferred):** [`M4-STAGING-OPERATOR-RUNBOOK.md`](./M4-STAGING-OPERATOR-RUNBOOK.md)

Do not run these steps until a later message explicitly authorizes staging deployment.

---

## 1. Source identity

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023
git rev-parse HEAD
# expect: 760470850db179821b3aa56043f5e5be3115d8d2
```

Preserve sibling trees (`zikuk-tq1-teaching-quality`, `zikuk-production-v29-hotfix`, original M4 checkout). Do not merge dirty v29 Edge WIP.

---

## 2. Required environment separation (Vercel project `focus-workspace`)

Configure in the Vercel dashboard (operator). This RC does **not** change remote env.

### Production

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://comxmviofnotfwzbupxg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production anon / publishable key |
| `VITE_STAGING_EMAIL_AUTH` | **unset** or not exactly `true` |

Aliases: `zikuk.com`, `focus-workspace-one.vercel.app`, and other production aliases — **do not change** during staging recovery.

### Preview (Staging)

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://lmgrhmyurhjlwwdedojk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Staging anon / publishable key |
| `VITE_STAGING_EMAIL_AUTH` | `true` |

---

## 3. Safe Vercel Preview deployment (when authorized)

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023
unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_STAGING_EMAIL_AUTH
export ZIKUK_ALLOW_STAGING_DEPLOY=1
npm run deploy:staging
```

Guards in `scripts/deploy-staging.sh`:

- Requires `ZIKUK_ALLOW_STAGING_DEPLOY=1`
- Refuses `--prod` / `--production`
- Refuses shell `VITE_SUPABASE_URL` containing the production project ref
- Refuses aliasing production hostnames
- Post-alias: fetches staging HTML/JS and requires staging ref present and production ref absent

---

## 4. Alias verification

```bash
curl -sS https://focus-workspace-staging.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js'
# Download that JS and confirm:
#   contains: lmgrhmyurhjlwwdedojk
#   lacks:    comxmviofnotfwzbupxg
#   contains: staging-magic-link-form   (staging email UI)
```

---

## 5. Frontend bundle identity checks (local rehearsal)

Already automated in this worktree:

```bash
bash scripts/build-release-targets.sh both
# produces dist-production / dist-staging and runs verify-build-target.mjs
```

---

## 6. Staging Supabase connection verification

In the browser on the staging alias (after authorized deploy):

- Sign-in uses staging project (staging email link and/or Google against staging Auth).
- Network tab: API host `lmgrhmyurhjlwwdedojk.supabase.co` only.

---

## 7. Edge Function version requirements

Deploy (separate authorization) Edge functions from this commit to **staging** Supabase before relying on tutor document-window / pdf-source paths:

- `ai-gateway` and shared askCourse modules at commit `7604708`
- Staging DB already exposes `ai_knowledge_document_window` and `ai_knowledge_search_pdf_source` (prior audit)

Production still lacks 020/021 until a later authorized migration gate.

---

## 8. Staging acceptance tests (after deploy)

- [ ] Google and/or staging email auth works on staging only
- [ ] Production Auth on `zikuk.com` still Google-only (no magic-link form)
- [ ] Open PDF, edit notebook, refresh persist
- [ ] Ask / Tutor smoke (document window / open PDF if Edge deployed)
- [ ] Mission Control smoke if used
- [ ] Two staging accounts: cross-user PDF deny

---

## 9. Recovery if staging alias is wrong

If the staging alias still embeds the production ref:

1. Do **not** change production aliases.
2. Fix Vercel **Preview** env to staging Supabase + `VITE_STAGING_EMAIL_AUTH=true`.
3. Redeploy Preview from this worktree; re-run `deploy:staging` with opt-in.
4. Re-check bundle identity.
5. If needed, point the staging alias back to a known-good Preview URL manually in Vercel — never to a Production deployment.

---

## 10. Proof that Production remains unchanged

Before/after staging recovery, record:

```bash
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js'
curl -sS https://focus-workspace-one.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js'
# Expect the same production index asset as before staging work
# (historically index-Cng6QXAI.js until an authorized production deploy)
```

Production deployment remains **NOT AUTHORIZED** by Phase A.
