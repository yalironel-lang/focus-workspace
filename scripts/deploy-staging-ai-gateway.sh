#!/usr/bin/env bash
# Staging-only deploy of supabase/functions/ai-gateway.
# NEVER targets production. Does nothing unless explicitly opted in.
#
# NOT executed by default. Requires:
#   ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAGING_REF="lmgrhmyurhjlwwdedojk"
PROD_REF="comxmviofnotfwzbupxg"
FUNCTION_NAME="ai-gateway"

for arg in "$@"; do
  if [[ "$arg" == *"$PROD_REF"* ]]; then
    echo "[deploy:staging-edge] ERROR: refusing production project ref in args." >&2
    exit 1
  fi
  if [[ "$arg" == "--project-ref" ]]; then
    : # paired value checked below via explicit export only
  fi
done

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<EOF
Usage: ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1 bash scripts/deploy-staging-ai-gateway.sh

Deploys only ${FUNCTION_NAME} to Supabase project ${STAGING_REF}.
Refuses ${PROD_REF}. Does not print secrets.
EOF
  exit 0
fi

if [[ "${ZIKUK_ALLOW_STAGING_EDGE_DEPLOY:-}" != "1" ]]; then
  echo "[deploy:staging-edge] ERROR: set ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1 to run (fail-closed)." >&2
  exit 1
fi

if [[ "${SUPABASE_PROJECT_REF:-}" == *"$PROD_REF"* ]] || [[ "${SUPABASE_PROJECT_ID:-}" == *"$PROD_REF"* ]]; then
  echo "[deploy:staging-edge] ERROR: shell points at production Supabase ref." >&2
  exit 1
fi

PROJECT_REF="${ZIKUK_STAGING_SUPABASE_REF:-$STAGING_REF}"
if [[ "$PROJECT_REF" != "$STAGING_REF" ]]; then
  echo "[deploy:staging-edge] ERROR: refusing non-staging project ref (${PROJECT_REF})." >&2
  exit 1
fi
if [[ "$PROJECT_REF" == *"$PROD_REF"* ]]; then
  echo "[deploy:staging-edge] ERROR: refusing production project ref." >&2
  exit 1
fi

if [[ ! -f "supabase/functions/${FUNCTION_NAME}/index.ts" ]]; then
  echo "[deploy:staging-edge] ERROR: missing supabase/functions/${FUNCTION_NAME}/index.ts" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "[deploy:staging-edge] ERROR: npx required." >&2
  exit 1
fi

echo "[deploy:staging-edge] Deploying ${FUNCTION_NAME} → project-ref=${PROJECT_REF}"
echo "[deploy:staging-edge] Source: ${ROOT_DIR}"
echo "[deploy:staging-edge] Commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"

# Explicit project-ref only — never rely on ambient link to production.
npx --yes supabase functions deploy "$FUNCTION_NAME" \
  --project-ref "$PROJECT_REF"

echo "[deploy:staging-edge] SUCCESS (verify with authenticated Ask Course smoke on staging)."
