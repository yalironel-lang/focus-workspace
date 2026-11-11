# M4 — Staging Browser Acceptance Preparation

**Status:** Preparation only. Promotion / Auth edits / alias moves require separate authorization.  
**Recommended URL after promotion:** `https://zikuk-staging.vercel.app`  
**Staging Supabase:** `lmgrhmyurhjlwwdedojk`  
**Approved M4 deployment:** `dpl_BnFSbC9yzsPhxd7GxK9YdSf6u2ZF`  
**Staging Vercel project:** `zikuk-staging` (`prj_x3693ooh2g0Ppu306hR04OZyy6q1`)

---

## Current host state (inspected)

| Host | Asset | Staging Supabase | Staging email UI | Deployment Protection |
|---|---|---|---|---|
| `https://zikuk-staging.vercel.app` | `index-CCcLcgPn.js` (**pre-M4**) · `dpl_B5pfaA6v…` | Yes | Yes | **None** (custom domain exempt) |
| Preview `…1kvn5k432…` / `dpl_BnFSbC9…` | `index-DqtYJjGF.js` (**M4**, READY) | Yes (env) | Yes (env) | **SSO** → `vercel.com/sso-api` (302) |
| `focus-workspace-staging.vercel.app` | on **focus-workspace** project | Prod-connected | No | Do not transfer / do not use |
| `zikuk.com` | `index-Cng6QXAI.js` | No | No | Do not touch |

SSO policy: `ssoProtection.deploymentType = all_except_custom_domains`. Only domain on staging project: `zikuk-staging.vercel.app`.

Promotion of `dpl_BnFSbC9yzsPhxd7GxK9YdSf6u2ZF` **within `zikuk-staging` only** (`prj_x3693ooh2g0Ppu306hR04OZyy6q1`) updates the stable host and does **not** touch `focus-workspace` / `zikuk.com` / `focus-workspace-staging.vercel.app`.

---

## Auth (read-only findings)

Public Auth settings:

- Email provider: **enabled**
- Signup: **disabled** (invite / existing users only)
- Google (public flag): **not enabled**
- Site URL / redirect allow-list: **not exposed** via public API → **UNVERIFIED**

Client return path: `window.location.origin + '/dashboard'`  
Required allow-list entry for stable host (operator to confirm in dashboard):

- `https://zikuk-staging.vercel.app/**`
- Especially: `https://zikuk-staging.vercel.app/dashboard`

Preview URL allow-list is optional if testing only on the stable host after promotion.

**Do not change Auth until separately authorized.**

---

## Exact staging-only promotion (when authorized)

Preflight:

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023
export VERCEL_ORG_ID=team_Fqri3BNqPhEp1ygtHuC5Dhxn
export VERCEL_PROJECT_ID=prj_x3693ooh2g0Ppu306hR04OZyy6q1
# MUST equal approved staging project — never focus-workspace
test "$VERCEL_PROJECT_ID" = "prj_x3693ooh2g0Ppu306hR04OZyy6q1"

# Record before fingerprint
curl -sS https://zikuk-staging.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
```

Promote **only** the verified M4 deployment:

```bash
npx vercel promote dpl_BnFSbC9yzsPhxd7GxK9YdSf6u2ZF \
  --scope yalironel-4532s-projects \
  --yes
```

Post-check:

```bash
# Expect index-DqtYJjGF.js (or successor) + staging ref + staging UI
curl -sS https://zikuk-staging.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
# Production must remain index-Cng6QXAI.js (until an authorized prod deploy)
curl -sS https://zikuk.com/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
# Must NOT change
curl -sS https://focus-workspace-staging.vercel.app/ | grep -Eo 'assets/index-[^"]+\.js' | head -1
```

**STOP if** promote targets any project other than `prj_x3693ooh2g0Ppu306hR04OZyy6q1`.

Rollback: `npx vercel promote dpl_B5pfaA6vopLeUJ3cR978BrSrWgsz --scope yalironel-4532s-projects --yes`  
(current stable production deployment before M4 promote).

---

## Browser acceptance checklist (synthetic staging data)

Use **authorized staging test accounts only**. Never open other users’ content.

### Access

- [ ] Open `https://zikuk-staging.vercel.app` (preferred after promote)
- [ ] Confirm no Vercel SSO wall on stable host
- [ ] Staging email magic-link UI visible
- [ ] Sign in with authorized staging account
- [ ] Land on `/dashboard` (or intended post-auth route)
- [ ] Network: API host `lmgrhmyurhjlwwdedojk.supabase.co` only

### App smoke

- [ ] Dashboard navigation
- [ ] Course / section loads
- [ ] Open PDF (synthetic staging PDF)
- [ ] Edit notebook → refresh → persists
- [ ] Mission Control opens / basic navigation

### AI Tutor / Ask Course (needs Edge v36 + M4 frontend)

- [ ] Select PDF text → Ask / Tutor
- [ ] Quoted short formula → `pdf_selection` or `mixed` with notice (not silent `general_academic`)
- [ ] Document-window / open-PDF retrieval path
- [ ] Contextual follow-up in same thread
- [ ] Conversation survives refresh (client storage)

### Isolation

- [ ] Second authorized staging account cannot read first account’s PDF/objects

### Production control

- [ ] `zikuk.com` asset unchanged
- [ ] No staging magic-link UI on production

---

## Next operation requiring authorization

1. Confirm staging Auth redirect allow-list includes `https://zikuk-staging.vercel.app/**` (dashboard read by operator if API unavailable).  
2. **Authorize:** `vercel promote dpl_BnFSbC9yzsPhxd7GxK9YdSf6u2ZF` on project `prj_x3693ooh2g0Ppu306hR04OZyy6q1` only.  
3. Run browser checklist above with authorized staging test users.
