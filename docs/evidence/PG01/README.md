# PG01 — session/tenant/environment authorization and admin MFA

**Work:** PG01 / F02,F03,F04 / S02,S04,S45. **Latest status: IMPLEMENTED; deployed security verification recorded below; manual browser/device QA and latest-source Vercel parity pending.** PG02 concurrent changes preserved. Historical checkpoints below are superseded by the completion section, not rewritten as past successes. Android UI expansion remains paused.

## Code
- `backend/internal/authz/authz.go`: validates existing opaque cookie session hash against PostgreSQL. Fails closed on invalid/expired/revoked/disabled, email verification required, removed members and unauthorized capabilities. Uses `SET LOCAL` tenant/workspace/environment context only after membership and capability checks, then queries FORCE-RLS data in a bounded transaction.
- `backend/cmd/api/main.go`: read-only session, workspace capability/environment and platform access endpoints; no payment success/mark-paid mutation. `/readyz` deliberately remains HTTP 503.
- `apps/web/src/lib/mfa-core.js`, `lib/server/mfa.ts`, `actions/admin-mfa.ts`, `components/admin-mfa-form.tsx`, `app/[locale]/admin/mfa/page.tsx`: six-digit RFC6238 TOTP, password-confirmed enrollment, AES-256-GCM encrypted seed stored server-side, persistent five-attempt lockout, replay-proof increasing step and session-bound admin MFA freshness (12 hours). Enforced on the real platform dashboard/actions.
- `infra/migrations/0003_pg01_admin_mfa.sql`: additive auth session/admin MFA persistence. `0004_pg01_environment_rls.sql`: workspace sandbox/live metadata, automatic trigger/backfill, FORCE RLS with membership and context checks, restricted runtime column grants.
- Previous 0001/0002, existing user/admin, and Kotlin native code preserved. No real merchant data fixtures added to production.

## Automated evidence (simulation against ephemeral local PostgreSQL)
[GitHub Actions run 38117671893](https://github.com/masharzy/ekmivo/actions/runs/38117671893), commit `c29287ba`, all three jobs PASS:
- `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `node scripts/pg00-smoke.mjs`, then `node scripts/pg01-rls-smoke.mjs`: migrations 0001–0004 on isolated PostgreSQL 17; three separate tenants × sandbox/live; FORCE RLS, missing/forged context denial, cross-tenant/environment denial, owner vs viewer write, removed and disabled members, auto seeded contexts, rollback and pooled connection cleanup.
- `go test ./...`, `go test ./internal/authz -run TestPostgresSessionMembershipAndEnvironment -count=1 -v`: Go session revocation/disabled/verified toggle, role changes, platform TOTP-gated authorization and three workspace memberships, with PostgreSQL runtime login.
- `node scripts/pg01-mfa-smoke.mjs`: RFC6238 vectors, TOTP reuse denial and AES-GCM primitive checks.
- Kotlin `:app:assembleDebug :app:testDebugUnitTest` still green, but **no Android UI/receipt expansion in PG01**.

## Production database observation — real Neon, not synthetic payment evidence
Project Ekmivo, database `ekmivo`, Singapore. Existing 0001/0002 not re-run. Additive `0003` and `0004` applied in transaction, then inspected:
- Existing user count unchanged (1), existing business 1. Two logical environment rows and two settings rows, **not live financial sandbox/provider integration**.
- 2 tables with both RLS and FORCE RLS, 3 RLS policies, new workspace-context auto-seed trigger.
- `ekmivo_financial_runtime` created by explicit SQL (not Neon role API), has LOGIN and **no** SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/INHERIT/neon_superuser membership or schema CREATE. It can read required control-plane columns; it cannot read `app_users.password_hash` or `platform_admin_mfa.secret_ciphertext`.
- `MFA_ENCRYPTION_KEY` generated securely and configured only in Vercel production encrypted environment; no secret appears in source or evidence.
- Attempted read-only `SET LOCAL ROLE ekmivo_financial_runtime` through Neon owner's management connection was denied because owner is not a member. This is **not** an RLS test failure nor proof of a live runtime connection. CI uses a direct nonowner runtime login and verified missing context/tenant isolation there.
- Neon API-generated unused role `ekmivo_runtime` was shown to inherit `neon_superuser` and have BYPASSRLS. Privilege reductions were denied by Neon; the role is **not used or granted application access**. Its removal requires explicit operator approval.

## Remaining PG01 acceptance gates — do not proceed to PG02
1. Real owner enrolls with own password and a TOTP authenticator at `/bn/admin/mfa` (or `/en/admin/mfa`). Verify repeated/stale codes, restart, logout/revocation, and admin action gating on actual production session without exposing seed.
2. Connect persistent Go API to the restricted `ekmivo_financial_runtime` role via server-only `AUTHZ_DATABASE_URL` (retrieve from Neon in secret channel) and run **production read-only** runtime-role/missing-context and negative tenant tests without creating fictitious merchant transactions or impersonating users. The Go financial API and worker are not hosted/ready yet.
3. Independently verify admin MFA/role change UI on production deployment, log/access controls, recovery/runbook. Record redacted results; no untested capacity/safety claim.
4. Securely remove the unused elevated Neon API-created role **after owner approval**; never replace it with a financial API credential.

**No payment API, matching engine, provider receipt, signed merchant webhook, device or live transaction is implemented or tested by PG01.** PG06 signer/validation source and AN03 APK source remain partial, as required by the owner's payment-first serial instruction.

## Render deployment and production RLS startup observation (2026-10-11)

**Verified:** Render service `srv-db5j532d0e5s73fli4h0` at `https://ekmivo-go-api.onrender.com` (Singapore, free plan) built commit `16fd3351` and deployed live as `dep-db5j7e8473hc73bcd8j0`. Go service configured with server-side `AUTHZ_DATABASE_URL` and `BRIOFOLD_REQUIRE_AUTHZ=true` (credential never logged). Render runtime log at 06:59:29 UTC: `PG01 authz runtime PASS: nonprivileged role and no-context tenant isolation verified`. The Go startup executes a read-only transaction after checking runtime role `ekmivo_financial_runtime`, clears transaction-local context, queries the two FORCE-RLS tables and rejects any exposed rows. Service is deployed and listening on port 10000. `/readyz` still reports financial services not implemented.

**Production MFA owner observation:** Real Neon read-only query returned one confirmed administrator MFA enrollment and one active session with recent MFA, maintaining one Super Admin; no OTP seed/session contents copied.

**Not yet verified:** authentic HTTP session forwarded through approved Next.js proxy to Go; live revoked/expired and cross-tenant HTTP negative tests; browser admin role mutation denial and repeated-code scenarios; recovery/incident procedures. Isolated Go/Postgres tests cover these paths but are not production HTTP evidence. PG01 remains **OPEN** pending those checks. PG02 not started. Android PG06/AN03 remain partial, not acceptance.

## Independent deployed HTTP verification — 2026-10-11

Status remains **IN PROGRESS / NOT ACCEPTED**. Source inspected at `912f297`; results concern actual deployed responses, not a claimed deployment SHA. Machine-readable endpoint/status/role/response/assertion records: [production-http-results.json](production-http-results.json). Reproducible guarded harness: [pg01-production-http.mjs](../../../apps/web/scripts/pg01-production-http.mjs).

### Method and limits

Dedicated short-lived `example.invalid` test users, three workspaces and a viewer were created through the authorized control-plane database connection; opaque sessions were generated using the existing format. This tests deployed HTTP authorization, **not signup/login issuance**. A dedicated test administrator's encrypted TOTP seed was installed as an unconfirmed fixture; the challenge was submitted to the **real deployed Next.js server action**, followed by Go HTTP verification. This is real challenge/replay/lockout evidence, **not password-confirmed enrollment or a physical authenticator test**. Seeds, credentials, cookies, recovery codes and raw HTML never enter evidence. No financial records or existing user/admin settings were changed. Fixture cleanup assertions are recorded separately.

Production targets: `https://ekmivo-go-api.onrender.com` and `https://ekmivo-web-masharzys-projects.vercel.app`. The JSON contains every expected/actual status and safe response. Next.js business denials may use HTTP 200; verify the error text and database result, not the transport status alone.

### Remaining release blockers

- No deployed workspace mutation endpoint exists: POST to the read-only access route returns 405. Viewer capability denial plus unchanged settings is verified, but **405 is not authorization evidence for an actual write command**.
- No MFA recovery-code generation/storage/consume endpoint exists. Recovery-code reuse/rate-limit checks therefore cannot run; password-reset OTP is a different factor and must not silently bypass MFA.
- No supported user-facing MFA revoke/reset action exists. Test-row `confirmed_at=NULL` verifies fail-closed behavior of existing sessions, but does not prove an audited revocation workflow, re-enrollment/session invalidation or operator recovery procedure.
- No Next.js-to-Go authenticated session proxy is implemented. Direct Go fixture-cookie requests verify Go checks; normal browser product integration remains unverified.

These are missing implementation coverage, not external credential blockers. Do not mark PG01 accepted or start PG02 until remaining required flows and their checks pass. Do not infer payment-engine readiness from this report.

### Short browser walkthrough

Use a **dedicated test administrator** and test workspaces; leave the sole production owner untouched. Operator grants the test account the required role through the existing approved admin process. Do not share its password, authenticator seed or codes in evidence.

1. Sign in to the test administrator in a fresh browser profile, then open `/en/admin` (or `/bn/admin`) before MFA. Expected: redirect to the MFA screen, no admin dashboard.
2. On `/en/admin/mfa`, confirm the test-account password, add its private key to its authenticator and submit the current code. Expected: admin dashboard. This manual enrollment step supplements the harness, which uses a seeded unconfirmed key.
3. Log out, sign in again, and submit the already-used TOTP code before its step changes. Expected: invalid/already-used error; no admin access. Never reuse the owner's authenticator for this test.
4. In the fresh test session, submit five invalid six-digit codes. The next attempt must show the 15-minute cooldown. Another browser login for the same test account must not reset the database lockout. Stop; do not lock the owner's account.
5. As test account A, open test workspace B's URL. Expected: no B data. For deployed Go HTTP assertions use the guarded harness, because a browser cookie on the Vercel domain is not automatically sent to the Render domain; do not paste cookies into console/logs.
6. Revocation and recovery walkthroughs are currently **unavailable**: no such controls exist. Do not delete a real MFA row manually or treat password reset as MFA recovery. Implement an audited flow, then add the corresponding browser steps and HTTP assertions.

To rerun the harness, first securely pull production variables to an ignored local file from the verified Vercel project. Set `PG01_ALLOW_PRODUCTION_FIXTURES=true` in the runner's environment, then invoke Node with `--env-file=<ignored-file> scripts/pg01-production-http.mjs` from `apps/web`. This explicitly creates and cleans dedicated test identity/workspace fixtures in the deployed control plane; never run it as an ordinary CI test. No container or Docker startup is needed.
### Final result of independent run

The final run passed real deployed TOTP challenge, same-code replay in a fresh session, five invalid attempts plus persistent lockout, with DB-confirmed blocked_until. Go three-tenant/session/capability/MFA negatives and cleanup also passed. Three required coverage items remain NOT_IMPLEMENTED: actual protected write endpoint, recovery-code flow and web-to-Go session proxy. Audited MFA revoke/re-enrollment remains an additional lifecycle gap; only controlled test-row revocation was checked. Initial form-transport timeout was investigated and the final run uses React Server Action encoding, matching the deployed client request protocol. RSC redirects may return HTTP 200 with the action redirect header, unlike ordinary HTML POST's 303; the database freshness and subsequent Go access confirm success.

Concurrent repository observation: during verification, origin/main advanced to `f9e390e` with PG02 UI commits. Those changes were preserved and pulled; they do not supply missing PG01 acceptance evidence. Earlier statements that PG02 has not started are historical. PG01 remains open regardless of those UI commits.

## Completion implementation and deployed HTTP evidence — 2026-10-11

**Current implementation milestone: IMPLEMENTED — MANUAL PENDING. Full production/source-parity acceptance remains OPEN.** The earlier missing write, proxy, recovery and reset features are now implemented; do not use the historical audit's NOT_IMPLEMENTED entries as the current source inventory. No payment-engine readiness claim is made.

Changes: `d2484ad` implements a real owner/admin-only checkout-expiry write through Go/restricted PostgreSQL RLS, server-side HttpOnly session forwarding with a destination allowlist and mutation Origin checks, eight once-visible recovery codes stored only as user-bound hashes, audited rotation/recovery/reset, password and fresh MFA checks, persistent five-attempt/15-minute recovery lockout, atomic single-use consumption, session revocation, and authenticator re-enrollment. Go and web both reject MFA freshness from before the current enrollment generation. `/en/admin/security` and `/bn/admin/security` contain real controls and session status; EN/BN and existing Ink & Bone/theme/font are preserved.

Additive `0006_pg01_mfa_recovery.sql` was applied to Neon after isolated CI success. Existing users and MFA enrollment counts were unchanged. Earlier migrations, existing secrets and concurrent PG02 work were preserved. The explicit one-off guarded script applies only this additive migration; it is not a replacement migration runner.

### Build and deployment provenance

- [CI 38123567627](https://github.com/masharzy/ekmivo/actions/runs/38123567627) on `d2484ad`: all three jobs PASS, including real isolated PostgreSQL owner write/viewer denial, repeated additive migration, atomic code consumption and runtime-role recovery-table denial, Go tests/build, Next lint/types/build and unchanged Kotlin build/tests.
- [CI 38124238106](https://github.com/masharzy/ekmivo/actions/runs/38124238106) on `42fc75d`: all three jobs PASS. This includes the localhost/preview proxy Origin correction; local production build and focused lint also passed.
- Render Go `d2484ad` was deployed LIVE (`dep-db5k6cqvcj2c73eo3vs0`). Production target: `https://ekmivo-go-api.onrender.com`. `/readyz` remains intentionally 503 because financial engine readiness belongs to later PGs.
- Vercel production Git build `3cc4eeef` is READY/promoted (`dpl_BhoL1bA8oVqpCfGUpG5t7Q1quh8D`). Git ancestry verified that it includes core PG01 `d2484ad`. Actual production HTTP tests use `https://ekmivo-web-masharzys-projects.vercel.app`.
- Vercel commit status for `42fc75d` reports **Deployment rate limited — retry in 24 hours**. Thus core PG01 live behavior is tested, but the additional localhost/preview-origin hardening is not claimed deployed. The earlier blanket claim that no newer web build exists was superseded by the inspected Git build; the newest source still has a quota blocker.

### Actual HTTP/action outcomes

[completion-http-results.json](completion-http-results.json) records expected and actual status, safe response, account role and relevant DB assertions. All security actions use a dedicated short-lived Super Admin/workspace owner; actual viewer writes use a separate viewer. Anonymous/expired/revoked cases are explicitly labelled. Server Actions use real RSC transport: a business denial or redirect may have HTTP 200, so expected safe text/redirect and subsequent API/DB assertion determine success, not HTTP status alone. Recovery codes, cookies, passwords, seeds and raw action output are never recorded.

Tests cover owner write persistence vs viewer/wrong-tenant denial, removed membership, expired/revoked sessions, missing MFA, proxy authentication/role-header spoofing/Origin/destination denial, real TOTP challenge, EN/BN × light/dark security SSR, recovery generation/hash-only storage/rotation, old-code and wrong-password rejection, fresh recovery, other-session revocation, consumed-code reuse, supported reset, cleared enrollment/codes/session freshness, password-confirmed re-enrollment, old authenticator rejection, old-generation freshness denial, persistent recovery lockout across sessions, audit and fixture cleanup. Earlier [production-http-results.json](production-http-results.json) independently records three-tenant/environment and TOTP replay/lockout negatives. It is a historical audit with obsolete missing-feature entries; the new completion report closes those implementation gaps.

Fixture sessions are seeded in the deployed control plane using the application's real format; this tests authorization and actual supported MFA actions, **not** signup/login issuance or a physical authenticator app. Real HTTP effects and Neon assertions are not mocked. Only dedicated test identities/workspaces are created and removed; existing owner and financial records are untouched. CI atomic-consumption evidence is not represented as a simultaneous production HTTP race.

### Reproducible browser walkthrough

Use a dedicated verified test administrator, never the sole real owner. Sign in normally and open `/en/admin` or `/bn/admin`: before MFA it must redirect to `/admin/mfa`. Confirm password, enroll a test authenticator and submit a current code. Open `/admin/security`; the Go session status must become connected. Confirm password and generate recovery codes; save privately because they appear once. Rotate; the previous set must fail.

Sign in in a new browser profile and use a current unused recovery code on `/admin/mfa`. It should redirect to Security; the other session must lose access. Try that code in another fresh session: invalid/used. On Security, confirm password and reset the authenticator; current admin privilege and other sessions must be invalidated. Enroll a new authenticator with password; the old key must not restore access. Use only test accounts for five-failure cooldown testing; a new session cannot clear the lockout.

For exact automated HTTP reproduction, from `apps/web` set `PG01_ALLOW_PRODUCTION_FIXTURES=true` and run Node with the securely pulled ignored env file: `node --env-file=<ignored-file> scripts/pg01-completion-http.mjs`. Default target is the approved production web and Go. It creates and cleans dedicated fixtures; it is deliberately not an ordinary CI test. No laptop Docker is used.

If all recovery codes and the authenticator are lost, there is deliberately no public password-only bypass. Escalate through an identity-verified authorized operator; do not delete the sole owner's MFA record ad hoc. An operator break-glass workflow is not claimed implemented by PG01 recovery-code support.

Remaining manual UI/device checks and latest-source deployment parity are centralized in [MANUAL-VERIFICATION.md](../../MANUAL-VERIFICATION.md). Security implementation and passing automated live evidence do not assert completed physical-device/browser QA or payment gateway release acceptance.
Final production run: **51/51 assertions PASS**, including dedicated fixture cleanup. All required HTTP security/lifecycle cases passed; remaining acceptance distinctions above still apply.

### Owner confirmation — 2026-10-11
Owner reported **All pass** for the supplied PG01/PG02/PG03 combined checklist. Record this as owner-reported browser smoke, not agent-observed physical authenticator/device/provider testing. PG01 security lifecycle was independently repeated against deployed HTTP with dedicated fixtures: 51/51 PASS, cleanup included; existing owner enrollment/recovery data were untouched. The owner subsequently deferred admin UI work. Admin UI expansion remains out of this checkpoint. PG02 route latency and full-shell loading were reported separately and are being corrected; do not erase that performance follow-up.
