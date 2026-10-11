# Ekmivo — consolidated manual verification register

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
- **Remaining:** End-to-end authenticated **production HTTP** authorization/cross-tenant negative scenarios need trusted client/session flow. Keep acceptance open until verification agent signs off.

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

## PG04 — Financial source of truth and job durability

- [ ] Inspect authorized read-only records from sandbox: attempts/evidence/allocations refer to exact tenant and environment; append-only audit immutable; no arbitrary "mark paid".
- [ ] Execute safe duplicate and concurrent sandbox requests; only one idempotent result, replay same event stable; crash/restart worker with no lost durable job.
- **Automated required:** empty/prior schema migrations, FK/unique/money constraints, DB atomicity, rollback, partition env and crash recovery.
- **Status:** PENDING.

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
- [ ] Verify the **latest PG02 SHA** is deployed in Vercel before judging production UI. The attempted Vercel build on 2026-10-11 failed at quota validation **HTTP 402 / `api-deployments-free-per-day`** (over 100 per 24-hour window). This is a hosting-rate blocker, not a claim that the latest web source is running. Do not silently test the older `356575bb` deployment as the current implementation.
