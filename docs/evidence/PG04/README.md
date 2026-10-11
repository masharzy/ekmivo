# PG04 — financial source of truth, idempotency and durability

**State: SOURCE IN PROGRESS, CI/RELEASE NOT YET ACCEPTED.** PR [#4](https://github.com/masharzy/ekmivo/pull/4), branch `pg04-financial-durability-20261011`. Source is intentionally not deployed, and migration 0008 must not be run against production before isolated preflight/authorized rollout.

## Scope and authority

Backlog PG04 (F02/F06/P02; S31/S32/S34). Canonical architecture: `docs/DUAL-SAAS-MVP-PLAN.bn.md`, `docs/PAYMENT-SYSTEM-DESIGN.bn.md`. PG04 is a persistence/reliability package, **not** PG05 checkout or PG07 matcher. No UI is specified for the PG04 persistence-only phase; subsequent dashboard/API screens stay unavailable rather than showing fabricated payment records.

## Source implemented

- `infra/migrations/0008_pg04_financial_core.sql`: financial receiving identity fingerprint, immutable intent/attempt, encrypted inbound evidence, receipt observation, five-field guarded verified payment records, allocations, completed idempotency responses, outbox + leased durable jobs. UUID tenant/environment composite FKs, minor-unit BDT amount checks, immutable history triggers, exact-amount & time-window verification gate, overlapping payer/route guard, over-allocation row locks and FORCE RLS. Financial runtime has no payment INSERT or raw evidence SELECT privilege.
- Enforces `financial_outbox` plus `financial_jobs` in the **same commit** via deferred constraint trigger; failure/rollback cannot persist one without the other.
- `backend/internal/financial/store.go`: internal scoped idempotency runner with advisory transaction lock, whole-request SHA-256 digest mismatch conflict, previous response replay, mutation/result/outbox atomic commit, rollback on failure, deduplicated outbox helper. **Not exposed to a merchant HTTP route.** Future API writer grants must be narrowly authorized and added at PG05; current financial runtime has read-only projections.
- `backend/cmd/worker/main.go`: environment-explicit PostgreSQL polling worker with random UUIDv4 claim tokens, 90-second leases, SKIP LOCKED, crash reclaim, bounded retries, poison-message handling and stale lease ACK guard. It **only consumes internal `pg04.audit` durability probes**; unknown payment/webhook/matcher jobs are not acknowledged or marked successful.
- `apps/web/scripts/pg04-financial-smoke.mjs` + Go integration/unit tests: ephemeral PostgreSQL migration, constraints, RLS and privileges, tenant/environment boundaries, amount/receipt guards, immutable history, queue lease/exactly-once ACK, request conflict, commit/rollback and concurrent idempotency replays; CI gated.

## Required proof before calling PG04 implemented/accepted

- [ ] CI green on final PR SHA: Node script, Go unit+integration, web compile/lint/build, Android regression. Record run ID and exact SHA.
- [ ] Confirm original 0001–0007 migrations plus 0008 from both empty and already-upgraded **isolated** DB without collisions. Validate RLS under actual restricted role, rollback of domain mutation and job, concurrent identical/different requests, lease-expiration/restart and allocation race with multiple DB connections.
- [ ] Architecture discrepancy: canonical plan requires **physically isolated sandbox/live financial DBs and worker credentials**. This migration currently uses workspace+environment partitioning/FORCE RLS in the existing control DB. This protects scoped queries but is NOT physical split. Resolve provisioning and isolated DB registry/migration contract before real money.
- [ ] Architecture discrepancy: canonical F06 specifies **River transactional queues**. This checkpoint implements a PostgreSQL leased durable queue, not River. Decide and implement River replacement/adapter under the single `infra/migrations` authority before PG04 is fully accepted.
- [ ] Worker currently dispatches only durability probes. Real receipt parsing/matching/webhook handlers need PG06–PG08 and cannot be represented as working now. Job recovery under true process termination/deployment restart still needs witnessed run.
- [ ] Credential/role hardening and source-to-deployed parity pending; no production Neon 0008 write or Render worker deployment is claimed. No real payment/device/provider evidence is claimed.

## Owner manual verification (single combined session)

The only owner checklist is `docs/MANUAL-VERIFICATION.md` under PG04; do not request an independent PG04 test session. All fixtures must be approved, isolated and redacted.

**Explicit non-goals:** API payment creation, hosted checkout, order linkage, actual SMS ingestion, automatic five-field matcher, signed outgoing webhook delivery, refunds, platform billing ledger and provider settlement are later PGs. An internal audit job cannot verify customer money.
