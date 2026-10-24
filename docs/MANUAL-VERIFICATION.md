## Briofold Phase 10 — consolidated owner acceptance (2026-10-22, NOT PASSED)

The consolidated Briofold 0–10 implementation/evidence matrix and one owner checklist are in
`docs/evidence/BRIOFOLD-PHASE10-RELEASE-READINESS-20261022.md`. The owner handles consented
physical devices, live providers and subjective visual/accessibility checks. Do not turn these
into code blockers once code is actually complete. However Phase 10 still has independent
code blockers (campaigns/broadcasts/bookings/parity) and an unapplied Phase 8 migration;
these must not be reclassified as owner manual work. No migration, money, provider send,
production flag change or staged cutover was performed by the Phase 10 reports increment.

- [ ] Owner-provided test accounts/providers/handset and isolated merchant business: run the
  eleven groups in the Phase 10 evidence ledger and record actual pass/failure evidence.
- [ ] Operator, **only after the owner explicitly authorizes merge/release**: exact merged SHA and green integrated CI; inspect the existing CONTROL schema (including checkout presentation 0100 and support topic 0073), then stage applicable CONTROL-only 0141/0142/0180–0200 migrations in dependency order with backups, checksummed review, known owner role, runtime grants, support ticket topic preservation and post-deploy health/rollback checks. Do not run them in either financial realm or as part of this code-only task.

## Nagad compact payer entry & bKash BD number normalization — 2026-10-14 (manual / build pending)

- [ ] Open actual checkout with Nagad selected, EN/BN, 320/375/390/desktop and small landscape viewport. Merchant, invoice, amount, 11 number boxes, consent and controls should fit the screen without duplicate white invoice header. Tiny viewport / keyboard may scroll inside the compact card.
- [ ] Nagad digit boxes support typing and paste (local `01...`, `8801...`, `+8801...`, Bengali digits), show 11 local digits, and submit one canonical full `+8801...` number. Close must navigate away without cancelling/marking payment.
- [ ] bKash input focus: no extra blue/black border or nested box shadow, visible keyboard focus via label. Incorrect operator/prefix/length or empty input shows immediate inline field error; valid local or international format succeeds.
- [ ] Server POST /api/checkout/:token/lock refuses invalid BD number with HTTP 422 INVALID_PAYER_OR_METHOD; verified SMS payer HMAC matches canonical full number. Never accept OTP/TrxID as identity.
- [ ] Check live/sandbox transaction verification, amount/window, expiry, double-send protection, safe cancellation, original phone-Forwarder behavior, and existing Rocket flow unchanged.
- [ ] Go unit regression test in backend/internal/checkout/payer_number_format_test.go is committed but **not executed**. Standalone TypeScript helper compile and 14 cases passed. Vercel preview on reconciled SHA fb71ebd9 READY: Next build and TypeScript passed (dpl_C9z8rxr52d5CpoLXBpY2YvndGMo4); earlier manual 402 quota and JSX syntax error resolved for this preview. PR #54 remains DRAFT, main untouched.

Evidence: docs/evidence/CHECKOUT-NAGAD-COMPACT-PAYER-NORMALIZATION-20261014.md

---
## Integrations & events — 2026-10-14

Local source/build/browser and sandbox rollback SQL evidence: docs/evidence/INTEGRATIONS-EVENTS-20261014/README.md. Existing manual items below are preserved; no real receiver/production acceptance is inferred.

- [ ] Apply 0058 through the existing financial migration coordinator to Sandbox, verify restricted role/function grants, then Live. Permanent migrations have not been applied by this work; rollback SQL passed and cleanup was confirmed.
- [ ] Deploy matching web/API/worker source when quota allows. Verify each of Developers, Webhooks, Events & logs, Integrations and their detail links retains dashboard header/sidebar. Verify native tabs, EN/BN, Light/Dark/System, mobile and offline/retry states against real data.
- [ ] Dedicated owner/admin, editor and viewer accounts: owner creates/rotates/revokes a scoped Sandbox key with password; Live/Sandbox credentials cannot cross. Viewer/editor must be denied endpoint/key/audit/export changes or reads as specified; removed membership, expired session and wrong-workspace URLs must reveal no data. Do not record tokens/passwords.
- [ ] Controlled HTTPS receiver: validate raw-body HMAC, timestamp, key/event/delivery IDs. Create one endpoint and record a real sandbox event, HTTP response, each retry timestamp, and event→payment→delivery links. Return 503 once then 2xx; verify replay uses the same event with a new delivery ID and never repeats fulfilment or a payment.
- [ ] Rotation: prepare a new key, install it on the receiver, activate, accept old/new during overlap, then revoke old. Disable/enable, duplicate replay while pending, private/loopback URL rejection and customer data minimization must behave correctly.
- [ ] Configure a real website/custom bot/WooCommerce store (plugin installed separately); edit conflict and webhook picker diagnostics must reflect actual deliveries. Shopify uses only supported external-payment store capabilities; dashboard configuration alone is not installation.
- [ ] With an authorized server key, call payment-intent/document endpoints. Confirm API route/status/duration/correlation metadata and no body/query/contact/secret fields. Audit is immutable and free-text minimized; API capture is best effort, not guaranteed financial audit.
- [ ] Create a private document export and verify actor-only download, expiry and owner/admin role recheck. Mark a real personal notification read and verify scoped deep links. Verify event/export inspectors contain no SMS body, credentials or full payer contact.
- [ ] Configure GO_SANDBOX_API_URL to the isolated service. Run simulator scenarios and archive/reset; Live data is untouched and prior financial history retained. No simulator fallback to Live.


## SMS Devices / QR / standalone checkout — 2026-10-14

- [ ] On a consented Android phone, create one real pairing QR in SMS Devices, scan it using Ekmivo and finish app permission prompts. Verify the correct workspace/realm, recent heartbeat, and code disappearing after claim.
- [ ] Verify expired-code rejection, copy/paste fallback, offline recovery and revoke blocking new receipt uploads. Web tests used mocked APIs and a synthetic QR; they are not real device/payment evidence.
- [ ] Refresh and client-navigation checks on deployed /pay and /checkout: no site header/footer; provider branding and checkout controls remain. Local EN/BN checks passed.
- [ ] Owner/admin device access and viewer denial, existing device detail deep links, rename, and controlled disconnect. No production device was modified by the local UI tests.

## Public/auth polish — 2026-10-14

Local evidence: `docs/evidence/PUBLIC-AUTH-POLISH-20261014/README.md`.

- [ ] With dedicated test accounts on staging, complete two-step signup with an 8-character letter+number password; verify one account, one workspace and owner membership, default workspace, and persisted personal/business names.
- [ ] Existing-password login, duplicate-email recovery, email verification when enabled, reset password, session/rate-limit behavior. Registration transaction failures were unit simulations, not live SQL tests.
- [ ] Verify authenticated workspace chooser/create form and return-home header in EN/BN and Light/Dark/System. Anonymous auth and public navigation/browser responsiveness passed locally.
- [ ] Final subjective review of Bengali copy, motion and keyboard navigation in the branch preview. No production merge/deploy authorized by this branch-only request.

## Payment Operations UX rebuild — 2026-10-14 (MANUAL / BUILD PENDING)

- [ ] Transactions canonical route `/w/{workspace}/payments/transactions` and detail; bookmarked legacy `/payments/payments` redirects. Test global search opens Transactions.
- [ ] Owner/admin/editor/viewer: verified list and incoming receipt permission; reprocess only after authorized actor confirmation; business/environment and cross-tenant isolation.
- [ ] Filters, Dhaka timestamps, pagination, empty/offline/403/503/timeout, failed request retry. No fake zeros or payer/contact inference.
- [ ] Payment Requests create/cancel, source invoice selector, standalone amount and expires-in, advanced source form, unsaved-draft safety.
- [ ] Refund request status, source, decrypted contact for authorized roles only, versioned review/approve/reject/cancel/mark returned; no automatic refund claim.
- [ ] Invoice explicit draft/issue/send and linked verified paid/partial states. Customer create/search/import, invoice association, no automatic customer from SMS payer.
- [ ] Payment Links creation/publish/archive/copy/public preview, light/dark/system, English/Bengali, responsive 320/375/768/1024/1440, keyboard and mobile scroll.
- [ ] Build and test source, including React TS JSX, Go, Android, Docker, migrations; record exact SHA. GitHub Actions run 38546270136 and re-run 38541468224 failed all jobs in ~4s before any steps; this is NOT a passed or diagnosed test.
- [ ] Vercel preview build blocked by 402 api-deployments-free-per-day (>100; retry after 24h). No production rollout until compile and authenticated browser evidence.
- [ ] Keep PR #50 payer-number Go/PG57 changes isolated; that security-sensitive backend is not part of this UI-only PR.

Evidence: docs/evidence/PAYMENT-OPERATIONS-UX-REBUILD-20261014.md

---

## Actual payer-number Reports ledger — 2026-10-14 (deployment and browser PENDING)

- [ ] On signed-in owner/admin Live workspace, open Reports and confirm all verified receipt-backed payments show actual FULL buyer/payer phone (+880...) rather than masked suffix, merchant receiving number or invoice contact.
- [ ] 25-row keyset pagination, from/to Dhaka date, account filters, PII CSV loaded rows and deep links; ensure old/absent encrypted contact shows unavailable rather than a guessed number.
- [ ] Viewer/editor, cross-workspace user and merchant API key cannot read /reports/ledger; invalid cursor/account/time, session expiry, no-cache headers, 15s proxy timeout and failure/retry.
- [ ] No duplicate Overview chart on Reports; remaining numeric breakdowns and summary/export aligned.
- [ ] Read-only SQL 0057 in both financial realms DONE; production web/API build and authenticated display NOT DONE. Vercel deployment status: `rate limited — retry in 24 hours`, so do NOT call this change live.
Evidence: docs/evidence/REPORT-PAYER-LEDGER-20261014.md.

---

## Reports vs Overview separation — 2026-10-14 (MANUAL PENDING)

- [ ] Confirm Reports now opens as an analytical workspace, not a duplicate operational KPI dashboard; Overview remains compact alerts, heartbeat and recent activity.
- [ ] Opt-in previous-period comparison uses the same authorized workspace/environment/receiving account; equal-length consecutive Bangladesh calendar ranges; no automatic extra request when comparison disabled.
- [ ] Verify BDT payment averages, previous-period % change and blank/no-baseline on zero earlier volume; independently reconcile the two scoped report queries.
- [ ] Test daily and 7-day bucket grouping with active and zero-volume days, UTC boundary labels, all breakdown tabs, allocation/provenance and exports.
- [ ] EN/BN, Light/Dark/System, 320–1440px, 200% zoom, keyboard, offline/502/503/504+retry and valid empty data.
- [ ] Record Vercel and Render release SHA and signed-in browser/API response after deploy. Preview Next build != authenticated production acceptance.

Evidence: docs/evidence/REPORTS-ANALYTICS-SEPARATION-20261014.md.

---

## PG13 Reports Redesign — 2026-10-14 (MANUAL PENDING)

- [ ] Actual signed-in merchant: automatic 30-day initial load; 7/30/90 preset and custom inclusive Dhaka dates, filter apply/race/timeout/refresh, invalid >366-day range and valid empty data.
- [ ] Receiving-account selection; denied/403 and 503/timeout/offline data must never appear as zero; stale report must not be exported.
- [ ] Compare verified/allocated/unallocated/refund statuses with exact backend period and merchant transactions, including late-receipt seller refunds; seller-returned must NOT appear independently settled.
- [ ] CSV UTF-8/BN/EN, comma/quote/formula injection, multi-section fields and print/PDF; document that CSV is loaded report snapshot rather than full async finance export.
- [ ] 320/375/768/1024/1440, 200% zoom, keyboard, screen reader, Light/Dark/System, Hind Siliguri with no full-page horizontal overflow.
- [ ] Record authenticated production merchant smoke with SHA. Preview Next build/Neon read-only checks are NOT substitutes.

Evidence: docs/evidence/PAYMENT-REPORTS-REDESIGN-20261014.md

---

## Payment Overview Mission Control — NEW (2026-10-14, MANUAL PENDING)

- [ ] Owner/admin new workspace: no plan state leads to **Billing** without showing plan cards in Overview; verified active or grace subscription creates tick; cancelled invoice does not.
- [ ] Verify profile + active receiving account + consented paired phone SMS permission and first heartbeat + active published link OR issued request + real verified transaction (no fake test) reach six verified milestones, show compact operational view.
- [ ] Existing workspace with payment history but expired plan or temporarily offline phone: historical payment access persists; unfinished setup is still visible, never falsely marked complete.
- [ ] Verified merchant transactions, summaries, refunds, webhook failure counts and online devices match each authorized source (no synthetic 0 for unavailable data).
- [ ] Workspace/role isolation (Owner, Admin, Editor, Viewer), 401/403/503/offline/timeout, site EN/BN, Light/Dark/System, 320/375/768/1024/1440, keyboard and 200% zoom; chart is one third width on wide desktop.
- [ ] Capture exact deployed frontend SHA and authenticated browser results. Vercel READY only proves Next build, not these real merchant flows.

Source/evidence: docs/evidence/PAYMENT-OVERVIEW-MISSION-CONTROL-20261014.md. No financial mutation or real-device test was performed for this UI change.

---

## Applied-schema update — 2026-10-14 (after the source audit)

**MIGRATION 0056 APPLIED TO BOTH PRIMARY FINANCIAL DATABASES.** With explicit owner approval, the exact reviewed `infra/migrations/0056_phone_incoming_and_late_refund_reports.sql` migration was applied atomically to `ekmivo_sandbox_financial` and `ekmivo_live_financial`. Neon migration preview could not parse the PostgreSQL dollar-quoted procedure bodies, so a dollar-quote-aware 8-statement transaction was used for each database (the same statements previously verified on the disposable branch). Both financial realms were confirmed isolated from control; both functions and `ekmivo_finance_reader` EXECUTE grants are present.

Live verification with tenant/environment-scoped GUCs: 4 incoming rows (physical source count 4, legacy count 0), status filters 3 matched/1 cancelled, method filter 4 bKash, future-date filter 0, no next cursor on current 4 rows. One physical receipt detail returned candidates array. October late seller refund summary: 1 requested case, 1000 BDT minor units (৳10) open, 0 seller-reported returned. Sandbox scoped read: 0 receipts/0 refund requests, as expected from pre-migration existing counts. All counts of existing financial receipts, observations and refunds remained unchanged. Migration creates functions/grants only; no payment verification, refund transfer, deletion or new receipt occurred.

The earlier statements below saying migration 0056 is not applied were accurate at source-checkpoint time but **are superseded by this update**. Source/API deployment on existing Render services, actual authenticated HTTP/dashboard smoke, Android handset reconnect/heartbeat, real provider/payment/webhook and PG16/PG17 acceptance remain **UNVERIFIED**.

## PG06 SMS forwarder — 2026-10-13 (REAL DEVICE PENDING)

> **New pending release gate (PR #19, 2026-10-13):** Signed bKash/Nagad Android SMS on two paired phones; wrong payer/amount/time and duplicates; 3 merchant receiving numbers without SIM/account selector; offline network/backlog and retry, power-off and optional consented READ_SMS inbox recovery; expired/cancelled attempt creates one seller refund request (no automatic money transfer), seller action and contact; 0051 migration on disposable isolated Sandbox/Live financial DBs; Go/Next/Kotlin build and phone UI/theme tests. All remain UNVERIFIED; see [dedicated scenario checklist](evidence/PG06-OFFLINE-SMS-REFUND.md).


- [ ] Pair one physical phone once using the actual code journey from Android Home. No required account/parser/SIM-ID picker or nonexistent QR scanner.
- [ ] Check only configured provider SMS senders and payment-like message bodies are forwarded; OTP/personal SMS are not. Unknown SIM ID must not silently select an account.
- [ ] Validate 0047 on BOTH isolated Sandbox and Live financial DBs, parser registry/current production settings, immutable captured configuration version, original queue key and account changes.
- [ ] Real consented bKash/Nagad/Rocket samples: actual payer != provider sender; original transaction time; complete receiving identity/source mapping; unique match and single webhook. Missing identity/parser must remain pending, never paid.
- [ ] Test offline/reboot/permission revoked/wrong realm/tenant/revoked key, duplicate replay, full receiving number checkout, 320dp EN/BN and theme.
- [ ] Preserve checkout ready-source gate; signed forwarding heartbeat is NOT a payment readiness or financial acceptance signal.

Full owner steps: USER-DEVICE-TESTS.txt. Source handoff: docs/evidence/PG06/PHONE-FORWARDER-2026-10-13.md. No real-device or provider PASS without recorded evidence.

---
## PG06 one physical phone / multiple receiving accounts — MANUAL PENDING (2026-10-12)

- [ ] Run the `USER-DEVICE-TESTS.txt` checklist with an explicitly identified configured debug APK, exact Go/SQL SHA, one phone/two SIMs, bKash/Nagad/Rocket and real consented receipts only after financial Sandbox/Live provisioning.
- [ ] Pair phone **once**, attach/detach multiple receiving accounts, verify exact source routing and the receiving-account identity, original payer (not SMS sender), amount and original time.
- [ ] Prove duplicate/signed replay settles once; wrong workspace/environment rejected; queued receipt remains bound on detach or number replacement; reboot/offline/permission/revoke and legacy enrollment upgrade preserve evidence.
- [ ] Verify full receiving number/copy in authorized merchant setup and selected **actual** number on public checkout, correct method/intent and no phone numbers in other workspaces or logs.
- [ ] Audit mobile 320dp/200% font, EN/BN, Light/Dark/System, screen reader, focus, error/offline/forbidden/empty and one card per physical phone.
- [ ] QR camera scanner remains incomplete; manual one-time pairing code exists. Do not call this flow accepted from code or simulated SQL alone.

# Ekmivo — consolidated manual verification register

## PG10–PG17 combined verification — source still in progress

Do not execute or accept this pass as completed yet. Use isolated staging accounts/workspaces and finance databases after all source work closes. Additive migrations are not applied. No secrets in retained evidence.

- [ ] PG10 real-data CRUD, concurrent visitor intent/invoice totals/due, cross-tenant reads, draft/version conflicts, custom fields/private scanner/upload ownership, CSV duplicate/error/formula handling, queued exports and actor revocation, public share/print; 320/768/1024/desktop EN/BN × Light/Dark/System.
- [ ] PG11 actual verified payment → customer refund request → encrypted seller contact/view → allowed seller states, concurrent refundable cap, duplicate webhook, original funds unchanged; seller-reported returned remains unverified; real statement idempotency/mismatch/reconciliation.
- [ ] PG12 merchant-owned receiving/source bindings and real payment-only connector roundtrip; configured tiles do not substitute for live evidence. No official API prerequisite for default phone verification.
- [ ] PG13 last-owner/concurrent team/invite/verified-email/revocation/grant checks; settings/version/support history; reports reconcile to ledger; dedicated platform billing payment, renewal once, expiry/grace and accepted events; privacy/retention once source closes.
- [ ] PG14 clean-account documented quickstart, generated client drift/schema conformance, all language webhook consumers, isolated sandbox scenarios/reset.
- [ ] PG15 security/failure/races/design/load checks, actual readiness/alerts, encrypted backup and timed isolated restore, key availability and post-restore reconciliation/rollback.
- [ ] PG16 consented real bKash/Nagad/Rocket device/receipt matrix, actual webhook consumer, at least seven observed paid-cohort days, incidents and response evidence.
- [ ] PG17 exact release source/CI/deployment manifest, owner release decision, production smoke/rollback/support and truthful released-capability list.

## PG06–PG09 receipt notice follow-up — 2026-10-12

Code branch: `codex/pg06-pg09-code`; see current [audit](evidence/PG06-PG09-AUDIT.md) for tested SHA. These rows are **MANUAL PENDING**, not automated PASS. Bundle with the existing PG06–PG09 pass; no production migration/deploy occurred here.

- [ ] Consented real Android device + approved receiving account/parser: original time, actual payer, amount, receiving account and method uniquely match; same receipt replay produces one payment/event/webhook. Test unrelated OTP rejection, permission loss, dual SIM, offline/reboot and durable ACK. The new software-signer HTTP test does not replace this.
- [ ] Configured staging SMTP + dedicated customer inbox: subscribe with explicit email consent, receive verification code, verify once, reject wrong intent/reuse/expired code. Confirm EN/BN and SANDBOX labeling. Receipt is independent of payer identity and never a payment prerequisite.
- [ ] Verify before and after payment; initial receipt queued once. Confirm SMTP accepted versus actual inbox delivery separately. No secrets, addresses, codes or raw email bodies in shared evidence.
- [ ] Drop SMTP DATA acknowledgement / kill notice worker: notice remains unknown; financial matching and webhook continue. Owner/admin must enter reason and acknowledge duplicate risk before recovery; viewer cannot retry, and SQL actor/reason audit must exist.
- [ ] Withdraw using original checkout and emailed withdrawal code; database recipient ciphertext/digest are NULL, pending notices suppressed, retry denied. Disable SMTP and confirm existing verify/withdraw controls still work. An already transmitted email cannot be recalled.
- [ ] Controlled public merchant HTTPS endpoint + authentic receipt: independently validate signature/timestamp/scope, query authoritative payment, fulfill once, repeat delivery and key overlap/rotation. Local TLS receiver with fake authoritative API is only simulation evidence.
- [ ] Combined deployed browser → authorized Go → real restricted finance database: payment detail notice history/recovery, wrong tenant/realm, owner/viewer, EN/BN, Light/Dark/System, 320/768/1024/desktop, keyboard/error/offline/switch/deep-link. Browser CI mocks operations API and is not this combined flow.

PG05 live issuance, PG10–PG13 lifecycle producers, PG14 generated SDK and later full privacy/restore/alerts are **code dependencies**, not manual-only omissions. Record exact deployment/commit, sanitized status/assertion, account role and date for each result.

**Single owner test file.** Updated: 2026-10-11. Source of acceptance: `docs/IMPLEMENTATION-BACKLOG.md`, `docs/PRODUCT-UX-SPEC.bn.md`, and per-PG `docs/evidence/PGxx/README.md`.

## Rules

- **Implementation**, **automated/integration checks**, **actual live tests**, **manual checks**, **acceptance** are separate fields. A passing build, mock data, demo page, or synthetic provider webhook never equals real payment acceptance.
- Agent implements and runs every technically available CI, Postgres, isolated security, Render, Next.js build and Kotlin compile test autonomously. Do **not** stop and wait for the user because a browser/device/account/provider check remains.
- Manual tests below are bundled for **one combined owner verification session**, not recurring interruptions. Mark with `[x]` only after exercising the real action; record date, release SHA, observed results, screenshots/log references (redact tokens, SMS, transaction IDs, private data).
- If implementation is complete but a manual test is pending, mark `IMPLEMENTED — MANUAL PENDING`; if a required source/worker/provider is not implemented, mark `BLOCKED / PARTIAL IMPLEMENTATION`, **never 100%**. Build dependent code independently, but do not ship as payment-ready.
- Real payments require five-field unique matching, server-confirmed status and signed customer webhook. Never use TrxID, screenshot or merchant manual approval as a substitute. Only use owner-controlled sanctioned sample devices/payments.
- Test responsive UI at widths **320 / 768 / 1440 px**, **200% zoom**, keyboard, touch, mobile Android, light/dark/system and **EN/BN**. Verify error/loading/empty/unavailable/success states and correct authorization before marking any screen ready.

## PG00 — Foundation

- [ ] **Owner/manual:** Verify login, launch, public web, password reset and admin enrollment from a fresh browser; no secret in error text.
- **Automated baseline:** isolated PostgreSQL migration rollback, Go test, Next.js lint/build and Android debug CI — previously passed.
- **Acceptance state:** Foundation source baseline accepted; manual smoke may be repeated together with release tests.

## PG01 — Auth, MFA and tenant RLS

- [x] **Owner-provided action:** TOTP enrollment; observed one confirmed account and fresh MFA session in production Neon without retrieving secrets.
- [ ] **Owner/manual:** Open an incognito window; protected admin pages redirect to login; after login require TOTP for sensitive action. Wrong/stale/previously consumed OTP fails; repeated failures throttle.
- [ ] **Owner/manual:** Log out on device A, use back button or old deep link — no protected data; sign in again; MFA step-up remains required.
- [ ] **Owner/manual (test identities only):** Role downgrade/revoke or remove membership and confirm access stops immediately; another workspace's URL must be 403/404. Never modify last real owner or production admin just to simulate.
- [ ] **Owner/manual:** Validate admin recovery path and no account lockout; review errors without exposing session, TOTP seed or database credentials.
- **Automated/live observation:** CI real local 3-tenants × 2-env RLS, session disabled/revoked, role/MFA matrix passed; Render Singapore `ekmivo-go-api` launched and read-only restricted SQL role/no-context RLS startup probe PASS.
- **Implementation:** Protected Go settings write, authenticated same-origin Next-to-Go proxy, single-use hashed recovery codes, rotation, persistent lockout, audited MFA reset/session invalidation and password-confirmed re-enrollment are implemented. CI 38124238106 passed all three jobs. Exact deployed lifecycle evidence is in `evidence/PG01/completion-http-results.json`; earlier missing-code entries are historical.
- **Owner/manual (dedicated administrator):** After a fresh MFA challenge, open `/en/admin/security` or `/bn/admin/security`, confirm password and generate recovery codes. Save privately; rotate and verify the old set fails. In a new signed-in session use one new code on `/admin/mfa`; its second use must fail. Recovery revokes other sessions. Reset authenticator from Security, then enroll a new authenticator with password; old OTP/session privileges must fail. Do not test on the sole real owner or publish codes.
- **Remaining manual:** Physical authenticator/browser usability, keyboard, 320/768/1440px, 200% zoom, EN/BN and Light/Dark/System. Automated locale/theme SSR assertions are not visual QA. Confirm the published build before testing: Vercel `3cc4eeef` contains the core PG01 implementation; later localhost/preview proxy Origin fix `42fc75d` is still deployment-rate-limited. Do not claim latest-source web parity.

## PG02 — Product/business/environment + shared UI foundation

- [ ] Create a second permitted business with distinctive name; search it in sidebar, switch; selected role/name reflects actual server membership. Try a forbidden workspace URL; must deny rather than leak.
- [ ] Switch Payment → AI → Payment; same business and previously authorized per-product section remains. Disabled product cannot be opened; current product click does not redirect.
- [ ] Select Sandbox then Live; URL and banner change and same business remains; records/keys/filters from Sandbox do **not** bleed into Live. Live incomplete shows clear setup reason. Switch businesses and back to verify remembered, authorized preferences.
- [ ] Use Ctrl/⌘K, arrows, Enter, Escape and sidebar search. Only accessible product/environment navigation/records; no fabricated result; selected keyboard result really navigates.
- [ ] For an editable **real** form, type an unsaved value, switch business/product/env/locale/theme and try browser back: Save draft / Discard / Stay behavior must preserve or intentionally discard the draft; no unconfirmed payment/order created.
- [ ] Open direct/bookmarked URLs, back/forward, malformed environment, expired session, forbidden product; verify distinct loading, denial/404, error+retry, empty/unavailable states.
- [ ] Four EN/BN × Light/Dark combinations + System OS switch across two tabs, refresh/no flash, Unicode Hind Siliguri, payment env/query preserved; no untranslated buttons/tooltips or clipped UI.
- [ ] Android Chrome width 320, tablet 768, desktop 1440, 200% zoom, sticky header, drawer body lock, keyboard and focus restoration, reduced-motion preference, screen reader labels.
- [ ] Visit notifications/profile, ensure unknown counts show **unavailable**, not 0; settings/security links must be real; incomplete records show **source disconnected** not “zero items”.
- **Automated:** navigation/route/env/translation contracts, web lint/TypeScript/build and server authorization tests. See CI; results/commit recorded in PG02 evidence.
- **Acceptance state:** IN PROGRESS. Do not call financial lists or dashboard complete without real PG03–PG09 APIs.

### PG02 additional live account/product checks (new functional controls)

- [ ] In `/{locale}/workspaces` as owner/admin, enable/disable AI and Payments independently, including Both Off. Confirm business remains visible and disabled workspace shows a real access/setup explanation. Try an editor/viewer or removed member — changes must be denied.
- [ ] Observe product state after refresh, browser back and a second browser. For a disabled payment product, its protected deep link and Go authorization must deny; re-enabling should recover allowed UI without activating real payments.
- [ ] Verify audit entries for enabled/disabled toggles (authorized operator view), no duplicate record for an idempotent unchanged request, and correct actor/business attribution.
- [ ] Open `/{locale}/account`; update name with real backend, refresh and verify persistence. Sign into another browser and use “Revoke other sessions”; first browser should lose access and current session must remain active. Confirm no guessed IP/device labels.
- [ ] In new workspace onboarding, fill an incomplete business name and service choice: Save draft, Restore, Discard; internal navigation shows Save/Discard/Stay. Test separate accounts on same browser do **not** restore each other's draft; nothing is submitted merely by saving local draft.
- **Automation passed:** [CI 38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845), Go/Next/Android and isolated PostgreSQL product/account isolation. Production Neon 0005 applied; Render `61105edf` startup PASS. Manual browser results pending.

### PG02 finalization delta — run together with the existing PG02 matrix

- [ ] **Onboarding language + draft guard:** In `/bn/workspaces`, enter an incomplete new business name and select AI. Change to EN. Stay preserves input and BN URL; Save draft navigates and Restore in this test account recovers local data; Discard deliberately clears it. The browser must not create a business from a draft.
- [ ] **Real authorized business command search:** From a workspace dashboard press Ctrl/⌘K. Type the unique other-business name in EN and BN, use arrows/Enter; only workspace memberships for the logged-in test account appear. Escape returns focus. A removed membership disappears after a server refresh and cannot be loaded via deep link.
- [ ] **Preference correctness with dirty editor:** When a real PG02 editable dashboard form exists, switch Sandbox→Live and choose Stay; reload and switch products and confirm no rejected environment preference leaked to storage or URL. Check suspended Live access as a negative case.
- [ ] **Profile stale draft:** Save a test name to server, return to same tab and choose Restore draft; a prior draft must not overwrite the confirmed name. In a separate browser test revoked-session denial.
- [ ] **Production parity:** Vercel project `ekmivo-web` production deployment `githubCommitSha` must equal the merged release SHA before owner QA. At investigation time production was `b2a7b0d` while main had reached `c31b653` — **not parity**. Review PG02 evidence for current SHA and CI.
- **Source fixes / tests (not manual passes):** business-membership-only search, command accessibility IDs, guarded language switch on onboarding, delayed environment preference write, current/business-off search closing, stale profile draft cleanup. Automated regression scripts added to CI in PG02 hardening branch; run ID and outcome required.

## PG03 — Contract and scoped API credentials

- [ ] On owner-owned sandbox, issue API key, copy **once**, refresh to confirm raw key cannot be viewed again; rotate and revoke, old key blocked, new key works.
- [ ] Same endpoint with Sandbox key against Live must fail, and vice versa; unscoped or non-owner cannot create credentials.
- [ ] Incorrect method/schema/amount/body yields localized actionable 4xx error, stable idempotency ID and no mutation. Check OpenAPI plus generated client.
- [ ] No secrets appear in logs, downloaded exports, URL or browser source.
- **Automated required:** hash-only storage, scoped roles, OpenAPI security and error conformance, real PostgreSQL env-isolation.
- **Status:** NOT IMPLEMENTED / PENDING.

### PG03 implementation-specific single-session checks (do not treat as passed yet)

- [ ] As a real owner/admin, open `/{locale}/w/{workspaceId}/payments/developers?env=sandbox`. Create a scoped `payments:read` key with a distinctive name, 7/30/90-day expiry and correct current password. Raw secret is shown once; refresh/return must not reveal it. Wrong password/no scopes are denied and create no row.
- [ ] With the server-side secret, call `GET /v1/merchant/context?environment=sandbox` directly through Go API. Confirm exact workspace, sandbox, key id, scopes, `financial_api_ready:false`; wrong environment, missing scope, unknown key, revoked key and expired key must deny. Live key cannot access sandbox and vice versa.
- [ ] Rotate an actual sandbox key. Old token immediately stops (401); new token inherits scope/expiry and works. Revoke it and retest denial. Confirm no key secret in DB, frontend JS bundle, logs, URL, web analytics or error body.
- [ ] Repeat creation/list as editor/viewer (forbidden, no key metadata); disable payment product or suspend environment (key must fail) and restore only test fixtures. Test owner vs removed member and second business; no cross-tenant result.
- [ ] Visit EN/BN and Light/Dark/System at 320/768/1440 px, zoom 200%, keyboard and screen reader: name/scopes/expiry/password, list/empty/error/success, copy/hide and disabled status must render. Verify loading and offline from a deliberately disconnected test browser.
- [ ] Verify applied production Neon 0007 migration, Vercel + Render deployment SHA/health, and no active key exists without correct RLS/function grants. Do not use actual merchant payment credentials or attempt real payouts.
- **Dependency / deliberately unavailable:** PG04–PG09 payment attempts, checkout, automatic verification and signed outbound webhooks; PG14 generated SDK/reference harness. Real operational API cannot be accepted by testing credential context alone.

## PG04 — Financial source of truth and job durability

**Implementation and acceptance are distinct.** Detailed evidence: [PG04](evidence/PG04/README.md); clean source [PR #6](https://github.com/masharzy/ekmivo/pull/6). No real money or merchant payment verification belongs to this phase.

- [ ] **Operator-only, isolated environment:** Confirm PostgreSQL has *three separate database names, credentials and connections*: control auth, sandbox finance, live finance. Control has no payment tables; finance holds no sessions/passwords/API secrets. No worker can connect to the other financial realm, no financial reader can INSERT a verified payment or SELECT raw encrypted SMS evidence.
- [ ] With an approved disposable workspace, enable Payments in control: projector creates both minimal financial registry rows with monotonic version. Disable Payments / suspend Live: appropriate projected state becomes suspended. Older version cannot reactivate it. Delete disposable workspace: tombstone updates both finance realms; identity data is not copied.
- [ ] Run migration 0009 in isolated control, River+0008 separately in both isolated financial DBs, then rerun: idempotent, no missing tables, no cross-realm or existing-user mutations. Confirm automated CI used real restricted roles, not superuser-only assertions.
- [ ] **Safe synthetic financial cases only:** two requests with same idempotency key/body return the identical result, even under concurrency; different body with same key is rejected. No extra intent/event/River job. Attempt cannot change amount/payer/receiving account/window; forged receipt/method/time and cross-tenant references cannot create verified funds.
- [ ] **Worker kill rehearsal:** Kill sandbox River worker after its synthetic `pg04_audit` job transitions to `running`, before ACK; restart fresh worker. Observe automatically recovered job, one processing marker (no duplicate), no loss; repeat for Live on isolated synthetic data if needed. Invalid/unsupported jobs never mark payment paid.
- [ ] Check that process logs, output, CI artifacts and temporary fixtures do not expose raw SMS, full payer numbers, secrets, DB URLs or user identity. Review separate outbox/dead job monitoring and recovery path.
- [ ] Record reviewed SHA, isolated migration run, River rescue and 4/4 CI, production migration/operator decision; **do not** treat PG04 as permission to issue real payment receipts, payment intents or claims of provider settlement.
- **Automated gates:** CI PostgreSQL 17 three-DB setup, migration replay, RLS, immutable/dedup/monetary guards, River InsertTx rollback and 12-way replay, real SIGKILL/restart recovery, Go/Next/Android regression.
- **Status:** **IMPLEMENTED — MANUAL PENDING** (source verified SHA `12d80eb3`; [CI 38135142457](https://github.com/masharzy/ekmivo/actions/runs/38135142457) **4/4 PASS**, 52 isolated finance assertions plus true SIGKILL/River recovery). Production financial migration, provider/device testing and release remain separate.


## PG05 — Checkout and payer lock

- [ ] Create standalone sandbox request; checkout shows exact server amount, method, receiving account, expiry, original reference; no order/catalog prerequisite.
- [ ] Enter full permitted payer mobile, lock route/window, test refresh/resume/cancel/expiry and spoofed callback; never see TrxID/screenshot/manual approval.
- [ ] Overlapping attempts and amount changes show explicit conflict, not duplicate paid.
- **Status:** PENDING.

## PG06 — Native Android consented receipt collection

- [ ] Install one **Kotlin/Compose** app on approved actual Android device. Consent SMS/notification only where allowed; permission denial leaves payment unconfirmed; exclude OTP and unrelated SMS.
- [ ] Test supported genuine provider receipts with **full payer number**, amount, receiving source, provider/direction and original transaction time, including Bangla digits and dual-SIM. Masked sender cannot auto-verify.
- [ ] Reboot/offline/retry, enrollment/revoke/rotate, device binding and Android Keystore signature checks; never fabricate missing fields or receipt timestamps.
- **Source only:** Keystore signer, canonical signature, evidence-field gate have unit tests; **real capture not implemented/verified**. PG06/AN03 NOT complete.
- **Status:** PENDING REAL DEVICE + SERVER INGESTION.

## PG07 — Unique automatic matching

- [ ] Send one controlled eligible five-field match; only one payment transitions to verified once and allocation is accurate.
- [ ] Test wrong amount, swapped source account, cash-out/direction, masked sender, stale/late/duplicate, concurrent contender, time-window edge, partially-paid/advance and cancellation. No ambiguous match is ever marked paid.
- **Status:** PENDING.

## PG08 — Merchant webhook

- [ ] Receive actual sandbox `payment.verified` with canonical raw-body HMAC; verify signature, event ID and merchant env. Fail consumer; retry preserves business event, uses new delivery attempt; invalid URL/replay rejected.
- [ ] Webhook failure must not roll back confirmed ledger, and duplicates cannot double-credit.
- **Status:** PENDING.

## PG09 — Real payment dashboards

- [ ] Payments/Requests/Incoming/Devices/Accounts/Webhooks each render authorized backend records with correct statuses/method/amount/time/provenance and role masks.
- [ ] Verify page heading primary action, URL filters/sort/cursor, data refresh/freshness, real empty vs unavailable, loading, error+retry, detail-not-found, permission denied, success, keyboard row navigation and safe export.
- [ ] Confirm verified status cannot be changed with a local button; no missing source appears healthy.
- **Status:** PENDING.

## PG10 — Payment links/invoices/customer/imports

- [ ] Generate real shareable per-visitor payment link; invoices snap server-side amount and due/advance; contact number never replaces payer identity.
- [ ] Actual permission-scoped export/import preview, bounded upload, downloadable invoice/receipt and no invented paid state.
- **Status:** PENDING.

## PG11 — Refund and reconciliation

- [ ] Refund limits, races, idempotent retries, unknown outcome clearly unresolved, settlement source reprocess, original provenance preserved; no fake “refunded” success.
- **Status:** PENDING.

## PG12 — Native provider/integrations

- [ ] For each supported provider, test **approved official sandbox/live** credentials and actual permitted callbacks/query/refund as applicable; unsupported methods clearly disabled; phone receipt matching not artificially blocked by official API absence.
- **Status:** PENDING.

## PG13 — Reports, billing, team and settings

- [ ] Verify accurate reconciled merchant volume vs SaaS revenue, authorized report exports, team invitation/role/grant lifecycle, settings validation, audit, notifications read/unread and help/security states.
- **Status:** PENDING.

## PG14 — Developer hub and examples

- [ ] Run clean-account quickstart. Verify generated API reference and TS/Go/PHP/Python signed webhook example against actual callback; sandbox reset/test cases reproducible.
- **Status:** PENDING.

## PG15 — Load/recovery/security

- [ ] Witness reproducible tenant/role security tests, real worker crash/retry, quotas, idempotency races and monitored alerts, restore from backup into **isolated** target with reconcilable balances, rollback rehearsal and documented incidents.
- [ ] Test EN/BN light/dark/system, 320/768/1440, accessibility and performance on low-end Android.
- **Status:** PENDING.

## PG16 — Controlled real payment cohort

- [ ] With owner-approved devices/accounts: one real qualifying bKash/Nagad/Rocket payment per supported receipt pattern, 7–14 day observation, duplicate correction, signed merchant consumer webhook verified; preserve test consent and logs.
- **Status:** PENDING — can never be silently replaced by synthetics.

## PG17 — Payment production release

- [ ] Approve release only when PG00–PG16 evidence, backups/rollback, service readiness, security, monitoring, support and financial accuracy pass. Record released provider/device capabilities; do not claim complete dual-SaaS.
- **Status:** PENDING.

## Owner's combined test session log

| Date | PG | Scenario | Result (PASS/FAIL/BLOCKED) | SHA/build | Redacted evidence | Follow-up |
|---|---|---|---|---|---|---|
| — | — | Not yet executed together | PENDING | — | — | Agent continues automated verification |


### PG02 final source-layer owner/browser test additions

- [ ] In `/bn/account`, edit **Display name** without saving; switch EN/BN and press **Stay**: URL, cookie locale and text remain unchanged; **Save draft & leave** preserves only account-scoped name in current tab and does **not** update server; revisit and click Restore. **Discard & leave** must not persist the unsaved name. Complete the real **Save name** action and refresh: persisted name now matches the server-confirmed success.
- [ ] While a future registered dashboard editor has a dirty draft, switch to another business where **both products are disabled**. It must still show Save/Discard/Stay before rendering the disabled-business information page.
- [ ] Open Ctrl/⌘K search from a focused text field; Escape and Close must restore the original focused field. On 320px mobile open menu, Escape/Close must focus the menu trigger again, including when it closes through React cleanup.
- [ ] Test a blocked unsaved-draft **language switch**: the locale preference cookie must remain unchanged until Save/Discard actually authorizes navigation. Switching Light/Dark/System must not discard the draft.
- [ ] Before owner browser QA, verify Vercel deployment source SHA is **`3cc4eeef` or a newer code-equivalent SHA**. The Git-connected deployment `ekmivo-5yxe0dedp-masharzys-projects.vercel.app` was verified **READY** for merged PG02 code `3cc4eeef`; the previous manual deployment API request did encounter daily quota `HTTP 402`, but automatic Git deployment later succeeded. Never test older `356575bb` as the finished PG02 code.

### Independent PG02/PG03 verification — 2026-10-11

**PG02: 21/21 deployed HTTP/action/DB assertions pass; browser 16 pass, 2 reproducible accessibility failures; acceptance OPEN.** Mobile search lacks an accessible name and client EN/BN navigation leaves html lang stale. **PG03: NOT ACCEPTED / release blocker.** 29 passing assertions, 8 unmet assertions: valid key/rotated/live context return 503 from PostgreSQL text[] → Go []string scan failure; OpenAPI also fails strict parsing (unclosed pattern at162, duplicate responses163/189). Deployed Vercel c441dca / Render 4f1c4d6 and green CI were inspected, so these are actual runtime/contract defects, not absent migration/provider credentials. Dedicated fixtures cleaned; no financial/user data or migrations changed. Detailed evidence and fix/retest requirements: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`; manual checks remain in `docs/MANUAL-VERIFICATION.md`. Fix these gates before claiming PG03 accepted or a working merchant API.
### Post-fix checkpoint — 2026-10-11
The two independently observed PG02 UI defects and two PG03 runtime/contract blockers are closed by `1ffa7da` and exact-source live verification: PG02 deployed 21/21, PG03 deployed 37/37, targeted Chrome 7/7; CI 38129786695 three jobs PASS. The historical failure entry above is superseded for these four defects. Mobile search EN/BN accessible names, html lang EN→BN→EN and key-form Stay preservation now PASS. All other unchecked manual items stay open, including full screen-reader use, System OS/cross-tab changes and secret Copy/Hide/reload/back-cache. No provider/device or financial acceptance is inferred. Source/evidence: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`.

### Owner confirmation — 2026-10-11
Owner reported **All pass** for the supplied PG01/PG02/PG03 combined checklist. Record this as owner-reported browser smoke, not agent-observed physical authenticator/device/provider testing. PG01 security lifecycle was independently repeated against deployed HTTP with dedicated fixtures: 51/51 PASS, cleanup included; existing owner enrollment/recovery data were untouched. The owner subsequently deferred admin UI work. Admin UI expansion remains out of this checkpoint. PG02 route latency and full-shell loading were reported separately and are being corrected; do not erase that performance follow-up.

### PG04 independent automated follow-up
The owner authorized dependency-independent PG04 verification hardening while PG05 runs separately. Populated isolation, invalid-receipt negatives, true competing-connection guards, actual concurrent idempotent domain/job writes and explicit rollback-job checks are implemented; CI result pending. These are automated technical checks, not extra tests delegated to the owner. Original production/operator/device manual entries remain open.

### PG04 automated follow-up outcome
- [x] Populated Sandbox/Live tenant/no-context/wrong-realm/pool-reuse isolation, malformed five-field receipts and provenance, missing outbox job and cross-tenant allocation, real concurrent overlap/allocation caps, 12-way domain/outbox/River first-use replay and explicit orphan-job rollback: **automated PASS**, source a8fa3c9 / CI 38144576645 (107 database assertions plus Go integration races). Not owner/device evidence.
- [ ] Existing operator production rollout and actual provider/device checks remain pending; original human checklist is preserved.


## PG05 — Checkout and payer lock

**Branch:** `pg05-checkout-payer-lock-20261011` ([PR #7](https://github.com/masharzy/ekmivo/pull/7)). **Review condition:** PG04 realm services/migration/config actually deployed to a permitted **disposable sandbox**, not production. No real transfer.

- [ ] From a real owner/admin account in **Sandbox**, open Payments → Requests, create a standalone `BDT 500.50` request with unique reference/15-minute expiry; verify list amount, reference, state, exact checkout deep link, copy, browser back/reload. API response 201; same Idempotency-Key and identical payload creates exactly one record; changed payload returns 409.
- [ ] Open in clean/incognito browser via `/bn/checkout/{opaqueToken}` and `/en/checkout/{opaqueToken}`; verify hard Sandbox **DO NOT SEND REAL MONEY** banner, amount/expiry/reference and no real receiving number. Locale/theme Light/Dark/System on 320px, 768px, 1024px, 1440px; no clipped BN conjuncts, navigation/keyboard controls work.
- [ ] Enter `০১৭১২৩৪৫৬৭৮` as the **actual payer**, choose bKash/Nagad/Rocket; after confirming, only last four digits display, method+amount+window remain locked across reload. A different payer/method must 409; same retry must not create a second attempt.
- [ ] Issue a second same-amount request with same payer+method+route inside overlapping window → 409; cancel first unpaid request, verify same sender can then use a **new** checkout without rewriting old immutable history. Cancel idempotent; expired/completed cannot be cancelled.
- [ ] Wait for countdown expiry, refresh/back/revisit: state remains expired; do not offer pay instructions. Set the test device's clock incorrectly: checkout countdown must still use the finance server time. Cancel → state cancelled; receiving evidence after cancellation must later be handled in PG07 reconciliation, never merchant auto-fulfilment.
- [ ] Suspend an isolated test workspace after issuing a checkout link: both public checkout view and payer-lock operations must become unavailable. Re-enable only this test workspace, verify access restores without creating a new payment or overwriting the original immutable attempt.
- [ ] Network offline/Go unavailable, invalid capability, no permission, viewer read vs write, cross-workspace/realm, CSRF, wrong key and service-unavailable conditions show actionable error and never display a fabricated 0 verified or success.
- [ ] Open a fake return/success URL, manually modify query/local JS and attempt direct 'paid' payload → still pending (no manual TrxID, screenshot, OTP, PIN, or approval). Browser writes cannot change verification or allocations.
- [ ] Create form unsaved draft → change business/env/language: Save draft/Discard/Stay guard. Restore only same user/business/environment, then reload: no duplicate issuance or silent server mutation.
- [ ] In Sandbox issue an immutable **Order** and **Invoice** source with 2+ lines, quantity and BDT unit prices, from the merchant UI; verify server-calculated total, unique reference, retry with identical lines returning the same ID and changed lines giving 409. Check that a viewer cannot create or change issued documents.
- [ ] Create a linked request by choosing the issued source. It must use the server-stored total, show the linked document reference in the merchant list and customer checkout must have the exact amount. Client POST with order_id/invoice_id **and** forged `amount_minor` rejects 422; an unknown or other-workspace source must not be resolvable or leak data.
- [ ] Issue a second active linked checkout for the same document from another session/idempotency key: conflict 409; cancel the unpaid first, then issue a new separately referenced intent for the same immutable document. Original events/attempts remain, and neither path marks funds verified.
- [ ] Test 1/20 lines, empty names, decimal quantity, negative/overflow price, duplicate document reference with altered content, concurrent create/linked issuance and replays. On live environment, source issuance and linked checkout remain 503—**not** simulated live money.
- [ ] Full external OMS/catalog sync, complete invoice drafting/correction/tax/discount/fulfilment and real receiving-provider verification are **outside PG05 minimum** and remain PG10/PG06/PG07 blockers. Do not pretend that this minimal issued source is a complete invoice application.
- **Status:** SANDBOX STANDALONE + MINIMAL LINKED SOURCE CODE IMPLEMENTED; previous standalone/base test suite **PASS** ([run 38142901441](https://github.com/masharzy/ekmivo/actions/runs/38142901441)); new full linked/HTTP CI pending final pass. Owner combined manual/browser verification **PENDING**; no live payment claim. Evidence: `docs/evidence/PG05/README.md`.

### PG05 continuation checks — one combined owner pass

Automated coverage is recorded separately in PG05 evidence. These checks remain **manual pending** on an explicitly provisioned isolated sandbox running the PR source, financial migrations 0010–0012 and control migration 0013:

- [ ] Owner/editor and viewer in separate real sessions: view the same immutable document/history; viewer sees read-only controls; direct writes deny. Follow a `requests?env=sandbox&request=<id>` deep link, reload/back and check role changes/revocation.
- [ ] Interrupt an intent POST after the server commits but before the response reaches the browser; reload, Restore draft and retry. Confirm the original request/token returns, without duplicate history. Change the payload deliberately to create a fresh request; do not blindly resend funds.
- [ ] Close a dirty request form, switch business/env/locale, test Stay/Save/Discard and restore only the same account/business/environment. Edit source lines during a slow response: fields stay locked until the result resolves.
- [ ] With a physical screen reader/keyboard and browser autofill, check announcements, focus, Bengali glyphs, 200% zoom, all four widths and Light/Dark/System/cross-tab preference changes. Automated Chromium coverage is not physical-device acceptance.
- [ ] Test source suspension and stale control-plane projection independently; unavailable business/source never displays usable instructions. Check edge/CDN logging scrubs bearer checkout paths and confirm deployment-wide quotas alongside the per-process 429 budgets.
- [ ] Verify the exact deployed sandbox SHA, restricted control/finance roles and migration operator procedure before any owner acceptance. Real receipt/payment matching remains PG06/PG07; production deployment and full invoice lifecycle remain separate gates.

## PG06 — Native Android consented receipt collection

- [ ] Install one **Kotlin/Compose** app on approved actual Android device. Consent SMS/notification only where allowed; permission denial leaves payment unconfirmed; exclude OTP and unrelated SMS.
- [ ] Test supported genuine provider receipts with **full payer number**, amount, receiving source, provider/direction and original transaction time, including Bangla digits and dual-SIM. Masked sender cannot auto-verify.
- [ ] Reboot/offline/retry, enrollment/revoke/rotate, device binding and Android Keystore signature checks; never fabricate missing fields or receipt timestamps.
- **Source only:** Keystore signer, canonical signature, evidence-field gate have unit tests; **real capture not implemented/verified**. PG06/AN03 NOT complete.
- **Status:** PENDING REAL DEVICE + SERVER INGESTION.

## PG07 — Unique automatic matching

- [ ] Send one controlled eligible five-field match; only one payment transitions to verified once and allocation is accurate.
- [ ] Test wrong amount, swapped source account, cash-out/direction, masked sender, stale/late/duplicate, concurrent contender, time-window edge, partially-paid/advance and cancellation. No ambiguous match is ever marked paid.
- **Status:** PENDING.

## PG08 — Merchant webhook

- [ ] Receive actual sandbox `payment.verified` with canonical raw-body HMAC; verify signature, event ID and merchant env. Fail consumer; retry preserves business event, uses new delivery attempt; invalid URL/replay rejected.
- [ ] Webhook failure must not roll back confirmed ledger, and duplicates cannot double-credit.
- **Status:** PENDING.

## PG09 — Real payment dashboards

- [ ] Payments/Requests/Incoming/Devices/Accounts/Webhooks each render authorized backend records with correct statuses/method/amount/time/provenance and role masks.
- [ ] Verify page heading primary action, URL filters/sort/cursor, data refresh/freshness, real empty vs unavailable, loading, error+retry, detail-not-found, permission denied, success, keyboard row navigation and safe export.
- [ ] Confirm verified status cannot be changed with a local button; no missing source appears healthy.
- **Status:** PENDING.

## PG10 — Payment links/invoices/customer/imports

- [ ] Generate real shareable per-visitor payment link; invoices snap server-side amount and due/advance; contact number never replaces payer identity.
- [ ] Actual permission-scoped export/import preview, bounded upload, downloadable invoice/receipt and no invented paid state.
- **Status:** PENDING.

## PG11 — Refund and reconciliation

- [ ] Refund limits, races, idempotent retries, unknown outcome clearly unresolved, settlement source reprocess, original provenance preserved; no fake “refunded” success.
- **Status:** PENDING.

## PG12 — Native provider/integrations

- [ ] For each supported provider, test **approved official sandbox/live** credentials and actual permitted callbacks/query/refund as applicable; unsupported methods clearly disabled; phone receipt matching not artificially blocked by official API absence.
- **Status:** PENDING.

## PG13 — Reports, billing, team and settings

- [ ] Verify accurate reconciled merchant volume vs SaaS revenue, authorized report exports, team invitation/role/grant lifecycle, settings validation, audit, notifications read/unread and help/security states.
- **Status:** PENDING.

## PG14 — Developer hub and examples

- [ ] Run clean-account quickstart. Verify generated API reference and TS/Go/PHP/Python signed webhook example against actual callback; sandbox reset/test cases reproducible.
- **Status:** PENDING.

## PG15 — Load/recovery/security

- [ ] Witness reproducible tenant/role security tests, real worker crash/retry, quotas, idempotency races and monitored alerts, restore from backup into **isolated** target with reconcilable balances, rollback rehearsal and documented incidents.
- [ ] Test EN/BN light/dark/system, 320/768/1440, accessibility and performance on low-end Android.
- **Status:** PENDING.

## PG16 — Controlled real payment cohort

- [ ] With owner-approved devices/accounts: one real qualifying bKash/Nagad/Rocket payment per supported receipt pattern, 7–14 day observation, duplicate correction, signed merchant consumer webhook verified; preserve test consent and logs.
- **Status:** PENDING — can never be silently replaced by synthetics.

## PG17 — Payment production release

- [ ] Approve release only when PG00–PG16 evidence, backups/rollback, service readiness, security, monitoring, support and financial accuracy pass. Record released provider/device capabilities; do not claim complete dual-SaaS.
- **Status:** PENDING.

## Owner's combined test session log

| Date | PG | Scenario | Result (PASS/FAIL/BLOCKED) | SHA/build | Redacted evidence | Follow-up |
|---|---|---|---|---|---|---|
| — | — | Not yet executed together | PENDING | — | — | Agent continues automated verification |


### PG02 final source-layer owner/browser test additions

- [ ] In `/bn/account`, edit **Display name** without saving; switch EN/BN and press **Stay**: URL, cookie locale and text remain unchanged; **Save draft & leave** preserves only account-scoped name in current tab and does **not** update server; revisit and click Restore. **Discard & leave** must not persist the unsaved name. Complete the real **Save name** action and refresh: persisted name now matches the server-confirmed success.
- [ ] While a future registered dashboard editor has a dirty draft, switch to another business where **both products are disabled**. It must still show Save/Discard/Stay before rendering the disabled-business information page.
- [ ] Open Ctrl/⌘K search from a focused text field; Escape and Close must restore the original focused field. On 320px mobile open menu, Escape/Close must focus the menu trigger again, including when it closes through React cleanup.
- [ ] Test a blocked unsaved-draft **language switch**: the locale preference cookie must remain unchanged until Save/Discard actually authorizes navigation. Switching Light/Dark/System must not discard the draft.
- [ ] Before owner browser QA, verify Vercel deployment source SHA is **`3cc4eeef` or a newer code-equivalent SHA**. The Git-connected deployment `ekmivo-5yxe0dedp-masharzys-projects.vercel.app` was verified **READY** for merged PG02 code `3cc4eeef`; the previous manual deployment API request did encounter daily quota `HTTP 402`, but automatic Git deployment later succeeded. Never test older `356575bb` as the finished PG02 code.

### Independent PG02/PG03 verification — 2026-10-11

**PG02: 21/21 deployed HTTP/action/DB assertions pass; browser 16 pass, 2 reproducible accessibility failures; acceptance OPEN.** Mobile search lacks an accessible name and client EN/BN navigation leaves html lang stale. **PG03: NOT ACCEPTED / release blocker.** 29 passing assertions, 8 unmet assertions: valid key/rotated/live context return 503 from PostgreSQL text[] → Go []string scan failure; OpenAPI also fails strict parsing (unclosed pattern at162, duplicate responses163/189). Deployed Vercel c441dca / Render 4f1c4d6 and green CI were inspected, so these are actual runtime/contract defects, not absent migration/provider credentials. Dedicated fixtures cleaned; no financial/user data or migrations changed. Detailed evidence and fix/retest requirements: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`; manual checks remain in `docs/MANUAL-VERIFICATION.md`. Fix these gates before claiming PG03 accepted or a working merchant API.
### Post-fix checkpoint — 2026-10-11
The two independently observed PG02 UI defects and two PG03 runtime/contract blockers are closed by `1ffa7da` and exact-source live verification: PG02 deployed 21/21, PG03 deployed 37/37, targeted Chrome 7/7; CI 38129786695 three jobs PASS. The historical failure entry above is superseded for these four defects. Mobile search EN/BN accessible names, html lang EN→BN→EN and key-form Stay preservation now PASS. All other unchecked manual items stay open, including full screen-reader use, System OS/cross-tab changes and secret Copy/Hide/reload/back-cache. No provider/device or financial acceptance is inferred. Source/evidence: `docs/evidence/PG02/README.md`, `docs/evidence/PG03/README.md`.

### Owner confirmation — 2026-10-11
Owner reported **All pass** for the supplied PG01/PG02/PG03 combined checklist. Record this as owner-reported browser smoke, not agent-observed physical authenticator/device/provider testing. PG01 security lifecycle was independently repeated against deployed HTTP with dedicated fixtures: 51/51 PASS, cleanup included; existing owner enrollment/recovery data were untouched. The owner subsequently deferred admin UI work. Admin UI expansion remains out of this checkpoint. PG02 route latency and full-shell loading were reported separately and are being corrected; do not erase that performance follow-up.

### PG05 automated verification checkpoint — 2026-10-11

Source a17d5c63, CI [38148742214](https://github.com/masharzy/ekmivo/actions/runs/38148742214): all three jobs PASS; real isolated Next/Go/PostgreSQL browser 26/26 PASS, including 16 viewport/locale/theme cases. This supersedes the PG05 pending automated-CI status above. All unchecked owner/manual items remain pending. No deployment, physical-device acceptance, receipt capture or payment verification is inferred. Evidence retained in docs/evidence/PG05.

### PG05 integrated automated result
Source 63e50c8 / CI 38150117547: four jobs PASS, combined PG04/PG05 financial 198 assertions and real browser 26/26 PASS. This closes available isolated source/CI checks, not operator production parity, physical screen-reader/device/provider checks. Existing manual checklist remains authoritative.

## PG06–PG09 combined verification — code checkpoint 2026-10-11

All rows below are **NOT RUN / pending**, not failed or passed. Run automated checks and fix source first, then bundle these with the existing ledger. No passwords, cookies, keys, source receipt plaintext, MFA secrets or recovery codes in evidence.

| Item | What to check | Needed source/account | Expected result |
|---|---|---|---|
| PG06 pairing | Owner/admin pairs; viewer cannot; token expires/consumed; wrong key/raw bytes/signed enrollment/env rejected | Dedicated owner/viewer, consented Kotlin device | One bound enrollment; no cross-workspace/account/env submission |
| PG06 capture | Approved actual incoming receipt; unrelated SMS/OTP/debit excluded; masked/missing payer/time exception | Real consented samples, approved parser/source | Five actual fields, original timestamp; no guessed sender/time or false paid |
| PG06 lifecycle | Permission denial/revoke; dual-SIM; airplane mode; reboot; backlog quota; force-stop; device revoke; lost claim response | Consented Android OEM/SIM device | Queue encrypted, IDs/sequence stable, transport re-signed, health truthful; gaps visible, no fake ACK |
| PG07 uniqueness | Parallel matches, transport duplicate/provider identity collision, same amount with wrong payer/account/method | Disposable isolated finance DBs, actual sandbox API/device | One payment/allocation/event; conflict never silently reallocated |
| PG07 windows | Exactly start/exclusive end, whole minute containment, timezone, late sync, cancelled, under/over/advance | Controlled attempts + signed receipt evidence | Only complete unique original-time match verifies; other funds remain reasoned exceptions |
| PG08 delivery | Exact raw-body HMAC, timestamp/env/IDs/key mismatch, consumer query/dedup, timeout/lost ACK/crash recovery | Dedicated public HTTPS receiver and its own disposable merchant DB | Stable event ID, fresh attempt/signature, durable retry; paid stays paid; fulfil once |
| PG08 SSRF | Private/mixed DNS, rebinding, metadata, IPv6/mapped IP, redirects, non-HTTPS, non-443 | Controlled security test DNS/receiver | Rejected before private request; no arbitrary proxy/redirect |
| PG08 rotation/replay | New key, overlap expiry, disabled endpoint, same-event replay | Dedicated owner/receiver | Once-visible secret; receiver accepts allowed keys only; payment logic not re-run |
| PG09 UI | Real data & actions, 320/768/1024/desktop, keyboard/modal, EN/BN, Light/Dark/System, offline/error/forbidden/empty, draft switch/deep link | Dedicated owner/admin/editor/viewer; real scoped seeded sandbox | Persistent shell, truthful state, masked data, no arbitrary mark-paid, no wrong-tenant view/action |
| Prerequisites | Live hosted checkout/production receiving instructions and consented receipt-notice channel | Actual intended account/channel configuration | Remain unavailable until implemented/configured and verified; no implied release from pipeline source |

Record exact endpoint/action, role, expected/actual HTTP status, safe response and relevant DB assertion during the later pass. Build/CI references belong in each per-PG README.

### Combined PG06–PG09 follow-up: one owner session (do not run until isolated backend and approved accounts exist)

Audit: [PG06–PG09](evidence/PG06-PG09-AUDIT.md). These are **PENDING**, not passes; no raw payer/message/credentials in the outcome log. Run the human-only cases once, after source/SQL/CI blockers are resolved; keep automated tests with agents.

- [ ] **PG06 phone / G0-6** — On consented actual Android phone(s) record Android/OEM/app build, approved receiving account and SIM subscription ID or notification package, SMS permission/listener enablement, genuine incoming provider samples with full payer/original transaction timestamp/precision. Include Bangla digits, unrelated SMS/OTP/debit/reversal exclusion, dual SIM, spoof-source limitation, Keystore proof, one-use pairing, lost response, revoke, consent withdrawal. **Account/device/source:** operator-approved device + bKash/Nagad/Rocket or other genuinely approved provider; no fixture is a real provider proof.
- [ ] **PG06 recovery/health** — Offline queue/reconnect/ACK ordering; airplane mode; reboot, force-stop collection gap, app upgrade, permissions revoke/restore, 500-event quota, repeated event, key loss and device re-enrollment. Record exact observed gap, backlog/rejection and health, never promise collection after force-stop. **Setup:** same consented test handset, account and restricted sandbox backend.
- [ ] **PG07 automatic payment** — In isolated authorized sandbox, original payer/time/amount/account/method five-field exact match auto-confirms exactly one payment and schedules event. Independently change each field, try masked payer, debit, collision, original minute boundary, late upload, competing workers, cancellation/expiry, partial/over/advance, duplicated provider ID and attempt replay. No user TrxID, screenshot or routine approval. **Setup:** disposable finance/control realms and eligible evidence; never transfer real money solely to complete testing.
- [ ] **PG08 controlled merchant receiver** — With owned public HTTPS endpoint, verify fresh raw-body HMAC headers, event/environment, duplicate delivery dedup in receiver DB + authoritative payment query; exercise receiver timeout/5xx, retry, replay, rotated key overlap, disabled endpoint and safe DNS failure. Separately verify **actual consented receipt notice delivery** once configured (not polling). **Setup:** operator-owned URL, receiver DB, nonproduction credentials and notice channel/contact.
- [ ] **PG09 single browser sweep** — Real owner/admin/editor/viewer and revoked member in two disposable businesses: Overview, Requests, Payments, Incoming five-field candidates, devices, accounts, endpoints/events/delivery details/actions. Check filters/deep-links, search loaded-page scope, pagination/order under inserts, account enable/disable, device pair/revoke/rename, receipt reprocess (never mark paid), endpoint create/rotate/disable/replay, secret once-visible. Force empty, forbidden, API unavailable and offline states; switching business/environment/language cannot leak data or drafts. Repeat EN/BN and Light/Dark/System at 320/768/1024/desktop, keyboard/focus/dialog/Escape/200% zoom. **Setup:** disposable browser accounts, same isolated server and records.
- [ ] **Operator release rehearsal** — Owner-reviewed 0014 staging on separate *disposable* control/sandbox/live DBs only, expected control rejection, least-privilege workers/RLS, backup/restore/key recovery, rollback-forward plan, monitoring/alerts. Record exact applied migration/commit, CI and cleanup. Actual production rollout, live checkout, real cohort remain **separate release decisions**.

**Results table:** date / source SHA + APK / device & provider (redacted) / case / PASS, FAIL or BLOCKED / evidence location / fix owner. None executed as part of the code checkpoint or this audit.

### PG06 combined-session checkpoint — owner work ONLY after automated source 8aaf240

[CI 38158507367](https://github.com/masharzy/ekmivo/actions/runs/38158507367) 4/4 jobs PASS and PG06 simulated disposable pairing/replay/health SQL PASS. **Do not repeat those unit/migration tests manually.** The open boxes in the PG06 section above remain **PENDING**, not PASS; no approved live parser or real receipt exists.

- [ ] **PG06 actual Android capture matrix:** For each supported bKash/Nagad/Rocket/SMS/notification method obtain lawful consented full payer, original provider time, amount, receiving account and verified SIM subscription/package binding; record provider version, Android/OEM/API level, source authenticity limits, and whether five fields truly exist. Reject any masked/OTP/debit/unrelated notification. If genuinely unavailable, log BLOCKED with method, never infer missing data.
- [ ] **PG06 pairing lost-response recovery:** On real enrolled phone, simulate a lost claim HTTP response, retry with same P-256 public key within five minutes, different key denied, app restarts before Confirm: collection must remain OFF. After recovery expiry, owner revokes stale device and explicitly re-pairs; no silent reuse or new source collection.
- [ ] **PG06 bounded queue/health:** On authorized test handset simulate network loss then 500 queued events, verify one overflow increments persisted missed-count WITHOUT storing rejected text; Devices dashboard must show overflow_count/last_queue_error. Return online, ACK+replay must not double-store; verify terminal HTTP rejection blocks queue instead of silently deleting. Revoke permission, reboot, app upgrade, key invalidation, force-stop; record collection gap and recovery.
- [ ] **PG06 controlled signed ingest:** Verify actual Android Keystore request bytes and Go P-256 signature over exact raw body + path/time/event ID, wrong key/time/enrollment/source/environment, revoked account, changed bytes, dropped ACK, duplicate sequence; record server DB and app build. Automated Go crypto helpers + SQL smoke are already green, but combined real-device chain is still untested.
- [ ] **PG06 security/operator review:** Approve retention and deletion/export of SMS ciphertext/Android queue, key backup/rotation and consent withdrawal protocol, alert destination/on-call, source account ownership and Android SMS permission/distribution policy before any live enrollment or production 0014 migration.

**Owner session result columns:** date/time; source SHA; redacted device/OEM/provider; scenario; PASS/FAIL/BLOCKED; redacted evidence ID; reviewer; next action. No real-device cases executed here. PG07 payment and PG08 receiver E2E must remain separate from PG06 collection evidence.

### PG07 one-session real-device/merchant verification checkpoint — after synthetic CI 38160139898

The PG07 **source-based automated** unique five-field matcher, PostgreSQL atomic payment/allocation/event, 268 PG04–PG07 mixed DB assertions, exact minute/late/cancel/partial/over and parallel worker/PG05 lock recovery are verified at tested SHA `a33c9dc`; **do not re-run those fixture tests manually**. Remaining cases in the same owner combined session are NOT YET RUN:

- [ ] **PG07 approved genuine source (BLOCKED until PG06):** record authorized bKash/Nagad/Rocket inbound receipt formats per OS/provider version and receiving account, with actual unmasked payer, original provider transaction timestamp (not phone collection time), exact minor-unit amount and receiving method. If any source lacks data, mark BLOCKED/unmatched; no sender inference and no routine manual mark-paid.
- [ ] **PG07 complete signed end-to-end:** controlled payment (only after approved safe live setup), consented Android capture, signed Go intake, durable persisted receipt, River matching automatically changes only the exact intended payment intent to completed and emits exactly one allocation/domain event; PG08 controlled HTTPS merchant webhook receiver verifies HMAC/query/dedup and fulfillment once. Required: owner-authorized device/account, sandbox/prod-safe receiving provider approval, isolated test merchant workspace + receiver URL. DO NOT SEND MONEY while PG05 checkout says SIMULATED.
- [ ] **PG07 adversarial field/clock matrix on permitted real samples:** alter just payer, original time, amount, receiving account, method, direction and provenance (with redacted evidence); check full minute containment, offsets/clock skew, duplicate provider identity across devices, two same-amount customers, cancel/expiry racing upload, late delivery versus actual source timestamp, partial/overpayment flagged for reconciliation but never auto credited. Sufficient synthetic cases are already green, genuine provider source not exercised.
- [ ] **PG07 staging concurrency/durability rehearsal:** restart River after worker crash before/after payment DB commit, lose ACK, retry same transport ID, two workers, hold PG05 checkout intent row while matching; ensure no duplicate payment, event, delivery or over-allocation and verify queue drains. Isolated DB synthetic lock tests passed, but real deployment/process failure/recovery remains unverified.
- [ ] **PG07 live release prerequisites (BLOCKED):** merchant-owned verified receiving account; PG05 real checkout link/intent instructions and live environment entitlement; provider receipt approvals; retention/key recovery; PG08 signed delivery and merchant receiver sign-off; operational safeguards. Never turn on live auto-verify solely from a fictional fixture.

Record each case as date / source SHA / provider+handset (redacted) / merchant and environment / PASS, FAIL or BLOCKED / redacted evidence / reviewer / next action. PG07 **product acceptance OPEN**; the detailed technical pass/fail separation is in [PG07 evidence](evidence/PG07/README.md) and [PG06–PG09 audit](evidence/PG06-PG09-AUDIT.md).

### PG08 owner combined-session checkpoint — 2026-10-12

PG08 automated webhook core tests [38165262343](https://github.com/masharzy/ekmivo/actions/runs/38165262343) **4/4 PASS**, source `d3276dc`: local TLS sender, artificial pinned public DNS & SSRF negatives, isolated financial DB retry/lease/replay/rotation, *real merchant consumer code* using a third disposable PostgreSQL DB and TLS fake payment API with event-ID dedup/one fulfillment. 312 is the combined PG04–PG08 SQL assertion count. **Do not repeat synthetic fixtures manually**; remaining checkboxes need different evidence:

- [ ] **PG08 actual externally reachable merchant receiver (MANUAL/EXTERNAL):** owner-approved HTTPS 443 host with safe public DNS and TLS certificate, restricted merchant-only DB, isolated sandbox API key and signing secret. Create one synthetic authorized sandbox verified payment; verify raw HMAC/body/header event IDs, current authoritative payment query, TLS redirect/private address denial, durable 204, duplicate/reordered webhook retries, HTTP 401/403/429/500, slow responses, public network loss and one merchant fulfillment. Record redacted receiver logs and Webhooks delivery IDs. No public receiver used in CI.
- [ ] **PG08 real rotation/rollback:** prepare next once-visible key without switching active signature; install it in receiver first; activate new key and accept old for at most 24h; emergency retire previous and remove in receiver; test stale/rotated/forged signature denial, live/sandbox isolation, key backup/restore and endpoint disabling. CI proves SQL + local receiver overlap only.
- [ ] **PG08 deployment crash/load & on-call:** kill worker after send/before finish, retry with expired lease on multiple replicas, DNS public/private change, connection/TLS/response caps, monitor max retries, missing delivery, recovery and manual replay; confirm payment/allocation/event does not revert on webhook error. Test with staging-owned worker/receiver, never raw personal receipt dumps.
- [ ] **PG08 consented customer receipt notice (MISSING CODE / BLOCKED):** build lawful verified customer opt-in/contact/withdrawal capture and configured approved SMS/email/push provider, encrypted recipient retention, durable notice delivery with dedup and retries; test real destination and privacy/anti-spam constraints. **Currently no recipient/channel exists, no customer notice delivered.** Checkout status polling and merchant webhook are not notices.
- [ ] **PG08 event inventory (DEPENDENCY):** after invoice/refund/reversal/expiry/exception owning services exist, verify every promised event producer with exact schema, ordering/resource versions, signature and dedup, plus nonfabricated query-authoritative state. Currently only `payment.verified` has a producer.
- [ ] **PG08 actual provider source end to end (PG06/PG07 dependencies):** consented genuine full-payer/original-time receipt → signed Android or approved provider ingest → unique matching/payment → signed merchant HTTPS callback → idempotent fulfillment. PG05 checkout is SANDBOX ONLY and explicitly says do not send money; no live transaction until separately authorized and safe.

Record scenario / exact backend SHA / receiver hostname (redacted) / device+provider (redacted) / sandbox-vs-live / PASS, FAIL, BLOCKED / test owner / evidence link. PG08 **automatic code + simulated tests VERIFIED**, **full product acceptance OPEN**. [PG08 evidence](evidence/PG08/README.md), [merchant receiver guide](../examples/webhook-receiver/README.md), [audit](evidence/PG06-PG09-AUDIT.md).

### PG09 combined owner real-browser verification — 2026-10-12

At **source SHA `0b7a4fd`**, [CI 38186957573](https://github.com/masharzy/ekmivo/actions/runs/38186957573) **4/4 PASS**: actual isolated database SQL source/read/mutation, real Go HTTP auth, and Next authorized browser shell with **MOCKED payment API** at EN/BN × light/dark × 320/768/1440. These CI checks do NOT establish a deployed genuine browser→backend→database journey. The following *remaining* checks can be performed **together** with PG06–PG08 real-world verification without re-running the automated fixtures:

- [ ] **Owner/admin/editor/viewer real backend browser:** deploy to a disposable/staging environment with an independently isolated finance backend. Sign in as each role, browse overview/payment/incoming/device/gateway/webhook/event lists and details; verify actual DB data/filters. Viewer/editor controls must be absent and server POST fail 403; owner/admin correct operations succeed, viewer read succeeds. Revoke membership/key/session during active tab; wrong workspace and wrong environment must never leak data. CI real Go HTTP tested owner/viewer/editor but not full deployed browser journey.
- [ ] **Data/UX state matrix:** empty vs loading vs authorization 401/403 vs backend 503 vs network offline vs successful mutation; 503 must not turn into "no payments"; verify confirmation and once-visible secret copy/hide, no plaintext secrets on reload; Webhooks Prepare/Activate/Revoke previous, disabled route, replay and error. Verify incoming detail 5-field differences/reason/provenance, original transaction vs device received vs payment verified vs webhook attempts; no mark-paid button anywhere.
- [ ] **Switch/hydration/privacy:** two businesses each with Sandbox/Live, switch product and realm, Back/Forward, copy/deep-link, reload/multi-tab. Filter search/date/account/method and saved drafts stay scoped by user+business+realm; one business's signing secret/rows/form values cannot appear in another. Invalid stored datetime should not crash. Verify no fake real receiving number in sandbox checkout.
- [ ] **Responsive/a11y**: EN/বাংলা × Light/Dark/System following actual OS setting, at 320/375/768/1024/1440 and actual mobile browser. Table horizontal scroll without page overflow, keyboard Tab/Enter/Escape, focus and dialog return, screen-reader labels, pending form draft navigation guard; verify save/recover discarded secrets not persisted.
- [ ] **Operational dependency labeling:** refunds, receipt resend/notice, customer/invoice/import/export/reconciliation and live gateway integration must be visibly unavailable or clearly linked to their owning future services, not clickable mock-success. Compare all relevant PG09 screens with `PRODUCT-UX-SPEC.bn.md`. PG05 live checkout, genuine PG06 provider receipts and public PG08 merchant E2E remain BLOCKED/MANUAL; do not send actual money while checkout displays SIMULATED.
- [ ] **Staging failover/retention:** withheld/failing webhook and offline device show accurate next retry, backlog, missing evidence and recorded reason; repeat same event without double credit; browser refresh fetches source-of-truth. Record redacted evidence and operator response/rollback before production.

Record actual date/time, tested commit + deployment, role/workspace/realm, source and environment, device/browser, case, PASS/FAIL/BLOCKED, sanitized screenshot or trace, reviewer and follow-up. PG09 **implementation + isolated automated verification PASS, overall product acceptance OPEN**. [Evidence](evidence/PG09/README.md), [audit](evidence/PG06-PG09-AUDIT.md).

## Owner five-day combined test intent — 2026-10-12

After source completion and one reviewed deployment, the owner intends five days of combined payment testing. No day is observed yet. Include real default receipts, wrong/missing five-field cases, duplicate/restart/offline recovery, signed consumer fulfilment, seller refund requests, tenant/role/session boundaries, documents/exports/files, billing, EN/BN/theme/mobile and latency. PG02 extended starts after outstanding PG10–PG17 source and must keep the shell mounted across navigation. Deployment region and production latency need actual measurements; `sin1` source configuration alone is not evidence. Existing formal cohort/release gates are not silently accepted by this five-day test intent.


### PG10–PG17 local continuation — 2026-10-12

These are remaining test requirements, not PASS claims. New migrations 0042–0044 and the extension suite have not run. Missing privacy/connector/design/state code is still in the implementation status and must not be moved into this manual ledger as if implemented.

- [ ] Disposable control/live/sandbox databases: run the existing coordinator plus extension SQL smoke; prove all thirteen matcher scenarios, cross-tenant cursor denial, refund cap, orphan lease cleanup and privacy operator/runtime separation. No production database for this pass.
- [ ] Dedicated owner/admin/viewer accounts: exercise refund/statement filters/pagination, report account/customer/refund views, public branding, Bengali filenames and document-field upload scan/errors. Verify 320/768/1024/desktop, EN/BN and Light/Dark/System, keyboard and loading/error/empty/forbidden/offline states.
- [ ] Lost checkout/CSV export response: retry same immutable key/body; leave and return to an export without creating a duplicate job; user/business/environment switch never restores another user's export.
- [ ] Independent sandbox service: tools use GO_SANDBOX_API_URL; absence produces unavailable, never Live simulation. SMTP/scanner/storage outages and maintenance/invoice worker failure must turn relevant readiness false.
- [ ] Privacy operator: test open owner export request, separate SQL operator/realm boundaries, encrypted snapshot credentials/raw-body exclusion and cross-tenant negatives. Do not record full export/deletion until private objects, device cache, queues and backups have their own actual outcomes.
- [ ] Prepared 25-workspace sandbox fixtures: run receipt-load, worker observer and read-load against one tested source; failures/drops/unknowns block target PASS. No Live load.
- [ ] Real phones/accounts and merchant receiver: complete existing receipt/payment/webhook/source, backup restore and real observed cohort/release gates. No synthetic result substitutes for these.


## 2026-10-13 — Standalone branded customer /pay and /checkout (PR #17)

Status: **manual pending**; not live-provider accepted. Test with a real authorized merchant payment-link and a real phone; no unverified payment must be sent.

- [ ] 320px/375px/768px/desktop: confirm no marketing header/footer, correct workspace identity/title/logo, real configured support contacts, high-contrast provider tiles and amount, and no overflow in EN/BN or light/dark/system.
- [ ] Only enabled configured and production-verifiable bKash/Nagad/Rocket options clickable; disabled accounts show clearly and never create a customer attempt. Do not show unsupported Upay/QR as usable.
- [ ] bKash pink payer-number → confirm → personal receiving number/copy → Send Money instructions → countdown/auto-poll. Nagad red equivalent; Rocket only when configured and verifiable.
- [ ] No email receipt / email consent / verification-code controls anywhere in the public checkout. Prior backend email records are retained.
- [ ] Actual brand links never use invented contacts; close/back preserves payment record. POST loss/retry remains idempotent, payer lock irreversible, no browser-set paid state.
- [ ] Repeat checks with device offline, receipt parser unavailable, expired link, wrong payer, active session, genuine provider receipts, and verified server/webhook settlement. Real payment acceptance remains OPEN.


## Simple Payment API / Developer Guide (2026-10-15 — pending)

All of the following are **MANUAL PENDING**, not passed: apply migration 0062 in Sandbox and Live finance databases before Go rollout; authorized Sandbox key minimal create→checkout→receipt scenario→GET verified status; live provider/device evidence; webhook signature/retries and configured URL; redirect/cancel routing; legacy integrations; EN/BN and Light/Dark mobile/desktop docs; production deploy parity. Details: docs/evidence/SIMPLE-PAYMENT-API-20261015.md.


## Simple Payment API migration 0062 — operator update (2026-10-15)

**DB SCHEMA APPLIED / VERIFIED** in both physical Neon finance databases `ekmivo_sandbox_financial` and `ekmivo_live_financial` (production branch); 13-statement atomic transaction each. Owner, realm, SQL objects, RLS and grants checked; existing payment rows untouched. Control database `ekmivo` unchanged. Prior ledger entries saying migration pending are superseded by this statement only. Still MANUAL PENDING: actual verified Sandbox/Live payment + provider device, signed webhook callback/retries, Go runtime smoke, checkout redirects and responsive EN/BN browser checks. See `docs/evidence/SIMPLE-PAYMENT-API-20261015.md`.


## Dashboard/API refinement — 2026-10-15 — manual pending

- After authorized rollout of financial migrations 0063/0064, control migration 0065 and API/web deployment, verify owner/admin Team access against the actual workspace. Isolated Neon branch confirms the ambiguous role SQL fix; production has not been changed.
- Use an authorized merchant sandbox API key and a publicly reachable HTTPS receiver: create with/without webhook_url, complete a genuine payment, validate signature and retry/deduplication, call verify before fulfillment, and confirm callback failure never reverses payment. Repeat with legacy default endpoint and cross-workspace/environment denial.
- Verify automatic invoice/customer activity with genuine authorized payment records; check permissions, pagination, search, filters, SMS evidence and ciphertext privacy.
- Complete actual-data browser pass EN/BN, Light/Dark/System, 320/768/1024/desktop, keyboard, offline, denied roles, documents create/edit and workspace settings. Saved screenshots use explicitly fictional development fixtures and do not establish live integration.
- Review the reference public payment-link/QR destination; clipboard capture was unavailable, so that reference path is not verified.
- Neon test branch `br-silent-breeze-b32znlqj` remains for review. Delete only with owner authorization. No Docker permitted.


## Production migration rollout — 2026-10-15

After explicit owner approval (push + migrations), existing financial-migrate runner with `EKMIVO_DASHBOARD_UPGRADE_ONLY=true` successfully applied only 0063/0064 to production Neon Sandbox/Live financial databases and 0065 to the control database at 2026-10-15 14:11 UTC. Runner confirmed no base migrations executed. Catalog probes confirm both financial migrations and the Team role fix. Before/after counts unchanged: Sandbox intents 15/payments 2/endpoints 1; Live intents 21/payments 3/endpoints 0. Runtime rollout and actual payment/browser E2E remain separate gates.


## Developer portal — 2026-10-15

Manual pending: finish the 11-page EN/BN × Light/Dark/System × 360/768/desktop browser matrix, search arrows/Enter/Escape and focus loop, copy toast and global code preference across navigation, reduced motion, marketing-to-portal shell swap and back. Browser tooling repeatedly timed out during this pass; only observed checks in the evidence README are passed. Use an owner-controlled Sandbox workspace/key for create → hosted checkout → real test receipt scenario → verify, plus signed payment alert delivery. Never paste a Live key into the tester. Provision the public custom API origin and publish an idempotency retention promise before removing those TODOs.


## Dashboard V2 / PR #61 — 2026-10-15

Manual pending: authorized Sandbox/Live workspace data reconciliation; EN/BN and Light/Dark/System at 320/768/1024/desktop; modal focus/keyboard/escape and create=1 navigation; payment/SMS details and roles; customer CSV import/export; invoice cancellation; payment-link create/edit/publish/archive and redirect/expiry validation; seller-managed refund decision; method enable/disable; phone pairing/disconnect. Use owner-controlled test accounts/devices and Sandbox for mutating scenarios. Source/build verification is recorded in `docs/evidence/DASHBOARD-V2-UI-HANDOFF.md`; it does not prove real-provider or production financial acceptance.

## Customer and navigation correction — 2026-10-16 (manual pending)

Use the existing authorized owner session and verified payer customer in the Neon-backed preview. Confirm full number in list/details; confirm viewer/editor do not gain recovery access. Navigate Payments → Customers and other payment menus with a slow source: old page stays until data or explicit error is ready, top progress line is visible, no page skeleton flash. Check full-width workspace picker on desktop/mobile and light/dark; retain draft guards and filter resets. No new payment or financial mutation is required. Automated evidence: `docs/evidence/CUSTOMERS-NAVIGATION-20261016.md`.


## Managed payment plans — 2026-10-16 (release pending)

**Rollout update, 14:20 UTC:** Owner approved completing deployment. Control 0067 and both financial 0068 are applied; existing financial counts and subscriptions preserved. Vercel/Render production run merged `65d6f80`. See production probe JSON in the managed-plans evidence directory. Earlier migration-pending instructions below are historical. Remaining: real enrolled-admin mutation/purchase flow and owner-approved hosting for existing standalone background workers. Primary signed-phone matching runs inline; worker health is currently false and `/readyz` is honestly 503. No paid worker was provisioned and no fake ready flag set.

Source and isolated Neon checks: `docs/evidence/MANAGED-PLANS-20261016/README.md`. Before production activation, review exact catalog pricing and entitlement terms; apply only control 0067 and financial 0068 to the intended realms using the existing targeted coordinator; deploy matching API, worker and web together. Confirm existing purchased subscriptions and pre-migration accepted checkouts. With an owner-controlled workspace/phone/platform receiving account: free activation, a real paid subscription invoice → verified receipt → renewal, quota exhaustion/upgrade, and expiry while a previously accepted payment/webhook completes. Check fresh-MFA challenge using a real enrolled admin and keyboard/screen-reader flows. Synthetic sessions/financial evidence are not real payment or MFA-enrollment acceptance. Test branches `br-lucky-mode-b3hkfaxa` and `br-still-fog-b38to82q` remain isolated; do not delete without owner authorization. No Docker used.


## API-hosted workers — 2026-10-16

**Activated 14:46 UTC with owner authorization:** #71 merged; restricted worker credentials configured in existing Render API. Both runtime startup logs and genuine critical/export/maintenance heartbeats observed in Sandbox/Live. `/readyz` HTTP 200, `release_verified=false`. No error logs in initial post-start interval. Earlier authorization-pending notes below are historical. Optional mail workers are not configured. Still manual pending: actual owner-controlled callback/renewal/provider lifecycle and host sleep/recovery under operational load.

Owner chose the existing API process temporarily. Full Go suite and isolated Neon two-realm audit-runtime startup/drain pass. Production activation awaits explicit permission to place the three restricted worker/projection credentials in the existing Render API service after automatic approval review rejected that egress. After authorization: confirm both River runtime startup logs and genuine critical/export/maintenance heartbeats, SMTP-dependent health if configured, and `/readyz`. Real authorized provider/callback/renewal acceptance remains distinct. Free Render instance sleep pauses both API and workers; no new paid service or always-on guarantee.
> **2026-10-16 pairing projection repair:** Production control and both financial registries now agree at version 5/active; hosted authoritative coordinator recurrence verified after deploy `dep-db93sacsiqls73d000r0`. Automated isolated stale-version recovery and full Go tests PASS. Remaining manual check: in the existing authenticated merchant workspace, click Create Pairing QR, confirm a real QR is returned, and pair the intended phone. No synthetic production enrollment or authenticated browser success is claimed. Evidence: `docs/evidence/API-HOSTED-WORKERS-20261016/README.md`.


## Dashboard reference overhaul — 2026-10-17 continuation (NOT ACCEPTED)

**Actual automated checks:** control/Live migration-ledger SHA-256 9/9 current SQL hashes match. Sandbox/Live financial ledger SHA-256 values agree. Read-only Neon connector verification only. GitHub Foundation CI job setup failed before any steps ran (no runner allocated); build, lint, type-check, Go tests and financial smoke checks did **not** pass in this continuation. Previous test results are historical, not substituted for fresh CI.

**Manual and environment pending:** Use an authenticated owner/admin and viewer workspace, existing real Sandbox/Live read access, a separate isolated Neon test branch for permitted mutation; side-by-side reference/app at 320/768/1024/1440 in Light/Dark/System, EN/BN; ensure screenshot Customer list/modal interactions, persisted masked/full customer numbers including details/copy, CSV import/export; invoice add/edit values/corrections/actions; payment link create→publish→public payment, disable/delete preserving accepted receipts; SMS pairing, live counts, recheck success/failure and raw-SMS redaction; API key create/one-time display/rotate/revoke; notifications read-one/read-all and destination; profile/session revoke; support topic changes/retries and replies; billing scheduled paid/free downgrade, renewal, proration and verified proof replay; nine checkout themes, real checkout success/cancel/expiry/redirect. Confirm focus/escape/outside click and no state leak across workspaces/realms. No prototype fixtures or production financial test writes. See `docs/evidence/DASHBOARD-REFERENCE-20261017/README.md` for precise continuation commits and blockers.

### Dashboard reference continuation — 2026-10-17 follow-up

Source fixes on `main`: Customer View table action (`32fa429`) and CSV import errors (`cd0008f`); Checkout Themes EN/BN editor labels (`c35d447`, `275cb86`, `da988d8`); API key one-time creation/rotation result separation (`f347d2b`); invoice-only checkout issue idempotency key (`453b8c5`). Vercel reports production builds READY through `cd0008f`. **No authorized browser/real-provider lifecycle acceptance is implied.**

Isolated Neon control branch rollback tests: (1) number visibility true/false write→readback PASS, original value preserved; (2) checkout theme version increment and stale optimistic-write conflict PASS, original value preserved. An attempted Sandbox document create→publish→disable→reenable→delete test was incomplete (first SQL invocation lacked required transaction workspace scope; scoped retry was blocked by safety checks). Those mutations were not accepted or performed on production. Continue actual browser screenshot comparison at 320/768/1024/1440 with EN/BN, light/dark/system, and authenticated payments/keys/billing/customer workflows; confirm key repeated-rotation displays fresh secret once, CSV error/retry, and expiry/cancel paths. GitHub Foundation CI runner failure remains unresolved; do not mark full build/lint/Go contract checks passed.

### Sandbox API Keys reference acceptance — 2026-10-17

Source/deploy evidence: API Keys includes Sandbox/Live list selector, active-realm validation in create modal, independent credential/webhook secret scopes, expiry column and Sandbox test-data notice. Production Neon READ ONLY confirms Sandbox realm active for four workspaces; no test key mutation. Vercel production build for `1bc3423` is READY; see `docs/evidence/DASHBOARD-REFERENCE-20261017/README.md`.

Manual pending: in an owner/admin workspace, open Developers → API Keys while Live is selected, choose Sandbox, create a real **Sandbox-only** key after password verification; validate one-time secret copy, prefix, expiry, authorized sandbox request, refresh/persistence, rotate and revoke. Confirm newly created Sandbox keys never appear under Live; user role viewer cannot read or write either. Test create-modal switch between active realms, suspended realm refusal, and automatic webhook secret isolation. Do not expose any secret in evidence. GitHub full CI and browser reference visual comparison remain open.


## 2026-10-17 — Shared drawer, sidebar, One-time Requests and Invoice release gates

**Source changes merged/pushed to main; NOT fully accepted.** Shared RefModal drawer CSS (padding, width, long values, body-only scroll, mobile safe-area), Billing pinned under separately scrollable sidebar, palette icon, reference-look One-time Requests toolbar/card/tabs and copy/cancel/detail actions, Create Request modal, invoice create-or-draft UI, automatic sequential invoice numbering, public hosted bilingual invoice, SMTP HTML+text invoice message and verified-only Paid status.

**Sandbox Neon checks PASS (rollback):** invoice-number replay returns same reference, second request increments counter; public draft shows sanitized data but no payment, issued date/status, canceled read-only status. New migrations 0078–0080 installed and checksummed in Live/Sandbox production financial databases; no live financial test writes. The invoice `fee_minor` is a merchant-entered additive fee, **not** processor pricing.

**Must still run before acceptance:** 320/768/1024/1440 side-by-side browser checks Light/Dark/System EN/BN; drawer focus trap/backdrop/Escape/focus restoration/long-ID copy; desktop and mobile sidebar scrolling and pinned Billing; both link/request tabs, create/cancel/copy/refresh/pagination and retained prior receipts; invoice Draft/Create & Issue, concurrent numbering, optional override, prefilled Edit, issued/correct/cancel, verified-paid and overdue statuses, checkout theme on Pay, SMTP HTML delivery/unknown delivery, and webhook status sync. Run Next lint, typecheck, full production build, Go compile/unit tests, contracts, and financial smoke. GitHub Foundation runner startup and Vercel build rate-limit currently prevent fresh PASS. Access to an interactive authenticated browser and a working CI/build runner is needed. Do not replace these results with source inspection.


### 2026-10-17 continued fixes: invoice delivery and request visual shell

Implemented and pushed:
- Invoice email test fixtures match canonical language-neutral invoice and Pay URLs; renderer reads saved Checkout Theme store name and validated asset URL; prints issue/due dates and recipient, maintains HTML+text, full Paid confirmation can be sent without offering a second Pay button.
- Hosted invoice displays stored PNG/JPEG/WebP base64 logo if present. Invoice Print now opens real hosted invoice page with print trigger rather than printing dashboard chrome.
- Invoice total breakdown and grouped invoice-hosted links have premium scoped CSS (custom disclosure control rather than browser-default triangle), mobile responsive.
- One-time Requests header now lives in same `ref-dashboard/ref-page` layout as Payment Links; toolbar, table and actions already migrated into one card.
- These changes do **not** alter payment verification, allocation or financial proof.

**Verification actually observed:** Render deployment `dep-db9hdvv2d8hs73d7c8hg` for commit `6497aa1` reached `live` after `go build` succeeded. Later CSS/request-layout commits have not been verified by Vercel production build due to plan-level `build-rate-limit`. GitHub Foundation CI workflow for latest source commit has no passing jobs. Production Live/Sandbox ledger `0078`–`0081` SHA-256 entries match each other. Production data at audit time: Live one issued invoice and one associated intent; zero verified invoice allocations; Sandbox zero verified invoice allocations. Actual Paid status end-to-end cannot be demonstrated with that data; do not claim it passed.

Manual pending as before: frontend build, lint, TypeScript checks, all Go unit tests, authenticated browser screenshot/focus/viewport checks, email delivery to an inbox, and a real provider-verified invoice transaction. No 100% acceptance.


### 2026-10-17 — Source-code completion pass, NOT final acceptance

**Fixed and pushed:** Billing paid-plan checkout uses `/checkout/{token}` (no obsolete language prefix); pure Node contract checker added to `payment:contract-check`; Invoice Save as Draft and Create/Issue both go through browser form validation; invoice-linked hosted capabilities paginate with cursor, Refresh/loading/errors, cancellation on workspace/realm switch and no premature empty state; hosted Invoice store name, From label and print image readiness; shared RefModal close accessibility labels (EN/BN) and reopen animation; Checkout Themes preview-only Step and placeholder accessibility copy.

**High-priority release pipeline fix:** official `backend/cmd/financial-migrate/dashboard_reference.go` now includes existing migrations 0078–0081 in both Live and Sandbox realm lists with SHA-256 ledger recheck, so new installations get invoice numbering, public Draft/Void metadata and verified receipts. The disposable `pg04-financial-smoke.mjs` setup installs the four additions after PG10 and `pg10-extension-smoke.mjs` now asserts sequential invoice reference, idempotency, private-notes redaction and Draft→Issued→Void public behavior. These **new test assertions have not executed** due runner provisioning failure.

**Actual rollback Neon Sandbox DB contract PASSES:** existing verified Sandbox allocation was connected to a temporary invoice inside a rollback subtransaction; its public projection reported paid_minor=5500, due_minor=0, exactly one verified receipt and no private_notes. Separately, an invalid combination of receipt/attempt was refused by immutable financial proof constraints. Control DB scheduled-Free downgrade preserved current paid entitlements, Undo cleared schedule, and forced expiry applied the scheduled Free plan, all rolled back with original state restored. **None** of this proves a production provider→browser transaction.

**Remaining verification:** Next lint/type-check/build (Vercel plan build-rate-limit), GitHub Actions runner start, interactive 320/768/1024/1440 browser and keyboard/focus regression, authenticated Sandbox API key lifecycle, SMS device evidence delivery, SMTP inbox acceptance, live paid verification and billing renewal/replay. No Docker used and no production payment/financial test writes.

## Admin trusted devices / plan audit — 2026-10-18

Owner requested code-level verification only for this pass and will verify physical devices.

- On an untrusted device, ordinary dashboard login must not grant Admin access; complete MFA once, then keep using the same valid session without periodic prompts.
- Trust a private device for 30 days; sign out/in and verify remembered access. Remove it from Settings and confirm linked sessions lose access. Clearing device storage or using another browser requires MFA again.
- After a role change or MFA recovery/reset, old trust and sessions must no longer authorize Admin operations.
- Production deploy/migrations and authenticated production API integration remain unverified. Isolated Neon/code checks are recorded in `docs/evidence/ADMIN-SECURITY-PLANS-20261018/README.md`.

### 2026-10-18 receiving account sharing/removal
- In EN/BN and light/dark, add a provider+number already in another workspace: red consent dialog, no other workspace identity disclosed; Cancel does not create; unchecked submit disabled; Help & security opens workspace help; checked submit creates once. Same-workspace duplicate remains blocked.
- Hover/focus an account: right-side delete icon appears; touch shows it without hover. Cancel preserves it; confirm removes active/disabled account, leaves historical payments, and re-add checks consent/plan again.
- Code/database checks are recorded in WORKSPACE-SAVE-DIAGNOSIS-20261018. Visual and physical-device checks are manual pending.

### 2026-10-18 mobile dashboard and system billing
- Admin Settings: select a payment-enabled workspace you manage, containing only active super admins. Save the selection; confirm ordinary Admin/support/analyst cannot change it.
- In the selected workspace, add system receiving numbers and connect the real SMS device. Purchase a plan from a different workspace; check the correct number, exact plan price, verified payment and one entitlement renewal. Do not use the system workspace as its own purchaser.
- At 320/375/390/768px EN/BN light/dark: mobile menu opens/closes; sidebar does not take page width; header controls fit; Billing stacks, its tables scroll internally; account delete/actions and dialogs fit. Desktop layout remains intact. Browser/physical verification is pending; source cascade and database/code checks are recorded in SYSTEM-BILLING-MOBILE-20261018.

- System workspace Settings regression: save a different eligible workspace; selection remains visible and Save becomes disabled. Reload/navigate away and back: saved workspace remains selected. A rejected change retains the last confirmed saved destination. Setup links and instructional paragraphs are absent.

### 2026-10-18 plan-aware Add/Create controls
- Use a non-system payment workspace with finite plan limits. Check Receiving accounts, SMS devices, API keys and Team usage, including owner + pending invitations. At the cap, Add/Create is disabled and View plans/Refresh work. Disable/disconnect/revoke/cancel a pending invitation and verify a slot returns. Unlimited and inactive plans must be distinguished.
- Reconnect a disconnected/expired-pairing phone while device quota is full; backend rejects. A pending pairing that expires releases capacity after refresh. Re-enable an account at capacity; backend rejects. Key rotation is slot-neutral and revocation remains usable.
- Team: reserve the last seat with an invitation, then accept it; one seat converts to a member. Resend an expired invitation when full; no extra seat can be reserved. Sandbox must not bypass shared team limits.
- One-time payment requests: monthly successful+reserved quota and active pending checkout cap show the appropriate message; per-minute errors advise retrying. Existing documents/history and cleanup remain usable. Check EN/BN, light/dark and mobile layout. Manual/browser checks remain pending; automated evidence is in DASHBOARD-PLAN-LIMITS-20261018.

### Plan feature UI — 2026-10-18
Owner manual pending: for a workspace plan with invoices/payment links/reports/exports disabled, check sidebar/search, overview shortcuts, one-time requests, direct list/detail URLs and upgrade CTA to Billing > Plans in EN/BN, mobile/desktop and light/dark. Code tests/build evidence: `docs/evidence/PLAN-FEATURE-UX-20261018/README.md`.

### System workspace unlimited — 2026-10-18
Manual pending: selected system workspace Billing shows all features/unlimited/no renewal; Usage and invoices remain accessible. Check EN/BN, light/dark, mobile/desktop. Automated switching/removal/expiry/no-subscription tests passed on isolated Neon. Evidence: `docs/evidence/SYSTEM-UNLIMITED-20261018/README.md`.

### System subscription cleanup — 2026-10-18
After Vercel build quota allows frontend rollout: verify workspace overview shows System workspace/Unlimited, subscription management is absent, and Usage opens in EN/BN without server error. Production subscription assignment already detached with audit retained; unlimited access active. Evidence: `docs/evidence/SYSTEM-SUBSCRIPTION-CLEANUP-20261018/README.md`.

### Buyer upgrade timing — 2026-10-18
Manual pending: with a non-system workspace on an active finite Starter term, choose a higher paid plan; compare Activate now (prorated / old expiry) and After current plan ends (full term price / future start and end). Verify payment, unchanged current access before the boundary, Paid schedule banner, and new plan after the boundary. Check EN/BN, light/dark and mobile. Do not test this on the unlimited system workspace. SQL/code checks: `docs/evidence/BUYER-UPGRADE-TIMING-20261018/README.md`.

## Google login + Resend auth email — 2026-10-19
- Add Google Cloud Web OAuth Client ID/Secret to Vercel production (details: evidence/GOOGLE-EMAIL-20261019). Google sign-in remains hidden until configured. Redeploy after setting.
- Test Google signup, existing linked login, cancellation, existing local-email collision, same-email Account linking within 10 minutes of fresh login, expired linking session, and admin MFA on an untrusted device. No real Google flow claimed passed.
- Production Server Action returned sent after Resend acceptance; check owner mailbox/Resend delivery log. Inbox delivery is not claimed. Mandatory verification is now enabled with audit; unverified accounts must use the code screen. Test resend/Enter code, wrong/expired/reused code rejection and recovery/session invalidation.

## New workspace first-load race — 2026-10-19
- Create a new Google/password account or payment-enabled workspace and immediately open Overview/Payments/Payment methods/SMS devices without refresh. Authorized empty data should load on the first request while provisioning runs on demand; no transient ACCESS_DENIED from an absent financial registry.
- Verify genuine plan-disabled pages still show existing upgrade UI, and suspended/wrong-workspace requests remain denied. Initialization outage must show unavailable/retry, never false zero data. Code + isolated SQL passed; no production synthetic account was created.

## 2026-10-19 — Plan labels and billing payment status
- Open Admin plan creation on mobile in EN/BN and light/dark: filled numeric fields retain labels; Free distinguishes quota cycle/access expiry and has no grace input; review shows actual Free duration and quota reset.
- Open the previously cancelled subscription invoice and check payment: show cancelled/unverified guidance inside its drawer, with no renewal and no raw VERIFIED_PLATFORM_PAYMENT_REQUIRED.
- Verify a real successful platform payment updates subscription once; pending/expired/cancelled payments never grant access. Physical phone/SMS verification belongs to owner.
- Automated checks and production read-only diagnosis: `docs/evidence/PLAN-LABELS-BILLING-STATUS-20261019/README.md`.

## 2026-10-19 — Canonical checkout URL and Official fallback
- New API-created payment links must use `https://ekmivo-web.vercel.app/checkout/<token>`, independently of the dashboard CORS alias.
- With no saved theme, verify the Official merchant/method/payer/waiting/result flow; selected custom themes remain selected.
- Changing checkout language keeps the public route locale-neutral; the webhook secret initially says it is hidden and reveals only after the authorized action.
- Regression checks/evidence: `docs/evidence/CHECKOUT-CANONICAL-DEFAULT-20261019/README.md`. Actual money transfer is not claimed by code checks.

## Android reference phases 1–2 (2026-10-19, PR #86)

- Phase 1: compare native dark/light setup and Inbox shell against `docs/design/android-20261019/` at the same inner viewport/font scale; native assemble/unit CI passed for Phase 1, visual parity remains unverified.
- Phase 2 preview: apply only additive 0114 control + 0115 financial via the guarded operator before testing this APK against that runtime. Production rollout has not been performed. Test physical camera and manual code, explicit Verify, loading/retry/rescan, expired/revoked/claimed code, network loss, process death and rotation. Verify lookup does not consume the code and the final explicit confirmation claims the displayed workspace/realm only.
- Full Phase 2 remains open: AI-only control-plane enrollment, capability-driven permissions/background work/navigation, real-phone reconnect/queue preservation. No AI-only enrollment or complete Inbox/channel integration accepted.


## Android reference phases 2–4 (2026-10-19) — manual pending

Use an approved Meta test app/account, configured Firebase project and a real API-26+ Android phone. After operator migration/runtime rollout: pair AI-only, change to Payment-only while screen remains open, grant newly required SMS permissions; change to both and both-off and verify UI within the two-second foreground refresh. Deny/revoke permissions, background/resume, rotate and kill process; encrypted pending receipt evidence must survive. Reconnect the same device without duplicate identity; revoke from web and verify signed requests fail. Check notification-only AI setup on Samsung.

Connect Messenger/Instagram professional/WhatsApp business accounts through OAuth; check callback actor mismatch/replay rejection, approved scopes, subscribed webhook delivery, duplicate webhook, known failed send retry versus uncertain timeout, and real sent/delivered/read events. Validate channel-specific messaging windows using provider accounts; no provider acceptance is inferred from SQL tests. Check data-only FCM delivery/background/deep link after revocation/workspace change, no other tenant message disclosure. Compare every phase 2–4 state against reference at 320/360dp in EN/BN, Light/Dark/System, large fonts and keyboard. These checks have NOT been run. Later media/forward/profile/reaction phases remain unimplemented.

### Android reference phases 5–6 (2026-10-20, manual pending)

Use an authorized configured Meta test account, private storage/scanner, and a paired Android device. Check 1/2/3/4/5+/10 images, eleventh-image refusal, gallery cancellation/removal/rotation, real camera, viewer swipes/pinch; deny/regrant mic, <1s voice rejection, recording interruption/background discard and single-player lifecycle; actual Meta image/audio/document bytes and reported status (Instagram capability restrictions); retry after transport loss without duplicate sends, partial album retry, closed-window forward denial, sender/source/target workspace isolation, reaction removal and provider rejection, actual event info. Verify profile verdict thresholds/unknown versus actual 0%, totals beyond three visible orders, contact omission/raw-number copy, complete note save/clear/relaunch/conflict/error, EN/BN and light/dark at 320dp/font scale. No production/provider/screenshot acceptance implied by CI.

### Android reference Phase 7 release (2026-10-20)

Automated emulator coverage and release identity live in `docs/evidence/ANDROID-REFERENCE-PHASE7/README.md` / PR #86. Distinguish those from pending real-device/provider acceptance: install over an existing production-signed release without uninstalling or clearing queued receipts; verify pairing/workspace lookup against the deployed compatible API, product changes in foreground, denial/regrant flows, Samsung screen-off/reboot and offline receipt ACK recovery, real camera/mic interruptions, Meta media/status/reactions, FCM, EN/BN/light/dark full reference parity and accessibility. Storage/scanner/Meta/Firebase configuration and control/finance migrations/runtime rollout are separate operator gates and were not executed by APK generation.

## Briofold Phase 7 — Customers (2026-10-21, PR #132) — manual pending

Code and automated acceptance evidence: `docs/evidence/BRIOFOLD-PHASE7-20261021.md`. Production rollout is separate: apply control migration 0140 before the compatible API; financial realms are unchanged. No Phase 7 production deployment has been performed.

With an authorized operator SMTP account and HTTPS CRM_PUBLIC_ORIGIN, request a customer-consented email confirmation, receive the actual message, confirm the fragment is removed, and verify expiry/single use/contact-change rejection. With an approved WhatsApp test account, verify actual signed inbound sender proof and cross-business/account isolation; fictional signed webhook tests are not provider proof. No unsolicited customer message is authorized by this checklist.

With owner/admin/editor/viewer test memberships, review Customers, Leads and Follow-ups at 320/768/1024/desktop in EN/BN and Light/Dark/System, keyboard and large text; verify contact masking, stale business tabs, dirty navigation, offline/retry recovery, merged history/export, dispute suppression and confirmed CRM erasure. Confirm retained financial/channel records are explained. Follow-ups are internal reminders; outbound campaigns belong to a later phase. These manual/provider checks remain pending and do not block the explicitly scoped code-and-automated-acceptance seal.

## Briofold Phase 8 — commerce (2026-10-21) — operator/manual pending

Source/evidence: `docs/evidence/BRIOFOLD-PHASE8-20261021.md`. Production rollout requires additive control migration 0141 before the compatible API. No Phase 8 production migration has been performed.

Use an authorized test business and provider accounts: configure the existing private object store and malware scanner; upload/reorder/view ten product photos, refuse the eleventh/invalid or unscanned file; revoke membership and verify private image access fails. Configure that business's Steadfast credentials, explicitly book one test parcel, verify its stable invoice/consignment, timeout reconciliation and real status/handover/label. Verify physical Code 39 scanner and packing labels. Other courier manual workflows must be labeled merchant-recorded, never API-verified. No unsolicited booking/message is authorized by this ledger.

Connect an authorized WooCommerce test store with read-only credentials; review paginated simple/variable SKU diffs, grouped variants, stale edits, unsupported types/batch limits and explicit apply. Compare actual variant attributes/prices and preserve stock. Verify real source-owned payment/invoice/refund links and partial payments; COD receipts must not become gateway verification, and return inspection must not move money. Customer notifications/campaign delivery remain separate from internal team status notifications.

Review populated Orders/Products/Inventory/Coupons/Delivery/Returns in EN/BN, Light/Dark/System and 320/768/1440 widths, keyboard/large fonts, offline uncertain-response reload, business switch drafts, viewer recipient masking, role revocation, multi-warehouse transfers, packing, damaged returns and exchange links. Automated fixtures are fictional; no live provider or financial acceptance is inferred from them.

## Briofold Phase 3 / Phase 10 owner clarification (2026-10-22)

- **Phase 1 CSS isolation was waived:** do not request separate dashboard/marketing CSS testing as a release gate. A future homepage-to-dashboard visual migration is a different task; present approved Admin styling remains independently protected.
- Accounts have **one user-facing Store**. Verify Store setup/resume and that new/primary-bound users see no workspace switch/create control. Old financial `workspace_id` and rare legacy multi-membership handling are compatibility infrastructure, not an invitation to create several user-facing Stores.
- Phase 3 code-level shell/Settings verification is recorded separately; your real visual, keyboard, phone and provider tests are deliberately outside that seal.
- Phase 10 editorial drafts and internal bookings (migration `0180`, flag `BRIOFOLD_GROWTH_OPERATIONS_ENABLED` initially OFF): inspect created broadcast and post drafts, future editorial plan, update conflict, disabled customer sending, booked resource and overlapping-slot refusal, cancel/rebook and role boundaries. Test at 320/768/1440 in both languages and themes. A planned draft **must never be represented as an actual scheduled provider send**. Existing CRM marketing preferences or verified email identity are NOT provider-specific consent; real opt-in, suppression, provider policies, dispatch and uncertain-delivery review remain separate implementation/provider gates.
- Phase 10 aggregate operations (migration `0181`, flag `BRIOFOLD_GROWTH_ANALYTICS_ENABLED` initially OFF): check draft/planned campaign totals, internal booking statuses, Inbox assigned/pending/overdue and seven-day customer/human/AI reply counts. Owner/admin download metrics CSV; editor/viewer denied; no names/contact information or verified finance amounts may occur in CSV. A missing function must show unavailable rather than a fictitious zero.


### Briofold Phase 10 — Pathao courier provider check

After owner-approved integration and an authorized test account only: configure the merchant-issued Pathao client credentials, verify pickup Store and city/zone/area, book one explicitly approved test parcel with whole-taka COD, compare consignment and merchant reference in Pathao, check status, then record actual handover and later COD settlement separately. Verify normal customer/provider notifications with authorized recipients. Do not retry an unknown booking; reconcile the existing merchant reference first. BRIOFOLD_PATHAO_ENABLED is OFF by default. Automated fictional transport checks are code evidence, not this provider result; this entry is manual pending and no production action is authorized by it.


### Briofold Phase 10 — WooCommerce signed catalog source

After owner-approved integration only: connect an owned WooCommerce store using read-only consumer credentials, set its currency to BDT, configure WOO_WEBHOOK_PUBLIC_ORIGIN and the gated source, and create WooCommerce product webhooks using the displayed URL/secret. An unsigned activation ping checks reachability only. Confirm one real signed product notice appears, preview refetches the current simple/variable product, and reviewed Apply alone changes the catalog. Check stale API changes, unpublished/deleted products, signature tamper, source disable, credential/origin replacement and duplicate delivery handling. Never infer customer/payment authority from a product hook. This combined owner checklist item is manual pending; mock transport and local callback checks are code evidence only.
