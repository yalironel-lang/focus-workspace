#!/usr/bin/env bash
# Local fail-closed checks for deploy-staging.sh — does NOT deploy.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SCRIPT="$ROOT_DIR/scripts/deploy-staging.sh"

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; exit 1; }

# Without opt-in → must exit non-zero
if ZIKUK_ALLOW_STAGING_DEPLOY= bash "$SCRIPT" >/tmp/zikuk-deploy-guard-out.txt 2>&1; then
  fail "deploy without ZIKUK_ALLOW_STAGING_DEPLOY=1 should fail"
else
  pass "refuses deploy without ZIKUK_ALLOW_STAGING_DEPLOY=1"
fi

# --prod refused even with opt-in (before network)
if ZIKUK_ALLOW_STAGING_DEPLOY=1 bash "$SCRIPT" --prod >/tmp/zikuk-deploy-guard-out.txt 2>&1; then
  fail "deploy --prod should fail"
else
  grep -q "refusing Production" /tmp/zikuk-deploy-guard-out.txt || fail "expected refusing Production message"
  pass "refuses --prod"
fi

# Production URL in shell refused
if VITE_SUPABASE_URL="https://comxmviofnotfwzbupxg.supabase.co" \
   ZIKUK_ALLOW_STAGING_DEPLOY=1 bash "$SCRIPT" >/tmp/zikuk-deploy-guard-out.txt 2>&1; then
  fail "production VITE_SUPABASE_URL should fail"
else
  grep -q "points at production" /tmp/zikuk-deploy-guard-out.txt || fail "expected production URL message"
  pass "refuses shell VITE_SUPABASE_URL with production ref"
fi

# Help works without opt-in
bash "$SCRIPT" --help >/tmp/zikuk-deploy-guard-out.txt 2>&1 || fail "help should succeed"
pass "help exits successfully"

# Static fail-closed contract: identity verification must ERROR (not WARN) on
# incomplete fetches, and SUCCESS must not be reachable without those checks.
if grep -n 'WARN: could not fetch staging alias HTML' "$SCRIPT" >/dev/null; then
  fail "identity HTML fetch failure must be ERROR, not WARN"
fi
if grep -n 'WARN: could not download index JS' "$SCRIPT" >/dev/null; then
  fail "identity JS download failure must be ERROR, not WARN"
fi
if grep -n 'WARN: could not parse index asset' "$SCRIPT" >/dev/null; then
  fail "identity asset parse failure must be ERROR, not WARN"
fi
grep -q 'for identity check' "$SCRIPT" \
  || fail "missing fail-closed HTML fetch error"
grep -q 'VERIFY_HOST' "$SCRIPT" \
  || fail "identity check must use VERIFY_HOST (deploy URL or updated alias)"
grep -q 'staging-magic-link-form' "$SCRIPT" \
  || fail "post-deploy check must require staging email UI marker"
grep -q 'Bundle identity check PASS' "$SCRIPT" \
  || fail "missing explicit identity PASS gate before SUCCESS"
# SUCCESS must appear after identity PASS in file order
PASS_LINE="$(grep -n 'Bundle identity check PASS' "$SCRIPT" | head -1 | cut -d: -f1)"
SUCCESS_LINE="$(grep -n '\[deploy:staging\] SUCCESS' "$SCRIPT" | head -1 | cut -d: -f1)"
if [[ -z "$PASS_LINE" || -z "$SUCCESS_LINE" || "$SUCCESS_LINE" -le "$PASS_LINE" ]]; then
  fail "SUCCESS must follow Bundle identity check PASS"
fi
# Must never invoke production deploy flag
if grep -E -- '--prod([[:space:]]|$)' "$SCRIPT" | grep -v 'refusing\|absent\|--production\|help\|Safety\|Does NOT' >/dev/null; then
  # Allow mentions in comments/help; forbid actual vercel --prod invocation
  if grep -E 'vercel[[:space:]].*--prod|--prod[[:space:]].*vercel' "$SCRIPT" >/dev/null; then
    fail "script must not invoke vercel with --prod"
  fi
fi
pass "fail-closed identity verification contract"

# Staging alias must not be a known production hostname
if grep -q 'STAGING_ALIAS="focus-workspace-one.vercel.app"' "$SCRIPT" \
  || grep -q 'STAGING_ALIAS="zikuk.com"' "$SCRIPT"; then
  fail "STAGING_ALIAS must not equal a production hostname"
fi
pass "staging alias is not a production hostname"

# Dedicated staging project pointer + production project refusal
META="$ROOT_DIR/.vercel-staging/project.json"
[[ -f "$META" ]] || fail "missing .vercel-staging/project.json"
grep -q 'prj_uBdZ12jILWA40tZUVWH92nFCKbkh' "$SCRIPT" || fail "script must know production project id"
grep -q 'refusing production project id' "$SCRIPT" || fail "missing production project refusal"
grep -q 'ZIKUK_UPDATE_STAGING_ALIAS' "$SCRIPT" || fail "alias update must be gated"
pass "dedicated staging project targeting contract"

# Without opt-in, still fails even with update flag
if ZIKUK_ALLOW_STAGING_DEPLOY= ZIKUK_UPDATE_STAGING_ALIAS=1 bash "$SCRIPT" >/tmp/zikuk-deploy-guard-out.txt 2>&1; then
  fail "alias update flag must not bypass deploy opt-in"
else
  pass "alias update flag does not bypass deploy opt-in"
fi

echo "ALL_DEPLOY_STAGING_GUARDS=PASS"
