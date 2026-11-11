#!/usr/bin/env bash
# ZIKUK G2.85 — Unit & Safety Guard Tests for run_f2c_smoke_window.sh
# Tests dry-run mode, argument validation, production refusal, and lock guards locally.
# Zero remote mutations. Zero network calls.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

TARGET_SCRIPT="scripts/run_f2c_smoke_window.sh"

PASSED_COUNT=0
TOTAL_COUNT=0

assert_true() {
  local desc="$1"
  shift
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if "$@"; then
    echo "  [PASS] $desc"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  [FAIL] $desc" >&2
    exit 1
  fi
}

assert_fails_with_output() {
  local desc="$1"
  local expected_err="$2"
  shift 2
  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  local out
  local exit_code=0
  out=$("$@" 2>&1) || exit_code=$?

  if [[ $exit_code -ne 0 ]] && [[ "$out" == *"$expected_err"* ]]; then
    echo "  [PASS] $desc (exit=$exit_code)"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  [FAIL] $desc (expected exit!=0 and match '$expected_err', got exit=$exit_code, out: $out)" >&2
    exit 1
  fi
}

echo "======================================================================"
echo " Running Unit & Safety Guard Tests for ${TARGET_SCRIPT}"
echo "======================================================================"

# Test 1: Help flag displays usage and exits 0
assert_true "Help flag returns 0" bash "$TARGET_SCRIPT" --help

# Test 2: Production ref in arguments is strictly refused
assert_fails_with_output "Rejects production ref in args" \
  "Forbidden production reference detected" \
  bash "$TARGET_SCRIPT" --project-ref comxmviofnotfwzbupxg

# Test 3: Production ref in SUPABASE_PROJECT_REF is strictly refused
assert_fails_with_output "Rejects production ref in SUPABASE_PROJECT_REF" \
  "Shell environment references forbidden production ref" \
  env SUPABASE_PROJECT_REF=comxmviofnotfwzbupxg bash "$TARGET_SCRIPT" --dry-run

# Test 4: Production ref in SUPABASE_PROJECT_ID is strictly refused
assert_fails_with_output "Rejects production ref in SUPABASE_PROJECT_ID" \
  "Shell environment references forbidden production ref" \
  env SUPABASE_PROJECT_ID=comxmviofnotfwzbupxg bash "$TARGET_SCRIPT" --dry-run

# Test 5: Non-staging project ref is strictly refused
assert_fails_with_output "Rejects non-staging project ref" \
  "is not the authorized staging project" \
  env ZIKUK_TARGET_REF=unauthorized_ref_12345 bash "$TARGET_SCRIPT" --dry-run

# Test 6: Live mode without ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 is rejected
assert_fails_with_output "Rejects live mode without opt-in env var" \
  "ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 is required" \
  bash "$TARGET_SCRIPT"

# Test 6b: Live mode without SUPABASE_ACCESS_TOKEN is rejected fail-closed
assert_fails_with_output "Rejects live mode when SUPABASE_ACCESS_TOKEN is unset" \
  "SUPABASE_ACCESS_TOKEN is required in the environment" \
  env ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 SUPABASE_ACCESS_TOKEN="" bash "$TARGET_SCRIPT"

# Test 7: Full dry-run mode completes with zero mutations
assert_true "Dry-run mode completes cleanly with 1-second window" \
  env ZIKUK_F2C_WINDOW_SECONDS=1 bash "$TARGET_SCRIPT" --dry-run

# Test 8: Concurrency lock prevents parallel execution
LOCK_FILE="/tmp/zikuk_f2c_smoke_window_lmgrhmyurhjlwwdedojk.lock"
rm -rf "$LOCK_FILE" 2>/dev/null || true
mkdir "$LOCK_FILE"

assert_fails_with_output "Rejects concurrent execution when lock exists" \
  "Another instance of Gate F2C smoke script is currently running" \
  bash "$TARGET_SCRIPT" --dry-run

rmdir "$LOCK_FILE" 2>/dev/null || true

# Test 9: Lock directory is cleanly removed after dry-run
env ZIKUK_F2C_WINDOW_SECONDS=1 bash "$TARGET_SCRIPT" --dry-run >/dev/null 2>&1
assert_true "Lock directory is removed on exit" test ! -d "$LOCK_FILE"

# Test 10: SIGINT interruption cleanly executes re-arm and removes lock
TOTAL_COUNT=$((TOTAL_COUNT + 1))
env ZIKUK_F2C_WINDOW_SECONDS=10 bash "$TARGET_SCRIPT" --dry-run >/dev/null 2>&1 &
BG_PID=$!
sleep 0.5
kill -INT "$BG_PID" 2>/dev/null || true
wait "$BG_PID" 2>/dev/null || true
if test ! -d "$LOCK_FILE"; then
  echo "  [PASS] SIGINT interruption cleanly removes lock"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo "  [FAIL] Lock remained after SIGINT interruption" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Local Mock Tests for Re-Arm Failure Paths & Secondary Recovery
# ---------------------------------------------------------------------------
MOCK_DIR="$(mktemp -d /tmp/zikuk_f2c_test_mocks_XXXXXX)"
MOCK_CURL_LOG="/tmp/zikuk_mock_curl_calls.log"
rm -f "$MOCK_CURL_LOG"

cat <<'EOF' > "$MOCK_DIR/npx"
#!/usr/bin/env bash
args="$*"

if [[ "$args" == *"secrets list"* ]]; then
  echo '{"secrets":[{"name":"AI_EMERGENCY_DISABLE","value":"b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b"},{"name":"AI_MODEL","value":"8a43428062692d369599bd00272fd529aa5949ba715361e20f54e63c444ccea1"},{"name":"AI_PROJECT_MAX_DAILY_REQUESTS","value":"1a6562590e"},{"name":"AI_PROJECT_MAX_DAILY_TOKENS","value":"6ce3189696"}]}'
  exit 0
fi

if [[ "$args" == *"db query"* ]]; then
  echo '{"rows":[{"count":10,"status":"settled","t":"reservations"},{"count":4,"status":"succeeded","t":"recovery_jobs"}]}'
  exit 0
fi

if [[ "$args" == *"secrets set"*"AI_EMERGENCY_DISABLE=false"* ]]; then
  exit 0
fi

if [[ "$args" == *"secrets set"*"AI_EMERGENCY_DISABLE=true"* ]]; then
  if [[ "${TEST_NPX_REARM_BEHAVIOR:-success}" == "fail" ]]; then
    exit 1
  elif [[ "${TEST_NPX_REARM_BEHAVIOR:-success}" == "timeout" ]]; then
    sleep 10
    exit 0
  else
    exit 0
  fi
fi

exit 0
EOF
chmod +x "$MOCK_DIR/npx"

cat <<'EOF' > "$MOCK_DIR/curl"
#!/usr/bin/env bash
echo "$@" >> /tmp/zikuk_mock_curl_calls.log

if [[ "${TEST_CURL_REARM_BEHAVIOR:-success}" == "fail" ]]; then
  echo "500"
  exit 1
else
  echo "200"
  exit 0
fi
EOF
chmod +x "$MOCK_DIR/curl"

# Test 11: Primary CLI Failure falls back to Tier 2 HTTPS recovery
TOTAL_COUNT=$((TOTAL_COUNT + 1))
rm -f "$MOCK_CURL_LOG"
t11_out=$(echo "CONFIRM_DISARM_STAGING" | env PATH="$MOCK_DIR:$PATH" \
  TEST_NPX_REARM_BEHAVIOR="fail" \
  TEST_CURL_REARM_BEHAVIOR="success" \
  ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 \
  ZIKUK_F2C_WINDOW_SECONDS=1 \
  SUPABASE_ACCESS_TOKEN="mock_canary_token_123" \
  bash "$TARGET_SCRIPT" 2>&1) || t11_ec=$?

if [[ "${t11_ec:-0}" -eq 0 ]] && [[ "$t11_out" == *"Tier 1 CLI re-arm failed"* ]] && [[ "$t11_out" == *"Tier 2 curl succeeded"* ]]; then
  echo "  [PASS] CLI failure triggers Tier 2 HTTPS fallback successfully"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo "  [FAIL] CLI failure fallback failed (out: $t11_out)" >&2
  exit 1
fi

# Test 12: Primary CLI Timeout falls back to Tier 2 HTTPS recovery
TOTAL_COUNT=$((TOTAL_COUNT + 1))
rm -f "$MOCK_CURL_LOG"
t12_out=$(echo "CONFIRM_DISARM_STAGING" | env PATH="$MOCK_DIR:$PATH" \
  TEST_NPX_REARM_BEHAVIOR="timeout" \
  TEST_CURL_REARM_BEHAVIOR="success" \
  ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 \
  ZIKUK_F2C_WINDOW_SECONDS=1 \
  ZIKUK_COMMAND_TIMEOUT_SECONDS=1 \
  SUPABASE_ACCESS_TOKEN="mock_canary_token_123" \
  bash "$TARGET_SCRIPT" 2>&1) || t12_ec=$?

if [[ "${t12_ec:-0}" -eq 0 ]] && [[ "$t12_out" == *"timed out (1s)"* ]] && [[ "$t12_out" == *"Tier 2 curl succeeded"* ]]; then
  echo "  [PASS] CLI timeout triggers Tier 2 HTTPS fallback successfully"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo "  [FAIL] CLI timeout fallback failed (out: $t12_out)" >&2
  exit 1
fi

# Test 13: Both Tier 1 and Tier 2 Fail triggers critical incident (exit 99)
TOTAL_COUNT=$((TOTAL_COUNT + 1))
t13_ec=0
t13_out=$(echo "CONFIRM_DISARM_STAGING" | env PATH="$MOCK_DIR:$PATH" \
  TEST_NPX_REARM_BEHAVIOR="fail" \
  TEST_CURL_REARM_BEHAVIOR="fail" \
  ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 \
  ZIKUK_F2C_WINDOW_SECONDS=1 \
  SUPABASE_ACCESS_TOKEN="mock_canary_token_123" \
  bash "$TARGET_SCRIPT" 2>&1) || t13_ec=$?

if [[ "$t13_ec" -eq 99 ]] && [[ "$t13_out" == *"CRITICAL UNRESOLVED SECURITY INCIDENT: BOTH TIER 1 AND TIER 2 RE-ARM FAILED"* ]]; then
  echo "  [PASS] Dual re-arm failure triggers incident escalation (exit 99)"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo "  [FAIL] Dual re-arm failure did not escalate to exit 99 (ec=$t13_ec, out: $t13_out)" >&2
  exit 1
fi

# Test 14: Fallback command targets staging only and never exposes token to output
TOTAL_COUNT=$((TOTAL_COUNT + 1))
CANARY_TOKEN="SUPER_SECRET_CANARY_JWT_DO_NOT_LEAK_999"
t14_out=$(echo "CONFIRM_DISARM_STAGING" | env PATH="$MOCK_DIR:$PATH" \
  TEST_NPX_REARM_BEHAVIOR="fail" \
  TEST_CURL_REARM_BEHAVIOR="success" \
  ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 \
  ZIKUK_F2C_WINDOW_SECONDS=1 \
  SUPABASE_ACCESS_TOKEN="$CANARY_TOKEN" \
  bash "$TARGET_SCRIPT" 2>&1) || true

curl_log_content=$(cat "$MOCK_CURL_LOG" 2>/dev/null || echo "")

if [[ "$curl_log_content" == *"https://api.supabase.com/v1/projects/lmgrhmyurhjlwwdedojk/secrets"* ]] \
   && [[ "$curl_log_content" != *"comxmviofnotfwzbupxg"* ]] \
   && [[ "$t14_out" != *"$CANARY_TOKEN"* ]]; then
  echo "  [PASS] Fallback targets staging only and never exposes token in output"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo "  [FAIL] Credential or target URL invariant violated in fallback" >&2
  exit 1
fi

# Clean up mock directory
rm -rf "$MOCK_DIR" "$MOCK_CURL_LOG" 2>/dev/null || true

echo ""
echo "======================================================================"
echo " Test Results: $PASSED_COUNT / $TOTAL_COUNT passed successfully."
echo "======================================================================"
