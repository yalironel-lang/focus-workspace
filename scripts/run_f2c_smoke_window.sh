#!/usr/bin/env bash
# ZIKUK G2.85 — Gate F2C Operator Bounded Orchestration Script
#
# Strictly targets staging project: lmgrhmyurhjlwwdedojk
# STRICTLY FORBIDDEN: comxmviofnotfwzbupxg (Production)
#
# PURPOSE:
# Coordinates exactly ONE paid explain_selection smoke test on staging by:
# 1. Enforcing strict read-only preflight checks.
# 2. Pre-staging re-arm mechanisms before mutating remote state.
# 3. Bounding the disarmed window with a strict local timer (default: 15s).
# 4. Automatically initiating re-arm upon keypress, timeout, or catchable signals.
# 5. Falling back to an independent HTTPS curl recovery path if CLI fails.
# 6. Auditing control-plane vault restoration without issuing test inference.
#
# SAFETY LIMITATIONS:
# Local scripts CANNOT recover from:
#   - Immediate SIGKILL (kill -9) on the process.
#   - Sudden host power loss or kernel panic.
#   - Complete local network uplink loss while disarmed.
# The operator MUST maintain an independent out-of-band device on a separate
# network (e.g. mobile phone on cellular) logged into the Supabase Dashboard.
#
# USAGE:
#   Dry-run mode (safe, zero remote mutations):
#     bash scripts/run_f2c_smoke_window.sh --dry-run
#
#   Live mode (requires explicit opt-in and interactive confirmation):
#     ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 bash scripts/run_f2c_smoke_window.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Strict Configuration & Invariant Constants
# ---------------------------------------------------------------------------
readonly AUTHORIZED_STAGING_REF="lmgrhmyurhjlwwdedojk"
readonly FORBIDDEN_PROD_REF="comxmviofnotfwzbupxg"

# SHA-256 cryptographic digests of secret values in Supabase vault
readonly DIGEST_KILLSWITCH_TRUE="b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b"
readonly DIGEST_KILLSWITCH_FALSE="fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa"
readonly DIGEST_MODEL_GPT_4O_MINI="8a43428062692d369599bd00272fd529aa5949ba715361e20f54e63c444ccea1"

readonly LOCK_DIR="/tmp/zikuk_f2c_smoke_window_${AUTHORIZED_STAGING_REF}.lock"
readonly DEFAULT_WINDOW_SECONDS=15
readonly COMMAND_TIMEOUT_SECONDS="${ZIKUK_COMMAND_TIMEOUT_SECONDS:-30}"

# State tracking variables
DRY_RUN=0
DISARMED_STATE=0
REARM_IN_PROGRESS=0
REARM_COMPLETED=0
LOCK_ACQUIRED=0

# ---------------------------------------------------------------------------
# Argument Parsing & Option Flags
# ---------------------------------------------------------------------------
for arg in "$@"; do
  if [[ "$arg" == *"$FORBIDDEN_PROD_REF"* ]]; then
    echo "[SECURITY ERROR] Forbidden production reference detected in arguments. Halting." >&2
    exit 1
  fi
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      cat <<EOF
ZIKUK Gate F2C Operator Bounded Orchestration Script

Usage:
  bash scripts/run_f2c_smoke_window.sh [options]

Options:
  --dry-run       Simulate preflight, disarm, window timing, and re-arm without remote mutation.
  --help, -h      Display this documentation.

Environment Variables:
  ZIKUK_ALLOW_F2C_LIVE_SMOKE=1   Required to execute live remote mutations.
  ZIKUK_F2C_WINDOW_SECONDS=15    Interaction window duration in seconds (default: 15).
  SUPABASE_ACCESS_TOKEN          Required for secondary HTTPS recovery path.
EOF
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Strict Production Refusal & Environment Checks
# ---------------------------------------------------------------------------
for env_var in "${SUPABASE_PROJECT_REF:-}" "${SUPABASE_PROJECT_ID:-}" "${PROJECT_REF:-}" "${TARGET_PROJECT:-}"; do
  if [[ "$env_var" == *"$FORBIDDEN_PROD_REF"* ]]; then
    echo "[SECURITY ERROR] Shell environment references forbidden production ref (${FORBIDDEN_PROD_REF}). Aborting." >&2
    exit 1
  fi
done

TARGET_REF="${ZIKUK_TARGET_REF:-$AUTHORIZED_STAGING_REF}"
if [[ "$TARGET_REF" != "$AUTHORIZED_STAGING_REF" ]]; then
  echo "[SECURITY ERROR] Target ref '${TARGET_REF}' is not the authorized staging project '${AUTHORIZED_STAGING_REF}'." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Command Execution Helpers with Bounded Timeout
# ---------------------------------------------------------------------------
run_with_timeout() {
  local timeout_sec="$1"
  shift
  "$@" &
  local cmd_pid=$!

  # Background watcher to enforce timeout
  (
    local elapsed=0
    while kill -0 "$cmd_pid" 2>/dev/null; do
      if [[ $elapsed -ge $timeout_sec ]]; then
        kill -TERM "$cmd_pid" 2>/dev/null || true
        sleep 1
        kill -KILL "$cmd_pid" 2>/dev/null || true
        exit 0
      fi
      sleep 1
      elapsed=$((elapsed + 1))
    done
  ) &
  local watcher_pid=$!

  local exit_code=0
  wait "$cmd_pid" 2>/dev/null || exit_code=$?

  kill -KILL "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true

  return $exit_code
}

# ---------------------------------------------------------------------------
# Concurrency Lock Management
# ---------------------------------------------------------------------------
acquire_lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[SECURITY ERROR] Another instance of Gate F2C smoke script is currently running (lock: $LOCK_DIR)." >&2
    echo "If a previous run crashed, inspect staging state and manually remove $LOCK_DIR if safe." >&2
    exit 1
  fi
  LOCK_ACQUIRED=1
}

release_lock() {
  if [[ $LOCK_ACQUIRED -eq 1 ]]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
    LOCK_ACQUIRED=0
  fi
}

# ---------------------------------------------------------------------------
# Secondary Independent Recovery Path (HTTPS curl)
# ---------------------------------------------------------------------------
execute_secondary_recovery_curl() {
  echo ">>> [RECOVERY] Attempting Tier 2 direct HTTPS Management API re-arm..." >&2

  if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    echo "[RECOVERY ERROR] SUPABASE_ACCESS_TOKEN is not set in environment. Cannot execute Tier 2 curl." >&2
    return 1
  fi

  local http_code
  # Execute curl without printing tokens or logging headers
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "https://api.supabase.com/v1/projects/${AUTHORIZED_STAGING_REF}/secrets" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '[{"name":"AI_EMERGENCY_DISABLE","value":"true"}]' 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    echo ">>> [RECOVERY] Tier 2 curl succeeded (HTTP $http_code)." >&2
    return 0
  else
    echo "[RECOVERY ERROR] Tier 2 curl failed with HTTP code: $http_code" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Central Re-Arm Function (Re-Entrancy Guarded)
# ---------------------------------------------------------------------------
rearm_killswitch() {
  local signal_name="${1:-NORMAL}"

  # Re-entrancy guard
  if [[ $REARM_IN_PROGRESS -eq 1 ]]; then
    return 0
  fi
  REARM_IN_PROGRESS=1

  if [[ $DISARMED_STATE -eq 0 ]]; then
    # System was never disarmed; nothing to restore
    release_lock
    return 0
  fi

  if [[ $REARM_COMPLETED -eq 1 ]]; then
    release_lock
    return 0
  fi

  echo ""
  echo "======================================================================"
  echo ">>> [RE-ARM INITIATED] Restoring AI_EMERGENCY_DISABLE=true (${signal_name})..."
  echo "======================================================================"

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY-RUN] Simulated Tier 1 CLI re-arm."
    REARM_COMPLETED=1
    DISARMED_STATE=0
    release_lock
    return 0
  fi

  local tier1_success=0

  # Tier 1: Primary CLI re-arm with timeout
  echo ">>> [TIER 1] Executing Supabase CLI secrets set..."
  if run_with_timeout "$COMMAND_TIMEOUT_SECONDS" env SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}" \
      npx --no-install supabase secrets set \
      --remote="$AUTHORIZED_STAGING_REF" AI_EMERGENCY_DISABLE=true --yes; then
    tier1_success=1
    echo ">>> [TIER 1] CLI re-arm command reported success."
  else
    echo "[WARNING] Tier 1 CLI re-arm failed or timed out (${COMMAND_TIMEOUT_SECONDS}s)." >&2
  fi

  # Tier 2: Fallback if Tier 1 failed
  if [[ $tier1_success -eq 0 ]]; then
    if ! execute_secondary_recovery_curl; then
      echo "" >&2
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
      echo "CRITICAL UNRESOLVED SECURITY INCIDENT: BOTH TIER 1 AND TIER 2 RE-ARM FAILED!" >&2
      echo "Target project: ${AUTHORIZED_STAGING_REF}" >&2
      echo "IMMEDIATE ACTION REQUIRED:" >&2
      echo "1. Switch to secondary independent device / cellular browser." >&2
      echo "2. Navigate to: https://supabase.com/dashboard/project/${AUTHORIZED_STAGING_REF}/settings/functions" >&2
      echo "3. Set AI_EMERGENCY_DISABLE=true and click Save." >&2
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
      release_lock
      exit 99
    fi
  fi

  # Audit control-plane vault verification
  echo ">>> [AUDIT] Verifying vault digest for AI_EMERGENCY_DISABLE..."
  local secrets_output
  secrets_output=$(env SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}" \
    npx --no-install supabase secrets list --remote="$AUTHORIZED_STAGING_REF" 2>/dev/null || echo "")

  if [[ "$secrets_output" == *"$DIGEST_KILLSWITCH_TRUE"* ]]; then
    echo ">>> [VERIFIED] Control-plane vault confirmed restored to 'true'."
    echo ">>> [NOTE] Individual edge runtime worker isolates refresh asynchronously."
    REARM_COMPLETED=1
    DISARMED_STATE=0
  else
    echo "" >&2
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    echo "CRITICAL UNRESOLVED SECURITY INCIDENT: Vault digest mismatch after re-arm." >&2
    echo "Expected digest: ${DIGEST_KILLSWITCH_TRUE}" >&2
    echo "Check dashboard immediately: https://supabase.com/dashboard/project/${AUTHORIZED_STAGING_REF}/settings/functions" >&2
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    release_lock
    exit 99
  fi

  release_lock
}

# ---------------------------------------------------------------------------
# Signal Traps Setup
# ---------------------------------------------------------------------------
trap 'rearm_killswitch EXIT' EXIT
trap 'echo -e "\n[INTERRUPTED] SIGINT received." >&2; rearm_killswitch SIGINT; exit 130' INT
trap 'echo -e "\n[TERMINATED] SIGTERM received." >&2; rearm_killswitch SIGTERM; exit 143' TERM
trap 'echo -e "\n[HANGUP] SIGHUP received." >&2; rearm_killswitch SIGHUP; exit 129' HUP

# ---------------------------------------------------------------------------
# Main Execution Flow
# ---------------------------------------------------------------------------
main() {
  acquire_lock

  echo "======================================================================"
  echo " ZIKUK G2.85 — Gate F2C Operator Bounded Orchestration"
  echo " Target Project: ${AUTHORIZED_STAGING_REF} (focus-workspace-staging)"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo " Execution Mode: DRY-RUN (Zero Remote Mutations)"
  else
    echo " Execution Mode: LIVE EXECUTION"
  fi
  echo "======================================================================"
  echo "IMPORTANT SAFETY NOTICE:"
  echo "Local scripts cannot recover from SIGKILL (kill -9), sudden host power"
  echo "loss, or total network uplink loss. Ensure your secondary out-of-band"
  echo "device (cellular) is logged into the Supabase Dashboard before proceeding."
  echo "======================================================================"

  # 1. Preflight Validation
  echo ""
  echo "--- Phase 1: Preflight Verification ---"

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY-RUN] Simulating preflight verification..."
    echo "[DRY-RUN] Confirmed staging ref: ${AUTHORIZED_STAGING_REF}"
    echo "[DRY-RUN] Confirmed killswitch digest: ${DIGEST_KILLSWITCH_TRUE}"
    echo "[DRY-RUN] Confirmed model digest: ${DIGEST_MODEL_GPT_4O_MINI}"
    echo "[DRY-RUN] Confirmed 0 active reservations, 0 running recovery jobs."
  else
    # Live Preflight: requires explicit opt-in
    if [[ "${ZIKUK_ALLOW_F2C_LIVE_SMOKE:-}" != "1" ]]; then
      echo "[ABORT] Live execution refused. ZIKUK_ALLOW_F2C_LIVE_SMOKE=1 is required." >&2
      echo "Run with --dry-run to test locally without remote mutations." >&2
      exit 1
    fi

    # Fail closed on missing fallback credential (SUPABASE_ACCESS_TOKEN)
    if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
      echo "[PREFLIGHT ERROR] SUPABASE_ACCESS_TOKEN is required in the environment." >&2
      echo "It must be set to ensure the Tier 2 HTTPS fallback recovery path is functional" >&2
      echo "and to prevent interactive macOS Keychain prompts during background CLI execution." >&2
      exit 1
    fi

    echo "Auditing staging secrets metadata..."
    local live_secrets
    live_secrets=$(run_with_timeout "$COMMAND_TIMEOUT_SECONDS" env SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN}" \
      npx --no-install supabase secrets list \
      --remote="$AUTHORIZED_STAGING_REF" 2>/dev/null || echo "")

    if [[ -z "$live_secrets" ]]; then
      echo "[PREFLIGHT ERROR] Failed to query secrets from staging project." >&2
      exit 1
    fi

    # Fail closed on killswitch
    if [[ "$live_secrets" != *"$DIGEST_KILLSWITCH_TRUE"* ]]; then
      echo "[PREFLIGHT ERROR] Staging AI_EMERGENCY_DISABLE is not 'true' (digest mismatch). Aborting." >&2
      exit 1
    fi

    # Fail closed on model
    if [[ "$live_secrets" != *"$DIGEST_MODEL_GPT_4O_MINI"* ]]; then
      echo "[PREFLIGHT ERROR] Staging AI_MODEL is not 'gpt-4o-mini' (digest mismatch). Aborting." >&2
      exit 1
    fi

    # Fail closed on daily limits
    if [[ "$live_secrets" != *"AI_PROJECT_MAX_DAILY_REQUESTS"* ]] || [[ "$live_secrets" != *"AI_PROJECT_MAX_DAILY_TOKENS"* ]]; then
      echo "[PREFLIGHT ERROR] Project daily limits are missing from staging vault. Aborting." >&2
      exit 1
    fi

    echo "Auditing database reservations and recovery jobs..."
    local db_query_out
    db_query_out=$(run_with_timeout "$COMMAND_TIMEOUT_SECONDS" env SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN}" \
      npx --no-install supabase db query \
      --remote="$AUTHORIZED_STAGING_REF" "
SELECT 'reservations' AS t, status, count(*)::int AS c
FROM public.ai_project_usage_reservations GROUP BY status
UNION ALL
SELECT 'recovery_jobs' AS t, status, count(*)::int AS c
FROM public.ai_knowledge_page_recovery_jobs GROUP BY status;
" --yes 2>/dev/null || echo "")

    if [[ "$db_query_out" == *'"status": "pending"'* ]] || [[ "$db_query_out" == *'"status": "dispatched"'* ]]; then
      echo "[PREFLIGHT ERROR] Active reservations found in database. Aborting." >&2
      exit 1
    fi

    if [[ "$db_query_out" == *'"status": "running"'* ]]; then
      echo "[PREFLIGHT ERROR] Ingestion recovery jobs currently running. Aborting." >&2
      exit 1
    fi

    echo "[PREFLIGHT PASS] All staging invariants verified."

    # Explicit interactive confirmation required before remote mutation
    echo ""
    echo "Type 'CONFIRM_DISARM_STAGING' to proceed with temporary disarm, or anything else to abort:"
    read -r user_confirmation
    if [[ "$user_confirmation" != "CONFIRM_DISARM_STAGING" ]]; then
      echo "[ABORT] Operator did not confirm disarm. Halting with zero mutations."
      exit 1
    fi
  fi

  # 2. Disarm Phase
  echo ""
  echo "--- Phase 2: Opening Bounded Disarm Window ---"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY-RUN] Simulating AI_EMERGENCY_DISABLE=false mutation..."
    DISARMED_STATE=1
  else
    echo "Setting AI_EMERGENCY_DISABLE=false on staging..."
    if ! run_with_timeout "$COMMAND_TIMEOUT_SECONDS" env SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN}" \
        npx --no-install supabase secrets set \
        --remote="$AUTHORIZED_STAGING_REF" AI_EMERGENCY_DISABLE=false --yes; then
      echo "[ERROR] Failed to set AI_EMERGENCY_DISABLE=false. Halting before opening window." >&2
      exit 1
    fi
    DISARMED_STATE=1
    echo "Disarm mutation sent to control plane."
  fi

  # 3. Bounded Interaction Window
  local window_seconds="${ZIKUK_F2C_WINDOW_SECONDS:-$DEFAULT_WINDOW_SECONDS}"
  echo ""
  echo "======================================================================"
  echo ">>> [WINDOW OPEN - MAXIMUM ${window_seconds} SECONDS]"
  echo ">>> Switch to staging browser and click 'Explain' EXACTLY ONCE."
  echo ">>> Press [ENTER] in this terminal immediately once request is sent,"
  echo ">>> or wait for the automatic timeout (${window_seconds}s)."
  echo ">>> ZERO INFERENCE RETRIES PERMITTED."
  echo "======================================================================"

  local entered=""
  # Bounded user interaction
  read -t "$window_seconds" -p "Press [ENTER] to close window: " entered || true
  echo ""
  echo ">>> Window timer concluded or operator pressed Enter."

  # 4. Immediate Re-Arm (Triggered cleanly via rearm_killswitch)
  rearm_killswitch "NORMAL_COMPLETION"

  echo ""
  echo "======================================================================"
  echo " Gate F2C Operator Bounded Smoke Sequence Completed."
  echo " Proceed to read-only accounting verification."
  echo "======================================================================"
}

main "$@"
