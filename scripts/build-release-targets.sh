#!/usr/bin/env bash
# Local-only production vs staging Vite builds with fail-closed env + artifact checks.
# Does NOT deploy. Does NOT touch remote Vercel/Supabase.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROD_REF="comxmviofnotfwzbupxg"
STAGING_REF="lmgrhmyurhjlwwdedojk"
PROD_URL="https://${PROD_REF}.supabase.co"
STAGING_URL="https://${STAGING_REF}.supabase.co"

# Placeholder anon values for static embedding checks only — not real secrets.
# Override with real Preview/Production keys when preparing a remote deploy.
PROD_ANON_PLACEHOLDER="${ZIKUK_PROD_ANON_PLACEHOLDER:-sb_publishable_local_prod_verify_only}"
STAGING_ANON_PLACEHOLDER="${ZIKUK_STAGING_ANON_PLACEHOLDER:-sb_publishable_local_staging_verify_only}"

TARGET="${1:-both}"

usage() {
  cat <<EOF
Usage: bash scripts/build-release-targets.sh [production|staging|both]

Builds into dist-production / dist-staging with explicit env (ignores .env.local
for these targets by exporting VITE_* in the child environment).

Then runs scripts/verify-build-target.mjs.
EOF
}

if [[ "${TARGET}" == "--help" || "${TARGET}" == "-h" ]]; then
  usage
  exit 0
fi

build_one() {
  local mode="$1"
  local out_dir="$2"
  local url="$3"
  local anon="$4"
  local staging_flag="$5"

  echo "[build-release-targets] building mode=${mode} out=${out_dir}"
  rm -rf "$out_dir"

  # Fail-closed: refuse cross-wiring refs into the wrong mode.
  if [[ "$mode" == "production" ]]; then
    [[ "$url" == *"$PROD_REF"* ]] || { echo "STOP production URL must include ${PROD_REF}"; exit 1; }
    [[ "$url" != *"$STAGING_REF"* ]] || { echo "STOP production URL must not include staging ref"; exit 1; }
    [[ "$staging_flag" != "true" ]] || { echo "STOP production must not set VITE_STAGING_EMAIL_AUTH=true"; exit 1; }
  else
    [[ "$url" == *"$STAGING_REF"* ]] || { echo "STOP staging URL must include ${STAGING_REF}"; exit 1; }
    [[ "$url" != *"$PROD_REF"* ]] || { echo "STOP staging URL must not include production ref"; exit 1; }
    [[ "$staging_flag" == "true" ]] || { echo "STOP staging must set VITE_STAGING_EMAIL_AUTH=true"; exit 1; }
  fi

  # Explicit env wins over any .env.local (Vite precedence).
  export VITE_SUPABASE_URL="$url"
  export VITE_SUPABASE_ANON_KEY="$anon"
  export VITE_STAGING_EMAIL_AUTH="$staging_flag"
  npx tsc -p tsconfig.build.json
  npx vite build --outDir "$out_dir"

  node scripts/verify-build-target.mjs --target "$mode" --dist "$out_dir"
}

case "$TARGET" in
  production)
    build_one production dist-production "$PROD_URL" "$PROD_ANON_PLACEHOLDER" "false"
    ;;
  staging)
    build_one staging dist-staging "$STAGING_URL" "$STAGING_ANON_PLACEHOLDER" "true"
    ;;
  both)
    build_one production dist-production "$PROD_URL" "$PROD_ANON_PLACEHOLDER" "false"
    build_one staging dist-staging "$STAGING_URL" "$STAGING_ANON_PLACEHOLDER" "true"
    ;;
  *)
    usage
    exit 1
    ;;
esac

echo "[build-release-targets] SUCCESS target=${TARGET}"
