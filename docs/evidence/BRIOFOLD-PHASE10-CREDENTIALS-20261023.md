# Phase 10 credential lifecycle continuation — 2026-10-23

Scope: Briofold Phase 10, stacked on the active `agents/phase10-growth-release` work. This is not the later full Workspace-to-Store migration. Signup/name collection and old route removal are deliberately deferred by the owner until Phase 10 is complete.

## Corrections

- Merchant key server actions revalidate the actual locale-prefixed canonical `/settings/api-keys` page as well as its historical adapter. A completed create/rotate/revoke must refresh the current inventory without a manual page reload.
- All three mutations recheck an installed authoritative primary Store binding inside the write transaction. A historical membership does not authorize a stale form targeting a different Store. Legacy databases without that additive binding table retain the existing membership authorization.
- Live key issuance handles a database lacking the optional platform-receiver function by denying the implicit platform exemption and checking the actual subscription. It does not invent an active entitlement or disable the plan check.

## New acceptance

`apps/web/scripts/briofold-key-lifecycle-acceptance.mjs` runs after the Phase 9 financial/browser fixture in the existing disposable Foundation workflow. It uses a fictional test password, restores the prior hash in `finally`, and never logs raw credentials. Coverage: wrong-password creation denial; owner Sandbox creation through the canonical UI and real server action; hash-only persisted credential; immediate inventory refresh; reload secret privacy; rotation with predecessor resolver invalidation and preserved expiry/scopes; successor revocation; private viewer inventory; exact append-only audit actions. These are automated source tests until their exact pushed commit's Foundation CI passes. No provider delivery or production acceptance is implied.

## Status

**NOT SEALED.** Full 56-row parity, missing growth integrations and other unresolved implementation remain governed by `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv`. Do not count this change as full API-key row parity before interactive domain-lock coverage and exact-head CI are verified. No PR merge, production migration, flag activation, external send or deployment is authorized.

The follow-up expands the browser test with direct viewer replay of the actual Next action payload (authorization must hold independently of hidden UI), a historical-owner stale form after primary Store rebinding, and actual Live key create/revoke under the preceding fixture's purchased entitlement. The test installs the exact binding table DDL from the canonical foundation only when absent in the older disposable fixture, and removes only that fixture-owned table/binding in `finally`; it does not claim full subscription migration acceptance. Production Next build also passes locally. This expanded acceptance still needs its own exact-head CI.

Base Phase 10 run 39895385777 and credential run 39896102758 both failed before reaching the new key journey at the immediate `isEnabled()` export assertion. The next test uses Playwright actionability waiting on the actual export click; independent CSV ledger comparisons remain unchanged, and a permanently disabled control will still fail. This is a proposed timing correction until a new CI pass proves it.

The key-capacity source also requires CONTROL 0096/0101 and financial 0068/0093. The new key journey applies those exact canonical migrations only to disposable CI realms, using the preexisting realm-specific migration owner for financial SQL. It runs after all earlier browser/financial fixtures so the migrations' stricter new-checkout and invitation admission rules do not invalidate those earlier historical fixtures. No dummy reader or bypass of the real Go capacity/entitlement checks is introduced. This fixture correction is pending a new full CI; the failed runs are not seals.

Run 39897459949 on 0f59b5a9 passed the actual payment CSV owner/viewer privacy test and the merchant statement preview/import/association/viewer-denial test. It then completed 192 responsive route cases and failed only at the outdated total assertion (`192 !== 176`), before the key journey. The route inventory is now explicitly asserted as 12 routes and 192 cases (2 locales × 2 themes × 4 widths × 12 routes), with an accurate dynamic route count in the PASS log. All per-case HTTP, theme, width, overflow and error checks are preserved.

Credential acceptance now runs after the Phase 9 semantic writes and before the long read-only responsive matrix. This keeps the quota migration boundary intact and reports credential failures earlier. Its outcomes and the corrected complete run still require fresh CI. No full parity or production acceptance is claimed.

## CRM implementation continuation

Additive CONTROL migrations 0191/0192 implement source/stage/priority/assignee filtering before stable pagination, role-safe contact/assignment projections, offer reminders, terminal skip, original requested time and IANA-timezone quiet windows. The Go reader and canonical leads/follow-up UI use these functions. Existing financial relationships and applied migrations remain unchanged.

`briofold-crm-parity-acceptance.mjs` exercises pagination beyond 50 matching records hidden behind newer nonmatches; combined filters; tenant/realm/role privacy; filtered CSV; real Go/Next scheduling and reload; skip; revision and idempotency; daytime/overnight and both DST transitions; 32 responsive locale/theme cases. It runs in the existing disposable acceptance database. TypeScript, ESLint, JavaScript syntax and diff checks pass locally. Database/browser results are still unsealed until CI executes this source.

Run 39899417676 failed waiting for the Live key revoke drawer after earlier mutations. Success handling now keys off stable secret/key IDs, refreshes the router inventory once, and the acceptance opens the exact active UUID row. This is an application lifecycle correction awaiting fresh full CI, not a weakened assertion.

## Independent row reconciliation and Inbox gaps

Payment report CSV and reconciliation each emitted their own successful acceptance marker in run 39899417676 (web job 120237270849), before a later credential failure. Their two tracker rows now record that evidence explicitly. This reduces unresolved entries from 35 to 33; it does not turn the failed whole run green.

Additive CONTROL migration 0193 extends the existing authorized Inbox page function with exact labels, inclusive UTC last-activity dates and Open/Pending/Waiting queues before pagination. The UI exposes those filters plus arrow/Home/End conversation navigation. Existing takeover, assignment, notes, tickets, permission checks, drafts and sends are preserved. Acceptance adds UTC boundaries, malformed/reversed date denial and real browser filter/keyboard checks.

Website chat now explains actual visitor/message limits; isolated acceptance exhausts the real public admission rate and maximum visitor capacity and asserts rejected admission creates no extra visitor. This supplements the existing allowed-origin, private history, expiry, disabled-site, signed HTTP and browser checks. These new Inbox/website assertions await CI; neither row is prematurely sealed.

A Neon isolated branch was attempted for additional migration verification, but the connected project rejected creation with `branches limit exceeded`. No existing branch was removed or modified. This is not Neon migration acceptance.

Run 39901921426 on 2e804e03 passed build/lint/TypeScript, Go, Kotlin and image checks. Database acceptance passed CRM SQL pagination, privacy, DST quiet-hour calculations and durable skip/idempotency, then exposed a real proxy gap: Next forwarded `source` but dropped `priority`/`assignee`, making the viewer assignment-filter request return 200 instead of the expected 403. The proxy allowlist now forwards both keys with the existing duplicate-parameter rejection. No authorization assertion was relaxed. Full acceptance must be rerun.

Additive CONTROL migration 0194 and the report panel implement rolling-seven-day first successful human/AI response metrics, five-minute response counts, channel breakdown and owner/admin-only current assignment workloads. Failed/queued replies are excluded; empty latency is null rather than a fabricated zero; current assignees are not described as historical responders. SQL and real SSR/browser acceptance covers fixed source arithmetic, tenant/realm and granular permission denial, viewer privacy and 16 responsive cases. This increment remains unsealed until CI executes it.


### Continuation: exact 6e4da967 CI evidence

Foundation 39933823360 / web job 120348358457 passed lint, TypeScript, production build, all schema installation, saved reply sequences and native tutorial playback. Accounting advances to 32/56, 24 unresolved. This is not an overall seal: integrated web job failed screenshot browser retrieval, group optimistic-concurrency HTTP status, interest stage label, and a missing explicit realm in a viewer test. The continuation fixes the actual screenshot URL and maps workspace concurrency/limit errors through the existing structured workflow mapper; it preserves all permission assertions.

0201 preserves the current Inbox date/label reader and excludes queued/failed responses from clearing waiting customers. Overview adds successful human/AI reply counts, both-product embedding, and effective Inbox/product-deny checks. New SQL/browser assertions are pending exact-head CI. No merge, deployment, production migration, live send or production flag activation.


### Per-channel policy and billing continuation (not sealed)

Additive CONTROL 0202 adds private, optimistic, idempotent per-channel response modes, SLA, optional takeover return default, and bounded review/product suggestion guidance. Human-only and policy edits invalidate queued/running generation; successful claims bind a policy revision and private guidance to the actual provider prompt; the existing knowledge/publication/access/credit/dispatch guards remain. A lease-bound pre-provider check is used only for contexts from the new claim wrapper, preserving compatibility with the previous schema. New route /settings/channels/{id} and details links are behind BRIOFOLD_CHANNEL_POLICIES_ENABLED (OFF by default; only isolated fixtures enable it). Guidance is reactive, not a scheduled marketing or verified-purchase claim.

Added independent actual SQL/Go/Next/browser channel-policy and canonical-wallet suites. Credential lifecycle now runs independently of the broad finance browser suite so a separate UI failure cannot conceal credential evidence. Wallet readers enforce current product:ai deny. The old overview source contract was corrected to require successful outbound state/sequence instead of the obsolete latest-sender heuristic. Local TypeScript, targeted ESLint, Go checkout/authz/API tests and SQL/PLpgSQL parsing passed. Integrated database/browser outcomes are still pending; count stays 32/56. No production action.


### Courier credentials, linked-order reporting and CI installation

Added the canonical courier credential screen using the existing encrypted integration source, owner/admin writes and safe metadata reader. It never calls a live provider during credential save; stored and verified remain distinct states. No browser credential storage or plaintext echo. Added ciphertext round-trip and UI/role/realm tests.

0203 adds actual linked-order conversion cohorts (7/30/90 days), explicit customer/order relations across merged identities, per-source/current-assignee breakdown, safe paginated CSV and current role/product/privacy checks. A Won stage without an order is not a conversion; draft/hold/cancelled/returned orders do not qualify. No causal attribution or verified revenue. SQL/API/browser fixtures cover all exclusions, dedup, merged profiles, masked member names and spreadsheet formulas. Local TypeScript, targeted lint, Go tests and SQL syntax passed; integrated verification pending.

The prior CI spent more than eight minutes in browser installation before application fixtures. Use the pinned headless Chromium shell supported by the installed Playwright CLI and https://playwright.dev/docs/browsers, bound the installation step, and save the version-keyed binary cache immediately after successful install so later application failures do not discard it. Existing browser assertions and database guards remain. Accounting remains 32/56; no seal.


### Photo/text retrieval continuation (pending integrated verification)

0204 adds private indexed catalog-photo signatures, bounded transient PNG/JPEG query decoding, text narrowing, conservative visual-similarity matches with unknown abstention, one result per product and source-SHA validation. It is explicitly a local structure/color similarity aid; it does not claim semantic identity or production accuracy. New uploads index opportunistically after existing scan/storage/save; an unavailable index is reported separately without discarding a valid saved upload. Existing stored photos can be indexed through the actual authenticated private object reader.

Owner/admin labelled evaluations record expected-product rank/top-five hit privately per account, without retaining query images or customer text; retries cannot duplicate the test. Added colour/resize/JPEG/unknown fixtures, real SQL boundaries and browser workflows. The isolated verification starts a loopback TLS object fixture that verifies actual SigV4 signatures; Go trusts its generated test CA normally, with no TLS bypass. Original malware-scanner fail-closed tests remain unchanged. Also wired the conversion API flag explicitly in the isolated Go fixture (the Next fixture already enabled its corresponding renderer). All production flags remain unchanged.

Local Go checkout/authz/API tests, TypeScript, targeted ESLint and SQL/PLpgSQL syntax pass. Full database/browser outcomes pending; accounting stays 32/56.


### Exact 2c030cf4 evidence: 37/56 accounted, 19 unresolved

Foundation 39968660063 / web job 120465720237 passed the complete new wallet browser journey, overview/waiting privacy/metrics through Workflow, feedback screenshots, groups and interest. Those five tracker rows are now Implemented+Tested. Existing Inbox, studio, saved sequences, video playback, signed website/comments, CRM, response reports, commerce, assignment and growth suites still pass. Courier credential configuration also passed, but its tracker row remains partial because the requested Pathao adapter is missing; the UI accurately says unavailable.

Overall web job stays red on four independent suites: a channel textarea's implicit label, the missing conversion flag in the Go fixture, duplicate financial Activity headings, and ambiguous key row click. The continuation adds explicit textarea labels, enables only the isolated Go conversion fixture, fixes heading ownership, and gives each key name a semantic details button that its lifecycle test uses. Permissions, password checks, one-time secrets and lifecycle assertions remain. No source/build-only feature closure or production action.


### c5bdb164 independent verification and media continuation

Foundation 39973112138 web job 120480667986 now passes conversion, product photos, all finance UI/source checks and the complete canonical key lifecycle. Five tracker rows advance, bringing accounting to 42/56. The sole failing suite is channel-policy browser takeover: a deep link opens the tools by default and the test toggled them closed. Only click its summary when closed; retain the real takeover/auto-return/privacy assertions.

Inbox attachments had download but no native audio player. Added scoped, lazy, accessible audio controls with no autoplay; object URL teardown and existing retry/download remain. The fixture now holds a synthetic 1.5-second Ogg Opus tone behind TLS/SigV4 private storage; queued original/forwarded media reads must return exact bytes, wrong realm must fail before storage access, and actual Chromium must decode/play it. Go tests verify outbound image/audio/file capability scope, expiry and HMAC realm binding without source keys or credentials leaking; unsupported Instagram documents remain denied. Notification embedding now owns one h1 and independent h2 sections; added actual server-action handover/SLA/AI filters, actor-specific reads and 51-row pagination checks. These additions await exact-head integrated CI; media and notification tracker rows remain unresolved. No provider/live delivery claimed.


### 45/56 evidence and post-onboarding setup implementation

Exact source 5cf9b36e / Foundation 39976319680 / web 120491736011 passes both channel settings and signed private Ogg/browser playback, closing three rows. Only the new notification filter assertion fails because it resolved the pre-filter list before the debounced server action completed. Wait for the selected kind, preserving all privacy, mark-read and pagination assertions.

Added a post-onboarding setup guide at /setup/checklist with actual live Store-only business, enabled channel, active product variant, encrypted courier-configuration presence and optional team metadata. Current role, disabled actor/Store and granular workspace settings restrictions are checked in the source query; no secrets, member identities or contacts are returned. Browser permissions remain an explicit per-device review; provider verification and financial receipts are never inferred from saved configuration. Links go to the real settings/catalog/dashboard; signup defaults stay unchanged. Added AI/Payments/Both, foreign/sandbox, revoked role/settings and 36 responsive cases to the isolated acceptance runner. Integrated result is still outstanding; setup stays partial.
