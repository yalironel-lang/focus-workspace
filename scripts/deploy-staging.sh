#!/usr/bin/env bash
# Deploy Focus to stable Vercel Preview staging (remote build) and update alias.
# NEVER touches Production (--prod is intentionally absent).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAGING_ALIAS="focus-workspace-staging.vercel.app"
PRODUCTION_ALIASES=(
  "focus-workspace-one.vercel.app"
  "focus-workspace-yalironel-4532s-projects.vercel.app"
  "focus-workspace-git-main-yalironel-4532s-projects.vercel.app"
)

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<EOF
Usage: npm run deploy:staging

Deploys the current working tree to Vercel Preview (remote build) and points
the stable staging alias at the new deployment:

  https://${STAGING_ALIAS}

Safety:
  - Does NOT use --prod
  - Does NOT alias production domains
  - Fails if deployment does not reach READY
EOF
  exit 0
fi

echo "[deploy:staging] Remote Preview deploy (branch: $(git branch --show-current 2>/dev/null || echo unknown))"

# JSON on stdout; progress logs on stderr.
DEPLOY_JSON="$(npx vercel deploy --yes --format json 2>/dev/null)"
DEPLOY_URL="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.url||"")' "$DEPLOY_JSON" 2>/dev/null || true)"
DEPLOY_ID="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.id||"")' "$DEPLOY_JSON" 2>/dev/null || true)"
READY_STATE="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.readyState||"")' "$DEPLOY_JSON" 2>/dev/null || true)"

if [[ -z "$DEPLOY_URL" ]]; then
  echo "[deploy:staging] WARN: JSON parse failed; retrying deploy with log capture." >&2
  DEPLOY_LOG="$(mktemp)"
  if ! npx vercel deploy --yes 2>&1 | tee "$DEPLOY_LOG"; then
    echo "[deploy:staging] ERROR: vercel deploy failed." >&2
    rm -f "$DEPLOY_LOG"
    exit 1
  fi
  DEPLOY_URL="$(grep -Eo 'https://focus-workspace-[a-z0-9]+-yalironel-4532s-projects\.vercel\.app' "$DEPLOY_LOG" | tail -1 || true)"
  rm -f "$DEPLOY_LOG"
fi

if [[ -z "$DEPLOY_URL" ]]; then
  echo "[deploy:staging] ERROR: could not determine deployment URL." >&2
  exit 1
fi

if [[ -n "$READY_STATE" && "$READY_STATE" != "READY" ]]; then
  echo "[deploy:staging] ERROR: deployment ${DEPLOY_ID:-unknown} readyState=${READY_STATE} (expected READY)." >&2
  exit 1
fi

for prod in "${PRODUCTION_ALIASES[@]}"; do
  if [[ "$STAGING_ALIAS" == "$prod" ]]; then
    echo "[deploy:staging] ERROR: refusing to alias production domain ${prod}." >&2
    exit 1
  fi
done

echo "[deploy:staging] Deployment ready: ${DEPLOY_URL}"
echo "[deploy:staging] Updating alias https://${STAGING_ALIAS}"

npx vercel alias set "$DEPLOY_URL" "$STAGING_ALIAS"

echo ""
echo "[deploy:staging] SUCCESS"
echo "  Stable staging URL: https://${STAGING_ALIAS}"
echo "  Deployment ID:     ${DEPLOY_ID}"
echo "  Preview URL:       ${DEPLOY_URL}"
echo ""
echo "Note: Preview Deployment Protection may require Vercel SSO or a bypass cookie on Device B."
