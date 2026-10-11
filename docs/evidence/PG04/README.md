# PG04 — Financial source of truth & River durability

**Implementation stage:** **IMPLEMENTED — MANUAL PENDING** for the PG04 source scope. Verified at code SHA `12d80eb327aaad1196c6d71d03062ce6004b7b83`; [GitHub Actions 38135142457](https://github.com/masharzy/ekmivo/actions/runs/38135142457) is **4/4 PASS**. Manual/production verification is separate. No production finance migration and no verified live customer payment are claimed.

## Scope
Backlog PG04: immutable financial attempts/evidence/payments/allocations; idempotency; transactional durable ingress/outbox and River queue. This is not PG05 public checkout, PG06 signed mobile receipt ingest or PG07 auto-matching. UI routes and verified-payment APIs have not been fabricated.

## Code
- `infra/migrations/0008_pg04_financial_core.sql` runs ONLY on separate sandbox and live financial PostgreSQL databases after River migrations. Physical realm installation is immutable. Workspace registry stores **workspace UUID, environment, active/suspended, source version**, not member or credential data.
- `infra/migrations/0009_pg04_control_projection.sql` remains in the **control** database. Product/environment transitions increment versions; business deletion creates monotonic tombstones so stale data cannot re-enable access.
- `backend/cmd/financial-migrate`: explicit three-database connection validation, single migration coordinator for River + domain schema, separate migration identities, refuse auth DB as finance DB, idempotent rerun, no implicit deploy/startup migration.
- `backend/cmd/financial-sync`, `backend/internal/financial/projection.go`: control-authorized projection into two physical realms with separate machine credentials; fail-closed on missing authority, immutable version advancement; 20-second scoped reconciliation mode.
- `backend/internal/financial/store.go`: transaction-scoped key+request digest lock, identical canonical JSON replay, conflict on payload mismatch, rollback of domain changes, River `InsertTx` plus append-only outbox in **same pgx transaction**. No API route enabling arbitrary paid status.
- `backend/cmd/worker`: real River worker, independent DB/credential/queue per realm, fresh control-plane projection check before internal durability audit, idempotent processed-outbox PK, no merchant webhook/payment verification behavior. Includes local-CI-only fault injection for genuine kill/restart evidence.
- DB financial invariants: tenant+environment composite foreign keys, immutable issued payer/account/window, overlapping candidate lock, provider+source event dedup, five-field verified payment backstop, allocation cap row locks, audit append-only and FORCE RLS; ordinary API reader/worker cannot INSERT payments or read encrypted inbound evidence.
- Backend Docker runtime packages `/api`, `/worker`, `/financial-sync`; separate explicit migration image `infra/Dockerfile.financial-migrate`. Deploy credentials must never be shared across realms or copied into the web bundle.

## Required automated proof

GitHub Actions must prove on the **same head SHA**:
- [x] Control 0001–0007 then 0009 migration, physically distinct new sandbox/live DB with upstream River + 0008 and repeat safe migrate, no auth/merchant tables in finance, no finance tables in control.
- [x] Restricted role/cross-DB credential denial, no-context FORCE RLS, source disable/delete and versioned tombstone propagation; wrong realm and stale reactivation denied.
- [x] Postgres negatives: FK, amount, payer/route overlap, immutable audit, receipt dedup, over-allocation, verified provenance/time, source boundary; rollback tests.
- [x] Actual Go + PostgreSQL idempotency: same-key replay exact canonical JSON, changed payload 409-equivalent conflict, 12 concurrent replays create one domain effect, one River/outbox job, zero jobs after rollback.
- [x] Actual River worker `SIGKILL` **after** a job is marked running, then fresh worker process automatically recovers and inserts one idempotent audit completion.
- [x] Go suite, web lint/TypeScript/production build, Kotlin debug APK unit tests, Docker image reproducibility with committed River `go.mod`/`go.sum`.

## Safety and acceptance boundaries
- Production financial DB provisioning/migration is **not authorized** by passing local CI, and remains separate from this code delivery.
- Live provider/device receipt and accurate five-field payment verification remain separate PG06/PG07 release gates. No actual transfer or settled merchant money is represented.
- Owner's combined manual session checklist lives in `docs/MANUAL-VERIFICATION.md`. This file contains independent automated evidence and limitations only. 
- **Acceptance classification:** **`IMPLEMENTED — MANUAL PENDING`** after full isolated CI green. This is a bounded PG04 source classification, **NOT** payment production readiness; PG05 checkout, PG06 provider/device ingress, PG07 matching and merchant webhooks remain separate future phases.

## Traceability
- Current clean source PR: [#6](https://github.com/masharzy/ekmivo/pull/6). Prior [#4](https://github.com/masharzy/ekmivo/pull/4) is the historical development branch with conflicts against a newer `main`; do not deploy the stale branch.
- Prior green [CI 38131692361](https://github.com/masharzy/ekmivo/actions/runs/38131692361) checked an **earlier single-DB custom-queue implementation**, and does NOT validate the newer River/3-DB architecture.

## Final PG04 source verification — 2026-10-11

- **Code-equivalent source SHA:** `12d80eb327aaad1196c6d71d03062ce6004b7b83`; [CI run 38135142457](https://github.com/masharzy/ekmivo/actions/runs/38135142457), **all 4/4 jobs SUCCESS** (Go full unit/compile, Next.js lint/typecheck/build with isolated PG00–PG04 PostgreSQL 17, Android Kotlin build/unit, BOTH production Docker images).
- **Financial integration:** `PG04 isolated finance+River PASS: 52 assertions` against physical independent sandbox/live databases and pre-existing control plane, with upstream River migrations and domain 0008 + 0009, safe migration replay, workspace version projection/disable/delete/tombstones, cross-credential denial, no-context RLS, FK/dedup/cap/immutable-transaction guards, and Go pgx River `InsertTx` atomicity/rollback/12-way replay.
- **Real process recovery:** A sandbox River worker was killed with SIGKILL *after* the job moved to running. A different process automatically requeued and completed its internal audit job through the **bounded PG04 audit-only stale-job recovery path**. Exactly one processed-outbox marker persisted. No payment was verified and no public financial API was opened.
- **Deployment gate still requires owner:** No PG04 migration applied to production/control Neon or external live financial database; no Render live PG04 worker or physical provider-source testing. Real merchant and client payment workflows remain later PGs. Owner's complete manual checklist is in [MANUAL-VERIFICATION.md](../../MANUAL-VERIFICATION.md).
