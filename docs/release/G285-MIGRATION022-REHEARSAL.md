# Migration 022 — isolated rehearsal specification, not execution authorization

No remote schema was inspected. Compatibility with the **current production schema is UNKNOWN**. Local migrations 001–021 and historical backup/runbook references are design evidence, not current catalog truth. No original migration was modified or applied in this batch.

## Authoritative dependencies and blockers

The reviewed gateway requires project begin/dispatch/settle/release RPCs and a real reservation. The new adapter denies configured dollar caps because 022 has no atomic dollar ledger. Request/token-capped requests can proceed only with a confirmed durable reservation; uncapped/null-reservation admission is denied before paid dispatch. This is a protective compatibility change, not full dollar-budget implementation. Never silently remove a configured cap to regain availability.

A complete money-cap implementation needs a separately reviewed schema/RPC design: atomic settled-plus-in-flight money reservation under a shared lock; verified model/embedding pricing and upper bounds; unknown-price rejection; idempotent settlement/release; conservative crash/late/UTC-day accounting. Current SQL cannot gain those guarantees through a UI/preflight or usage-log read alone. No guessed pricing or new SQL migration is introduced here.

## Preconditions (no service starts authorized)

1. Obtain a separately authorized non-sensitive baseline capture using `scripts/security/release-audit/migration022-catalog.sql`. Independently confirm destination/project and actual execution role first. It reads catalogs only, in a read-only repeatable-read transaction with a five-second statement timeout. Do not treat role or database name as project identity proof. Review definitions before sharing; unknown unexpected function definitions may need private operator review.
2. Capture existing definitions, overloads, dependencies, owners, grants, table shape, constraints/indexes and relevant policies. Missing names mean forward creation; existing names require exact compatibility review. IF NOT EXISTS is not drift protection. Do not infer application from a guessed ledger entry.
3. Prepare a disposable PostgreSQL instance using an already approved toolchain, bound only to loopback with no external credentials. Creation/start/application requires separate authorization. No use of operator-selected existing containers, remote URLs, restored user data or production credentials.
4. Populate synthetic schema representing auth.users and all affected existing document/usage relationships. Keep synthetic users, sections/groups/items, notebooks, references and objects distinct; Storage binaries are out-of-database and need a separate recovery plan. Existing `scripts/test_postgres_migration022.sh` is not the approved executor: it targets a configurable container and truncates tables.
5. Inventory a pre-migration canary set: exact row IDs/counts and canonical digest of synthetic content in every pre-existing relation; constraints, owners and ACLs; synthetic object byte digests. Keep any future real-data comparisons private; do not export real content/identifiers.

## Rehearsal cases and acceptance

- **R01 clean baseline:** apply once transactionally; expected two new usage tables/five functions and exact ACL/RLS/owner/search_path; all pre-existing canaries unchanged.
- **R02 compatible existing baseline:** reapplication only if explicitly supported, no data reset, expected compatible definitions retained. Drifted columns/constraints/overloads must reject before DDL, never be skipped silently.
- **R03 deliberate error before COMMIT:** no partial catalog or canary changes; no automatic retry or rollback.
- **R04 least privilege:** anon/authenticated cannot read/write usage tables or execute RPCs; service_role can perform exactly the required operations; no unintended PUBLIC grants.
- **R05 concurrency:** 20 independent connections race for two remaining request slots and a bounded token pool; exactly the admissible number succeeds, settled+reserved never exceeds the defined cap; no deadlock/unknown result is PASS.
- **R06 lifecycle:** dispatch once, settle once, duplicate same settlement/release is harmless; conflicting settlement, unknown IDs and malformed JSON cannot be reported as success by the adapter.
- **R07 crash/late behavior:** pending versus dispatched expiry; conservative accounting until settlement confirmed; no zeroing of possibly paid work or redispatch; no automatic retry on timeout.
- **R08 UTC boundary:** reservations before midnight, expiry and settlement after midnight; define which day owns each request/token charge before comparing expected counters. Current cleanup/settlement use current-day counters; this needs explicit policy and real PostgreSQL verification.
- **R09 lock ordering:** concurrent admission, expiry cleanup and settlement; bounded statements/transactions, no counter corruption; diagnose deadlocks rather than disabling locks.
- **R10 rollback:** restore the captured original function/ACL definitions in the disposable environment; retain newly populated usage/accounting tables by default. Never drop pre-existing relations or charge records. Verify compatible old/new gateway behavior and all pre-existing canaries unchanged.
- **R11 recovery:** restore the approved backup in isolation, rerun canary/catalog assertions and test the selected application rollback artifact. A schema-only backup is not complete existing-user or Storage recovery proof.

## Boundaries and readiness

Plan and metadata capture query are prepared. **Database rehearsal BLOCKED** on explicit isolated-infrastructure/migration authorization, actual baseline and chosen accounting/day-boundary contract. Baseline-specific rollback cannot be finalized from guessed production definitions. No rehearsal or current-production compatibility PASS is claimed.

After rehearsal and separate staging approval: apply only if needed, catalog postflight, deploy exact compatible gateway, verify authenticated no-provider/mock controls, then bounded separately approved paid inference. Finally verify frontend workflows. Production requires independent release approval and current backup/restore evidence. The G2.85 ownership policies are unchanged; this batch provides no reason to repeat its 72 live cases.
