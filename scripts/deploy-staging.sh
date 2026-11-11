#!/usr/bin/env bash
# Deploy Focus to the dedicated Vercel staging project (remote build).
# NEVER touches Production (--prod is intentionally absent).
#
# FAIL-CLOSED GUARDS (local script):
#   - Requires ZIKUK_ALLOW_STAGING_DEPLOY=1 (explicit operator opt-in)
#   - Refuses any --prod argument
#   - Targets dedicated staging project via .vercel-staging/project.json
#     (refuses the production focus-workspace project id)
#   - Does NOT move focus-workspace-staging.vercel.app unless
#     ZIKUK_UPDATE_STAGING_ALIAS=1 (preserve alias until verified)
#   - Refuses aliasing production domains
#   - Post-deploy identity check fails closed
#
# Staging project env must already use lmgrhmyurhjlwwdedojk — this script
# does not create projects or set remote env vars.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAGING_ALIAS="${ZIKUK_STAGING_ALIAS:-zikuk-staging.vercel.app}"
STAGING_REF="lmgrhmyurhjlwwdedojk"
PROD_REF="comxmviofnotfwzbupxg"
PROD_PROJECT_ID="prj_uBdZ12jILWA40tZUVWH92nFCKbkh"
STAGING_META="$ROOT_DIR/.vercel-staging/project.json"
PRODUCTION_ALIASES=(
  "focus-workspace-one.vercel.app"
  "focus-workspace-yalironel-4532s-projects.vercel.app"
  "focus-workspace-git-main-yalironel-4532s-projects.vercel.app"
  "zikuk.com"
  "www.zikuk.com"
)

for arg in "$@"; do
  if [[ "$arg" == "--prod" || "$arg" == "--production" ]]; then
    echo "[deploy:staging] ERROR: refusing Production deploy flag (${arg})." >&2
    exit 1
  fi
done

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<EOF
Usage:
  ZIKUK_ALLOW_STAGING_DEPLOY=1 npm run deploy:staging

  # After the new deployment is verified on zikuk-staging.vercel.app:
  ZIKUK_ALLOW_STAGING_DEPLOY=1 ZIKUK_UPDATE_STAGING_ALIAS=1 npm run deploy:staging

Deploys the current working tree to the dedicated staging Vercel project
(default: zikuk-staging from .vercel-staging/project.json).

Stable alias https://${STAGING_ALIAS} is updated ONLY when
ZIKUK_UPDATE_STAGING_ALIAS=1 (preserves the current alias until verified).

Required operator prerequisites (NOT performed by this script):
  - Dedicated project env: VITE_SUPABASE_URL=https://${STAGING_REF}.supabase.co
  - Dedicated project env: VITE_SUPABASE_ANON_KEY=<staging anon>
  - Dedicated project env: VITE_STAGING_EMAIL_AUTH=true
  - Never set production Supabase refs on the staging project

Safety:
  - Does NOT use --prod
  - Does NOT target production project ${PROD_PROJECT_ID}
  - Does NOT alias production domains
  - Requires ZIKUK_ALLOW_STAGING_DEPLOY=1
  - Fails if deployment does not reach READY
  - Fail-closed bundle identity check
EOF
  exit 0
fi

if [[ "${ZIKUK_ALLOW_STAGING_DEPLOY:-}" != "1" ]]; then
  echo "[deploy:staging] ERROR: set ZIKUK_ALLOW_STAGING_DEPLOY=1 to run (fail-closed)." >&2
  echo "[deploy:staging] This RC phase does not authorize remote deploy by default." >&2
  exit 1
fi

if [[ ! -f "$STAGING_META" ]]; then
  echo "[deploy:staging] ERROR: missing ${STAGING_META}" >&2
  echo "[deploy:staging] Dedicated staging project pointer is required." >&2
  exit 1
fi

STAGING_PROJECT_ID="$(node -e 'const j=require(process.argv[1]); process.stdout.write(j.projectId||"")' "$STAGING_META")"
STAGING_ORG_ID="$(node -e 'const j=require(process.argv[1]); process.stdout.write(j.orgId||"")' "$STAGING_META")"
STAGING_PROJECT_NAME="$(node -e 'const j=require(process.argv[1]); process.stdout.write(j.projectName||"")' "$STAGING_META")"
if [[ -z "$STAGING_PROJECT_ID" || -z "$STAGING_ORG_ID" ]]; then
  echo "[deploy:staging] ERROR: ${STAGING_META} must include projectId and orgId." >&2
  exit 1
fi
if [[ "$STAGING_PROJECT_ID" == "$PROD_PROJECT_ID" ]]; then
  echo "[deploy:staging] ERROR: refusing production project id ${PROD_PROJECT_ID}." >&2
  exit 1
fi

export VERCEL_ORG_ID="$STAGING_ORG_ID"
export VERCEL_PROJECT_ID="$STAGING_PROJECT_ID"

# Refuse if someone exported production URL into the shell expecting local bake-in
# (remote build uses Vercel env; this still catches obvious operator mistakes).
if [[ "${VITE_SUPABASE_URL:-}" == *"$PROD_REF"* ]]; then
  echo "[deploy:staging] ERROR: shell VITE_SUPABASE_URL points at production (${PROD_REF})." >&2
  echo "[deploy:staging] Unset it so the staging project env is used." >&2
  exit 1
fi
if [[ "${VITE_STAGING_EMAIL_AUTH:-}" == "false" ]]; then
  echo "[deploy:staging] WARN: VITE_STAGING_EMAIL_AUTH=false in shell; staging project env must still set true on Vercel." >&2
fi

COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
echo "[deploy:staging] Dedicated staging deploy project=${STAGING_PROJECT_NAME} id=${STAGING_PROJECT_ID} commit=${COMMIT}"

# JSON on stdout; progress logs on stderr.
if ! DEPLOY_JSON="$(npx vercel deploy --yes --format json 2>/dev/null)"; then
  echo "[deploy:staging] ERROR: deployment outcome UNKNOWN; stop and reconcile the existing attempt read-only. Do not retry automatically." >&2
  exit 1
fi
# Validate response structure before any alias or verification request. A CLI
# response is not proof of absence when parsing or required fields fail.
if ! printf '%s' "$DEPLOY_JSON" | node -e '
  try {
    const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    if (!j || Array.isArray(j) || typeof j.url!=="string" || typeof j.id!=="string" || !j.id || typeof j.readyState!=="string") process.exit(1);
    const u=new URL(j.url);
    if (u.protocol!=="https:" || u.username || u.password || u.port || !u.hostname.endsWith(".vercel.app")) process.exit(1);
  } catch { process.exit(1); }
'; then
  echo "[deploy:staging] ERROR: deployment outcome UNKNOWN; invalid response metadata. Reconcile the existing attempt read-only; do not retry automatically." >&2
  exit 1
fi
DEPLOY_URL="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.url||"")' "$DEPLOY_JSON" 2>/dev/null || true)"
DEPLOY_ID="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.id||"")' "$DEPLOY_JSON" 2>/dev/null || true)"
READY_STATE="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.readyState||"")' "$DEPLOY_JSON" 2>/dev/null || true)"

if [[ -z "$DEPLOY_URL" ]]; then
  echo "[deploy:staging] ERROR: deployment outcome UNKNOWN; missing or unreadable deployment URL. Reconcile the existing attempt read-only; do not retry automatically." >&2
  exit 1
fi

if [[ "$READY_STATE" != "READY" ]]; then
  echo "[deploy:staging] ERROR: deployment readiness unverified (expected READY). Stop without retry or alias change." >&2
  exit 1
fi

# Never alias a production hostname; never treat a prod host as the deploy URL.
for prod in "${PRODUCTION_ALIASES[@]}"; do
  if [[ "$STAGING_ALIAS" == "$prod" ]]; then
    echo "[deploy:staging] ERROR: refusing to alias production domain ${prod}." >&2
    exit 1
  fi
  if [[ "$DEPLOY_URL" == *"$prod"* ]]; then
    echo "[deploy:staging] ERROR: deployment URL looks like production host ${prod}." >&2
    exit 1
  fi
done

echo "[deploy:staging] Deployment ready: ${DEPLOY_URL}"

VERIFY_HOST=""
if [[ "${ZIKUK_UPDATE_STAGING_ALIAS:-}" == "1" ]]; then
  echo "[deploy:staging] Updating alias https://${STAGING_ALIAS} (explicit ZIKUK_UPDATE_STAGING_ALIAS=1)"
  npx vercel alias set "$DEPLOY_URL" "$STAGING_ALIAS" --scope yalironel-4532s-projects
  VERIFY_HOST="$STAGING_ALIAS"
else
  echo "[deploy:staging] Preserving existing https://${STAGING_ALIAS} (set ZIKUK_UPDATE_STAGING_ALIAS=1 after verification)."
  VERIFY_HOST="$(node -e 'try{process.stdout.write(new URL(process.argv[1]).host)}catch{process.stdout.write("")}' "$DEPLOY_URL")"
fi

if [[ -z "$VERIFY_HOST" ]]; then
  echo "[deploy:staging] ERROR: could not determine host for identity verification." >&2
  exit 1
fi

# Identity check — FAIL CLOSED on the verified host (deploy URL or updated alias).
echo "[deploy:staging] Verifying https://${VERIFY_HOST} embeds ${STAGING_REF} (not ${PROD_REF})"
TMP_HTML="$(mktemp)"
TMP_JS="$(mktemp)"
cleanup() { rm -f "$TMP_HTML" "$TMP_JS"; }
trap cleanup EXIT

if ! curl -fsSL --max-time 30 "https://${VERIFY_HOST}/" -o "$TMP_HTML"; then
  echo "[deploy:staging] ERROR: could not fetch https://${VERIFY_HOST}/ for identity check." >&2
  echo "[deploy:staging] Do not treat this run as successful." >&2
  exit 1
fi

JS_PATH="$(grep -Eo '/assets/index-[^\" ]+\.js' "$TMP_HTML" | head -1 || true)"
if [[ -z "$JS_PATH" ]]; then
  echo "[deploy:staging] ERROR: could not parse index asset from https://${VERIFY_HOST}/ HTML." >&2
  exit 1
fi

if ! curl -fsSL --max-time 60 "https://${VERIFY_HOST}${JS_PATH}" -o "$TMP_JS"; then
  echo "[deploy:staging] ERROR: could not download index JS for identity check (${JS_PATH})." >&2
  exit 1
fi
if [[ ! -s "$TMP_JS" ]]; then
  echo "[deploy:staging] ERROR: index JS download empty (${JS_PATH})." >&2
  exit 1
fi

if grep -q "$PROD_REF" "$TMP_JS"; then
  echo "[deploy:staging] ERROR: bundle still embeds production Supabase ref." >&2
  echo "[deploy:staging] Fix dedicated staging project env and redeploy." >&2
  exit 1
fi
if ! grep -q "$STAGING_REF" "$TMP_JS"; then
  echo "[deploy:staging] ERROR: bundle missing staging Supabase ref ${STAGING_REF}." >&2
  exit 1
fi
if ! grep -q "staging-magic-link-form" "$TMP_JS"; then
  echo "[deploy:staging] ERROR: bundle missing staging email-auth UI marker." >&2
  echo "[deploy:staging] Staging project env must set VITE_STAGING_EMAIL_AUTH=true and rebuild." >&2
  exit 1
fi

echo "[deploy:staging] Bundle identity check PASS (${STAGING_REF} present, ${PROD_REF} absent, staging UI present)"

echo ""
echo "[deploy:staging] SUCCESS"
echo "  Verified host:     https://${VERIFY_HOST}"
echo "  Stable alias:      https://${STAGING_ALIAS} (updated=$([[ "${ZIKUK_UPDATE_STAGING_ALIAS:-}" == "1" ]] && echo yes || echo no))"
echo "  Staging project:   ${STAGING_PROJECT_NAME} (${STAGING_PROJECT_ID})"
echo "  Deployment ID:     ${DEPLOY_ID}"
echo "  Deployment URL:    ${DEPLOY_URL}"
echo "  Source commit:     ${COMMIT}"
echo "  Index asset:       ${JS_PATH}"
echo ""
echo "Note: Deployment Protection may require Vercel SSO or a bypass cookie on Device B."
