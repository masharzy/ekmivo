# PG03 — scoped merchant API credentials and contract-first auth

**Status: IMPLEMENTATION IN PROGRESS; NOT ACCEPTED.** This is real developer credential control-plane code, not proof of payment/checkout/webhook readiness.

## Intended scope and specification
- Backlog PG03 · P04/F05 · S05/S34/S45: OpenAPI 3.1, sandbox/live credential separation, hashed secret issuance, rotation, revocation, owner/admin onboarding, API auth validation.
- UI: `docs/PRODUCT-UX-SPEC.bn.md` Developers screen; Design System and tokens (EN/BN, Light/Dark/System, 320–1440px, keyboard, loading/error/empty/success/forbidden).
- Dependencies: 0001–0006 PG00–PG02 migrations and existing verified session/membership/Go authorization. PG04 financial schema/outbox and PG05 checkout are separate; leave readiness 503 until real pipeline operational.

## Real source changes
- `infra/migrations/0007_pg03_merchant_keys.sql`: workspace/environment FK, full SHA-256 token digest only, nine whitelisted scopes, expiry, audit, FORCE RLS, restricted database runtime role and constrained credential resolver. Public ID never grants access alone.
- `apps/web/src/actions/merchant-keys.ts`: current-session check, fresh role/product/environment revalidation in same transaction, server-side password confirmation, cryptographically random 32-byte token, expiry + scope validation, separate realm, once-only raw secret in action response, same-scope rotation and immediate revoke, audit and limit. No client-side raw secret persistence.
- `apps/web/src/components/{developer-console,api-key-manager}.tsx`: actual admin authorized key list and creation/rotate/revoke with once-visible copy/hide; viewer/editor forbidden; backend unavailable/error vs real empty distinct.
- `apps/web/src/components/dashboard-content.tsx`: route `/{locale}/w/{id}/payments/developers?env=sandbox|live` is wired to the real control plane, with server-validated tenant context.
- `backend/internal/authz/keys.go` + `backend/cmd/api/main.go`: bearer key authentication for `GET /v1/merchant/context?environment=sandbox|live`; wrong realm, revoked, expired, disabled product, suspended realm and missing scope fail closed. Response has `financial_api_ready:false`, no financial data.
- `contracts/openapi.yaml`: honest implemented Go API paths, environment enum, bearer scheme, safe errors and scoped context contract. Public bilingual first-use guide `/{locale}/docs/payments`.
- `apps/web/src/app/dashboard.css`: responsive key forms, keyboard focus and theme tokens.
- `apps/web/scripts/pg03-credentials-smoke.mjs`, Go tests, GitHub CI required PG03 integration step.

## Verify and record only observed outcomes
- [ ] Full PR 3/3 CI jobs green on final SHA; include run ID and commit.
- [ ] DB migration applied against production Neon using direct trusted migration path, check RLS, grants, policy/function access. Do not infer application deployment from GitHub source.
- [ ] Render Go deployment has new API path; Vercel deploy includes new Developers UI; prod commit parity and safe smoke verified.
- [ ] Create sandbox test key using actual authorized owner/admin password, copy once; refresh and confirm unrecoverable. No browser/Next server logs/URL leak.
- [ ] Query merchant context with real test secret; live-vs-sandbox mismatch 403, revoked/expired 401, missing read scope 403; cannot cross-workspace.
- [ ] Second test account editor/viewer blocked from API keys; disabled product/suspended environment denied. Real browser EN/BN, theme, touch/keyboard, 320/768/1440/zoom and error/offline as consolidated ledger.

**Not PG03 deliverables:** real payment records, payment requests, checkout, incoming receipt matcher, verified status, durable webhook, generated SDK, and Android production payment collection. Do not mark PG04–PG14 accepted by the mere existence of a server auth endpoint.

## Automated evidence
The new CI web job runs disposable PostgreSQL 17 DDL, hash-only storage, missing/no runtime table grants, correct digest authorization, mismatched public ID, revoked/expired, disabled payment product, suspended environment, cross-tenant isolation and rollback; Go tests validate token syntax, environment and fail-closed HTTP route. **Execution results to be filled from CI.**

## Owner manual test source
All manual PG03 and PG00–PG17 requirements are kept in `docs/MANUAL-VERIFICATION.md` for one consolidated owner pass. Do not require one-at-a-time manual interruptions.
