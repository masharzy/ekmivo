> **Unified dashboard Phase 10 code seal — 2026-10-24:** 56/56 parity entries reconciled: 55 implemented/tested and one honest upstream website-voice block. Exact code `23d84cf` passed all four Foundation jobs in [40076150642](https://github.com/masharzy/ekmivo/actions/runs/40076150642), including 796 isolated financial assertions and the final broadcast, member-channel and payment-link suites. [Final code evidence](evidence/BRIOFOLD-PHASE10-CODE-SEAL-20261024.md). No merge/deploy/production migration or live provider/device acceptance is claimed.

> **Owner runtime direction — 2026-10-16:** Temporarily host the existing Sandbox and Live River workers inside the current Go API process; no extra paid worker service. Preserve separate restricted realm credentials, financial databases and queues. Shared runtime and restricted credential configuration are now deployed with owner authorization. Both realm critical/export/maintenance heartbeats are true and `/readyz` returns HTTP 200 (`release_verified=false`), verified 2026-10-16 14:46 UTC. Evidence: [API-hosted workers](evidence/API-HOSTED-WORKERS-20261016/README.md).

> **Production plan rollout — 2026-10-16 14:20 UTC:** Owner-approved control 0067 and financial 0068 applied to production Neon, existing financial rows/subscriptions preserved. Vercel and Render API live on merged `65d6f80`. Public catalog currently has zero published plans; configure in Admin → Plans. Inline signed-phone verification remains independent of standalone workers. Background worker health is false and `/readyz` remains 503; no full financial release acceptance or new paid worker deployment claimed. Evidence: [managed plans](evidence/MANAGED-PLANS-20261016/README.md).

> **Owner pricing decision — 2026-10-16:** Payment gateway subscriptions belong to a workspace. Unlimited websites, apps and bots share one successful-payment allowance across all API keys; domain matching is not licensing. Reserve on new Live checkout, consume once on verified completion, release unpaid cancellation/expiry. Exhaustion/expiry restricts new checkout creation only; accepted verification, receipt forwarding, refunds and webhook retries continue. Admin configures versioned Free (finite or always free), Paid and Custom plans, feature/resource limits and audited grants. AI remains separate prepaid billing. Earlier limits-OFF wording is historical: production activation requires reviewed 0067/0068 plus matching runtime rollout. No production activation or real subscription purchase is claimed. [Implementation and evidence](evidence/MANAGED-PLANS-20261016/README.md).

> **Integrations & events source update — 2026-10-14:** Developers/Webhooks/Events/Integrations redesigned with real existing APIs, scoped credential/sandbox tools, staged rotation/replay and safe audit/API/attempt-history source. Additive 0058 and existing coordinator support added. Local Go suite, TypeScript/Next build, browser simulation (64 locale/theme/viewport cases) and sandbox rollback SQL passed; no permanent migration/deployment/live-receiver acceptance claimed. Evidence: [INTEGRATIONS-EVENTS-20261014](evidence/INTEGRATIONS-EVENTS-20261014/README.md). Entire PG acceptance is unchanged; consolidated manual ledger lists release steps.


> **Main merge and PG02 navigation follow-up — 2026-10-12:** PR #10 merged into `main` at `8b3c8e8f6b25d36d6af3305c1c22adad96f72eb7`, after the feature-branch Actions run `38266674244` completed all four CI jobs successfully. Subsequent direct-main source commits `86d4ae1` and `9626b13` remove the client-transition immediate dashboard skeleton swap and add a structural regression assertion; the server route's content-only streaming fallback remains. Direct-main post-change CI, deployed browser latency and production parity have not yet been independently verified. PG10–PG17 source/acceptance, privacy erasure/retention, connector setup and real provider/device/manual release gates stay OPEN. Migrations 0016–0044 were not applied to production as part of this merge.

> **2026-10-13 Android SMS reliability repair (PR pending):** Root symptom: merchant phone had a local pending bKash SMS but backend forwarded count was zero and the phone's last recorded heartbeat predated the SMS. Android receipt enqueue changed to urgent WorkManager wake (replace stale/backoff chains), constrained retry with persistently recorded non-sensitive HTTP/transport status; manifest SMS receiver and reboot receiver use goAsync for short enqueue/scheduling. Android connected screen shows ONLY unsent receipts, removes them on durable server ACK, and has a simple "all SMS sent" state. Optional historical recovery moved to Settings. Rebuilt APK 0.2.1 must be tested on the actual device after build. Prior local encrypted queue MUST NOT be deleted/uninstalled until forwarded/recovered. Real phone, network, OEM background and boot checks manual pending. No SMS receipt is itself proof of a verified payment.


> **2026-10-13 — Offline SMS and late-refund source PR #19:** Latest owner flow eliminates SIM receiving-number mappings and checkout receiver selection from verification; backend uniquely matches signed phone workspace+provider+full payer+amount+original transaction time, app stores/retries encrypted receipts and exposes recovery UI, and SQL 0051 creates seller-managed refund cases for eligible cancelled/expired transfers. Plan limits are OFF, not infinite hardcoded. Code is on `codex/offline-sms-late-refund` and **not production accepted or migrated**. First CI attempts failed before executing any job steps; no Go/Android/SQL pass claim. Manual ledger: `docs/evidence/PG06-OFFLINE-SMS-REFUND.md`.


> **Release-readiness audit, 2026-10-12:** Branch push is a source handoff, not a gateway release. The workflow does not run on this feature-branch push. PG10–PG17 source/acceptance remain open, PG02 extended latency work remains open, migrations 0016–0044 are unapplied/unverified, and no controlled real-device bKash/Nagad/Rocket five-field payment, public signed merchant webhook, isolated restore, measured production performance or observed paid cohort is recorded. Latest Kotlin change has no APK build evidence. Production/market readiness is **NO** until the payment release gates pass. Regulatory classification and permitted merchant/provider usage require owner-led review before public launch.

> **Pushed source checkpoint, 2026-10-12:** commit `7a1cc8acefa0bad2b187c2743ab526d7d65f6bbc` is on `origin/codex/pg10-pg17-code`. Older “local only/no push” lines below describe earlier snapshots. Working tree was clean after push. PG10–PG17 source and acceptance remain OPEN; migrations 0016–0044 are unapplied, and no production deployment or real provider/device proof is claimed.

# Implementation status and remaining work

### Local continuation checkpoint — 2026-10-12

All changes remain local on `codex/pg10-pg17-code`. Migrations 0016–0044 are unapplied/unverified; no deploy/push/production migration occurred.

Added source: tenant/environment-bound refund/statement filters and cursor pagination (0042); owner/password-confirmed privacy request/store evidence workflow (0043) plus bounded, encrypted read-only SQL-store export executor; public merchant checkout branding (0044); actual account/customer/refund/statement report sections and account picker; immutable unknown-outcome checkout retry; persisted async CSV-export job/key across navigation; Bengali upload filenames end to end; bounded TypeScript SDK transport and Go/PHP/Python upload parity; isolated sandbox-tool origin with no Live fallback; maintenance/invoice worker readiness; authenticated receipt ingress limits; thirteen matcher SQL fixtures plus refund/upload/privacy authority cases; receipt/worker/authenticated-read load source; release evidence credential/calendar/time rejection. A build-blocking receipt route configuration re-export was fixed.

Checks run on the local working tree: Go `go test ./...` PASS; main web TypeScript PASS; payment-example TypeScript PASS; full web lint exits 0 (9 warnings remain); Next production build PASS after the receipt-route fix; generated OpenAPI/client drift and schema validation PASS (58 extension paths, 40 SDK operations); Go SDK compile PASS; Python AST syntax PASS (3 files); release/SDK/privacy registry tests 17/17 PASS. Load/privacy executor syntax checks PASS. These are source checks, not CI/deployment or SQL integration evidence. Database tests may skip without their explicit database configuration.

**Source completion remains OPEN.** Missing code still includes complete privacy object/cache/backup export and erasure/retention execution, complete connector/source setup diagnostics and clean-account harness, full failure/security/browser/design coverage and final settings/draft/state/schema parity. SQL-store export does not export private-object bytes or erase anything. PG02 extended has NOT started in this continuation; existing shell source is not a new latency/region verification. Do not label these gaps manual-only or mark PG10–PG17 accepted. Full acceptance also needs disposable SQL migrations/race tests, real device/provider/merchant/storage/mail/account flows, measured load/restore, deployed region/latency and observed cohort days.

## Active PG10–PG17 source work — 2026-10-12

Owner authorized complete source work now, combined verification afterward. Branch `codex/pg10-pg17-code`; all changes local. Additive migrations 0016–0044 are **unapplied/unverified**. No push/deploy or production data change.

Implemented partial source: documents/customers/invoices/links/public checkout/private scanned uploads and encrypted async export; seller-managed refund request and statement backend; integration configuration; reports/team/settings/support/notifications/separate platform billing; generated contract/client sources and signed webhook validation examples; recovery/evidence/release-support tools. See individual [PG10](evidence/PG10/README.md), [PG11](evidence/PG11/README.md), [PG12](evidence/PG12/README.md), [PG13](evidence/PG13/README.md), [PG14](evidence/PG14/README.md), [PG15](evidence/PG15/README.md), [PG16](evidence/PG16/README.md), [PG17](evidence/PG17/README.md) for remaining code. **Source completion and acceptance are both OPEN.** Basic Go compilation/TypeScript checks during coding are not database/browser/provider verification.

### Owner continuation and PG02 extended — 2026-10-12

Finish remaining PG10–PG17 source before PG02 extended. Source/acceptance remain OPEN. All current changes are local on `codex/pg10-pg17-code`; no push/deploy/migration.

Latest continuation closes document action version guards, lost-response retry keys, whole-batch customer import idempotency, invoice-send/export permission boundaries, expired-event sweep starvation and extension-schema readiness. Generated OpenAPI covers 57 new paths; merchant/public registry contains 40 operations. Website/custom-bot hosted checkout adapter reads the merchant's stored total and reuses the order key. Sandbox adds missing payer/amount, wrong method/account and unknown direction fixtures; no real receipt evidence.

Checks actually run: Go API/worker compile and main web TypeScript before the latest import/fixture edits; current contract generation/drift/OpenAPI validation PASS; separate TypeScript SDK/webhook/website example check PASS; release validator negative unit fixtures 5/5 PASS. PostgreSQL migrations, extension SQL smoke, browser and real device checks NOT RUN. Final source-wide checks remain due.

Latest added source: reviewed-policy raw receipt redaction with holds (0040, disabled by default), durable pre-upload reservation/orphan recovery (0041), Shopify exact-amount external/manual recording adapter with no blind unknown-outcome retry, source-manifest generator, customer picker search and correct accessible radio/checkbox fields. Shopify account capability is an external blocker; see integrations/shopify/README.md. TypeScript SDK/consumer/website/Shopify check PASS; targeted lint for seven new screens PASS after fixes. No Shopify transaction or new SQL test has run.

Remaining source: privacy export/deletion and full retention registry/execution, complete approved connector setup/diagnostics, full sandbox/failure/load/design coverage and final UI/state/contract parity. Existing per-PG OPEN items must be reconciled, not treated as passed.

PG02 extended follows this source work: retain header/sidebar across same-product route changes; suspense only the target content with its matching skeleton; preserve draft/role/environment controls. Measure authenticated route/API/data timings and confirm actual deployed execution region against the database region. Earlier `sin1` configuration is not proof of deployed region or latency. Owner intends a five-day combined live test pass after deployment; no days have been observed or release gate closed.

### Latest PG06–PG09 code checkpoint — 2026-10-12

Application source `9131284dbb908df3e36a3b188e93f8001f659a36` is pushed to `codex/pg06-pg09-code` ([draft PR #9](https://github.com/masharzy/ekmivo/pull/9)); main/production remain unchanged. This follow-up adds consent-verified customer receipt emails, isolated transactional notice outbox, TLS SMTP and unknown-outcome recovery, owner/admin audited resend, Go pre-persistence unrelated/OTP rejection, and signed HTTP integration coverage. Latest exact-source CI outcome is recorded in the [current audit](evidence/PG06-PG09-AUDIT.md). Earlier foundation-only descriptions below are historical, not current source inventories.

PG06–PG09 production acceptance remains OPEN: real Android/provider, SMTP/public merchant and combined deployed browser checks are not represented by synthetic tests. PG05 live checkout issuance remains a missing earlier code dependency. Later lifecycle producers, complete privacy/retention/recovery and generated SDK remain with their documented owners. PG10–PG17 were not started under this narrowed request. [Notice setup/recovery](evidence/PG08/RECEIPT-NOTICE.md); [manual ledger](MANUAL-VERIFICATION.md).

### Latest measured performance checkpoint — 2026-10-11

Source de688397886ac2118cd1385f1a32e7f0399e6791 is pushed. [CI 38132058044](https://github.com/masharzy/ekmivo/actions/runs/38132058044): all three jobs PASS, including actual section skeleton rendering, Next production build and isolated database/security checks. Local exact-source production build PASS; local Next production HTTP/RSC against real Neon and deployed Go: PG02 21/21, PG03 37/37, dedicated fixture cleanup PASS. See per-item local-performance-control-plane.json; these are not deployed web parity or browser interaction evidence. Chrome connection unavailable; fallback local browser sign-in was not completed, so no new browser PASS is claimed. Its dedicated fixture was removed and local server stopped.

Measured previous production full responses: first Overview 4859ms, warmed Overview 2452–2465ms, Developers 2896–2917ms. Headers stream earlier. Vercel execution region iad1 versus Singapore Neon adds inter-region trips; dashboard reads use Next directly, so this measurement does not establish Go CPU saturation. Changes pin sin1, parallelize independent reads, deduplicate within-request auth reads, preserve product layout/sidebar and display content-only target skeletons. Fresh authorization remains required; no cross-request identity cache.

**LIVE PERFORMANCE FOLLOW-UP BLOCKED:** GitHub Vercel deployment status for de68839 is failure: Deployment rate limited — retry in 24 hours. Production still serves previous source 66ee26a. No post-deploy speed result is claimed. After quota resets, deploy this source, confirm sin1 from deployment/request metadata, repeat authenticated full-response latency and actual route/dirty-form/environment browser checks. Do not upgrade a paid plan or mark this follow-up closed without evidence.

Owner reported All pass for supplied PG01/PG02/PG03 functional checklist; that evidence is owner-reported. Prior agent-observed post-fix production checks remain PG01 51/51, PG02 21/21, PG03 37/37. Admin UI expansion is deferred by the owner. These results do not accept PG04 financial engine, all future financial screens or real device/provider flows.

---

Historical checkpoints below are superseded where explicitly corrected above.

Checkpoint: 2026-10-11; inspected working tree based on Git HEAD **164afe8**. This report includes local uncommitted dashboard work; it is not a production deployment claim. Plans/tests from earlier turns are cited, not represented as fresh provider tests.

## বর্তমান ফলাফল

Repository/web/auth/dashboard foundation শুরু হয়েছে। **Running payment gateway এখনো তৈরি হয়নি।** Go business API, financial schema, auto-matcher, merchant API, signed webhook delivery, sandbox and receipt bridge are not implemented. No recorded end-to-end live automatic payment evidence exists in this repository checkpoint.

A completion percentage would mix screens, source code, deployed behavior and real-provider evidence. Track accepted work packages instead. Newly defined phase-1 PG00–PG17 gates are all open; existing foundation work is credited below. This does not mean no code exists.

| Area | Actual evidence | Status | Remaining |
|---|---|---|---|
| Monorepo/runtime | apps/web, backend API/worker, contracts, infra, mobile/bridge/extension folders | Partial foundation | Reproducible local DB/services, dependency/security fixes, active CI |
| Public web | Bilingual V3 Ink & Bone landing, self-hosted Hind Siliguri, login/register/recovery pages source | Implemented source; prior deployment evidence for foundation | Complete public/help/legal/pricing/status claims, rendered audit, current deployment parity |
| Auth/workspaces | [auth](../apps/web/src/lib/server/auth.ts), [account actions](../apps/web/src/actions/account.ts), migrations 0001/0002 | Source present; not complete production-security evidence | Go identity boundary, granular capability, removed/revoked tests, MFA, live recovery/mail evidence, session/CSRF hardening |
| OTP/admin | Recovery adapter/forms, admin toggle/audit/role source | Partial | Real email/recovery, bootstrap/MFA/least privilege and deploy validation |
| Separate dashboards | [navigation](../apps/web/src/lib/dashboard-navigation.ts), [frame](../apps/web/src/components/dashboard-frame.tsx), local two-level routes | Local UI foundation | Environment selector, last-page persistence, real record search, all data/actions/details/states, visual/device evidence |
| Theme/locale | Tokens, bilingual labels, selectors | Partial D01/D02 | Complete catalog, cross-tab/OS sync, filter/draft preservation, four-combination/mobile/a11y checks |
| Tenant isolation | Membership checks in web; schema FK for current identity | Partial application boundary | Financial RLS/runtime roles/composite tenant-env FKs/jobs/storage/SSE/export tests; no financial isolation claim |
| PostgreSQL | Auth migration source; server-side connection adapter | Source/config available | Live schema/application validation not repeated here; financial migrations absent; Go readiness not DB-backed |
| Go API | [main.go](../backend/cmd/api/main.go) has healthz; readyz returns 503 database_not_configured | Skeleton | All product endpoints/auth/DB/commands |
| Go worker | [worker](../backend/cmd/worker/main.go) exits jobs-not-implemented | Skeleton | River setup/durable jobs/retries/operational queue |
| API contract | [OpenAPI](../contracts/openapi.yaml) documents health only | Skeleton | All merchant/public/device/domain schemas, generated clients, compatibility tests |
| Payment records/matching | No financial Go packages/migrations in inspected tree | Not started | Five-field matching, atomic consumption/allocation, exceptions, state/reconciliation |
| Merchant API/keys/webhooks | Route/UI descriptions only | Not started | Scoped hashed keys, idempotent API, signed events, SSRF-safe retries/rotation/replay |
| Checkout/links/invoices/refunds | UI schemas/marketing samples; no authoritative backend | Not started | Complete financial flow and real UI actions |
| Sandbox | No isolated payment test environment/simulator | Not started | Separate data/key/worker/source adapter, named scenarios, test-run evidence |
| Android receipt bridge | apps/android-bridge README only; no Kotlin build | Not started | Phase-1 minimal bridge and real samples/device tests |
| Android merchant/inbox app | Native Kotlin/Compose Gradle sources in apps/mobile; theme/copy/preferences/animated shell and honest connection probes | Foundation source only; CI compile/device gate pending | Secure mobile sessions, actual payments/inbox, Android receipt module and phase-2 acceptance |
| AI/channels/commerce/connectors | Domain navigation/empty state source | Not functional | Full remaining S-ID implementation and native provider access/evidence |
| Reliability/security/recovery | Infra template and planning/runbooks | Partial planning | Active CI, observability, load/failure tests, restore/rollback, operational owner |
| Competitor research | AiPraktor/ZiniPay/PipraPay/Paymently reports and redacted evidence | Research complete within recorded limits | Input for design; not our product implementation proof |

## Recorded checks and limitations

[Dashboard checkpoint](research/DASHBOARD-FOUNDATION-CHECKPOINT.md) records:

- npm ci, TypeScript noEmit and production build passed for local dashboard work.
- Changed dashboard files lint passed; full lint failed on three existing React effect rules in auth-form, workspace-onboarding and marketing-experience, plus existing warnings.
- Production-only dependency audit had zero findings; full audit reported five high development dependency findings. Not a comprehensive security audit.
- git diff whitespace check passed at that checkpoint.
- No complete local rendered/keyboard/mobile/four-theme-locale evidence, no live matching/provider tests.
- GitHub workflow template exists under infra; active CI was not established by prior scaffold work. Verify actual CI state in PG00 rather than assume.
- Previously deployed web foundation URL: https://ekmivo-web-masharzys-projects.vercel.app. This checkpoint did not redeploy/re-audit its current parity. Earlier signed-in browser showed older mixed dashboard; local separation cannot be claimed live.

Current task creates/refines planning docs only. It does not run migrations, change accounts, build Android, implement the financial API, push or deploy a gateway.

## What remains, in the requested order

1. PG00–PG17: finish shared prerequisites and **complete running payment product**, minimal receipt bridge, sandbox, merchant developer API/docs, tested native payment sources, real paid-cohort/recovery evidence.
2. AN01–AN05: Go/web inbox/channel foundation, full Android management/inbox app using existing bridge, push/offline/OS validation.
3. FM01–FM05: full commerce/courier/store sync, all channels and AI/media/voice, booking/Stars/agency, iOS/PWA/extension, analytics/feedback, complete dual-MVP audit.

Exact step dependencies/acceptance in [backlog](IMPLEMENTATION-BACKLOG.md). Exact menus/content in [UX](PRODUCT-UX-SPEC.bn.md). Do not mark an S-ID complete merely because one phase implemented a subset.

## External inputs to record early

| Input | Needed by | Action/evidence |
|---|---|---|
| Real bKash/Nagad/Rocket samples and receiving identities | G0-6, PG06/PG07/PG16 | Consented relevant receipts showing full payer/time/direction; dual-SIM/account binding |
| Android test phone and distribution/signing ownership | PG06/PG16, AN03–AN05 | Permission/background/reboot/offline behavior; supported tested OS/OEM matrix |
| Required native payment provider merchant access | G0-2, PG12/PG16 | Account docs/credentials, sandbox/live permissions, callback/query/refund semantics |
| Hosting/database/email accounts and budget | PG00/PG01/PG15 | Approved secret channel; region/PITR/worker/email configuration and operational quote |
| Business/support/legal/retention policies and price | PG13/PG17 | Real checkout identity, human incident contact, retention and service-billing policy |
| Meta/channel account access | AN01 and full channels | Official app/access/review; no claim of live channel from mocks |

External blockers must be explicit, with affected gates. Continue independent authorized work; don't silently defer capabilities or repeatedly ask for already supplied credentials/approval.

## Status update format for subsequent agents

For each item record: ID + S-IDs; proposed/in_progress/blocked/accepted; code change/commit; relevant automated checks; actual staging/browser/provider/device evidence; unresolved inputs; next dependency-ready item. Separate local/source, deployed, simulated, provider-sandbox and live-device evidence. This report is the latest status summary; history remains in research/checkpoints.

## PG00 execution checkpoint — 2026-10-11

Status: **in progress, not accepted**. Docker is excluded from laptop execution at the owner's request; use hosted isolated test databases for database checks. No database migration or financial write was performed.

- Vercel CLI verified `masharzys-projects/ekmivo-web`. Development env has no DATABASE_URL; production env was pulled into a separate Git-ignored server-only local file. Existing `.env.local` was preserved. Credentials are not included in this repository or handoff.
- Read-only hosted PostgreSQL inspection succeeded. Existing public tables: app_users, auth_attempts, auth_one_time_codes, auth_sessions, platform_admin_audit, platform_administrators, platform_auth_settings, workspace_members, workspaces. No schema_migrations table exists. Do not blindly replay 0002: its named ADD CONSTRAINT is not repeatable. Establish verified baseline/history before implementing the migration runner.
- Auth/workspace duplicate error toast effects removed; inline errors retained. Landing reduced-motion uses an external-store subscription with conservative SSR snapshot and stops autoplay when OS preference changes.
- Targeted ESLint on the three changed components and database inspector, followed by TypeScript noEmit, exited successfully. Earlier whole lint output is historical; fresh full lint/build checks remain required for PG00 acceptance.
- `apps/web/scripts/inspect-database.mjs` runs a read-only transaction and prints schema table names only; connection errors are redacted. Invoke with a server-only DATABASE_URL via environment, not command arguments.
- Active CI, isolated migration/integration database and complete clean-build evidence remain open. Financial engine and Android bridge remain unimplemented.

Cloud agent starts at PG00 with the committed source and docs. Provision secrets via its approved environment; GitHub contains no database credential. The owner's supplied production connection is not an integration-test target.

## Native Android architecture decision — 2026-10-11

The owner selected one Android-native Kotlin + Jetpack Compose application. React Native and a separate receipt bridge are removed from the design (no source was deleted). Android receipt intake lives in the same app and Go remains authoritative for payment matching/confirmation; iOS is a separate FM04 client. Source foundation work is underway and must not be mistaken for real device performance or payment evidence.

### PG00 CI verified

GitHub Actions `Foundation CI` run [38114530626](https://github.com/masharzy/ekmivo/actions/runs/38114530626) completed successfully on commit `2b9fea86361c61f1b5bf9720c32603d05d76e155`: whole Next.js lint, production build, TypeScript noEmit, isolated PostgreSQL 17 migrations/rollback smoke, Go tests and both binary builds passed. No production database migration or receipt transaction was involved. PG00 foundation baseline is accepted; ongoing Android build/hosting/device gates remain individually open.


### AN03 Kotlin source checkpoint (unaccepted)
`apps/mobile` now contains an actual Gradle/Kotlin/Jetpack Compose Android implementation with Ink & Bone Material3 colors, Hind Siliguri sourced from the existing web fonts, BN/EN copy, DataStore appearance/language preferences, animated merchant navigation, payment/inbox empty states and a real Go HTTP health/readiness probe. No receipt/SMS permissions are requested. A native CI job has passed on run 38115451816: Android debug APK assembly and unit tests (artifact 11693123111); web/Go/PostgreSQL tests also passed. Real Android device/performance/auth/payment behavior remains untested. All AN03/PG06/full inbox release gates remain open.

### Kotlin build CI accepted (source only)
Workflow: https://github.com/masharzy/ekmivo/actions/runs/38115451816 — success on b8247408; Kotlin/Compose assembled and unit-tested APK artifact 11693123111. No real-device benchmark, auth, inbox or receipt tests; PG06 and AN03 remain open.


### PG06 native receipt evidence security helpers (source-only, unaccepted)
Kotlin `receipt/EvidenceGate.kt` implements strict *submission completeness* checks for full payer number, exact amount, original transaction time, enrolled receiving-source binding, method and incoming direction; masked/omitted evidence stays incomplete. `AndroidKeystoreSigner.kt` can generate/sign with P-256 private keys bound to the Android Keystore after enrollment. `DeviceSignature.kt` canonicalizes method/path/transport timestamp/event ID/SHA-256(raw body), and Go `backend/internal/deviceevidence/signature.go` verifies X.509 P-256 DER signatures and transport timestamp freshness. Relevant unit tests added. No collector/permission, device enrollment, actual receipt, payment matcher, webhook or sandbox is integrated; **PG06 remains OPEN**.

### Receipt safety and native Go/Kotlin signature test result
Committed receipt field prefilter, Android Keystore P-256 signer, Kotlin raw-body canonicalizer and Go verifier/freshness helpers. Kotlin and Go unit tests both passed in [GitHub Actions 38115889313](https://github.com/masharzy/ekmivo/actions/runs/38115889313); APK artifact 11693770119. PG06 is **not accepted** until verified device/receipt ingestion, Go enrollment/tenant binding, durable event queues and real five-field matching/webhook evidence. Source/data tests are not live provider evidence.

## PG01 status — 2026-10-11, implementation + deployment verification

**Status: IN PROGRESS, NOT ACCEPTED. PG02 not started.** The owner explicitly paused native Android UI expansion. The existing Kotlin/Compose code remains intact; PG06 signer/validation and AN03 app foundation are partial/unaccepted.

**Source:** Go `backend/internal/authz` validates existing 256-bit opaque sessions against PostgreSQL, revocation/expiry/disabled users, global email verification switch, workspace membership/capabilities, sandbox/live environment and admin MFA freshness; the API exposes only read-only session/access checks, with secure fail-closed role validation. Next.js admin TOTP has current-password enrollment, AES-256-GCM encrypted seeds, replay counter and persistent throttling, and session-bound 12-hour authorization; no bypass/demo credentials. Go tests include actual PostgreSQL 3-tenant authorization checks.

**Database changes:** production Neon `ekmivo` received only additive migration `0003_pg01_admin_mfa.sql` and `0004_pg01_environment_rls.sql` after isolated CI tests. Prior 0001/0002 are preserved and not re-run. Observed 1 existing workspace, 2 logical environments (not actual payment integrations), 2 FORCE-RLS tenant tables, 3 policies, an automatic context-seeding trigger, and unchanged user count. The SQL-created `ekmivo_financial_runtime` login was verified `rolsuper=false,rolbypassrls=false,rolcreaterole=false,rolcreatedb=false`, without `neon_superuser` membership or schema CREATE privileges. Column grants exclude password hashes and MFA secret ciphertext. The unused Neon API-created `ekmivo_runtime` is elevated and **must never be used** (owner authorization required for removal).

**CI:** [GitHub Actions 38117671893](https://github.com/masharzy/ekmivo/actions/runs/38117671893) on `c29287ba` passed all three jobs: Go compile/unit including role+MFA/session guards; real isolated PostgreSQL 17 migration/RLS and 3-tenant x sandbox/live cross-access/rollback/connection-reuse tests; RFC6238 TOTP tests; web lint/TypeScript/production build; unchanged Kotlin debug APK build/tests. This is **source/integration simulation**, not a live financial transaction or receipt test.

**Open acceptance:** Owner has not completed live authenticator enrollment; no actual authenticated production admin MFA walkthrough or production Go host runtime SQL connection probe has been completed. A Neon owner connection cannot `SET ROLE` to the restricted runtime role, so production FORCE-RLS behavior was inspected by metadata/privilege checks, while the full runtime-query negative tests passed in isolated PostgreSQL. API financial readiness stays 503. Do not mark PG01 accepted or begin PG02. Full details: [PG01 evidence](evidence/PG01/README.md).

### PG01 live Render startup verification — 2026-10-11
Render `ekmivo-go-api` Singapore service `srv-db5j532d0e5s73fli4h0` deployed Go build `16fd3351` live; runtime log confirmed dedicated nonprivileged Neon role and zero tenant/environment rows without transaction-local RLS context. Required DB env configured with fail-closed `EKMIVO_REQUIRE_AUTHZ=true`, secrets not logged. Owner's real TOTP enrollment and fresh MFA session verified in Neon (1 each). PG01 **still open** for authenticated production HTTP negative tests and admin role/MFA recovery walkthrough; PG02 not started. See `docs/evidence/PG01/README.md`.

## Independent PG01 verification — 2026-10-11

Live Go HTTP authorization was tested using dedicated transient control-plane fixtures: three tenants, viewer capability denials, removed membership, expired/revoked sessions and MFA-gated admin access. Full expected/actual endpoint/status/DB assertions and limitations are in [PG01 evidence](evidence/PG01/README.md) and its production-http-results.json. The same source includes an opt-in redacted verification harness. Existing owner credentials/MFA and financial records were untouched; cleanup is separately asserted.

**PG01 remains not accepted.** Actual workspace writes, approved web-to-Go session proxy and user-facing audited MFA revocation/recovery (including one-use recovery codes) are not implemented/testable. Capability denial and simulated enrollment revocation are partial evidence, not substitutes for those flows. No PG02 advance authorized by this verification.
Concurrent update: the remote repository now contains PG02 UI work (observed during this audit and preserved). This does not change PG01's open acceptance status. The final verification run reports 34 passing assertions and 3 NOT_IMPLEMENTED coverage items; supported revocation/recovery lifecycle remains incomplete. See PG01 evidence for exact boundaries.

## PG02 started — implementation checkpoint, NOT accepted (2026-10-11)
Explicit owner instruction permits PG02 implementation while independent PG01 security verification finishes; the earlier strict serial rule still applies to **acceptance and PG03 advancement**. Native Kotlin Android source is preserved, Android UI expansion remains paused, and PG06/AN03 are still partial/unaccepted.

**Source implemented:** existing web dashboard shell now uses payment-first routing for both-service businesses; real member-owned business selector with search/role, product switch with actual entitlement-by-mode and remembered destination, server-authorized Sandbox/Live context from `workspace_environments` cross-checked with user membership/disabled status, explicit env in payment URLs and workspace-specific remembered env, scoped Ctrl/⌘K keyboard page search, profile/settings/help/logout, truthful notification/backend-unavailable states, responsive Ink & Bone topbar/drawer, bilingual navigation/loading/error/forbidden states, cross-tab theme sync and language change retaining environment/query. Commerce feature links not implemented in phase 1 are labelled in development and not shown as working actions. Broken placeholder "No records yet" was corrected to data service unavailable. No synthetic payment rows or mark-paid action were added.

**Automated checks:** `apps/web/scripts/pg02-navigation-smoke.mjs` tests payment-first selection, authorized products/sections, localized navigation and strict payment env URLs. `apps/web/scripts/pg02-tenant-context-smoke.mjs` checks two actual disposable PostgreSQL workspace/memberships, cross-business denial, suspended live environment, disabled/revoked actors and rollback. Both are required in CI; latest combined run outcome must be checked independently and is not presumed passing from source alone.

**Open PG02 gates:** full browser QA for 320–1440px, theme+locale four combinations/OS and cross-tab, keyboard dialog focus restoration, draft save/discard/stay policy, route back/refresh and last-page state, production user-permission negative browser tests, global record search/notifications when provider event APIs exist and real domain UI/action contracts of later PG items. Shell source and isolated test evidence do not complete a working payment gateway or the full D01/D02 screen inventory. `docs/evidence/PG02/README.md` owns the detailed checklist.

### PG02 implementation evidence — 2026-10-11

**Source implemented; CI PASS; owner manual acceptance pending.** See [PG02 report](evidence/PG02/README.md) and [combined manual register](MANUAL-VERIFICATION.md). New product-access migration `0005` applied on production Neon, business AI/Payments/Both/Off state and audit writes restricted to owner/admin, Go payment authorization enforced by RLS product access. Real account profile/session management, per-user draft save/restore/discard, responsive EN/BN controls and explicit disconnected data states added. [CI 38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845) all green. Render Go live at SHA `61105edf` with restricted Neon startup probe PASS. Remaining production browser/manual checks are batched; **not accepted as financial functionality**. PG01 independent verifier still owns final acceptance review. Continue dependency-ordered source implementation without waiting for manual test rounds as authorized.

### PG02 final-source hardening / deployment blocker (2026-10-11)

New PG02 patches: blocked locale cookie persistence (`8c0f6cde`), actual keyboard-search focus restoration (`2b6dc631`), BN workspace/role labels (`e875db0b`), account-scoped profile drafts with Save/Discard/Stay (`7e0bf1e7`), both-product-disabled business draft guard (`aecead77`), and React-cleanup-safe mobile menu focus return (`3579c608`). Added a component-level locale/theme guard smoke test in CI and corrected its own cookie/localStorage mock fixture. **Latest combined green CI pending at this point**; previous full green SHA `61105edf`, [run 38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845).

**Web production parity BLOCKED** by Vercel daily deployment quota (`api-deployments-free-per-day`, 402, 2026-10-11). Newest confirmed READY `ekmivo-web` artifact remains SHA `356575bb`, behind latest source. Render Go `61105edf` live and Neon 0005 product/RLS schema inspected; financial endpoints and actual payment success remain unimplemented. Latest source completion does not imply web deployed or owner manual acceptance. One combined checklist: [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md).

### PG02 corrected latest-source Vercel parity (2026-10-11)

Subsequent Git automatic deployment of merged code `3cc4eeef` to Vercel `ekmivo-web` was inspected as **READY**, URL `https://ekmivo-5yxe0dedp-masharzys-projects.vercel.app`. This supersedes the earlier temporary daily-quota blocker for *this source build*. The manual deployment API returned 402 but Git integration still deployed successfully. [PG02 PR #2](https://github.com/masharzy/ekmivo/pull/2) is merged and [PR CI 38123777088](https://github.com/masharzy/ekmivo/actions/runs/38123777088) passed all three jobs. **PG02 implementation complete for its bounded UX/control-plane scope**; actual browser/manual owner QA remains OPEN in `docs/MANUAL-VERIFICATION.md`. Future PG03–PG13 real record/payments/notification functionality is **not** implemented or accepted by PG02.

### Latest PG01 completion checkpoint — 2026-10-11

**PG01 IMPLEMENTED — MANUAL PENDING; full production/source-parity acceptance OPEN.** Core missing features are closed in `d2484ad`: actual restricted Go owner/admin settings write, authenticated browser proxy, hashed single-use recovery codes/rotation, persistent lockout, audited MFA reset/recovery/session revocation and password-confirmed re-enrollment. Additive 0006 applied without changing existing users/enrollments. CI 38123567627 and 38124238106 all three jobs PASS. Render core PG01 is live; inspected Vercel READY Git build `3cc4eeef` contains core PG01 by ancestry, and actual deployed HTTP/action tests pass. `42fc75d` localhost/preview Origin hardening has passing CI but its web deployment is rate-limited; do not claim latest-source parity. Exact expected/actual statuses and DB assertions: [PG01 completion evidence](evidence/PG01/README.md) and `completion-http-results.json`. Prior missing-feature statements are historical. Remaining human UI/device checks are in [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md); no payment readiness or completed manual QA is claimed. Preserve concurrent PG02 changes.

### PG03 first implementation checkpoint — 2026-10-11

**PG03 credential code IMPLEMENTED; production acceptance OPEN.** [Merged PR #3](https://github.com/masharzy/ekmivo/pull/3) source `19c7a011`; [CI #38125321809](https://github.com/masharzy/ekmivo/actions/runs/38125321809) 3/3 passing including actual isolated PostgreSQL merchant key hash/RLS/revocation/expiry/isolation, web lint/TS/build, Go bearer auth and Kotlin regression. Backend [Render `dep-db5kljvavr4c73f6636g`](https://dashboard.render.com/web/srv-db5j532d0e5s73fli4h0) is LIVE at `19c7a011`. New UI is real owner/admin-scoped database-driven create/list/rotate/revoke with once-only secret and EN/BN, not a mock financial list. OpenAPI documents only the actual merchant auth route; Go readiness remains 503 pending financial PG04–PG09.

**Release blockers (verified):** Production Neon Ekmivo `merchant_api_keys` table/0007 migration absent; Vercel latest READY source `3cc4eeef` and manual deployment attempt returned HTTP 402 daily Hobby deployment API cap. No successful live key issuance, browser matrix, end-to-end payment/checkout, or signed webhook evidence yet. PG03 source is not production-accepted; all owner interaction and UI/device checks remain in [single ledger](MANUAL-VERIFICATION.md). Detailed negative tests, commit/run/deploy refs and rollout blockers in [PG03 evidence](evidence/PG03/README.md). Preserve PG01/PG02 manual pending; no other PG accepted automatically.

### Independent PG02/PG03 verification — 2026-10-11

**PG02: 21/21 deployed HTTP/action/DB assertions pass; browser 16 pass, 2 reproducible accessibility failures; acceptance OPEN.** Mobile search lacks an accessible name and client EN/BN navigation leaves html lang stale. **PG03: NOT ACCEPTED / release blocker.** 29 passing assertions, 8 unmet assertions: valid key/rotated/live context return 503 from PostgreSQL text[] → Go []string scan failure; OpenAPI also fails strict parsing (unclosed pattern at162, duplicate responses163/189). Deployed Vercel c441dca / Render 4f1c4d6 and green CI were inspected, so these are actual runtime/contract defects, not absent migration/provider credentials. Dedicated fixtures cleaned; no financial/user data or migrations changed. Detailed evidence and fix/retest requirements: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`; manual checks remain in `docs/MANUAL-VERIFICATION.md`. Fix these gates before claiming PG03 accepted or a working merchant API.
### Latest PG02/PG03 correction checkpoint — 2026-10-11
The earlier independent audit failures are resolved in `1ffa7da`. Exact-source Vercel production READY/PROMOTED and Render LIVE verified; [CI 38129786695](https://github.com/masharzy/ekmivo/actions/runs/38129786695) all three jobs PASS. Post-fix deployed assertions: **PG02 21/21**, **PG03 37/37**; targeted connected-Chrome correction checks **7/7**. Mobile search labels and committed HTML language fixed; Go merchant scope scan and invalid OpenAPI fixed, with required real PostgreSQL Go and strict contract regressions. Dedicated test fixtures cleaned; applied migrations/secrets preserved; no local Docker. The four reported blockers are CLOSED. **PG02/PG03 IMPLEMENTED — MANUAL PENDING**, with remaining manual checks in `docs/MANUAL-VERIFICATION.md`; full financial readiness and every-screen acceptance are not claimed. See per-PG README and `post-fix-*.json` evidence. Earlier failure entries are historical, superseded by this checkpoint.


### PG04 source implementation completed — 2026-10-11; owner manual QA pending

**PG04 bounded source implementation: IMPLEMENTED — MANUAL PENDING.** Canonical clean [PR #6](https://github.com/masharzy/ekmivo/pull/6) on `pg04-integrated-current-main-20261011`. Code commit **`12d80eb327aaad1196c6d71d03062ce6004b7b83`** passed [Actions 38135142457](https://github.com/masharzy/ekmivo/actions/runs/38135142457) **4/4**, including 52 isolated PostgreSQL 17 finance assertions, Go PGX/River transactional job+idempotency concurrency tests, actual worker SIGKILL/restart automatic audit-only recovery, restricted control→two physical realm database/version projections, old-version and cross-realm denial, Next.js lint/TS/build, Kotlin unit/debug build, and both runtime/migration Docker image builds. `go.mod` + `go.sum` locked to verified River dependency. Old PG04 single-control-DB queue version is replaced. Full source and tests in [PG04 evidence](evidence/PG04/README.md), owner manual cases in [one combined register](MANUAL-VERIFICATION.md).

**Not production-released.** No PG04 migrations applied to any real Neon financial database, no real provider/device receipt, no live payment verification/checkout/webhook; PG05–PG17 remain independent prerequisites. Production physical financial DB provisioning, role secrets, worker service creation and manual permission/error/restore QA require owner-controlled verification. Do not misrepresent PG04 source completion as a working gateway or completed release acceptance. Documentation-only completion-status commit follows verified code SHA, with no application code changes.

### PG04 independent automated verification hardening — 2026-10-11

Owner requested dependency-independent work while another agent implements PG05. Full PG05–PG17 work packages remain serially dependent; this branch completes the outstanding PG04 automated review checks without changing PG05 routes/UI/schema or production data. Scope: PG04 / F02,F06,P02 / S31,S32,S34.

Implemented populated two-tenant restricted-reader positive/wrong-tenant/no-context/wrong-realm/pool-reuse checks in both physical realms; individually invalid receipt field/source/direction/precision/policy/currency cases with rollback balance assertions; missing outbox job and cross-tenant allocation denials; real competing-connection attempt/funds/intent-cap races; 12-way first-use idempotency with actual intent/outbox/River job and explicit orphan-job absence after rollback. CI verification is pending. Local integration tests require disposable PostgreSQL and skip without it; do not label unit tests as database PASS. No Docker or migration is run on the owner laptop. Production rollout/provider/device verification remains OPEN.

### PG04 independent automated follow-up complete — 2026-10-11

Tested source a8fa3c98ddd55196be02a142f34f3f79e2f40597: [CI 38144576645](https://github.com/masharzy/ekmivo/actions/runs/38144576645) all four jobs PASS. Actual isolated PostgreSQL finance/River harness: **107/107 assertions**; separate Go integration cases pass actual competing-connection attempt/funds/intent races and 12-way idempotent intent/outbox/job creation, including explicit orphaned-job rollback denial. Worker running-job SIGKILL/fresh restart still passes. Restricted populated two-tenant readers tested in both physical realms. Sixteen malformed receipt cases deny with no financial effects; valid control case succeeds.

Earlier independent review automated-evidence gaps are CLOSED. PG04 bounded source and available automated verification are complete; production provisioning/migration/projector/worker rollout and real provider/device release evidence remain OPEN. This does not accept PG05 or later PGs. Local full Go unit tests/vet and both Node syntax checks PASS; no local PostgreSQL integration or laptop Docker is claimed. Application/migrations/UI unchanged; only test code and documentation changed.

### PG05 verified source checkpoint — 2026-10-11

PG05 authoritative minimal order/invoice sources, linked server totals, merchant history and secured payer-locked checkout are IMPLEMENTED and isolated automated verification is COMPLETE. Source a17d5c63: CI 38148742214 all three jobs PASS; actual Next/Go/PostgreSQL Chromium 26/26 PASS, with retained JSON and inspected Bengali dark 320px screenshot in docs/evidence/PG05. This supersedes earlier pending source/CI checkpoints. Draft PR #7 remains based on separate PG04 staging. Deployment and owner acceptance remain OPEN in docs/MANUAL-VERIFICATION.md; no verified payment without PG06/PG07 receipts or full PG10 invoice lifecycle is claimed.

### PG05 integrated source ready — 2026-10-11
Owner authorized clearing PRs and keeping main current. PG05/current-main integration 63e50c8: CI 38150117547 **4/4 PASS**, combined finance **198 assertions**, real browser **26/26 PASS**, all PG04 fixes/tests and image checks retained. Full evidence: docs/evidence/PG05/README.md. PG05 source + isolated automated verification complete; deployment/manual/provider gates remain open. Next dependency-ready source item: **PG06**, native receipt collector inside the SAME Kotlin/Compose application, enrollment/source binding, signed durable upload and consent/offline/reboot tests. Keep Android UI expansion paused; no automatic matching claim until PG07; real consented device/provider samples remain G0-6 evidence.

## PG06–PG09 owner-authorized code-only checkpoint — 2026-10-11

Source written on `codex/pg06-pg09-code`, starting from main `9e0e4d3`. The owner explicitly deferred builds, CI, database/device/provider tests and later bug fixing to conserve remaining usage. **None of these PGs is accepted.** Formatting is not compile evidence, and old green CI does not verify this source.

Read [the code checkpoint](evidence/PG06-PG09-CODE-CHECKPOINT.md) for source coverage, configuration, exact deferred commands and remaining code/dependency gates. PG06 adds consented native capture/enrollment/encrypted queue; PG07 adds five-field atomic matching/allocation; PG08 adds signed durable delivery and a merchant receiver example; PG09 adds scoped operational APIs and functional dashboard source. New migration 0014 is NOT applied; no production deployment performed.

Next work: review and verify this exact checkpoint, close remaining source gaps and prerequisite integrations listed there, then run the combined manual ledger. Do not skip directly to PG10, mark live checkout/notice delivery connected, or reuse historical device/CI PASS labels for the new code.

### PG06–PG09 exact branch follow-up audit — 2026-10-11

Branch `codex/pg06-pg09-code`, baseline `9e0e4d3`, code checkpoint `513ae04`; [mandatory audit](evidence/PG06-PG09-AUDIT.md), [draft verification PR #9](https://github.com/masharzy/ekmivo/pull/9), and [combined manual ledger](MANUAL-VERIFICATION.md). PG06 added Bengali/Arabic/Persian numeric normalization and a live/sandbox parser enrollment boundary fix; new fictional sandbox fixture tests are authored, not proof of a provider receipt. Code exists for PG07 matcher, PG08 callbacks and PG09 operations; the new 0014 migration has NOT been executed, no approved provider/device/payment/merchant E2E exists, and all four PG acceptances remain OPEN. Earlier PR/PG05 green runs are not exact-source verification; current CI must be checked by SHA. Remaining code gaps: quota overflow health, chronological cursor, privacy lifecycle, configured receipt notices, future lifecycle emitters. Live checkout is still SANDBOX ONLY; no real money.

### PG06 isolated source verification completed — 2026-10-11 (NOT PRODUCT ACCEPTED)

Source branch codex/pg06-pg09-code at exact tested SHA **8aaf240be72920c7508502e2f67d75f400da18a8**; CI [38158507367](https://github.com/masharzy/ekmivo/actions/runs/38158507367) **4/4 PASS** (Go tests/race/vet; Android unit+debug build; Docker images; Next lint/OpenAPI/typecheck/build and isolated PG04/PG05/PG06 PostgreSQL). 223 database assertions are COMBINED across stages. PG06 isolated SQL evidence includes dual financial realm apply/replay migration 0014 with FORCE RLS, one-key device pairing/recovery, invalid key denial, health overflow/poison counters, durable duplicate-event ACK, changed bytes denied, revocation and rollback. No production migration.

PG06 code now records overflow and poison errors in native UI and server-side Devices, protects capture using only approved full-message rule, supports Bangla exact money parsing, persists consent-confirmation recovery without auto-collecting, and suspends disabled source authorization. **Code-level available automation is verified.** Real physical SMS/notification collection, OEM/dual-SIM, genuine bKash/Nagad/Rocket full payer/original time, Keystore device networking, force-stop/offline/backlog behaviour, real provider and controlled merchant HTTP E2E remain UNTESTED/MANUAL PENDING. Full signed HTTP-to-DB regression, configured retention/alert and encryption-key recovery also remain open. Product acceptance **OPEN**, PG07–09 unchanged/unaccepted. Reference: [PG06 evidence](evidence/PG06/README.md), [audited gaps](evidence/PG06-PG09-AUDIT.md), [one manual ledger](MANUAL-VERIFICATION.md). This supersedes historical PG06 unverified-source statements only for the tests listed above, not for real-provider or release capability.

### PG07 automatic matcher verified in isolated financial DB — 2026-10-11

**Exact tested source SHA: `a33c9dc308ea7c5ea738d59aaed51dbdd701187a`.** [GitHub Actions 38160139898](https://github.com/masharzy/ekmivo/actions/runs/38160139898) **4/4 jobs PASS** (Go unit/race/vet; Android unit/debug APK; Docker API/worker/migrator; Next lint, OpenAPI, TypeScript, build, PostgreSQL). CI financial logs report `PG07 isolated matching PASS` and **268 total PG04–PG07 combined** assertions. The actual PG07 SQL fixture verified complete five-field unique match, original second/minute boundaries, automatic PG05 state completion, one atomic verified payment/allocation/event/delivery, duplicate-and-parallel worker idempotency, PG05 lock contention yielding pending then recovery, cancellation, late arrival within original window, under/over amount reconciliation without financial credit, stale control entitlement, restricted finance worker role and direct-insert denial. Revised migration 0014 was replayed on disposable sandbox/live realm DBs only, **not** production.

PG07 matcher now uses intent `FOR UPDATE SKIP LOCKED` to avoid PG05's inverted intent/bucket lock deadlock, rejects incomplete/disabled-source/wrong-provenance evidence and maps partial/excess to named reconciliation reasons. No client verification opt-in, manual mark-paid, screenshot or customer transaction-ID shortcut added. **PG07 available source and synthetic database behavior IMPLEMENTED+VERIFIED; PG07 live/product acceptance OPEN.** Real consented source/provider authenticity/full payer/original transaction time, controlled signed Android→Go→DB→worker→PG08 HTTPS merchant proof, production live checkout and receiving instructions are still BLOCKED/MANUAL PENDING (PG05 still SANDBOX ONLY). Do not send real money or apply production migration. Details: [PG07 evidence](evidence/PG07/README.md), [audit](evidence/PG06-PG09-AUDIT.md), [one manual ledger](MANUAL-VERIFICATION.md). PG08 and PG09 acceptance unchanged.

### PG08 merchant signed-webhook delivery source milestone — 2026-10-12

**Exact tested commit:** `d3276dc0a8ef0c62c964a381078f0bec02a82054`. [CI 38165262343](https://github.com/masharzy/ekmivo/actions/runs/38165262343) **4/4 jobs PASS**: Go unit/race/vet including pinned TLS/SSRF tests; Kotlin native unit/debug APK; API/worker/migration Docker images; Next lint/TypeScript/OpenAPI/build and isolated PostgreSQL 17 financial suite. The log reports `PG08 isolated webhook state machine PASS` and `PG08 merchant receiver PASS` with **312 assertions total across PG04–PG08**, not 312 PG08 tests. Actual merchant Go receiver handler was run using local TLS authoritative-query fixture and a separate disposable merchant PostgreSQL database; duplicate event/HMAC/key rotation and once-only fulfillment verified synthetically.

PG08 now supports durable claim leases, bounded jittered 1m/5m/15m/1h/3h/6h/12h retry, terminal ordinary 4xx vs retryable 408/429/5xx/transport unknown, 8-attempt crash exhaustion, safe replay without duplicating verified funds, DNS-pinned public TLS/no proxy/no redirects, and staged once-visible new signing secret → explicit activation/24h old-key overlap → emergency retirement via Webhooks UI. [PG08 evidence](evidence/PG08/README.md) and [consumer guide](../examples/webhook-receiver/README.md). Migration 0014 applied only in disposable CI sandbox/live finance databases; never in production.

**PG08 core webhook/merchant delivery implementation and available synthetic CI VERIFIED. Full PG08 product acceptance OPEN**: customer receipt notice (no verified consent/contact/channel or transport, still **MISSING CODE**); payment.exception/expired/reversed, refund.updated and invoice.paid depend on unimplemented owning lifecycle services; actual public HTTPS merchant receiver/legitimate provider payment, channel notification, staging recovery/key restoration and operator on-call are unverified/manual/external. Customer checkout polling or merchant callbacks are NOT proof of notice delivery. One owner session ledger: [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md). PG09 browser/source completion remains separately OPEN. No live money, deploy or merge.

### PG09 payments operations dashboard/API automated verification — 2026-10-12

**Verified exact code SHA `0b7a4fd4b7d65eaa8d21169b00b427cf1a4064bf`, [CI run 38186957573](https://github.com/masharzy/ekmivo/actions/runs/38186957573) 4/4 PASS.** Go unit/race/vet, Kotlin APK/unit, Docker, Next lint/OpenAPI/TS/production build, disposable isolated PostgreSQL PG04–PG09 **493 combined assertions** and PG09 real Go HTTP/browser-only source tests PASS. These are **493 combined finance assertions, not PG09-only**.

PG09 now verifies source-backed Payments/Incoming/Devices/Receiving Accounts/Webhooks/Events and overview list/detail/actions; full-tenant server search, status/account/method/date filters, chronological timestamp+UUID 50-row cursor and tenant/realm authorization; device rename/revoke and retained history, incoming reprocess without manual paid, account/source disable, webhook enable/disable and delivery history, immutable audit, payment-to-webhook correlation. Real Go HTTP owner/viewer/editor session, 401/403, source 503, wrong workspace/live fail-closed, owner-only endpoint create/disable and once-visible signing secret are exercised against isolated DBs. Browser **UI-only** real authenticated shell with mocked payment API data verifies owner/viewer UI, payment/incoming details, overview, 503 UI and EN/BN × light/dark × 320/768/1440 with no overflow. It is NOT a whole real browser-to-finance backend session. Physical Sandbox/Live boundary was tightened in `pg06_scope`; cross-tenant filter/draft and once-visible secret isolation was fixed on workspace/realm switching.

**PG09 implementation + available isolated automation VERIFIED. Product acceptance OPEN.** Actual deployed staging browser+real backend roles, 1024px, keyboard/focus/Escape, System OS theme, cross-tab/reload/deep-link, source outage/offline and owner workflows remain manual. Current checkout still SANDBOX ONLY, real handset/provider receipts pending PG06, customer notice pending PG08; refunds/export/receipts/invoices/customers depend on later PGs and cannot display fake success. No production 0014 migration, merge, live funds or deploy. [PG09 evidence](evidence/PG09/README.md), [updated audit](evidence/PG06-PG09-AUDIT.md), [one manual ledger](MANUAL-VERIFICATION.md). 

## Latest local source checkpoint — 2026-10-12

PG12 integration edit/diagnostics, PG13 privacy cancellation/object archive/expired-object command, PG14 dedicated Sandbox quickstart source and PG15 backup catalog were added. Full Go test suite, TypeScript, OpenAPI generation/validation (60 paths, 40 client operations), seven archive/registry unit checks, full web lint (0 errors, 9 existing warnings) and Next.js production build passed locally. The quickstart only passed syntax; no HTTP execution occurred. Migration 0021/0043 SQL, Android receipt cleanup, real object storage, managed backups and deployed behavior remain unverified. PG10–PG17 source and acceptance remain OPEN; PG02 extended has not started. No push, deployment or migration was performed.

PG13 settings draft-navigation source was added after the passing full production build. Its targeted TypeScript and ESLint checks pass; browser draft flows and new build have not been repeated.

PG16 received a source-only actual-observation compiler with hash/path/day validation; syntax passed and no real evidence was run.

PG17 release validation now rejects staging release, insecure deployment identity, invalid owner decision, simulated real gates and future cohort days; seven fictional validator tests pass. Production release remains OPEN.

## 2026-10-15 — Single developer guide

Owner requested /developers as the canonical API guide. /docs and /docs/payments now redirect there; dashboard API Docs links point directly there. The large generated endpoint-reference section was removed. Request details, responses and language examples remain within the relevant guide sections. Right code sidebar was removed: examples and Sandbox controls now use the reading column. Visual/navigation evidence: docs/evidence/UNIFIED-DEVELOPER-GUIDE-20261015.md. This does not change payment gates or prove real provider/device verification.


## Owner dashboard/API refinement — 2026-10-15

The latest owner instruction refines the payment dashboard: Payments replaces Transactions in navigation; Payment Links includes the existing one-time requests flow; SMS Data replaces Incoming Receipts. Workspace Billing, Team and Settings are accessed through the workspace gear, and Help through the header. Developers contains API Keys and external API Docs. Legacy deep links and integrations remain compatible. The operational dashboard uses the semantic payment tokens and an original visual direction documented in `docs/design/ekmivo-dashboard/SKILL.md`.

Create Payment may accept an optional per-payment `webhook_url` without dashboard registration. Reuse signed delivery, retries and tenant isolation; callbacks are notifications and merchants must verify server-side before fulfillment. Existing default registered endpoints remain supported. Additive migrations 0063/0064 (financial) and 0065 (control) are implemented and tested on an isolated Neon branch only; production rollout and end-to-end acceptance remain pending. Do not use Docker: the owner requires Neon for database work. See `docs/evidence/DASHBOARD-REFINEMENT-20261015/README.md` and the consolidated manual ledger.


## Production migration rollout — 2026-10-15

After explicit owner approval (push + migrations), existing financial-migrate runner with `EKMIVO_DASHBOARD_UPGRADE_ONLY=true` successfully applied only 0063/0064 to production Neon Sandbox/Live financial databases and 0065 to the control database at 2026-10-15 14:11 UTC. Runner confirmed no base migrations executed. Catalog probes confirm both financial migrations and the Team role fix. Before/after counts unchanged: Sandbox intents 15/payments 2/endpoints 1; Live intents 21/payments 3/endpoints 0. Runtime rollout and actual payment/browser E2E remain separate gates.
