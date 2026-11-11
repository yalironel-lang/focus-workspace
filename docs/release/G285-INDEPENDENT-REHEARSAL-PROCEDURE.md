# Disposable token-ledger rehearsal — prepared, NOT executed

No database start, installation, image pull, SQL execution or remote connection is authorized by this file. Migration 022 remains unchanged. The prepared `migration022-corrected-rehearsal.sql` is deliberately guarded for a disposable database and must never be applied to staging/production.

## Preconditions and approval

Obtain explicit approval for: starting one disposable PostgreSQL container from an already cached immutable image, creating only synthetic data, applying the original and corrected SQL there, opening concurrent local test connections and stopping only that newly created container. Approval must identify the image digest, PostgreSQL version and local engine socket. No daemon startup, image pull, package installation, remote context or host data restore is implicit.

Requirements: local Docker engine reachable via an explicitly approved **unix socket**; image `postgres@sha256:<approved digest>` already cached; no existing container named `zikuk-022-rehearsal`; adequate memory; reviewed source fingerprints; original and corrected artifacts available. Docker CLI presence does not establish these prerequisites. Actual production schema/version compatibility remains UNKNOWN until separately approved catalog evidence is available.

## Isolation envelope and future operator commands

These are a template for a later approval, not commands run by this review. Replace only the nonsecret approved socket and image digest. Never use a database URL, password, a default Docker context, a production dump or an existing test container.

```bash
ZIKUK_REHEARSAL_SOCKET='unix://<approved-local-socket>'
ZIKUK_REHEARSAL_IMAGE='postgres@sha256:<approved-cached-image-digest>'
ZIKUK_REHEARSAL_ROOT='/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023'
# STOP unless the socket is local, image is pinned/cached and approval matches.
# Inspect image metadata only; no pull or login.
docker --host "$ZIKUK_REHEARSAL_SOCKET" image inspect "$ZIKUK_REHEARSAL_IMAGE"
# STOP if the fixed name already exists; never delete/reuse it.
ZIKUK_REHEARSAL_CID="$(docker --host "$ZIKUK_REHEARSAL_SOCKET" run --detach \
  --pull never --name zikuk-022-rehearsal --label zikuk.scope=g285-isolated \
  --network none --read-only --memory 1g --cpus 2 \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
  --tmpfs /var/run/postgresql:rw --tmpfs /tmp:rw \
  --env PGDATA=/var/lib/postgresql/data/pgdata \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=zikuk_022_rehearsal \
  "$ZIKUK_REHEARSAL_IMAGE")"
```

The trust setting is confined to the newly created no-network/no-port container, not any real database or global configuration. No host source or data directory is mounted. Inspect **only the returned CID** and require matching image, label, network=none, zero published ports and no bind mounts. Stop on an uncertain start outcome; do not issue another run. No private credential is needed for this isolated setup.

When the one container is ready, use only its internal psql:

```bash
docker --host "$ZIKUK_REHEARSAL_SOCKET" exec -i "$ZIKUK_REHEARSAL_CID" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d zikuk_022_rehearsal
```

Every session must first assert database `zikuk_022_rehearsal`, set `statement_timeout='5s'`, `lock_timeout='2s'`, and set `zikuk.isolated_rehearsal='G285_TOKEN_LEDGER_REVIEW'`. The corrected artifact also checks the marker and database before DDL. Failures/timeouts mean FAIL/UNKNOWN, never permission to retry migrations automatically.

## Ordered rehearsal

1. **Synthetic baseline.** Create auth.users and anon/authenticated/service_role test roles in this empty container, synthetic users, representative existing usage/document/asset-reference tables and fixed synthetic content. No real identifiers, accounts, personal files or remote data. Record exact row counts and canonical synthetic canary digests, schema/constraints/owners/ACLs. Do not add paid API access.
2. **Original behavior reproduction.** Apply original Migration 022 **inside this container only**, using psql stdin from the unchanged source. Capture metadata and synthetic canaries. Execute the known-expiry and day-refund schedules below; their unsafe original results are expected defect reproductions, not acceptance PASS.
3. **Capture rollback baseline.** Capture original function definitions, owners/ACLs, indexes/constraints and data canaries privately within the synthetic work area. Define exact restoration of those definitions; keep all accounting rows/tables. The source file is not a general rollback for unknown live definitions.
4. **Corrected candidate.** Apply `scripts/security/release-audit/migration022-corrected-rehearsal.sql` as one transaction, using the marked session and stdin. It must fail outside this isolated database. No automatic retry on error or uncertain COMMIT.
5. **Catalog/preservation.** Require all five functions to use the common transaction advisory lock first; RLS enabled; ordinary roles denied table/RPC access; only intended service execution; unchanged ownership/search_path expectations; every baseline canary and unrelated schema object unchanged. No guessed migration-ledger identifier.
6. **Concurrent schedules.** Run each schedule on fresh synthetic state, explicit session barriers and real independent connections. No arbitrary timing sleeps or mock substitute for PostgreSQL.
7. **Lifecycle and failure.** Test malformed/negative inputs, missing IDs, dispatch after expiry, repeated identical settlement, mismatched settlement, above-reservation spend, lost acknowledgment and aborted transactions. No paid or possibly paid reservation may take the refund path. Actual spend above reservation must be recorded and fail, not be truncated or reported as success.
8. **Rollback test.** In isolation only, restore the captured original definitions/ACLs, retain charge records and verify all canaries. Restore the corrected candidate and verify again. Never restore vulnerable accounting in a live environment with inference enabled; any eventual live rollback requires its own baseline-specific artifact and approval.
9. **End.** Record fixed case labels, PASS/FAIL/UNKNOWN, aggregate counts and preservation results only. Stop the exact CID created above after verifying its label/image again; never use rm/prune/reset against shared names or other resources. tmpfs data disappears only for this expressly disposable container. No user data exists in it.

## Mandatory concurrency/expiry schedules

**E1 locked expired dispatched spend (confirmed review concern).** Cap=100, settled=0, synthetic expired dispatched reservation=100. Session L begins and locks the reservation with SELECT FOR UPDATE; keep it open at an explicit operator barrier. Session A requests another 100. Original code can skip the locked row and admit: FAIL. Corrected code must block/timeout without admission, or deny once L releases and conservative settlement charges the 100. It must never return a new confirmed reservation while the original liability is unaccounted.

**E2 midnight refund.** Yesterday's pending admission=1; today's cap/counter=5. Expire yesterday's pending reservation and attempt a new admission today. Today's counter must stay 5 and the new request must be denied. Only yesterday's counter may be refunded. Repeat explicit release and dispatched expiry/late settlement across the boundary; all charges/refunds use original UTC admission day.

**E3 global lock order.** Interleave begin/cleanup/dispatch/settle/release from multiple sessions, including expiry and a row held by an external test transaction. The five entry points must serialize on the same transaction lock before row/counter locks. External contention may fail closed within deadlines; no deadlock/timeout is counted PASS. Document any deadlock rather than disabling locking.

**E4 capacity race.** Twenty connections compete for two remaining request slots and one bounded token pool. Exact admitted count, reservations plus settled totals and counters must match; no capacity disappears between active and conservatively settled states. Repeat with delayed/failed settlement and expired pending/dispatched records.

**E5 late/duplicate finalization.** Repeat identical settlement without incrementing counters twice. Conflicting token amounts must not overwrite a terminal settled charge. Above-bound observed usage must remain fully recorded but return failure. Dispatched/expired-assumed-consumed release must deny without refund. Do not test retries against a real provider.

## Readiness and rollback limits

Procedure and SQL candidate are prepared. PostgreSQL execution, SQL syntax on the chosen version, preservation, permissions and real concurrency remain **UNVERIFIED** until this approved rehearsal runs. This procedure does not authorize production baseline capture or prove current production compatibility. An applied Migration 022 requires a separately reviewed forward correction; do not rewrite migration history. The full input/attempt-bound provider policy must also be established before paid runtime use; ledger correctness alone cannot certify a bound the caller has not proved.

## Additional compatibility gate from provider-readiness SQL review

The corrected rehearsal artifact now rejects legacy terminal records with unknown or cross-UTC-day settlement/refund history before DDL. Original 022 can have charged the wrong window; installing a new function cannot infer or repair that past counter state. Do not bypass this stop or assume unchanged column shapes establish compatibility.

Run original defect repro calls inside explicit transactions and ROLLBACK them after recording the synthetic outcome, so they do not leave ambiguous terminal history in the preservation baseline. Deliberately test a persisted cross-day legacy fixture separately: correction must STOP with unchanged catalog/canaries. Fresh corrected lifecycle tests must start from the captured unambiguous synthetic baseline. Perform rollback/reapply checks before cross-day terminal fixtures, or expect this conservative stop and restore the expressly disposable baseline. This artifact is not a general idempotent reapplication tool or production data-reconciliation migration.
