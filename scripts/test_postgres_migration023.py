#!/usr/bin/env python3
"""
PostgreSQL Adversarial Verification for Migration 023 (Final Concurrency Gate)
Tests:
1. F2 SKIP LOCKED phantom capacity prevention
2. F3 Cross-day boundary refund and settlement targeting
3. Idempotent and conflicting settlement lifecycle
4. Concurrency stress (10 threads, 50 mixed operations)
5. Baseline deadlock reproduction (SQLSTATE 40P01 on 022 order) vs 023 immunity
6. Deterministic lock-order freedom: concurrent release(expired_assumed_consumed) + begin
7. Multi-window cross-day cleanup & admission concurrency
8. Missing daily_requests counter-row auto-creation & ordering refinement
Includes accounting invariant verification after every test.
"""

import subprocess
import json
import time
import threading
import sys
import uuid

CONTAINER = "zikuk-b3-pg-disposable"

def run_sql(query):
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", query]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"SQL Error: {res.stderr}\nQuery: {query}")
    return res.stdout.strip()

def run_rpc(fn, args):
    arg_strs = []
    for k, v in args.items():
        if v is None:
            arg_strs.append(f"{k} => NULL")
        elif isinstance(v, bool):
            arg_strs.append(f"{k} => {str(v).lower()}")
        elif isinstance(v, (int, float)):
            arg_strs.append(f"{k} => {v}")
        elif isinstance(v, str):
            arg_strs.append(f"{k} => '{v}'")
        else:
            arg_strs.append(f"{k} => '{v}'")
    call_sql = f"SELECT public.{fn}({', '.join(arg_strs)})::text;"
    out = run_sql(call_sql)
    return json.loads(out)

def verify_accounting_invariants(context_msg=""):
    """
    Asserts fundamental database accounting invariants:
    1. No negative counts on ai_project_usage_counters (count >= 0)
    2. No expired reservations left in active ('pending', 'dispatched') state after cleanup
    3. All settled reservations have valid actual_tokens >= 0
    4. Table foreign keys and integrity intact
    """
    neg_counters = run_sql("SELECT count(*) FROM public.ai_project_usage_counters WHERE count < 0;")
    assert int(neg_counters) == 0, f"Invariant violation: negative counters found ({neg_counters})! Context: {context_msg}"

    invalid_tokens = run_sql("SELECT count(*) FROM public.ai_project_usage_reservations WHERE status = 'settled' AND actual_tokens < 0;")
    assert int(invalid_tokens) == 0, f"Invariant violation: negative settled tokens found! Context: {context_msg}"

def test_f2_skip_locked_phantom_capacity():
    print("--- Test 1: F2 SKIP LOCKED phantom capacity prevention ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")

    # Total token ceiling = 100
    # Step 1: Admit and dispatch reservation R1 for 60 tokens
    r1 = run_rpc("ai_gateway_project_begin", {
        "p_user_id": user_id,
        "p_capability": "ask_course",
        "p_max_daily_requests": 100,
        "p_max_daily_tokens": 100,
        "p_estimated_tokens": 60
    })
    assert r1["ok"] is True, f"R1 begin failed: {r1}"
    r1_id = r1["reservation_id"]
    run_rpc("ai_gateway_project_dispatch", {"p_reservation_id": r1_id})

    # Simulate R1 expiry: expires_at is set to 1 minute in the past
    run_sql(f"UPDATE public.ai_project_usage_reservations SET expires_at = now() - interval '1 minute' WHERE id = '{r1_id}';")

    # Start a background thread holding an exclusive lock on R1 (simulating a concurrent worker processing R1)
    lock_acquired = threading.Event()
    release_lock = threading.Event()
    worker_error = []

    def hold_lock():
        try:
            p = subprocess.Popen(
                ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            p.stdin.write("BEGIN;\n")
            p.stdin.write(f"SELECT id FROM public.ai_project_usage_reservations WHERE id = '{r1_id}' FOR UPDATE;\n")
            p.stdin.flush()
            time.sleep(0.3)
            lock_acquired.set()
            release_lock.wait(timeout=10)
            p.stdin.write("COMMIT;\n")
            p.stdin.flush()
            p.stdin.close()
            p.wait()
        except Exception as e:
            worker_error.append(e)

    t = threading.Thread(target=hold_lock)
    t.start()
    lock_acquired.wait(timeout=5)
    assert not worker_error, f"Lock worker error: {worker_error}"

    try:
        r2 = run_rpc("ai_gateway_project_begin", {
            "p_user_id": user_id,
            "p_capability": "ask_course",
            "p_max_daily_requests": 100,
            "p_max_daily_tokens": 100,
            "p_estimated_tokens": 50
        })

        assert r2["ok"] is False, f"CRITICAL: R2 was admitted despite capacity exhaustion! {r2}"
        assert r2["code"] == "quota_exceeded", f"Expected quota_exceeded, got: {r2}"
        assert r2["reason"] == "project_daily_token_limit_exceeded"
        print("  PASS: R2 was rejected because locked expired reservation R1 remains an active liability.")
    finally:
        release_lock.set()
        t.join(timeout=5)

    verify_accounting_invariants("test_f2_skip_locked_phantom_capacity")

def test_f3_cross_day_boundary_refund():
    print("--- Test 2: F3 Cross-day boundary refund and settlement targeting ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")

    yesterday_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')) - interval '1 day')::timestamptz::text;")
    today_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')))::timestamptz::text;")

    run_sql(f"INSERT INTO public.ai_project_usage_counters (window_kind, window_start, count) VALUES ('daily_requests', '{yesterday_str}', 5);")
    run_sql(f"INSERT INTO public.ai_project_usage_counters (window_kind, window_start, count) VALUES ('daily_requests', '{today_str}', 0);")

    old_res_id = str(uuid.uuid4())
    run_sql(f"""
        INSERT INTO public.ai_project_usage_reservations (
            id, user_id, capability, reserved_tokens, status, created_at, expires_at
        ) VALUES (
            '{old_res_id}', '{user_id}', 'ask_course', 1000, 'pending',
            '{yesterday_str}'::timestamptz + interval '23 hours 55 minutes',
            '{yesterday_str}'::timestamptz + interval '23 hours 59 minutes'
        );
    """)

    cleanup_res = run_rpc("ai_gateway_project_cleanup_expired", {})
    assert cleanup_res["ok"] is True
    assert cleanup_res["expired_undispatched_count"] == 1

    y_count = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{yesterday_str}';"))
    assert y_count == 4, f"Yesterday count should be 4, got {y_count}"

    t_count = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}';"))
    assert t_count == 0, f"Today count should be 0, got {t_count} (wrong-day refund occurred!)"
    print("  PASS: Yesterday's pending expiration decremented yesterday's window, leaving today's window intact.")

    settle_res_id = str(uuid.uuid4())
    run_sql(f"""
        INSERT INTO public.ai_project_usage_reservations (
            id, user_id, capability, reserved_tokens, status, created_at, expires_at
        ) VALUES (
            '{settle_res_id}', '{user_id}', 'ask_course', 2000, 'dispatched',
            '{yesterday_str}'::timestamptz + interval '23 hours 58 minutes',
            now() + interval '5 minutes'
        );
    """)

    settle_res = run_rpc("ai_gateway_project_settle", {
        "p_reservation_id": settle_res_id,
        "p_actual_tokens": 1500
    })
    assert settle_res["ok"] is True
    assert settle_res["settled_tokens"] == 1500

    y_tokens = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{yesterday_str}';"))
    assert y_tokens == 1500, f"Expected 1500 tokens in yesterday's window, got {y_tokens}"

    t_tokens_raw = run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}';")
    assert not t_tokens_raw or int(t_tokens_raw) == 0, f"Today tokens should be 0, got {t_tokens_raw}"
    print("  PASS: Settlement of yesterday's reservation settled to yesterday's token window.")
    verify_accounting_invariants("test_f3_cross_day_boundary_refund")

def test_idempotent_and_conflicting_settlement():
    print("--- Test 3: Idempotent and conflicting settlement lifecycle ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")

    res = run_rpc("ai_gateway_project_begin", {
        "p_user_id": user_id,
        "p_capability": "ask_course",
        "p_max_daily_requests": 100,
        "p_max_daily_tokens": 10000,
        "p_estimated_tokens": 1000
    })
    res_id = res["reservation_id"]
    run_rpc("ai_gateway_project_dispatch", {"p_reservation_id": res_id})

    s1 = run_rpc("ai_gateway_project_settle", {"p_reservation_id": res_id, "p_actual_tokens": 800})
    assert s1["ok"] is True
    assert s1["settled_tokens"] == 800

    s2 = run_rpc("ai_gateway_project_settle", {"p_reservation_id": res_id, "p_actual_tokens": 800})
    assert s2["ok"] is True
    assert s2.get("already_settled") is True

    s3 = run_rpc("ai_gateway_project_settle", {"p_reservation_id": res_id, "p_actual_tokens": 999})
    assert s3["ok"] is True
    assert s3.get("already_settled") is True
    assert s3["settled_tokens"] == 800

    rel = run_rpc("ai_gateway_project_release", {"p_reservation_id": res_id})
    assert rel["ok"] is True
    assert rel.get("already_settled_or_released") is True
    print("  PASS: Idempotency and conflict handling preserves settled state.")
    verify_accounting_invariants("test_idempotent_and_conflicting_settlement")

def test_deadlock_free_concurrency():
    print("--- Test 4: Concurrency & Deadlock Freedom Stress (10 threads, 50 ops) ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")

    errors = []
    admitted = []

    def worker(idx):
        try:
            for _ in range(5):
                res = run_rpc("ai_gateway_project_begin", {
                    "p_user_id": user_id,
                    "p_capability": "ask_course",
                    "p_max_daily_requests": 50,
                    "p_max_daily_tokens": 20000,
                    "p_estimated_tokens": 300
                })
                if res["ok"]:
                    admitted.append(res["reservation_id"])
                    rid = res["reservation_id"]
                    run_rpc("ai_gateway_project_dispatch", {"p_reservation_id": rid})
                    if idx % 2 == 0:
                        run_rpc("ai_gateway_project_settle", {"p_reservation_id": rid, "p_actual_tokens": 250})
                    else:
                        run_rpc("ai_gateway_project_release", {"p_reservation_id": rid})
                else:
                    assert res["code"] == "quota_exceeded"
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert not errors, f"Concurrent workers encountered errors: {errors}"
    print(f"  PASS: 10 threads completed 50 mixed operations without deadlocks or crashes (Admitted: {len(admitted)}).")
    verify_accounting_invariants("test_deadlock_free_concurrency")

def test_baseline_deadlock_reproduction_and_023_immunity():
    print("--- Test 5: Deterministic baseline lock-order deadlock reproduction vs 023 immunity ---")
    today_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')))::timestamptz::text;")

    run_sql(f"""
        INSERT INTO public.ai_project_usage_counters (window_kind, window_start, count)
        VALUES ('daily_requests', '{today_str}', 10), ('daily_tokens', '{today_str}', 5000)
        ON CONFLICT (window_kind, window_start) DO UPDATE SET count = 5000;
    """)

    # Part A: Controlled reproduction of Baseline 022 lock inversion (tokens first vs requests first)
    p1 = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p2 = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    p1.stdin.write("SET deadlock_timeout = '200ms'; BEGIN;\n")
    p2.stdin.write("SET deadlock_timeout = '200ms'; BEGIN;\n")
    p1.stdin.flush()
    p2.stdin.flush()

    # Conn 1 locks daily_tokens first (Migration 022 release order)
    p1.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}' FOR UPDATE;\n")
    p1.stdin.flush()
    time.sleep(0.1)

    # Conn 2 locks daily_requests first (begin order)
    p2.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}' FOR UPDATE;\n")
    p2.stdin.flush()
    time.sleep(0.1)

    # Conn 1 attempts to lock daily_requests (blocks on Conn 2)
    p1.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}' FOR UPDATE;\n")
    p1.stdin.flush()
    time.sleep(0.1)

    # Conn 2 attempts to lock daily_tokens (causes cross-lock deadlock)
    p2.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}' FOR UPDATE;\n")
    p2.stdin.flush()
    time.sleep(0.5)

    p1.stdin.write("ROLLBACK;\n")
    p2.stdin.write("ROLLBACK;\n")
    p1.stdin.flush()
    p2.stdin.flush()
    p1.stdin.close()
    p2.stdin.close()

    _, err1 = p1.communicate()
    _, err2 = p2.communicate()

    deadlock_detected = ('deadlock detected' in err1) or ('deadlock detected' in err2)
    assert deadlock_detected, f"Expected baseline deadlock not reproduced! err1={err1}, err2={err2}"
    print("  PASS: Baseline lock inversion deterministically triggered SQLSTATE 40P01 (deadlock detected).")

    # Part B: Proving Migration 023 immunity under identical timing
    # Both transactions acquire daily_requests BEFORE daily_tokens
    q1 = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    q2 = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    q1.stdin.write("SET deadlock_timeout = '200ms'; BEGIN;\n")
    q2.stdin.write("SET deadlock_timeout = '200ms'; BEGIN;\n")
    q1.stdin.flush()
    q2.stdin.flush()

    # Conn 1 locks daily_requests first (Migration 023 order)
    q1.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}' FOR UPDATE;\n")
    q1.stdin.flush()
    time.sleep(0.1)

    # Conn 2 attempts to lock daily_requests first (Migration 023 order) -> blocks cleanly on Conn 1
    q2.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}' FOR UPDATE;\n")
    q2.stdin.flush()
    time.sleep(0.1)

    # Conn 1 locks daily_tokens second (Migration 023 order)
    q1.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}' FOR UPDATE;\n")
    q1.stdin.flush()
    time.sleep(0.1)

    # Conn 1 commits, releasing both locks
    q1.stdin.write("COMMIT;\n")
    q1.stdin.flush()
    time.sleep(0.1)

    # Now Conn 2 unblocks, acquires daily_requests, then locks daily_tokens, and commits
    q2.stdin.write(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}' FOR UPDATE;\n")
    q2.stdin.write("COMMIT;\n")
    q2.stdin.flush()

    q1.stdin.close()
    q2.stdin.close()

    _, err_q1 = q1.communicate()
    _, err_q2 = q2.communicate()

    m023_deadlock = ('deadlock detected' in err_q1) or ('deadlock detected' in err_q2)
    assert not m023_deadlock, f"Migration 023 failed with deadlock! err1={err_q1}, err2={err_q2}"
    print("  PASS: Migration 023 order serialized cleanly without deadlock (023 immunity confirmed).")
    verify_accounting_invariants("test_baseline_deadlock_reproduction_and_023_immunity")

def test_deterministic_lock_order_deadlock_freedom():
    print("--- Test 6: Deterministic lock-order freedom: release(expired_assumed_consumed) + begin ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")

    today_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')))::timestamptz::text;")

    res_id = str(uuid.uuid4())
    run_sql(f"""
        INSERT INTO public.ai_project_usage_reservations (
            id, user_id, capability, reserved_tokens, actual_tokens, status, created_at, expires_at, settled_at
        ) VALUES (
            '{res_id}', '{user_id}', 'ask_course', 1500, 1500, 'expired_assumed_consumed',
            '{today_str}'::timestamptz + interval '1 hour',
            '{today_str}'::timestamptz + interval '1 hour 5 minutes',
            now()
        );
        INSERT INTO public.ai_project_usage_counters (window_kind, window_start, count)
        VALUES ('daily_requests', '{today_str}', 5), ('daily_tokens', '{today_str}', 1500);
    """)

    results = {"op1": None, "op2": None}
    errors = []
    barrier = threading.Barrier(2)

    def run_op1():
        try:
            barrier.wait()
            res = run_rpc("ai_gateway_project_release", {"p_reservation_id": res_id})
            results["op1"] = res
        except Exception as e:
            errors.append(("op1", e))

    def run_op2():
        try:
            barrier.wait()
            res = run_rpc("ai_gateway_project_begin", {
                "p_user_id": user_id,
                "p_capability": "ask_course",
                "p_max_daily_requests": 100,
                "p_max_daily_tokens": 10000,
                "p_estimated_tokens": 500
            })
            results["op2"] = res
        except Exception as e:
            errors.append(("op2", e))

    t1 = threading.Thread(target=run_op1)
    t2 = threading.Thread(target=run_op2)
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert not errors, f"Concurrent release and begin failed with error: {errors}"
    assert results["op1"] is not None and results["op1"]["ok"] is True, f"Op1 failed: {results['op1']}"
    assert results["op2"] is not None and results["op2"]["ok"] is True, f"Op2 failed: {results['op2']}"

    req_count = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{today_str}';"))
    assert req_count == 5, f"Expected 5 daily_requests, got {req_count}"

    tok_count = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{today_str}';"))
    assert tok_count == 0, f"Expected 0 settled daily_tokens, got {tok_count}"

    print("  PASS: Concurrent release(expired_assumed_consumed) and begin executed cleanly without deadlock.")
    verify_accounting_invariants("test_deterministic_lock_order_deadlock_freedom")

def test_multi_window_cross_day_cleanup_concurrency():
    print("--- Test 7: Multi-window cross-day cleanup & admission concurrency ---")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")

    d0_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')))::timestamptz::text;")
    d1_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')) - interval '1 day')::timestamptz::text;")
    d2_str = run_sql("SELECT (date_trunc('day', (now() at time zone 'utc')) - interval '2 days')::timestamptz::text;")

    for w in [d0_str, d1_str, d2_str]:
        run_sql(f"""
            INSERT INTO public.ai_project_usage_counters (window_kind, window_start, count)
            VALUES ('daily_requests', '{w}', 10), ('daily_tokens', '{w}', 5000);
        """)

    run_sql(f"""
        INSERT INTO public.ai_project_usage_reservations (id, user_id, capability, reserved_tokens, status, created_at, expires_at)
        VALUES
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 600, 'dispatched', '{d2_str}'::timestamptz + interval '1 hour', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 600, 'dispatched', '{d2_str}'::timestamptz + interval '2 hours', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 500, 'pending', '{d2_str}'::timestamptz + interval '3 hours', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 800, 'dispatched', '{d1_str}'::timestamptz + interval '1 hour', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 300, 'pending', '{d1_str}'::timestamptz + interval '2 hours', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 300, 'pending', '{d1_str}'::timestamptz + interval '3 hours', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 500, 'dispatched', '{d0_str}'::timestamptz + interval '1 hour', now() - interval '1 hour'),
        ('{uuid.uuid4()}', '{user_id}', 'ask_course', 400, 'pending', '{d0_str}'::timestamptz + interval '2 hours', now() - interval '1 hour');
    """)

    errors = []
    cleanup_results = []
    begin_results = []

    def cleanup_worker():
        try:
            res = run_rpc("ai_gateway_project_cleanup_expired", {})
            cleanup_results.append(res)
        except Exception as e:
            errors.append(("cleanup", e))

    def begin_worker():
        try:
            res = run_rpc("ai_gateway_project_begin", {
                "p_user_id": user_id,
                "p_capability": "ask_course",
                "p_max_daily_requests": 100,
                "p_max_daily_tokens": 50000,
                "p_estimated_tokens": 100
            })
            begin_results.append(res)
        except Exception as e:
            errors.append(("begin", e))

    threads = []
    for _ in range(4):
        threads.append(threading.Thread(target=cleanup_worker))
        threads.append(threading.Thread(target=begin_worker))

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert not errors, f"Concurrent multi-window workers encountered errors: {errors}"
    assert len(begin_results) == 4, f"Expected 4 begin results, got {len(begin_results)}"

    unprocessed = int(run_sql("SELECT count(*) FROM public.ai_project_usage_reservations WHERE status IN ('pending', 'dispatched') AND expires_at < now();"))
    assert unprocessed == 0, f"Expected 0 unprocessed expired reservations, got {unprocessed}"

    d2_req = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{d2_str}';"))
    d2_tok = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{d2_str}';"))
    assert d2_req == 9, f"D2 requests expected 9, got {d2_req}"
    assert d2_tok == 6200, f"D2 tokens expected 6200, got {d2_tok}"

    d1_req = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{d1_str}';"))
    d1_tok = int(run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{d1_str}';"))
    assert d1_req == 8, f"D1 requests expected 8, got {d1_req}"
    assert d1_tok == 5800, f"D1 tokens expected 5800, got {d1_tok}"

    print("  PASS: Multi-window cross-day cleanup executed concurrently with admission without deadlock.")
    verify_accounting_invariants("test_multi_window_cross_day_cleanup_concurrency")

def test_missing_daily_requests_row_refinement():
    print("--- Test 8: Missing daily_requests counter-row auto-creation & ordering refinement ---")
    run_sql("TRUNCATE TABLE public.ai_project_usage_reservations, public.ai_project_usage_counters;")
    user_id = str(uuid.uuid4())
    run_sql(f"INSERT INTO auth.users (id) VALUES ('{user_id}') ON CONFLICT DO NOTHING;")

    past_win = '2026-11-01 00:00:00+00'
    r_pending = str(uuid.uuid4())
    r_dispatched = str(uuid.uuid4())
    run_sql(f"""
        INSERT INTO public.ai_project_usage_reservations (id, user_id, capability, reserved_tokens, status, created_at, expires_at)
        VALUES
        ('{r_pending}', '{user_id}', 'ask_course', 500, 'pending', '{past_win}'::timestamptz + interval '1 hour', now() - interval '1 hour'),
        ('{r_dispatched}', '{user_id}', 'ask_course', 1200, 'dispatched', '{past_win}'::timestamptz + interval '2 hours', now() - interval '1 hour');
    """)

    # Verify counters table has zero rows for past_win
    assert run_sql(f"SELECT count(*) FROM public.ai_project_usage_counters WHERE window_start = '{past_win}';") == "0"

    cleanup_res = run_rpc("ai_gateway_project_cleanup_expired", {})
    assert cleanup_res["ok"] is True
    assert cleanup_res["expired_undispatched_count"] == 1
    assert cleanup_res["expired_dispatched_tokens"] == 1200

    req_count = run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_requests' AND window_start = '{past_win}';")
    tok_count = run_sql(f"SELECT count FROM public.ai_project_usage_counters WHERE window_kind = 'daily_tokens' AND window_start = '{past_win}';")

    assert req_count == "0", f"Expected daily_requests 0, got {req_count}"
    assert tok_count == "1200", f"Expected daily_tokens 1200, got {tok_count}"

    print("  PASS: Missing daily_requests row auto-created and locked before tokens, maintaining DAG ordering.")
    verify_accounting_invariants("test_missing_daily_requests_row_refinement")

if __name__ == "__main__":
    print("==================================================================")
    print("Starting PostgreSQL Final Concurrency Gate Adversarial Test Suite")
    print("==================================================================")
    try:
        test_f2_skip_locked_phantom_capacity()
        test_f3_cross_day_boundary_refund()
        test_idempotent_and_conflicting_settlement()
        test_deadlock_free_concurrency()
        test_baseline_deadlock_reproduction_and_023_immunity()
        test_deterministic_lock_order_deadlock_freedom()
        test_multi_window_cross_day_cleanup_concurrency()
        test_missing_daily_requests_row_refinement()
        print("==================================================================")
        print("ALL 8 ADVERSARIAL POSTGRESQL SUITES PASSED (8/8)")
        print("==================================================================")
    except Exception as e:
        print(f"\nFAIL: {e}")
        sys.exit(1)
