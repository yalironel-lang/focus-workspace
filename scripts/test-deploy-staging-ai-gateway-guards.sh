#!/usr/bin/env bash
# Local fail-closed checks for deploy-staging-ai-gateway.sh — does NOT deploy.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SCRIPT="$ROOT_DIR/scripts/deploy-staging-ai-gateway.sh"

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; exit 1; }

chmod +x "$SCRIPT" 2>/dev/null || true

if ZIKUK_ALLOW_STAGING_EDGE_DEPLOY= bash "$SCRIPT" >/tmp/zikuk-edge-guard-out.txt 2>&1; then
  fail "deploy without opt-in should fail"
else
  pass "refuses deploy without ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1"
fi

if ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1 ZIKUK_STAGING_SUPABASE_REF=comxmviofnotfwzbupxg \
  bash "$SCRIPT" >/tmp/zikuk-edge-guard-out.txt 2>&1; then
  fail "production project ref should fail"
else
  grep -q "refusing" /tmp/zikuk-edge-guard-out.txt || fail "expected refusing message"
  pass "refuses production project ref override"
fi

if ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1 SUPABASE_PROJECT_REF=comxmviofnotfwzbupxg \
  bash "$SCRIPT" >/tmp/zikuk-edge-guard-out.txt 2>&1; then
  fail "shell production SUPABASE_PROJECT_REF should fail"
else
  pass "refuses shell production SUPABASE_PROJECT_REF"
fi

bash "$SCRIPT" --help >/tmp/zikuk-edge-guard-out.txt 2>&1 || fail "help should succeed"
pass "help exits successfully"

grep -q 'lmgrhmyurhjlwwdedojk' "$SCRIPT" || fail "script must pin staging ref"
grep -q 'comxmviofnotfwzbupxg' "$SCRIPT" || fail "script must know production ref to refuse"
pass "staging/production refs encoded"

echo "ALL_STAGING_EDGE_DEPLOY_GUARDS=PASS"
