# Agent handoff: implement payment-first

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
