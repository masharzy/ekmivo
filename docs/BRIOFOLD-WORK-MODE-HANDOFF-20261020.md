# BRIOFOLD — WORK MODE MASTER HANDOFF

**Owner mandate (2026-10-20):** Execute the complete Phase 1–10 implementation in `masharzy/ekmivo` as quickly as responsibly possible. Work should directly inspect/edit code, run tests, resolve conflicts, create/merge gated PRs, and continue across the backlog rather than stopping at a plan. **Never claim 100% code complete for a phase if a scoped implementation or required automated test is missing.** The owner will carry out final human verification after source/CI completion. Do not equate that with production/provider certification.

**This is an execution handoff for ChatGPT Work mode, not a completion certificate.** Work should update the file or linked issue as facts change. GitHub repository and actual tool results are authoritative; no stale conversational summary proves deployment.

## 1. Open these live links first

- Repository: https://github.com/masharzy/ekmivo (branch `main`).
- Shared asynchronous decision/progress thread: https://github.com/masharzy/ekmivo/issues/94 (read issue + **all** comments; post incremental status and requests).
- Phase 4–5 draft PR **#93**: https://github.com/masharzy/ekmivo/pull/93 (unfinished; do not merge solely because earlier CI is green).
- Unified foundation PR **#91**: https://github.com/masharzy/ekmivo/pull/91 (merged).
- SMS Data / Invoices / simplified Payments UI PR **#92**: https://github.com/masharzy/ekmivo/pull/92 (merged).
- Phase 1 CSS guard PR **#90**: https://github.com/masharzy/ekmivo/pull/90 (merged).
- Roadmap: `docs/BRIOFOLD-UNIFIED-IMPLEMENTATION-ROADMAP.bn.md` (its **old 7-menu design and Requests/Reconciliation references are superseded** by newer owner direction).
- Feature parity ledger: `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv` (56 entries; statuses need re-audit and actual evidence).
- Competitor audited surfaces: `docs/research/AIPRAKTOR-DASHBOARD-AUDIT.bn.md`, `docs/research/AIPRAKTOR-UI-INVENTORY.md`, `docs/research/aipraktor-dashboard-coverage.csv` (screenshots/features are UI evidence, **not proof provider APIs work**).
- Root and nested agent rules: `AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`; distinguish historical comments from latest explicit owner choices.
- Financial correctness and manual gate history: `docs/AGENT-HANDOFF.md`, `docs/MANUAL-VERIFICATION.md`.
- Approved dashboard design: `docs/evidence/DASHBOARD-SHELL-V3-UI-HANDOFF.md`, `docs/evidence/BRIOFOLD-PHASE1-STYLE-BASELINE-20261020.md`, `apps/web/src/app/dashboard-v2.css`, `dashboard-pass2.css`, `dashboard-refinement.css`, `dashboard-shell-v3.css`.

## 2. What is actually verified as of this handoff

- `main` observed at `4e6fd86f706f8bcb98f45c5990098acda71eeb9c` (PR #92). Refresh GitHub before editing; it may have moved.
- Phase 1A introduced read-only CSS/token protection and responsive regression tests; **Phase 1B physical CSS ownership isolation is NOT done**. Current `apps/web/src/app/layout.tsx` imports `globals.css`, which imports public, checkout, merchant and admin styles. Owner says current sites already look/work correctly: do not aggressively refactor and break the visuals.
- Phases 2–3: canonical merchant routes, server business resolver, seven-entry shell baseline and Settings categories were merged in #91; later #92 added separate SMS Data and Invoices and simplified Payment tabs. **Feature/action parity, permissions, old deep links, browser QA and settings behaviors are NOT certified complete.**
- Phase 4–5: **PR #93 is OPEN, DRAFT and NOT merged**, latest observed SHA `554e4f77db658b384690e48a1b1fd61a0e3c8088`. It contains onboarding UI/server calls, control DB migrations `0123`–`0125`, wallet/ledger/reservation/top-up building blocks and safeguarded Go top-up code. Existing Payment plan confirmation handoff and fail-closed tests were amended. **Live AI request metering, cost tariff/version policy, authoritative settle/release/refund, timeout/retry/concurrent protections, end-to-end paid top-up and all required migrations/production checks are still incomplete/unverified.** Feature flag `BRIOFOLD_AI_TOPUPS_ENABLED` defaults disabled; do not switch it on until all gates are met.
- On PR #93 SHA above, GitHub Foundation CI run **39431724112** completed successfully, including Go, Kotlin, migration Docker and Next.js/financial smoke. However, this is only evidence for *currently written* code; not a complete phase acceptance. Vercel status linked to **build rate limit** (`upgradeToPro=build-rate-limit`), NOT evidence of an app compilation error, and no successful preview/deployment was verified.
- **Phase 6–10 not completed**. Some existing channels, Android Inbox, API and payment code may already be present; audit and extend rather than replace.
- Other open Android PRs previously observed: #87, #73, #72. Before any Android changes, inspect whether they remain relevant or merged; do not overwrite.

## 3. Current owner decisions — stronger than historical roadmap prose

1. Product name **Briofold**; GitHub repository is still `masharzy/ekmivo`. Do not do an incidental mass rename.
2. Unified merchant dashboard must follow **existing approved Payment Gateway Dashboard** typography, colors, spacing, light/dark, component language. Homepage is separate. Admin uses its own locked styles. **Never redesign current working Payment/Home/Admin UI solely for isolation**. Dashboard must not rely on marketing `globals.css` design styling; perform physical isolation only after screenshots and careful cascade migration.
3. Visible merchant URLs have no `/en`, `/bn` or `/w/<UUID>` prefix. Internal tenant/workspace IDs stay for authorization. Preserve previously issued deep links safely; no redirect loops.
4. Current **nine** merchant primary navigation destinations: `Overview /dashboard`, `Inbox /inbox`, `Orders /orders`, `Payments /payments`, `SMS Data /sms-data`, `Invoices /invoices`, `Customers /customers`, `Reports /reports`, `Settings /settings`. Keep nested advanced functions discoverable without overcrowding the sidebar.
5. Payments user navigation: **Transactions, Payment Links, Refunds only**. Remove **separate Payment Requests** menu/tab (including the Payment Links extra tab), and remove **Reconciliation** user-facing menu/tab. Retain internal finance reconciliation/accounting safety and old API compatibility where required; never delete a needed worker or ledger operation merely because a UI menu was removed.
6. Keep SMS Data and Invoices as **separate main menu entries**, not cramped within Payments. Distinguish seller/customer invoices from subscription billing invoices.
7. **Inbox visual redesign is on hold** per owner. Phase 6 backend AI/channel/comment automation should respect the current approved Inbox UI. Do not independently restyle it or invent a different design. Implement required message correctness, provider restrictions and channel functionality without visual churn.
8. One business can enable AI-only, Payments-only or Both; one dashboard with role/entitlement appropriate content. Merchant business switching is server-authorized. No duplicate workspaces or accidental cross-tenant reads.
9. Payment subscription and AI **prepaid** credits remain separate. No unlimited AI, no negative credit balance, no credit grant based on client-reported payment status, no double charge on retries. Exhausting AI credits may pause paid AI generation, never existing payment processing/manual authorized Inbox.
10. Backend must preserve real financial truth from SMS/payment evidence, exact amount/payer/transaction time rules, signed Android receipt forwarding, isolated financial realm, duplicate prevention, invoices/refunds/webhooks and merchant authentication. Do not ask customer to enter TrxID manually or present unverifiable payments as confirmed. No automatic refund money transfer.
11. Bangla UI uses Hind Siliguri, English default/switcher, clean minimal non-technical-user UX, 16px line icons, no decorative emojis in dashboard, no ALL CAPS eyebrow/paragraph clutter, consistent layout and responsive design. Apply existing reference HTML, not a new imagined visual style.
12. Frontend is Next.js/TypeScript, Go API on Render, Neon Postgres with separate financial/control realms, native Kotlin Android app; Vercel web. Do not introduce a parallel payment ledger or client-side authorization workaround.
13. Do not put credentials/merchant phone numbers/receipt contents/secret keys into GitHub comments, git commits or screenshots. Use explicitly approved secret channels, redacted test fixtures and isolated Neon test branch for database test work. Root AGENTS explicitly forbids unapproved local Docker startup; existing GitHub CI Docker jobs are not authorization to run Docker locally.

## 4. Execution order and module-level completion gates

### Phase 1 — Styles and isolation
- Capture authenticated before/after baseline for Payment dashboard, homepage, Admin and checkout across supported languages, themes, navigation transitions and 320/360/768/1440 widths.
- Audit actual cascade/current computed tokens; physically isolate marketing/auth, merchant, admin and checkout CSS safely under route/layout ownership without leaking brand styles or changing current appearance. Test hard reload, client transitions, back/forward, dark toggle, Bengali font and module CSS.
- Required gate: static boundary tests, visual snapshots, browser style parity and complete unaffected payment/admin/public tests. Phase 1A is not Phase 1B.

### Phase 2 — Business resolution/routing
- Audit unified resolver, membership, preferred business, active business switching, AI-only/Payments-only/Both access; forbid client workspace ID authorization.
- Every canonical route and nested deep link must work on refresh/client transition, proper 403/404 handling, old links safe, drafts safe, no locale prefixes in visible URLs, no marketing chrome on application pages.
- Required gate: actual authorized/forbidden/tenant isolation tests and browser navigation, not just static route regex checks.

### Phase 3 — Shell, real Settings and feature parity
- Preserve nine primary entries (latest owner preference); Settings categorized and deep-linked: business, AI, knowledge, channels, comment rules, payment methods/SMS devices, checkout, developer keys/webhooks/docs, team/security, billing and help.
- Audit EVERY page/action from feature tracker. Button not connected/empty table/mock values/generic JSON error are not code complete. Keep approved Payment dashboard visual standard and role-aware/plan-aware controls.
- Gate: traceable implementation+tests for accessible real content, search/filter/pagination, error/loading/offline/empty/success, dark/light EN/BN, drafts and mobile.

### Phase 4 — Onboarding
- Finish/integrate existing PR #93: self-hosted signup/email verified → business → AI/Payments/Both → relevant Gateway plan/AI wallet onboarding → dashboard. Existing active workspaces and invitations must not be broken.
- Owner/Admin control must manage adding service later. Merchant cannot grant own paid entitlements by changing client mode. Plan selection needs real quote/approval/checkout and verified backend callback, no fake paid activation. Payment-only must not require AI wallet; AI-only must not depend on payment receiving account setup.
- Gate: new and returning account, invite, partial step, back/refresh, invalid plan, role and state transitions, AI-only/Payments-only/Both and responsive browser E2E.

### Phase 5 — AI prepaid finance and cost protection
- Complete existing wallet ledger/reserve/settle/top-up migrations/Go/Next integration in PR #93; use explicit tariff/version/model input/output costs and bounded request maximums; meter every AI execution path *before* expensive calls and settle from actual usage; release on failure; recover timed-out reservations.
- Immutable append-only ledger, wallet statements, low balance and exhaustion UX, top-up payment proof verified using financial realm, recurring/idempotent events, webhook deduplication, no double credit/charge, no negative balance, no unrestricted unpaid AI generation.
- Correct concurrency, crash/retry, parallel requests and cross-business isolation; keep manual Inbox and payment processing available on AI exhaustion. Do not enable disabled feature flags before safety tests and owner/provider checks.
- Gate: disposable Neon migration+race/rollback evidence, Go and Next integration tests, cost arithmetic, sandbox/proof E2E, security review and deploy readiness. Reconcile any proposed pricing/tax/fees with actual approved catalog rather than invent prices.

### Phase 6 — AI and channels (no discretionary Inbox restyle)
- Implement real AI runtime, instruction/version/draft/test/publish/rollback, trusted knowledge Q&A/file ingestion/retrieval, prompt/content security, request cost reservation and authoritative metering (must use Phase 5 APIs).
- Authorized Messenger/Instagram/WhatsApp/website integrations and webhook validation/deduplication, message send/receive correctness, human ownership/handover/auto-revert, saved replies/notes/tickets/SLA where in defined feature tracker. Keep Inbox styling approved.
- Per-post comment automation: selected/all/excluded posts, keyword/intent/PII/moderation, AI/fixed/human modes, permission-based actions, rate limits, dry-run/audit/failure handling. Don't claim providers support unsupported APIs.
- Gate: realistic seeded 7–8 long conversations with text/photos (test only), role and channel mocks; real third-party send needs approved test account and evidence. No production sends to real customers as a test.

### Phase 7 — Customers / verified identities
- Tenant-safe CRM, leads/stages/assignment/consents, links among financial customers/AI identities/verified phone+email and unverified contacts. No identity merge by name or weak phone match. Manual unlink/disputes/masking/erasure/export and audited permissions.
- Gate: no cross-workspace leaks, reversible safe linking, mixed-role tests and notification/inbox relations.

### Phase 8 — Orders / commerce operations
- Genuine order domain with AI/API/manual sources; product variants, inventory reservations/oversell protection, images, catalogs, coupons, scan/packing, courier consent/booking/handover, returns/exchanges, state transitions and refund references.
- No assumed one-to-one mapping between payment and order; handle partial/double/cancel/time window and concurrency. All controls must perform validated server action.

### Phase 9 — Payment integration
- Move/reuse existing production-backed transaction/links/refunds/invoices/SMS-data/device/method screens into unified navigation, preserve financial core and exact read-model parity old vs new.
- Audit bKash/Nagad/Rocket cases, payer number/amount precision, SMS import/forwarding, device reconnect/delete, invoice success/cancel redirects, refunds and webhooks. All deep links, migration and tabs consistent with owner's simplified navigation.
- Gate: no duplicate confirmation, leaks or parser regression. Reconciliation internal accounting only, not standalone UI.

### Phase 10 — Growth, reporting and rollout
- Implement followups, consented broadcasts/campaigns, bookings (when supported), reporting across AI/team/orders/payments/products, stable exports/alerts and complete accessible multilingual responsive QA; no spam policy violations.
- Final pass across EVERY feature tracker line; verify permissions, concurrency, provider failure/offline, stale cache, migration and rollback; staged feature flags, observability and repeatable release plan.
- Gate: feature-by-feature code+CI proof, merged commit and production deployment status. Third-party/provider and owner's physical QA are separately itemized without masking missing code.

## 5. Practical Work-mode orchestration protocol

1. Start with a fresh GitHub read: main HEAD, all open PRs, Issue #94 comments, file and migration inventory. Do NOT assume prior snapshots remain current.
2. Produce a dependency-ordered **code gap matrix**, not a new speculative roadmap. Map every existing main/PR #93 capability to exact missing function and acceptance test. Update GitHub Issue #94 with a concise status and links.
3. Implement aggressively in independent small branches/PRs. If Work runs subtasks in parallel, assign non-overlapping directories and explicit API contracts; never allow simultaneous edits to the same branch/file. Prefer working code and tests to status narration.
4. At each module boundary, post `[WORK-A01-### → AGENT/OWNER | STATUS | Phase]` on Issue #94 with PR, commit, CI and precise asks. Other ChatGPT chats do not automatically see/read messages; issue comments are *asynchronous*, not a self-running group chat.
5. Route/code/migration changes always get actual lint, typecheck, tests, security authorization, UI browser checks and full GitHub CI; collect logs. Verify Vercel/Render/Neon against deployed commit; do not mistake build-rate-limit for a code failure.
6. Do not merge open draft PR #93 just because CI ran green. Finish metering/finance, migrate safely, resolve current-base conflicts and satisfy readiness first; split its scope into independent PRs if that reduces risk.
7. Keep `main` stable. Worker code in feature branches and reviewed PRs only. Merge a phase only after code gates pass. For production financial migrations/external provider actions, follow authorization/security/rollback constraints; don't alter live financial records or send live messages without appropriate approval.
8. If external credentials/certification/customer-real-world testing is missing, complete ALL code/mock/sandbox work that can be done; mark exact external gate separately, then continue unrelated phases safely. Do not count missing code as 'manual verification'.
9. Do not keep asking the owner every few steps. Make reversible engineering decisions from accepted specs and raise only blockers requiring a business/legal/financial choice or credentials. Keep a readable summary and continue implementation while safe.
10. With many agents, *one* Work lead remains responsible for dependency merges and final status; prefer Work's single persistent task over requiring ten ChatGPT chats to talk continuously.

## 6. Phase report template (no fabricated percentage)

```
Phase N / name
Scope items: X of Y implemented with file+test citations
Code complete: YES/NO (100% ONLY if every scoped item is implemented)
Source PR(s): links; merge commit(s): SHAs
CI: run IDs, pass/fail/cancelled; Vercel/Render/Neon deployment: confirmed/unconfirmed
Automated proof: tests, auth, financial concurrency, migration, browser, accessibility
Open CODE gaps: exact files/actions (must be empty for 100%)
Open EXTERNAL/manual gates: owner/provider/device verification separate from code gaps
Blockers/next safe action
```

**Final reporting rule:** When all code-level gates for Phase 1–10 actually pass, tell owner `100% CODE IMPLEMENTATION, CI PASSED, main MERGED` phase by phase with commits. Until then never print those words as achieved. It is better to surface a specific blocker than falsely reassure.

## 7. Starting Work instruction

> You are the lead executing Briofold through Phase 10. Begin now using the GitHub repo and this file as handoff. Read Issue #94/all comments and the exact current main/open PRs. Complete outstanding Phase 1–5 safely, then Phase 6–10; organize parallel subtasks only with strict file ownership and integration contracts. Preserve owner-approved styles/finance. Every code change requires evidence, CI, PR and guarded merge. Do not return a design plan and stop: make actual progress in the repository and keep working through sequential dependencies, issuing concise truthful status updates. Owner performs final manual verification after truly complete code. Never say 100% when any implementation/test is missing.