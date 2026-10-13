> **Remote tip:** `018ce2f725929a0d862868027d0f52281b14ea3a` on `origin/codex/pg10-pg17-code`. The source commit is `7a1cc8a`. `Foundation CI` runs on `main` pushes and pull requests, so this feature-branch push has no new CI run. Earlier local checks do not validate unapplied migrations 0016–0044 or the latest Android change. Do not claim market readiness from branch availability.

> **Current implementation — 2026-10-13:** PR [#19](https://github.com/masharzy/ekmivo/pull/19), branch `codex/offline-sms-late-refund`: approved bKash/Nagad parser formats, signed phone server forwarding with unique payer+amount+provider+original-time matching independent of checkout receiving number, encrypted Android receipt history/offline retry/boot wake-up and consented historical inbox recovery, paired-device web status, late receipt seller-managed refund case and SQL 0051. Plan limits OFF (not permanent unlimited). See `docs/evidence/PG06-OFFLINE-SMS-REFUND.md` for limitations/tests. Requires disposable financial-DB migration proof, real Go/Next/Kotlin builds and provider/device E2E; GitHub Actions reported zero job steps on earlier runs. **No production migration/deployment, no verified live money/refund claims.** Supersedes earlier PG06 account/SIM mapping handoffs.


> **Cloud handoff, 2026-10-12:** start from `origin/codex/pg10-pg17-code` at `7a1cc8acefa0bad2b187c2743ab526d7d65f6bbc`, not the older `main`. The source checkpoint is pushed; PG10–PG17 and PG02 extended remain OPEN. No deploy or production migration has been performed. Older local-only notes below are historical.

## Latest continuation — 2026-10-12

### Local continuation checkpoint — 2026-10-12

All changes remain local on `codex/pg10-pg17-code`. Migrations 0016–0044 are unapplied/unverified; no deploy/push/production migration occurred.

Added source: tenant/environment-bound refund/statement filters and cursor pagination (0042); owner/password-confirmed privacy request/store evidence workflow (0043) plus bounded, encrypted read-only SQL-store export executor; public merchant checkout branding (0044); actual account/customer/refund/statement report sections and account picker; immutable unknown-outcome checkout retry; persisted async CSV-export job/key across navigation; Bengali upload filenames end to end; bounded TypeScript SDK transport and Go/PHP/Python upload parity; isolated sandbox-tool origin with no Live fallback; maintenance/invoice worker readiness; authenticated receipt ingress limits; thirteen matcher SQL fixtures plus refund/upload/privacy authority cases; receipt/worker/authenticated-read load source; release evidence credential/calendar/time rejection. A build-blocking receipt route configuration re-export was fixed.

Checks run on the local working tree: Go `go test ./...` PASS; main web TypeScript PASS; payment-example TypeScript PASS; full web lint exits 0 (9 warnings remain); Next production build PASS after the receipt-route fix; generated OpenAPI/client drift and schema validation PASS (58 extension paths, 40 SDK operations); Go SDK compile PASS; Python AST syntax PASS (3 files); release/SDK/privacy registry tests 17/17 PASS. Load/privacy executor syntax checks PASS. These are source checks, not CI/deployment or SQL integration evidence. Database tests may skip without their explicit database configuration.

**Source completion remains OPEN.** Missing code still includes complete privacy object/cache/backup export and erasure/retention execution, complete connector/source setup diagnostics and clean-account harness, full failure/security/browser/design coverage and final settings/draft/state/schema parity. SQL-store export does not export private-object bytes or erase anything. PG02 extended has NOT started in this continuation; existing shell source is not a new latency/region verification. Do not label these gaps manual-only or mark PG10–PG17 accepted. Full acceptance also needs disposable SQL migrations/race tests, real device/provider/merchant/storage/mail/account flows, measured load/restore, deployed region/latency and observed cohort days.

Work remains local on `codex/pg10-pg17-code`. Owner priority: finish incomplete PG10–PG17 source, then PG02 extended persistent-shell/content-skeleton and measured latency/region work. Do not switch to PG02 early or claim the payment service live. No push/deploy/production migration performed. Read the newest checkpoint in IMPLEMENTATION-STATUS.md and preserve all changes.

# Agent handoff: implement payment-first

**Local continuation, 2026-10-12:** PG12 versioned integration editing and diagnostics, PG13 privacy cancellation/encrypted private-object export/expired-object cleanup, PG14 dedicated Sandbox HTTP quickstart source, PG15 authenticated backup catalog with interrupted-expiry hold, and Android receipt cache-key destruction were added. Generated OpenAPI now has 60 paths and 40 merchant operations. Go full suite, TypeScript, OpenAPI validation, seven archive/backup checks and web lint (0 errors, 9 warnings) passed locally; Next production build passed locally. The quickstart and storage/backup commands have not executed against accounts. Migrations 0021/0043 were edited but not applied or SQL-tested. PG10–PG17 source/acceptance remain OPEN. No push, deploy or production migration. See latest IMPLEMENTATION-STATUS.md.

## Current owner scope — 2026-10-12

**Superseding execution update:** PG10–PG17 code implementation is now authorized and active on `codex/pg10-pg17-code`. Work locally; no push/deploy/production migration. User defers combined verification until source completion. Per-PG evidence now lists concrete source and remaining **code**, not merely external tests. Every PG10–PG17 acceptance remains OPEN. Continue remaining source; do not treat this checkpoint as task completion. Preserve default phone auto-verification and seller-managed refund correction in canonical documents.

Finish PG06–PG09 remaining source and available checks, then report. **Do not start PG10–PG17 until the owner instructs.** Branch `codex/pg06-pg09-code` / draft PR #9; no main merge, production deploy or migration performed by this follow-up. Consult the top of [current audit](evidence/PG06-PG09-AUDIT.md), per-PG evidence and [manual ledger](MANUAL-VERIFICATION.md); older missing-notice/UUID-pagination/source-only rows below are historical where corrected. Real Android/provider and SMTP/public merchant/browser evidence remain external gates. The owner said access is ready but its location has not yet been supplied; do not invent access or claim these tests passed.

Updated 2026-10-11. Single canonical implementation plan: **[DUAL-SAAS-MVP-PLAN.bn.md](DUAL-SAAS-MVP-PLAN.bn.md)**. This file is the reading/execution entry, not another product plan.

## Read order

1. Root [AGENTS.md](../AGENTS.md) and applicable nested AGENTS.
2. [Master plan](DUAL-SAAS-MVP-PLAN.bn.md) — architecture and latest user correction.
3. [Feature inventory](MVP-FEATURE-SCOPE.md) — every S01–S46 remains required.
4. [Design system](DESIGN-SYSTEM.md) and [tokens](design/tokens.css) — Hind Siliguri, Ink & Bone, full theme/locale behavior.
5. [Backlog](IMPLEMENTATION-BACKLOG.md) — PG00–PG17 first, AN01–AN05 next, FM01–FM05 afterward.
6. [Payment architecture](PAYMENT-SYSTEM-DESIGN.bn.md), [screen UX](PRODUCT-UX-SPEC.bn.md), [API/sandbox/developer docs](PAYMENT-API-AND-SANDBOX.md).
7. [Actual status](IMPLEMENTATION-STATUS.md) and relevant research/checkpoint evidence; inspect code and git diff before edits.

## Start point and constraints

Current execution task: **PG01 (in progress, not accepted)**. PG00 CI baseline passed. Do not start PG02 until all PG01 gates pass. Existing foundation and local dashboard changes must be preserved. Inspect current source before treating any recorded check/deployment as current. Do not reset working tree, copy competitor source, or rebuild a parallel architecture.

Priority: fully running payment product with sandbox/testing/developer/API docs. Minimal receipt collection is part of the **same native Kotlin/Jetpack Compose Android application** in phase 1 for live phone auto-verification; full merchant Android/inbox UI follows in phase 2. No React Native, Flutter or separate receipt bridge app. Full AI/commerce/other client features remain full-MVP requirements in phase 3.

Verification auto: actual payer number + original transaction time + amount + receiving account + method → exactly one valid request → atomic verified/payment allocation/event/webhook. No customer TrxID, screenshot proof, routine approval, auto-accept opt-in, or second gateway approval for phone path. Receipt IDs internal only. Ambiguity/missing evidence is pending/exception, not arbitrary match.

Go owns money/state/matching. Next.js web/session proxy, Kotlin receipt collection and Compose merchant UI share one native Android app and reuse the Go API. Existing self-hosted auth/migration history preserved and hardened. Vercel web / persistent API-worker / Neon design; no duplicate serverless payment backend.

Separate business/product/environment selectors; separate AI/payment navigation; all promised payment route buttons real. Theme/locale must preserve drafts and context. Current OpenAPI is health-only; API design docs are proposed until implemented/tested.

## Working protocol

- Follow serial backlog dependencies; split large package into concrete endpoint/schema/screen changes. Do not start AI work to avoid an unfinished payment task.
- Before code: identify item/S-IDs, required evidence, current dependencies and applicable AGENTS. Use existing working tree; preserve applied SQL migrations, secrets and user changes.
- Implement and verify authorized work; don't stop at proposing code or creating placeholder pages.
- For each completed item, record docs/evidence/<ID>/README.md with changes/checks/staging/browser/provider/device evidence and unresolved inputs; update backlog/status.
- Simulation, provider sandbox, live device and live transaction are different evidence labels. Account input missing means affected release gate open, not fake success.
- Use approved server-side secret channel; no secrets/receipt PII in source/log/report. Provider/account/business decisions belong to owner. Continue independent work while resolving external input.
- Done means acceptance passed, docs and deployed behavior match, security/data/money tests relevant to change pass. Missing prerequisite isn't silently deferred outside full MVP.
- Finish phase-1 gate PG17 before AN01. Finish Android phase gate before remaining FM implementation. No complete dual-MVP claim until all S-IDs pass.

## Prompt to give the next GPT/agent

Copy this with repository access:

~~~text
Work in the current Ekmivo repository. Read AGENTS.md and the canonical
docs/DUAL-SAAS-MVP-PLAN.bn.md, then the feature scope, design guide/tokens,
IMPLEMENTATION-BACKLOG.md, PAYMENT-SYSTEM-DESIGN.bn.md,
PRODUCT-UX-SPEC.bn.md, PAYMENT-API-AND-SANDBOX.md and
IMPLEMENTATION-STATUS.md. Preserve existing working-tree changes.

Implement serially from PG00 through PG17: first make the payment gateway
completely running, including real five-field automatic phone verification,
the minimal receipt bridge, isolated sandbox, merchant API and signed
webhooks, functional payment screens, tested developer/API docs, recovery
and production evidence. Full Android app + inbox comes next, AN01–AN05.
Remaining full-MVP scope stays required afterward.

Do not create a competing plan, replace Go/PostgreSQL, introduce customer
TrxID/screenshot/manual normal approval, or call a mock/route scaffold done.
Complete dependency-ready work, run relevant checks, record evidence and
update repo docs after each accepted item. Identify external blockers
without inventing provider/device success or silently omitting features.
~~~

## PG01 handoff checkpoint

Additive migrations `0003_pg01_admin_mfa.sql` and `0004_pg01_environment_rls.sql` have been applied to Ekmivo production Neon (existing 0001/0002 preserved). New `ekmivo_financial_runtime` role was created using restricted PostgreSQL SQL and verified **not** to be superuser, BYPASSRLS, CREATEROLE, CREATEDB, schema CREATE, table owner or `neon_superuser` member. The earlier Neon API-generated `ekmivo_runtime` is **elevated and unused**; never configure services with it. Removing that unused role requires explicit owner approval. No secret or connection string is in Git. MFA AES encryption key is stored in encrypted Vercel production env; user must enroll via `/bn/admin/mfa` or `/en/admin/mfa` with current password and authenticator. The real Go service is not yet hosted; `/readyz` stays 503. GitHub CI tests isolated 3-tenant/2-environment RLS, session revocation, disabled users, role changes, email-verification enforcement, TOTP vectors and Go integration. Live user MFA and production runtime-role query need acceptance before PG02.

### Render handoff, PG01 (2026-10-11)
Go service is **live** at `https://ekmivo-go-api.onrender.com`, Render id `srv-db5j532d0e5s73fli4h0`, Singapore Free. Render has `AUTHZ_DATABASE_URL` bound to the restricted Neon runtime role and `EKMIVO_REQUIRE_AUTHZ=true`; startup log on deploy `dep-db5j7e8473hc73bcd8j0` confirms least-privileged DB identity and missing-context RLS isolation. Owner's real TOTP MFA enrollment and active MFA-verified session confirmed. However PG01 remains open for real authenticated HTTP authorization/tenant denials, admin MFA replay/logout/role checks and recovery evidence; these cannot be relabeled as completed based on isolated tests. Financial readiness 503 by design. Do not start PG02 until PG01 accepted.

### Independent PG01 HTTP audit — acceptance OPEN

Dedicated production HTTP fixture tests and browser reproduction steps are recorded in [PG01 evidence](evidence/PG01/README.md). Missing actual write/proxy/recovery/revocation paths remain required coverage; do not interpret read-only capability checks or fixture updates as complete acceptance. Inspect production-http-results.json for current test outcomes before advancing to PG02.
Concurrent update: the remote repository now contains PG02 UI work (observed during this audit and preserved). This does not change PG01's open acceptance status. The final verification run reports 34 passing assertions and 3 NOT_IMPLEMENTED coverage items; supported revocation/recovery lifecycle remains incomplete. See PG01 evidence for exact boundaries.

### PG02 concurrent implementation handoff (2026-10-11)
The owner authorized beginning **PG02 implementation only** while their independent agent runs PG01 final verification. Preserve the independent agent's current commits and never mark PG01 accepted from assumptions. Follow named `PRODUCT-UX-SPEC.bn.md` screen/interaction contracts before authoring any UI. PG02 source now includes member-revalidated business/product/payment environment selection, controlled URL scope, search keyboard dialog, responsive EN/BN Ink & Bone and truthful loading/error/unavailable states. Actual app/browser interaction QA and draft/record/event contracts are still missing; PG02 acceptance OPEN and PG03 blocked. Kotlin UI development stays paused. For this release, a placeholder route/endpoint is never an accepted screen.

### Current PG02 source handoff — 2026-10-11

PG02 source/integration checkpoint tested in [CI 38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845), 3 jobs green. Production additive `infra/migrations/0005_pg02_product_access.sql` applied and verified; existing 1 business has 2 seeded rows, controlled by owner/admin audited actions. Go runtime reads enabled payments via tenant FORCE RLS and denies disabled payment product. Verified Render Go commit `61105edf` live. Web has real profile/current vs other session revoke, per-user business-onboarding drafts, product switch, EN/BN/theme and truthful data-source availability. Manual browser QA has **not** been performed; see centralized `docs/MANUAL-VERIFICATION.md`. Downstream financial API/keys/provider/checkout/receipt/webhook UI remains unavailable rather than “complete.” Owner permits continuing sequential source implementation after CI while manual QA is batched.

### Latest PG01 completion checkpoint — 2026-10-11

**PG01 IMPLEMENTED — MANUAL PENDING; full production/source-parity acceptance OPEN.** Core missing features are closed in `d2484ad`: actual restricted Go owner/admin settings write, authenticated browser proxy, hashed single-use recovery codes/rotation, persistent lockout, audited MFA reset/recovery/session revocation and password-confirmed re-enrollment. Additive 0006 applied without changing existing users/enrollments. CI 38123567627 and 38124238106 all three jobs PASS. Render core PG01 is live; inspected Vercel READY Git build `3cc4eeef` contains core PG01 by ancestry, and actual deployed HTTP/action tests pass. `42fc75d` localhost/preview Origin hardening has passing CI but its web deployment is rate-limited; do not claim latest-source parity. Exact expected/actual statuses and DB assertions: [PG01 completion evidence](evidence/PG01/README.md) and `completion-http-results.json`. Prior missing-feature statements are historical. Remaining human UI/device checks are in [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md); no payment readiness or completed manual QA is claimed. Preserve concurrent PG02 changes.
### Independent PG02/PG03 verification — 2026-10-11

**PG02: 21/21 deployed HTTP/action/DB assertions pass; browser 16 pass, 2 reproducible accessibility failures; acceptance OPEN.** Mobile search lacks an accessible name and client EN/BN navigation leaves html lang stale. **PG03: NOT ACCEPTED / release blocker.** 29 passing assertions, 8 unmet assertions: valid key/rotated/live context return 503 from PostgreSQL text[] → Go []string scan failure; OpenAPI also fails strict parsing (unclosed pattern at162, duplicate responses163/189). Deployed Vercel c441dca / Render 4f1c4d6 and green CI were inspected, so these are actual runtime/contract defects, not absent migration/provider credentials. Dedicated fixtures cleaned; no financial/user data or migrations changed. Detailed evidence and fix/retest requirements: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`; manual checks remain in `docs/MANUAL-VERIFICATION.md`. Fix these gates before claiming PG03 accepted or a working merchant API.
### Latest PG02/PG03 correction checkpoint — 2026-10-11
The earlier independent audit failures are resolved in `1ffa7da`. Exact-source Vercel production READY/PROMOTED and Render LIVE verified; [CI 38129786695](https://github.com/masharzy/ekmivo/actions/runs/38129786695) all three jobs PASS. Post-fix deployed assertions: **PG02 21/21**, **PG03 37/37**; targeted connected-Chrome correction checks **7/7**. Mobile search labels and committed HTML language fixed; Go merchant scope scan and invalid OpenAPI fixed, with required real PostgreSQL Go and strict contract regressions. Dedicated test fixtures cleaned; applied migrations/secrets preserved; no local Docker. The four reported blockers are CLOSED. **PG02/PG03 IMPLEMENTED — MANUAL PENDING**, with remaining manual checks in `docs/MANUAL-VERIFICATION.md`; full financial readiness and every-screen acceptance are not claimed. See per-PG README and `post-fix-*.json` evidence. Earlier failure entries are historical, superseded by this checkpoint.

### Latest measured performance checkpoint — 2026-10-11

Source de688397886ac2118cd1385f1a32e7f0399e6791 is pushed. [CI 38132058044](https://github.com/masharzy/ekmivo/actions/runs/38132058044): all three jobs PASS, including actual section skeleton rendering, Next production build and isolated database/security checks. Local exact-source production build PASS; local Next production HTTP/RSC against real Neon and deployed Go: PG02 21/21, PG03 37/37, dedicated fixture cleanup PASS. See per-item local-performance-control-plane.json; these are not deployed web parity or browser interaction evidence. Chrome connection unavailable; fallback local browser sign-in was not completed, so no new browser PASS is claimed. Its dedicated fixture was removed and local server stopped.

Measured previous production full responses: first Overview 4859ms, warmed Overview 2452–2465ms, Developers 2896–2917ms. Headers stream earlier. Vercel execution region iad1 versus Singapore Neon adds inter-region trips; dashboard reads use Next directly, so this measurement does not establish Go CPU saturation. Changes pin sin1, parallelize independent reads, deduplicate within-request auth reads, preserve product layout/sidebar and display content-only target skeletons. Fresh authorization remains required; no cross-request identity cache.

**LIVE PERFORMANCE FOLLOW-UP BLOCKED:** GitHub Vercel deployment status for de68839 is failure: Deployment rate limited — retry in 24 hours. Production still serves previous source 66ee26a. No post-deploy speed result is claimed. After quota resets, deploy this source, confirm sin1 from deployment/request metadata, repeat authenticated full-response latency and actual route/dirty-form/environment browser checks. Do not upgrade a paid plan or mark this follow-up closed without evidence.

Owner reported All pass for supplied PG01/PG02/PG03 functional checklist; that evidence is owner-reported. Prior agent-observed post-fix production checks remain PG01 51/51, PG02 21/21, PG03 37/37. Admin UI expansion is deferred by the owner. These results do not accept PG04 financial engine, all future financial screens or real device/provider flows.

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

### PG06–PG09 next-agent completion and final audit
Read [the completion checklist](evidence/PG06-PG09-COMPLETION-HANDOFF.md) for all identified remaining source gaps, automated/database/browser checks, real-device/provider gates and the mandatory final audit format. Continue on `codex/pg06-pg09-code`; all four PGs remain OPEN. Report any additional gaps discovered by source review, not only the listed ones.

### PG06–PG09 current audit and actual follow-up

[PG06–PG09 audit](evidence/PG06-PG09-AUDIT.md) on verification-only [draft PR #9](https://github.com/masharzy/ekmivo/pull/9) records exact source corrections, source-vs-simulation boundaries, migration 0014 isolation, unresolved code, CI status, external/device blocks and safe rollback constraints. The four PGs remain UNACCEPTED; do not deploy or merge without closing critical gates. Combine owner-only tests using [the consolidated ledger](MANUAL-VERIFICATION.md). Earlier green CI on PG05 is not evidence for the new branch.

### PG06 verified source focus — 2026-10-11

PG06 was prioritized without implementing PG07–PG09 features beyond shared migration/Devices health/API contract dependencies. Exact tested source **8aaf240be72920c7508502e2f67d75f400da18a8**; [CI 38158507367](https://github.com/masharzy/ekmivo/actions/runs/38158507367) **4/4 PASS**, including Go tests/vet/race, Kotlin debug APK/unit, Docker, Next/OpenAPI and synthetic three-DB verification. The existing migration coordinator applied 0014 only to ephemeral Sandbox and Live financial databases, twice; control remained free of PG06 tables. PG06 SQL replay/duplicate ACK, changed signature-dependent event digest denial, same-key pair recovery, different-key deny, revoke, queue health and rollback passed as simulated unit/SQL checks, not actual signed phone/provider calls. The 223 assertions reported are mixed PG04–PG06 assertions, not PG06-only.

Handoff: [PG06 source and manual gates](evidence/PG06/README.md), [formal audit](evidence/PG06-PG09-AUDIT.md), [consolidated owner checks](MANUAL-VERIFICATION.md). **PG06 product acceptance OPEN:** physical device, real consented SMS/notification, OEM/dual-SIM/Keystore, approved provider's actual full payer+original time, offline/reboot/force-stop, controlled signed HTTP-to-DB smoke, retention/alert/key recovery and production operator rollout need evidence. Safe pairing-response recovery is same public key for five minutes; if recovery expires, explicitly revoke and re-pair; never auto-collect from pending confirmation.

No production migration/deploy, real funds, approved provider parser or PG07/08/09 acceptance. This supersedes earlier statements that *all* PG06 source was unverified, not the remaining device/policy conditions. Continue PG06 external validation before marking PG06 accepted or moving to PG07 acceptance.

### PG07 source and atomic financial matcher signed off by CI — 2026-10-11

Exact **tested source** `a33c9dc308ea7c5ea738d59aaed51dbdd701187a`: [GitHub Actions 38160139898](https://github.com/masharzy/ekmivo/actions/runs/38160139898), **4/4 jobs PASS**. The isolated PG04–PG07 PostgreSQL smoke logged `PG07 isolated matching PASS` with **268 combined** financial assertions; PG07 scenario matrix is detailed in [PG07 evidence](evidence/PG07/README.md) and [audit](evidence/PG06-PG09-AUDIT.md). Includes exact five-field positive/negative comparisons, automatic payment/allocation/event/delivery in one transaction, PG05 completed state, duplicate/replayed/cancelled/late/minute/partial/over cases, restricted River role, checkout intent lock yielding pending then match, concurrent 2-worker idempotency, isolated dual-realm migration replay and fail-closed control DB. All evidence uses FICTIONAL SANDBOX receipts and disposable databases, NOT approved provider transactions.

PG07 implementation/available automation is verified; **PG07 product acceptance OPEN**. PG05 checkout is still sandbox-only, PG06 requires genuine provider samples/consented physical device, PG08 needs a real signed merchant HTTPS receiver, and actual deployment crash tests, live provider authenticity, full signed source-to-callback E2E are pending. No production migration, live money, merge or deployment. Continue dependency-ready PG08 implementation without treating PG07 external acceptance as passed; retain all combined owner-only tests in [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md).

### PG08 verified webhook core and merchant receiver — 2026-10-12

Exact tested source `d3276dc0a8ef0c62c964a381078f0bec02a82054`, [CI 38165262343](https://github.com/masharzy/ekmivo/actions/runs/38165262343): **4/4 jobs PASS**, including Go pinned TLS DNS/SSRF sender test, lease/retry/rotation SQL in disposable dual realms and the genuine merchant Go consumer against a separate disposable merchant PostgreSQL DB plus TLS fake authoritative payment API. CI logs say `PG08 isolated webhook state machine PASS` and `PG08 merchant receiver PASS`; **312 assertions are PG04–PG08 combined**, not PG08-only. Retry statuses obey terminal ordinary 4xx vs retryable 408/429/5xx/unknown, jittered 1m/5m/15m/1h/3h/6h/12h, max eight claims, 60s lease recover/stale ACK denial; payment state is unchanged after webhook failure. Two-phase secret preparation → explicit activation with receiver/key overlap → emergency previous-key revoke and UI are present. See [PG08 evidence](evidence/PG08/README.md), [consumer how-to](../examples/webhook-receiver/README.md) and [audit](evidence/PG06-PG09-AUDIT.md).

**PG08 full product acceptance OPEN:** verified recipient opt-in and actual receipt email/SMS/push transport MISSING CODE (not checkout polling); additional exception/expiry/reversal/refund/invoice event emitters blocked by their owning services; an owner-controlled public HTTPS merchant receiver, genuine PG06/PG07 receipt source, final staging crash/restore, monitoring/privacy/retention are pending. These are combined in [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md). No real funds, production migration or deployment, and draft [PR #9](https://github.com/masharzy/ekmivo/pull/9) remains unmerged. PG09 UI overall acceptance not established by PG08-only build.

### PG09 source code and automated dashboard/API acceptance — 2026-10-12

**Exact tested source `0b7a4fd4b7d65eaa8d21169b00b427cf1a4064bf`**, [CI run 38186957573](https://github.com/masharzy/ekmivo/actions/runs/38186957573) **4/4 PASS**. Go unit/race/vet, Android debug/unit, Docker, Next lint/OpenAPI/TS/build; independent PostgreSQL PG04–PG09 combined **493** assertions, PG09 scoped chronological server search and list/detail/mutation tests, real Go HTTP owner/viewer/editor permission and credential read-once checks, and Next authorized shell with **mocked API** EN/BN light/dark at 320/768/1440 UI browser coverage. CI log explicitly reports `PG09 isolated source-backed UI contracts PASS` and `PG09 REAL GO HTTP PASS` and 18 browser UI-only check lines. Browser UI-only fixtures are not an actual end-to-end browser→Go→Postgres session, nor real provider payment.

PG09 fixes: stronger physical finance realm scope in `pg06_scope`, safe invalid persisted-date handling, workspace-specific filter hydrate/clear and drafts, scoped one-time secrets/operations remount, corrected negative RLS permission test and React effect lint. Old PG09 runs failed/cancelled during test-hardening; exact final run green. No manual Set paid. Details: [PG09 evidence](evidence/PG09/README.md), [audit](evidence/PG06-PG09-AUDIT.md), [single owner-only manual checklist](MANUAL-VERIFICATION.md).

**Product acceptance OPEN:** staged deployed real browser+real authenticated backend, cross-tab/cross-business/realm switching, 1024px and OS System themes, keyboard/a11y and actual handset/provider/customer notice/public receiver still pending. PG05 live checkout remains SANDBOX ONLY. Later refund/export/invoice/customer/receipt notices cannot be claimed PG09 functionality until owning PG10–PG13/PG08 services exist. No production migration, deploy or PR merge. Continue prerequisite-independent PG10 code without bypassing PG06–PG09 external owner release gates.

### PG09 exact verified implementation checkpoint — 2026-10-12

PG09 complete source-level operational dashboard implementation: exact **verified code** `0b7a4fd4b7d65eaa8d21169b00b427cf1a4064bf`, [CI 38186957573](https://github.com/masharzy/ekmivo/actions/runs/38186957573) **4/4 PASS**. Next lint/OpenAPI/TypeScript/prod build, Go unit/race/vet, Kotlin debug APK/unit and Docker builds green; PostgreSQL financial/River tests report **493 PG04–PG09 combined assertions**, `PG09 isolated source-backed UI contracts PASS` and `PG09 REAL GO HTTP PASS`. Actual restricted owner/editor/viewer Go HTTP session and isolated finance/control DB tests include scoped search, pagination, webhooks actions, once-only secret and wrong realm/tenant denial. Chromium **18 PG09 UI cases PASS** with real authenticated Next shell but mocked PG09 operations API responses; browser→real Go→DB whole chain **not** tested together. PG05 Requests still integrated; PG10+ exports, invoices, refunds, public receipts remain separate owners.

Chronological (timestamp, UUID) keyset and full-dataset server search fixed; payment verification provenance, incoming five-field comparisons, device log/health, account status, events, webhook attempts and 7-day Overview are source-backed. Cross-scope drafts, secrets and state no longer leak across a business/realm switch. Historical CI failures were test JSON binding, incorrect permission assertion and React setState lint and are resolved in the exact passing run; no older failure is counted as a pass.

**PG09 available source/CI verification VERIFIED; PG09 production/customer acceptance OPEN** pending unmocked owner staging browser with actual authorized backend, 320/768/1024/1440 responsive + EN/BN Light/Dark/System, roles and revoked session, keyboard/focus/zoom and context/deep-link/cross-tab, consented PG06 real provider+PG07 match+PG08 merchant receiver, key/retention/on-call/migration/recovery and explicit production sign-off. See [PG09 evidence](evidence/PG09/README.md), [PG06–PG09 audit](evidence/PG06-PG09-AUDIT.md), [one owner manual ledger](MANUAL-VERIFICATION.md). No production migration 0014, merge, deployment or real money. [Draft PR #9](https://github.com/masharzy/ekmivo/pull/9) stays unmerged; next sequence PG10 only after dependency assessment.

### Active owner scope — 2026-10-12
Owner narrowed execution: finish all remaining PG06–PG09 code and available verification, report it, and do NOT start PG10–PG17 until instructed again. Receipt notice follow-up is in progress; real phone/account/controlled merchant access was reported ready but its location has not yet been supplied. No new device/provider proof inferred. New migration 0015 remains unapplied in production.
