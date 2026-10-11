# PG04 — financial data integrity, River delivery and independent realm databases

**Status: IMPLEMENTATION SOURCE PREPARED; LATEST CODE UNVERIFIED; NOT ACCEPTED OR DEPLOYED.** Main implementation draft [PR #4](https://github.com/masharzy/ekmivo/pull/4), branch `pg04-financial-durability-20261011`. The canonical scope is PG04 (F02/F06/P02; S31/S32/S34). PG05 checkout, PG06 actual receipt ingestion, PG07 automatic matcher, PG08 merchant signed webhooks and later product UI are NOT evidence of PG04 readiness. No user-facing payment state is fabricated; `/readyz` deliberately stays 503.

## Full PG04 architecture now represented in source

1. **Physical finance realms:** `0008_pg04_financial_core.sql` creates financial source tables in a *new*, single-realm financial database, not the auth/control DB. Each financial DB has a singleton realm FK and a minimal non-PII workspace registry; explicit separate Sandbox/Live PostgreSQL LOGIN credentials/role groups and restricted CONNECT rights are provisioned in the disposable CI harness. Neither financial DB should contain sessions, users, MFA secrets or merchant API keys.
2. **Control consistency:** `0009_pg04_control_projection.sql` installs versioned product/environment projections, a minimal SELECT-only machine resolver, product/realm triggers and workspace deletion tombstones in the existing control DB. `backend/internal/financial/projection.go` and `backend/cmd/financial-sync` reconcile active/suspended/removed workspaces into both realms using separate provisioner credentials and monotonic versions, optionally as a continuous dedicated process. Stale version conflicts fail closed.
3. **Integrity:** immutable receiving identities, requests, issued attempts, encrypted ingress evidence, observations, verified funds and allocations; tenant/environment composite FK, provider-reference dedup, exact paisa/BDT checks, matching-field/time/original payer and incoming-method backstops, locked overdraw guard, overlapping payer/account/method/time serialization, immutable idempotency outcomes and history triggers. Reader role has no raw evidence SELECT or financial INSERT; worker has no payment INSERT.
4. **Real River queue:** `backend/internal/financial/store.go` uses pgx `river.Client.InsertTx` in the SAME transaction as the domain mutation, outbox and immutable response. The deferred PostgreSQL outbox check requires a corresponding River job at commit. Completed River jobs may later be pruned without deleting immutable financial history. Same-key/operation/workspace/realm replay returns the persisted exact result; different request hash is a conflict; callback rollback leaves no job.
5. **Dedicated worker:** `backend/cmd/worker` runs River on realm-specific `financial_sandbox` or `financial_live` queues and rejects wrong DB/user/realm. Before `pg04_audit` it rechecks current control-plane workspace status/version through the separate machine-only source. A SECURITY DEFINER function applies an idempotent `financial_audit_processed` side effect, no customer paid status or webhook. River owns retries/rescue. Test-only loopback fault injection allows a CI worker to be SIGKILLed with a job in `running` and restarted.
6. **Single migration procedure:** `backend/cmd/financial-migrate` coordinates the only control projection migration and upstream pinned River + financial domain SQL, with explicit operator approval env, independent DB/credential guard and idempotent installed-realm check. No migrations in HTTP request handlers; additive existing 0001–0007 control migration history preserved. Optional `backend/Dockerfile` and `infra/Dockerfile.financial-migrate` package dedicated processes; non-Docker CLI works too.

### Source files / reproducible planned tests

- `infra/migrations/0008_pg04_financial_core.sql`; `infra/migrations/0009_pg04_control_projection.sql`.
- `backend/internal/financial/{store.go,store_test.go,store_integration_test.go,projection.go,projection_test.go}`.
- `backend/cmd/{financial-migrate,financial-sync,worker}` and their tests.
- `apps/web/scripts/pg04-financial-smoke.mjs`, registered in `.github/workflows/ci.yml`: create physically distinct disposable PostgreSQL 17 databases, explicit realm roles, protected migration runner, empty/control isolation, control product disable/delete/tombstone reconciliation, force RLS/money/FK/append-only/security tests, River 12-way concurrent idempotency/rollback and real worker SIGKILL→River recovery→one completed side effect.
- [PG04 runbook](../../runbooks/PG04-FINANCIAL-REALMS.md) and one combined [manual register](../../MANUAL-VERIFICATION.md).

## Verification results: do not conflate old and new architecture

**OLD source (custom queue, not this current code):** [GitHub Actions 38131692361](https://github.com/masharzy/ekmivo/actions/runs/38131692361) at `b2489e8dd01ed5910f2739022a0a7cce0fc45a3c` was 3/3 green. It verified the *earlier* single-DB/custom PostgreSQL queue implementation and is historical evidence only, **NOT** the River/physically isolated PG04 implementation.

**CURRENT rewritten source:** Multiple new source commits on PR #4 were confirmed in GitHub, but Actions returned **no run/check record for the latest head SHA** when checked. No actual final River Go compile, Node/Postgres migration, SIGKILL rescue, Docker build or UI/production QA result was observed. Temporary draft [PR #5](https://github.com/masharzy/ekmivo/pull/5) was created solely to try to get an independent CI dispatch; it is not deployment evidence. The newly added integration tests are **written but not yet PASS-confirmed**.

## Remaining hard gates before calling PG04 100% implemented/ready for owner verification

- [ ] Obtain a CI runner on the **latest PR #4 commit**, run `go mod tidy` and commit the resolved River transitive Go dependency graph/`go.sum` lock, then rerun all 3 jobs. Fix any actual Go API/DDL/SQL/worker/recovery failures surfaced. **Do not infer PASS from source or old CI.**
- [ ] Confirm migrations `0009` control + River + `0008` financial on two fresh realm databases and re-run idempotently, migration-role hardening, no cross-realm DB connection/credential and no control identity duplication.
- [ ] Independently witness two clients racing same payment/dedup bucket, transaction rollback without a River job, and real worker SIGKILL while `running` followed by rescue and one post-crash effect. The new script expresses these assertions; outcomes pending.
- [ ] Verify architecture update with the current branch and docs; source builds for Go, Next.js and Kotlin plus optional Docker images, no plaintext secrets/logging.
- [ ] Production migrations remain **NOT APPLIED**: do not run against production Neon without the owner's separate schema/operator approval. No production finance DB/worker/projector deployment parity or live synthetic/account negative browser tests have been verified.
- [ ] Maintain `/readyz=503` until real end-to-end financial PG05–PG09 integration. PG04 audit probe is never proof of payment.

**Owner manual work is accumulated only in `docs/MANUAL-VERIFICATION.md`. Do not interrupt for a PG04-only manual pass; first close code/CI gates.**
