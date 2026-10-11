# PG04 financial durability — deployment and verification runbook

**Revision:** 2026-10-11. Scope F02/F06/P02 (PG04 only). No production migration was executed while preparing this source. Do NOT point the disposable CI script at Neon/production.

## Physical isolation and independent processes

- Existing PG00–PG03 **control database** holds users, sessions, membership, workspace environments/products and the narrowly permissioned `resolve_financial_projection` function. PG04's additive control migration is `infra/migrations/0009_pg04_control_projection.sql`.
- **Sandbox financial database** and **Live financial database** are different PostgreSQL databases, with independently named reader/worker/provisioner/migration LOGIN credentials. They must not reuse the control database name, runtime role or credentials. Neither financial DB contains `app_users`, `auth_sessions` or `merchant_api_keys`.
- Both finance databases install pinned upstream River migrations under the **same explicit one-shot migration runner** and then `infra/migrations/0008_pg04_financial_core.sql`. Each database has one immutable `financial_realm` row. A realm FK prevents writing Live rows into Sandbox or vice versa.
- `financial_workspace_registry` copies only workspace UUID, environment, active/suspended status and an increasing source version. Source status is resolved and rechecked from the control database before every River event.
- Provisioning/reconciliation daemon: `backend/cmd/financial-sync`; separate worker processes: `backend/cmd/worker` with realm-specific queue `financial_sandbox` / `financial_live`. It only executes internal `pg04_audit` probes. **No verified payment, SMS parser, merchant webhook or hosted checkout is implemented by PG04.**
- Optional Docker builds are supported, but Go services also run without Docker. Financial migration Docker image is defined in `infra/Dockerfile.financial-migrate`; the API/worker/synchronizer Docker image is `backend/Dockerfile`.

## Role and network boundary

Provision (using an independently authorized PostgreSQL operator, never within request handling) the NOLOGIN groups `ekmivo_finance_reader`, `ekmivo_financial_worker`, `ekmivo_financial_provisioner`, and `ekmivo_financial_projection`. Create realm-specific LOGIN users and grant only their corresponding group, and constrain `CONNECT` on each database to the correct realm users and migration owner. The control machine LOGIN inherits **only** `ekmivo_financial_projection`; it never receives a financial group. The existing control runtime role `ekmivo_financial_runtime` must NOT be reused in a financial database.

The migration runner fails closed if a target is the control database, if the two migration connections share a DB or credential identity, or if an installed realm disagrees with the requested realm. Database owner roles install tables and SECURITY DEFINER functions. Runtime readers have no financial INSERT/UPDATE/DELETE or raw receipt SELECT. Worker has the minimal River DML and explicit non-PII audit-function EXECUTE; provisioner can only call the versioned registry sync function. Financial tenant tables use FORCE RLS and scope-bound SELECT policies; migration-owner-only policy permits trusted internal functions to preserve invariants.

No live provider account/phone/receipt credentials belong in source, logs, CI fixtures, CLI arguments, or public storage.

## One-shot schema application, strictly after operator authorization

In a reviewed checkout, prepare these environment variables as private secrets from independently created database principals (do not paste the values in issues):

| Variable | Required content |
|---|---|
| `PG04_ALLOW_MIGRATION` | Explicitly `true`, set only during a reviewed migration |
| `PG04_CONTROL_MIGRATION_DATABASE_URL` | Existing control migration-owner PostgreSQL URL |
| `PG04_CONTROL_MIGRATION_FILE` | Absolute path to `infra/migrations/0009_pg04_control_projection.sql` |
| `PG04_SANDBOX_MIGRATION_DATABASE_URL` | New Sandbox finance DB migration-owner URL |
| `PG04_LIVE_MIGRATION_DATABASE_URL` | New Live finance DB migration-owner URL |
| `PG04_FINANCIAL_MIGRATION_FILE` | Absolute path to `infra/migrations/0008_pg04_financial_core.sql` |

From `backend`: `go run ./cmd/financial-migrate`. It coordinates control projection + upstream River schema + domain schema from **one explicit procedure**, is idempotent after successful realm installation, and does not create fixtures, provider connections, customer payments or webhook deliveries. Prefer one isolated branch of the current production DB for preflight first; **never apply production schema writes without explicit owner approval**.

Optional container from repository root: `docker build -f infra/Dockerfile.financial-migrate -t ekmivo-pg04-migrate .`. Use the same reviewed private environment and operator approvals. Back up/schema-snapshot before production application; handle failed or partially provisioned realms as unavailable, never silently fall back to control DB.

## Separate worker and projection daemon

On a sandbox-only worker host configure `EKMIVO_WORKER_ENVIRONMENT=sandbox`, `FINANCIAL_WORKER_DATABASE_URL` (sandbox worker LOGIN), and `PG04_WORKER_CONTROL_PROJECTION_URL` (control projection-only LOGIN). Run `go run ./cmd/worker` or `/worker` in its separate container. Repeat independently for Live with Live credentials and `EKMIVO_WORKER_ENVIRONMENT=live`. A wrong realm, elevated role or missing independent control source prevents startup. Do not run worker code inside the Next.js/Vercel request lifecycle.

Set `PG04_PROJECTION_CONTROL_URL`, `PG04_PROVISIONER_SANDBOX_URL`, and `PG04_PROVISIONER_LIVE_URL` with three distinct LOGIN credentials. Set `PG04_PROJECTION_WATCH=true` to start `go run ./cmd/financial-sync` as its own process for continuous, versioned reconciliation; alternatively set `PG04_WORKSPACE_ID` and `PG04_ENVIRONMENT` for one explicit safe sync. It reads only source UUID/realm/version/status, suspends disabled workspaces and preserves tombstones after deletion. Worker rechecks source version before acknowledging any job; stale or disabled projection fails closed. Never put machine credentials in a public frontend.

## Automated tests (local disposable PostgreSQL 17 / CI)

The `.github/workflows/ci.yml` web job runs PG00–PG03 disposable control migrations and then `node apps/web/scripts/pg04-financial-smoke.mjs`. This script **hard rejects non-loopback database URLs**, creates two separate disposable databases and realm-specific roles, executes/re-executes the PG04 migration runner, verifies no control tables exist in finance, FORCE RLS/permission denials, mismatched realm/FK/money/immutability, real control→finance product toggles and deletion tombstones, Go River transaction/idempotency conflict/12-way concurrency/rollback, then kills a real worker after River has claimed an audit job and checks automatic recovery and one side effect after restart. All synthetic fixture data is disposable and is not a live payment claim.

`go test ./...` additionally checks worker realm role, invalid DB pairing, unavailable fail-closed behavior, and store input validation. Next.js lint/typecheck/build and Kotlin regression are independent CI jobs. Record **actual final SHA/run ID** before marking any of these passed. Old run 38131692361 passed the prior custom queue architecture and **does not verify this new River/isolated database rewrite**.

## Rollout/acceptance gates

PG04 is **not accepted** until: a final CI run passes all new Go/web/Android/PostgreSQL jobs; upstream River version and committed Go checksums are fixed; an isolated preflight proves the actual finance migration runner; genuine worker SIGKILL/automatic recovery and two DB credential isolation pass; an operator separately approves controlled production database provisioning and deployment; read-only production realm/role/schema/health checks pass. Manual owner QA is consolidated in `docs/MANUAL-VERIFICATION.md`. Keep `GET /readyz` 503 until PG05–PG09 financial payment flows are truly functional; do not mark customer money paid for an audit-probe ACK.

Recovery after failed production rollout must use a separately approved snapshot/restore and consistent source/registry version checks. **Never drop an existing financial schema or manually mark a payment verified as a rollback shortcut.**
