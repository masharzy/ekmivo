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
- [ ] Record reviewed SHA, isolated migration run, River rescue and 3/3 CI, production migration/operator decision; **do not** treat PG04 as permission to issue real payment receipts, payment intents or claims of provider settlement.
- **Automated gates:** CI PostgreSQL 17 three-DB setup, migration replay, RLS, immutable/dedup/monetary guards, River InsertTx rollback and 12-way replay, real SIGKILL/restart recovery, Go/Next/Android regression.
- **Status:** SOURCE IMPLEMENTATION UNDER CI; mark **IMPLEMENTED — MANUAL PENDING** only after latest full tests pass. Production release remains separate PG17.


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
