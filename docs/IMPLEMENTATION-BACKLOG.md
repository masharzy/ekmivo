# Implementation backlog and release evidence

Baseline: [বাংলা master plan](./DUAL-SAAS-MVP-PLAN.bn.md), revision 6, 2026-10-11; payment-first execution correction; this is the canonical plan the agent follows. User decisions: all features in the first public MVP; automatic phone payment verification; Ink & Bone Option F minimal public landing, readable shared UI, full-page Light/Dark/System and complete EN/BN switcher. No customer TrxID submission or routine merchant payment approval. Scope authority: [MVP-FEATURE-SCOPE.md](./MVP-FEATURE-SCOPE.md). Design authority: [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md). Status: partial web/auth/dashboard source foundation; current deployment parity unverified. Financial engine/API/worker/bridge/sandbox not implemented; latest evidence in IMPLEMENTATION-STATUS.md. Single implementation owner: Codex. Product/provider owner: user.

Design specification completed: guide, [semantic tokens](./design/tokens.css) and [contrast report](./design/CONTRAST-REPORT.md). These are planning assets, not proof of working theme/localization in an application. Implement D01/D02 after the F01 scaffold and before feature-page styling.

### Current implementation checkpoint — 2026-10-11

Latest source-based status: [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md); previous research checkpoints remain history.

- Monorepo/public web/auth foundation source exists. Go API exposes health only; worker exits jobs-not-implemented. Financial schema/API/auto-matcher/providers/device bridge/sandbox are not implemented.
- Local separate AI/payment shell, icon groups/routes/tabs/empty states are partial D01/D02/S03/S46; not deployed by this checkpoint and not working financial modules.
- Existing self-hosted scrypt sessions, memberships, OTP/recovery/admin source replaces the earlier proposed Clerk choice. Migration source exists; live application/database/security behavior is not revalidated by this planning task.
- Prior local TypeScript/production build passed; whole lint has three existing effect failures; current CI effectiveness remains to be established. See source evidence report instead of old contradictory deployment statements.
- Website foundation was previously deployed; current local dashboard/backend parity is unverified. No full-MVP or live payment completion claim.
- Current task completes the payment-first architecture/UX/API/sandbox/serial-plan specification. PG00 implementation started; see docs/evidence/PG00/README.md. All acceptance gates remain open.

Priority: P0 = required for the full first public release. Previously deferred features are now P0. A Spike resolves feasibility for a required feature; it does not remove that feature from launch. Every completed item must link its change, relevant checks, and staging/provider/device evidence. A green mock test does not count as a live provider test. The previous 8–12 week estimate and small-pilot budget are superseded; full-scope estimates require access checks and measured progress.

## G0 — Resolve external contracts early

| ID | Priority | Deliverable | Dependency | Acceptance |
|---|---|---|---|---|
| G0-1 | P0 | Merchant/customer workflow map and physical-goods sample catalog | User samples | A-only, B-only, combined scenarios documented |
| G0-2 | P0 | Gateway account and integration agreement check | User/provider | Sandbox credentials, merchant ownership mapping, refund/query semantics and allowed SaaS integration known |
| G0-3 | P0 | Meta app/access matrix and review preparation | User Meta account | Required scopes, privacy/deletion URLs, reviewer demo plan; no unnecessary permissions |
| G0-4 | P0 | Obtain capability/account docs for Steadfast, Pathao, RedX, eCourier | User/providers | Each provider's booking, status, webhook auth, quotas, returns/COD and unknown-outcome behavior recorded |
| G0-5 | P0 | Hosting quote and operational owner | Budget/account input | Backup/PITR, pgvector, region, worker support, alerts and monthly estimate validated |
| G0-6 | P0 Spike | Android receipt capture and matching feasibility | Consented real devices/sample messages | Reboot/offline/missing fields/permission loss, payer binding, privacy and distribution measured; feeds required X08 |
| G0-7 | P0 | All connector/modality/store capability matrix | User/provider accounts | WhatsApp/Instagram, Stars, stores/Daraz, voice, app stores and extension access validated; unsupported capability remains blocked, not silently deferred |

G0-2 blocks provider-verified payment claims; G0-3/G0-7 block the relevant public integrations; G0-6 blocks phone-bridge release. Local fake-provider development may proceed labelled sandbox. Full public launch requires every feature inventory gate, even if a partial internal alpha works.

## P0 work packages

| ID | Work package | Depends on | Acceptance evidence |
|---|---|---|---|
| F01 | Monorepo web/backend/mobile/extension, pinned toolchains, Docker local services, CI | Baseline | Reproducible clean builds, native signing secrets protected, no committed secret |
| D01 | Semantic design tokens, typography, components and responsive shell | F01 | Guide-matching Ink & Bone light/dark palette, Bengali glyphs, keyboard states, desktop/mobile layouts; sample data labelled |
| D02 | Theme and EN/BN infrastructure, switchers and translation catalog | D01 | Four theme-locale combinations, persistence/system changes, SSR without flash, preserved routes/forms, complete keys and locale-safe amounts/time |
| F02 | PostgreSQL migrations and tenant schema | F01 | Up migrations work on empty and prior schema; composite FK tests |
| F03 | Existing identity hardening, Go session/member/capability validation, admin MFA boundary | F02 | Expired/revoked identity, removed member and unauthorized role tests |
| F04 | RLS and tenant-scoped repositories/jobs | F03 | Three-tenant negative tests through runtime DB roles |
| F05 | Entitlements, configuration switches and workspace UI | F04,D02 | A-only/B-only/both/off checked server-side, queued work rechecks permissions; localized shell and theme tokens |
| F06 | Durable ingress, River queues, outbox and observability | F04 | Commit/rollback/crash tests; correlation IDs without PII |
| C01 | Catalog variants and CSV preview/import | F05 | Invalid row errors, idempotent retry, immutable SKU ownership |
| C02 | Orders, price snapshot, stock reservations | C01,F06 | Concurrent last-item orders, cancellation/expiry release, no negative available stock |
| P01 | Payment request API and checkout | F05,F06; C02 only for order-linked flow | Expected sender number, receiving account/method, amount and time window recorded; no customer TrxID field; standalone and order-linked requests |
| P02 | Automatic receipt verification, additional provider callbacks and reconciliation | P01,F06 | Unique sender/time/amount/account/method match auto-verifies; duplicate/wrong-sender/out-of-window/collision tests; gateway adapter access isolated to X07 |
| P03 | Partial advance, COD due, verified/exception UI | P02 | Successful phone verification automatically allocates and confirms; method visible; no routine merchant approval |
| P04 | Merchant API keys and signed outbound webhooks | P02 | Key revoke/rotate; HMAC timestamp; retry/replay; SSRF and idempotency tests |
| C03 | Courier booking/status and receipts | C02,P03,G0-4 | Ready-to-ship guard, timeout lookup, duplicate prevention, real consignment evidence |
| A01 | Web chat, contacts, inbox, human replies | F05,F06 | Reconnect/refetch, workspace scoping, delivery status and rate limits |
| A02 | Messenger adapter and onboarding | A01,G0-3 | Signed ingress, message identity dedup, echo handling, permissions/reconnect, non-role live user test |
| A03 | Knowledge ingestion and retrieval | C01,A01 | Tenant/version filters; malicious upload/prompt cases; Banglish retrieval samples |
| A04 | AI provider adapter and bounded tools | A03,C02,P01 | Budget/time/tool limits; server-derived price; confirmed-order flow |
| A05 | Handover, practice/live/off, versioned configuration | A04 | Mid-generation takeover cancels send; disputes require explicit release |
| A06 | AI evaluation harness | A04,A05 | ≥150 cases; recorded quality/cost results; release thresholds from master plan |
| B01 | Prepaid service-credit ledger and usage reservations | F06,P02,A04 | Concurrent balance checks; retry settles once; adjustment by compensating entry |
| B02 | B subscription invoices and entitlement lifecycle | F05,P02; B01 only for combined AI-credit billing | Verified renewal only; expiry/grace; in-flight payment and shipment complete |
| T01 | Basic Telegram physical-goods adapter | P04,C02 | Webhook secret validation, scoped token, physical order/payment flow; no digital-goods bypass |
| O01 | Admin exceptions, support audit and replay tools | P03,C03,A05 | Least privilege, reason/expiry, all actions audited |
| O02 | Data export/deletion and retention | O01 | Only requested tenant exported/deleted; required financial retention and backup expiry explained |
| O03 | Backups, restore and incident runbooks | F06,G0-5 | Timed restore in isolated environment; keys available; reconciliation after restore |
| O04 | Full-flow/failure/load/security/design checks | D02,P04,C03,A06,B02,T01,O03,X01–X14 | All S01–S46 and evidence matrix complete, theme/locale/accessibility checks, actual modality/connector workloads, no release-blocking issue |
| L01 | Public pages, pricing, onboarding help | F05,B02 | Claims match shipped capabilities; keyboard/mobile/contrast checks |
| L02 | Controlled paid cohort and launch review | O04,L01 | 7–14 day pilot log, real transactions, usage economics, owner release decision |

## Expanded P0 packages — same public release

These packages implement the prior P1 list and remaining reference capabilities. Package order is an implementation dependency order, not separate product release scope.

| ID | Work package | Depends on | Acceptance evidence |
|---|---|---|---|
| X01 | Official WhatsApp, Instagram, Facebook/Instagram comments and per-channel policy/rendering | A02,G0-3,G0-7 | Approved external accounts, supported cards/private replies/templates, consent and opt-out; no unauthorized post-window sends |
| X02 | Image recognition, voice notes, web voice calls, rich product UI | A04,G0-7 | Held-out Bengali/image evals, ambiguity confirmation, interrupt/reconnect tests, cost caps, actual client audio |
| X03 | PDF/Word/URL knowledge, natural-language Agent Desk, moderator assistant, unanswered questions | A03,A05 | Safe ingestion/SSRF tests; draft diff/test/publish/undo; no autonomous live policy edits |
| X04 | Full inbox/CRM, snooze, lead pipeline, campaigns/follow-up, tickets, persistent alerts, ratings/reviews | A01,A05,X01 | Timer/state correctness, native takeover where supported, suppression/consent, audience-bound offers, human issue resolution |
| X05 | Multiwarehouse, richer order states/returns/exchanges/refunds, coupons, picking/QR/bulk operations | C02,C03,P03 | Stock/transfer concurrency, invoice totals, authorization, partial batch failures, recorded financial reversals |
| X06 | All four couriers and WooCommerce/Shopify/Sheets/Excel/CSV/Daraz connectors | C01,C03,G0-4,G0-7 | Each capability documented; live sync/booking, conflict/dedup/retry/return/settlement; authorized Daraz access or explicit blocker |
| X07 | Named payment methods/gateways: direct merchant APIs where available, SSLCOMMERZ/AamarPay, bank import | P02,P04,G0-2 | Per-provider live validation/refund/query evidence; no unrelated personal TrxID lookup assumption; credentials isolated |
| X08 | Android receipt bridge, parser registry, device health and automatic verification | P01,G0-6,F06; P02/P03 for final matching acceptance | Real device/receipt tests; actual payer number/time/amount/account match; no TrxID submission, opt-in acceptance step or routine manual approval; offline/replay/collision checks and automatic confirmation/webhook |
| X09 | Agency/multi-brand permissions, consolidated credits, client budgets, pricing/trials/volume rules | F05,B01,B02 | Atomic credit ownership/charging, tenant access constraints, trial abuse and plan transition tests |
| X10 | Calendar/resource booking and Telegram digital subscriptions/Stars | T01,P03,X04,G0-7 | No slot oversell, advance/cancel/reminder flow, Stars success/refund/paysupport and membership expiry |
| X11 | Analytics, customer/courier history, return-risk assistance and reporting | X04,X05,X06 | Reconciled metric definitions, permitted data, measured predictive quality or visible data blocker; no fabricated risk score |
| X12 | Full Android/iOS merchant apps and PWA | A05,P03,X04,X05,X08,G0-7 | Device/OS matrix, push/inbox/order/payment/QR, secure tokens/deep links, offline sync, real distribution route |
| X13 | Chrome extension next to business inbox | A05,X03,G0-7 | Scoped auth and minimal permissions, takeover/assistant; native interface changes fail visibly |
| X14 | Text/voice feature requests, progress status, expanded public/help/migration surfaces | L01,X02 | Feedback lifecycle, protected attachments, status history and truthful feature docs |

## Contracts to define before endpoint implementation

All API paths below are proposed contracts, not deployed endpoints. OpenAPI is the schema source; generated TypeScript client must be checked for compatibility in CI.

| Contract | Required behavior |
|---|---|
| `POST /v1/orders` | Scoped key/session; server-calculated totals; idempotency key; confirmed customer intent |
| `POST /v1/payment-intents` | Amount in minor units, currency, expected sender number, receiving account/method, creation/expiry window; no customer TrxID required; no PII in return URLs |
| `GET /v1/payment-intents/{id}` | Authorized merchant or opaque checkout capability; status and verification method |
| `POST /webhooks/payments/{connection}` | Provider-native authentication/validation, durable dedup and fast acknowledgement |
| `POST /webhooks/channels/{connection}` | Native provider signature/secret and account-to-workspace mapping |
| `POST /v1/conversations/{id}/takeover` | Atomic ownership/version transition, queued reply cancellation |
| `POST /v1/conversations/{id}/release` | Authorized explicit release with audit |
| `POST /v1/shipments` | Approved + ready order, COD amount computed from allocations, unknown outcome tracked |
| `GET /v1/events` | Authenticated workspace-scoped SSE; safe reconnect/resume/refetch |
| `POST /v1/device-events` | Production-target device bridge; signed evidence, scoped enrollment, dedup; never trusts caller-supplied tenant or verified status |
| `PATCH /v1/payment-settings` | Scoped settings for receiving accounts/methods, payment expiry and timestamp handling; valid unique phone match auto-verifies without an extra acceptance opt-in |

Error envelope: stable code, safe human message, correlation ID; never SQL/provider secret/raw stack. Cursor pagination for message/payment/order lists. API version and webhook event version explicit.

## Financial and event invariants

1. A receipt is deduplicated by provider, receiving account and automatically extracted transaction ID/event identity across device/API sources. Allocations cannot exceed its verified amount; verification method remains explicit. A later provider check enriches the same receipt rather than posting another payment.
2. An order can receive several allocations, but one incoming payment is not silently reused across unrelated orders. MVP split-payment edge cases go to review.
3. Ledger transaction postings balance in one currency; corrections are reversals/adjustments, not overwritten history. Service credits are separate from merchant payment records.
4. A usage reservation is created atomically against available credit. Settlement/release is idempotent. Cost overflow has a defined platform-loss/stop policy; never hidden overdraft.
5. Webhook receipt, domain mutation and follow-up job are transactionally linked where applicable. External effects remain at-least-once with dedup/reconciliation.
6. Cancellation does not erase evidence of money received; refund lifecycle is separately tracked and human-authorized.
7. A provider-unknown outcome remains unknown until query/reconciliation resolves it. Timeouts are not equivalent to failure.
8. Module disable prevents new actions but does not discard already accepted financial events or erase historical records.
9. A unique valid receipt match automatically sets `verification_status=verified` with `verification_method=sms_match` or `notification_match`, records payment allocation and enqueues confirmation/webhook atomically. No gateway confirmation or routine merchant approval is required for this path.
10. Match the actual payer number, transaction time, amount, receiving account and method to the pending request. Customer TrxID input is neither requested nor required. Missing/masked required fields or multiple candidates remain pending/exception instead of selecting an arbitrary order.
11. Preserve receipt transaction time separately from device receive/server ingest times. Offline replay cannot make an old transaction eligible for a newer payment request. Each receipt can be consumed once even under concurrent verification.

## Release evidence matrix

| Scenario | Required assertion |
|---|---|
| A-only workspace | Answers FAQ/catalog, takes lead, handover works; B tool rejected |
| B-only workspace | Login without Meta, order/payment/courier works, no LLM call |
| A+B workspace | Chat → customer confirmation → order → verified advance → ready → courier → status |
| Duplicate inbound/payment event | One business mutation/charge/allocation; observable dedup |
| Spoofed browser success | Payment remains unpaid unless server/provider verification succeeds |
| Same-amount payments / reused TrxID | No amount-only match or cross-order reuse |
| Wrong tenant or provider account | Access denied, no data leak or mutation |
| Partial/overpay/expired/reversed | Correct due/review/refund state and audit |
| Worker killed after external call | Query/dedup/manual review resolves unknown outcome; no blind duplicate booking |
| Provider callback lost | Scheduled query reconciles final status |
| Two buyers, last SKU | Only one reservation accepted |
| AI generating during takeover | Generated reply discarded before dispatch |
| Prompt injection or false payment claim | No privileged action, price change or paid status |
| AI credit exhausted | AI stops; inbox human flow and B remain operational |
| B subscription expires mid-payment | New order creation policy applied; prior callback/reconciliation completes |
| Provider outage and timeout | User sees pending/retry state; budgets respected; alert delivered |
| Database restore | Measured recovery; replay safe; financial gap reconciled |
| Customer export/deletion | Correct tenant only, all registered stores covered |
| Phone bridge offline/reboot | Evidence sync health visible; no false success |
| Automatic phone verification | Actual sender number + transaction time + amount + receiving account/method match one request: auto-verified, allocated and confirmed with webhook; no customer TrxID or routine manual approval |
| Same sender/amount and overlapping requests | Multiple candidates cannot be arbitrarily selected; pending/exception; one receipt never confirms two requests |
| Receipt source fields | SMS sender label is not payer number; contact number is not silently payer number; normalized actual sender and transaction timestamp are required |
| Device/API report the same payment | One receipt/allocation; method upgraded without duplicate credit |
| All channels and rich media | Actual approved-account image/audio/card/voice flows; per-channel policy and budget gates |
| Store/courier sync and multiwarehouse | All declared connectors work; no duplicate order/stock movement; unknown outcomes resolved |
| Booking/Stars | No concurrent slot allocation; digital payment, refund/support and membership lifecycle pass |
| Android/iOS/extension | Real device/client tests; minimum permissions; secure takeover/session isolation |
| Agency/campaign/support/reporting | Workspace boundaries, shared-credit correctness, suppression rules and reporting reconciliation |
| Theme and language | Light/EN, Light/BN, Dark/EN, Dark/BN; System mode tracks OS; preference persists; no lost drafts or recreated payment requests |
| Design/readability | All required features reachable; correct tokens, Bengali glyphs, translation keys, numbers/time, focus/keyboard/mobile/zoom states; no decorative template clutter |
| Outbound messaging window closed | Message blocked or approved allowed template used |

## Build sequence — payment-first execution authority

Latest user sequence, 2026-10-11: Phase 1 fully running payment product including sandbox/testing/developer/API docs; Phase 2 full Android app + inbox; Phase 3 remaining full dual-service MVP. PG/AN/FM items refine the older F/P/C/A/X package inventory; they do not create a competing architecture or remove any S-ID.

All items below **proposed/open** at this design checkpoint. Existing source is credited in [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). Next item **PG00**. Agent reads [handoff](AGENT-HANDOFF.md) and records evidence under docs/evidence/<ID>/README.md. Do not mark dependencies accepted merely because a route builds.

### Phase 1 — Complete payment gateway

| Order / ID | Deliverable | Depends on | Existing packages / scope | Acceptance |
|---|---|---|---|---|
| 00 / PG00 | Reconcile source/status; clean reproducible builds, toolchain, local PostgreSQL/services, effective CI and secret checks | Baseline | F01, S45 | Whole lint/build/Go compile pass; active CI confirmed; DB/service local startup reproducible; preserve existing changes and applied migrations |
| 01 / PG01 | Existing auth hardening, Go session/member/capability boundary, admin MFA, workspace/env schema and RLS | PG00 | F02,F03,F04, S02,S04,S45 | Revoked/disabled/member removed; three-tenant runtime-role tests; missing context/connection rollback; cross-env denial, admin boundary |
| 02 / PG02 | Complete D01/D02, separate product/business/environment switching, shell/components/translation | PG01 | D01,D02,F05, S03,S05,S46 | UX control placement; authorized deep links/last page; four locale-theme views, OS/cross-tab sync, mobile/keyboard/no lost drafts |
| 03 / PG03 | Contract-first payment API skeleton; sandbox/live isolation; scoped hashed keys/rotation; onboarding | PG02 | P04,F05, S05,S34,S45 | OpenAPI security/enums/errors; same routes with separate sandbox credentials/DB/queues; wrong key/env blocked; once-visible secret |
| 04 / PG04 | Financial schema, immutable attempts/evidence/payments/allocations; idempotency, River/outbox/durable ingress | PG03 | F02,F06,P02, S31,S32,S34 | Empty/prior migration tests; FK/unique/amount invariants, atomic commit/rollback/job enqueue, crash recovery |
| 05 / PG05 | Standalone/linked payment-intent API, public checkout, payer+route lock, expiry/resume/cancel | PG04 | P01,P03, S32,S33,S34 | No catalog prerequisite standalone; exact amount/window; actual payer; no TrxID/screenshot/approval; spoofed return fails; overlapping attempt conflict |
| 06 / PG06 | Minimal signed native Kotlin receipt collector in the main Android app, parser registry, device enrollment/source binding/health/offline | PG05,G0-6 | X08, S31 | Real consented samples/devices; SMS/notification capture route and full payer/time available; Keystore/signature fixtures, dual-SIM/revoke/reboot/offline; no OTP/unrelated SMS |
| 07 / PG07 | Automatic matching/payment confirmation and allocation/reconciliation reason engine | PG06 | P02,P03,X08, S32 | Five-field unique match auto-verifies atomically; concurrent workers/dedup/masked sender/time boundary/late/cancel/amount/direction tests; exact advance |
| 08 / PG08 | Signed webhooks, safe endpoints, retry/query/replay/rotation, receipt notice and merchant E2E | PG07 | P04,F06, S34,S45 | Durable event+job; consumer valid raw-body HMAC + event dedup; wrong signature/env/replay/order/SSRF tests; failed webhook doesn't undo paid |
| 09 / PG09 | Functional Payments/Requests/Incoming/detail/event/device/account dashboard pages | PG08 | D01,P03,O01, S03,S31,S32,S45,S46 | Real queries/actions, verification comparison/provenance, independent timestamps, role masking, all UI states; no manual mark-paid |
| 10 / PG10 | Payment links/custom fields, invoices/customers/import-export and public receipt | PG09 | P01,P03,O02, S30,S32,S34,S41 | Per-visitor intents, server totals/issued snapshot, due/advance; contact not payer; immutable paid status; private uploads/import/CSV export; real share/print flow |
| 11 / PG11 | Refund authorization/execution and unknown-outcome recovery; exception/statement/settlement reconciliation | PG10 | P03,O01,O02,X07, S28,S32,S33,S45 | Refund cap/races/native or independently evidenced assisted route; no fake completion; source reprocess without ignoring matching rules; history retained |
| 12 / PG12 | Required native payment adapters and payment-only store/custom bot integrations | PG11,G0-2 | X07,P04,payment subset X06/T01, S33,S34,S38 | Per-provider permitted account capability matrix; native sandbox/live callback/query/refund where supported; phone core does not depend on these credentials; payment-only integration smoke evidence |
| 13 / PG13 | Reports/payment-service subscription, team/grants/settings/notifications/help/legal/status/pricing | PG12 | B02,O01,O02,L01, payment/shared S01,S04,S05,S40,S41,S44,S45,S46 | Reconciled metrics, real authorized saves/invites/support, verified renewal/expiry accepted events continue; distinct merchant/SaaS funds; truthful public claims |
| 14 / PG14 | Complete bilingual developer hub, generated API docs, quickstart/SDK examples/sandbox scenario harness | PG13 | P04,O04,L01, S34,S45,S46 | Clean-account quickstart executed; TS/Go/PHP/Python webhook examples checked; full schemas/generated client drift/conformance; named sandbox cases and clean reset |
| 15 / PG15 | Full failure/security/load/design suite; staging/API-worker hosting/monitoring; backups/restore/rollback runbooks | PG14,G0-5 | O03, payment subset O04, S45,S46 | System targets measured, real DB race/crash tests, four UI combinations, timed restore/keys/reconciliation, active alerts and healthy API/worker readiness |
| 16 / PG16 | Real-device/provider controlled paid cohort and release evidence | PG15,G0-6,G0-2 | Payment subset L02, S31–S34,S45 | bKash/Nagad/Rocket evidence/source matrix, required adapter evidence; 7–14 day log; true auto-confirm+signed consumer webhook, duplicates once, documented exceptions/operator response |
| 17 / PG17 | Payment-service production release review and verified deployment | PG16 | Payment phase gate | All phase-1 items accepted, no money/auth/tenant release blocker, docs live match API, production smoke/rollback/support status; released capabilities listed, no full dual-MVP claim |

Early G0-2/G0-5/G0-6 preparation proceeds when input exists; live-account actions still belong to account owner. No artificial dependency of phone matching on official gateway credentials. If a serial item has an external blocked part, record it and advance only dependency-independent subwork; retain release gate as open.

**Phase 1 completion means a usable payment product**, not just a dashboard or sandbox demo. Full warehouse/inventory/courier/AI work is not prerequisite for standalone intents. Linked commerce functionality not yet implemented must remain explicit, not fabricated. A payment chip/order reference is not proof of a running OMS.

### Phase 2 — Full Android app with inbox management

| ID | Deliverable | Depends on | Packages / scope | Acceptance |
|---|---|---|---|---|
| AN01 | Go conversation/message/contact/assignment APIs, website chat and approved Messenger transport, notifications | PG17,G0-3 | A01,A02,F06, S06,S10,S12,S13 | Real inbound/outbound, dedup/echo/delivery, session/tenant/search, messaging policy/reconnect, external user test |
| AN02 | Full human web inbox, assignment/notes/tags/saved replies/snooze/resolve/tickets and ownership boundary | AN01 | A05 boundary,X04 subset, S12,S13,S21,S25 | Takeover/queued send race, drafts/status/search/history, explicit release, snooze timers and live updates |
| AN03 | Full Kotlin + Jetpack Compose Android app shell/payment operations, secure mobile auth, integrated receipt collector, push/deep links | AN02 | X12, S31,S42,S46 | Same financial backend, product switch/tab UX, permission/role/token revoke, no offline success/secret leakage |
| AN04 | Android inbox management and offline sync parity | AN03 | X12,X04, S12,S13,S21,S25,S42 | Human reply/assignment/notes/snooze/ticket history, queued send cancellation, reconnect window checks, duplicate send prevention |
| AN05 | Android release/device validation and operational docs | AN04,G0-7 | X12,O04 subset | Real OS/OEM/network/reboot/keyboard/theme/locale/push tests, signed build/distribution, no native receipt collector evidence regression |

Phase 2 delivers human inbox and connected channel foundation. Full AI/campaign/media/other channel features remain required in phase 3; do not claim these from an inbox shell. The native receipt collector built in the same Kotlin app during PG06 is reused; there is no React Native bridge or separate receipt app.

### Phase 3 — Remaining full-MVP inventory

| ID | Sequential group | Dependencies / evidence |
|---|---|---|
| FM01 | Full commerce/catalog/variants/warehouse/stock/order/coupons/packing/QR/returns, all four couriers, store/file sync | C01,C02,C03,X05,X06 and G0-4/G0-7; inventory races, real permitted courier/store/settlement evidence |
| FM02 | Remaining official channels/comments/WhatsApp/Instagram/Telegram, AI knowledge/Agent Desk/assistant/handover, image/voice/web calls | A03–A06,X01–X03,T01; provider review, held-out quality/cost and adversarial/native-policy tests |
| FM03 | Full CRM/leads/campaigns/follow-up/tickets/reviews, booking/Stars, agency/credits/billing, reporting/risk/feedback | X04,X09–X11,X14,B01,B02; timer/consent/money/slot/agency correctness and permitted data |
| FM04 | iOS/PWA/Chrome extension and remaining client capabilities | X12,X13; secure distribution, actual device/extension tests; iOS management not Android receipt capture |
| FM05 | Full S01–S46 coverage audit, all-theme/locale/accessibility/security/recovery/device/channel/load/economics checks, full cohort and dual-MVP release | All remaining packages including O04,L01,L02; no silently omitted item, real evidence or explicit user scope decision |

FM groups are serial work bundles; split into bounded endpoint/screen/provider tasks before coding. Scope matrix in [MVP-FEATURE-SCOPE.md](MVP-FEATURE-SCOPE.md) identifies phase overlap; shared/partial scope is not accepted until full row passes.

### Required evidence per item

Store docs/evidence/<ID>/README.md: item/S-IDs; change/commit; environments; commands/results; real DB/API assertions; redacted screenshots; simulation/provider-sandbox/device/live transaction labels; remaining external inputs; next step. Update [status](IMPLEMENTATION-STATUS.md) and this backlog. Never include connection strings, receipt PII, API secrets or pairing tokens.

Phase-1 money gate: zero false verified/duplicate allocation in defined negative/race tests; merchant webhook consumer deduplicates; real unique receipt confirms without customer TrxID or routine approval; no pending provider timeout mislabeled failed/succeeded. Documentation quickstart, restore and production smoke must be executed, not just written.

A dedicated vector database, Redis, Kubernetes, custom ML service or service extraction requires documented bottleneck and operational owner. No fixed elapsed completion date from unmeasured agent estimates.

## Decision record index to create during implementation

- ADR-001: Go modular monolith, deployable API/critical worker/AI worker.
- ADR-002: Shared-schema tenancy, RLS, role/connection boundaries.
- ADR-003: Automatic phone verification by time/sender/amount/account, no customer TrxID, deduplication and separate additional gateway adapters.
- ADR-004: Order/payment/fulfilment/settlement state separation.
- ADR-005: Transactional jobs, inbound dedup, outbound unknown outcomes.
- ADR-006: Shared catalog and A/B entitlements.
- ADR-007: LLM provider/data policy, evaluation and billing units.
- ADR-008: Managed infrastructure, recovery objectives and operator responsibilities.
- ADR-009: Full feature launch inventory, provider capability blockers and revised estimates.
- ADR-010: Native apps, Android bridge, extension and channel-specific capability boundaries.
- ADR-011: Shared minimal design tokens, personal theme preference and complete EN/BN localization.
- ADR-012: Existing identity hardening, Go session/mobile boundaries and control-plane versus financial DB projections.
- ADR-013: Payment-first delivery, sandbox/live isolation, minimal bridge before full Android app, API/event compatibility.

These are planned records, not links to files that already exist.

## Current work evidence — product separation and references, 2026-10-11

Scope: D01/D02, S03/S46 UI foundation; research for payment/phone verification contracts. No financial engine, external provider or first-release feature is marked complete by this checkpoint.

- Read-only signed-in AiPraktor audit retained under `docs/research`; ZiniPay merchant navigation/forms inspected and recorded in `ZINIPAY-DASHBOARD-REFERENCE.md`. Inspection does not prove provider actions work.
- PipraPay core source pinned to `021ecd302a0dc3316383933ef3aa405be9271404`; diagnosis and SHA-256 source manifest recorded. Upstream PHP/installer/plugins were not executed or vendored. TrxID-dependent checkout, missing five-field request matching, concurrency and webhook-state findings inform our independent Go implementation.
- Local changes: separate product routes and overview content, server-side entitlement/section guards, authorized legacy redirects, grouped bilingual icon navigation, searchable sidebar, product/business selectors, theme/locale controls and native mobile drawer. Module-specific tabs and table schemas are UI scaffolding; backend/domain actions remain open, including team/settings views.
- Scope inventory is unchanged. All routes still require real data, authorized mutations, error/loading/detail states and acceptance evidence. No mock rows or financial success are presented as live data. No deployment claimed.
- Verification results and browser limitations are recorded in `research/DASHBOARD-FOUNDATION-CHECKPOINT.md`; D01/D02 remain in progress pending full rendered and accessibility checks.

### Paymently browser research, 2026-10-11

[Paymently audit](research/PAYMENTLY-BROWSER-AUDIT.bn.md): all 13 enabled internal main-menu destinations, profile, settings/report subpages and key forms inspected; 75 redacted snapshots, 37 merchant paths plus 2 linked documentation paths. Theme preview restored to System. No financial/provider/device action submitted and no product feature marked complete. Reference helps D01/D02, S03/S46 operational UI; five-field auto-verification remains unchanged. Account is empty/Free, so actual transaction, paid-plan and provider behaviour remain unverified. No implementation/deployment changes made for this audit.

### Payment-first system/UX planning checkpoint — 2026-10-11

Planning scope: phase-1 payment delivery design, S03/S31–S34/S42/S45/S46 and full inventory traceability. Added payment architecture, every-menu UX, API/sandbox/developer-doc specification, source-based status and agent handoff; synchronized master/scope/design/backlog/AGENTS/README. No product implementation/deploy in this checkpoint.

Validation: local Markdown links resolve, code fences paired, authoritative inventory retains all 46 S-IDs, PG00–PG17 sequence ordered and present; tracked diff whitespace clean. Architecture references official PostgreSQL/River/Android/Play/Render/SSLCOMMERZ docs; account-specific provider capability still needs real evidence. Existing frontend changes preserved. Next execution PG00.


### PG00 accepted CI checkpoint and native-client architecture, 2026-10-11

PG00 foundation evidence accepted in [PG00 evidence](evidence/PG00/README.md) via GitHub Actions run 38114530626 (web lint/build/typecheck, isolated PostgreSQL 17 two-migration transaction smoke, Go tests/compile). This does **not** accept Go payment readiness or downstream payment items. One Kotlin/Compose Android app is selected; PG06 receipt collection is integrated as its native module, then AN03–AN05 build the full payment/inbox application. Kotlin foundation source is preparation, not accepted PG06/AN03 real-device evidence.


### Native Kotlin source preparation
Owner selected native Kotlin + Compose (ADR-0001). A runnable app source foundation is being prepared under `apps/mobile` ahead of PG06/AN03; this is an early native toolchain/design dependency check, **not** an acceptance bypass for PG01–PG05. Recording runnable source or an assembled APK must not be mistaken for a real receipt bridge, live merchant payment, inbox or full AN03 phase gate. See `docs/evidence/AN03/README.md`.

### Native compile checkpoint
Kotlin/Compose debug assemble and unit tests succeeded in [Actions run 38115451816](https://github.com/masharzy/ekmivo/actions/runs/38115451816) (artifact 11693123111). It is **not** PG06/AN03 acceptance or real-device smoothness evidence; dependencies remain in the serial PG schedule.


### PG06 source safety check (not accepted)
An opt-in native intake security foundation now exists in `apps/mobile/.../receipt` with non-authoritative evidence field validation and Android Keystore P-256 request signing; Go `internal/deviceevidence` supplies signature/timestamp verification. Neither structural completeness nor a device signature proves a payment. Real Android permission, enrollment/binding, approved parser samples, Go server ingestion, offline recovery, receipt matching and live-device tests remain mandatory in PG06/PG07/PG16. See [PG06 evidence](evidence/PG06/README.md).

### CI evidence for receipt security source
Tests passed for Android receipt completeness and Kotlin/Go P-256 canonical request verification helpers in [run 38115889313](https://github.com/masharzy/ekmivo/actions/runs/38115889313). These protect future device ingress but do not deliver PG06/PG07; the sequential money/security release gates remain open.

### PG01 implementation checkpoint — source/DB tested; acceptance OPEN

PG00 accepted. PG01 scope F02/F03/F04, S02/S04/S45: Go opaque session/member/role checks, platform TOTP MFA and additive workspace/environment FORCE RLS were coded and reviewed. [GitHub Actions run 38117671893](https://github.com/masharzy/ekmivo/actions/runs/38117671893) passed Go/web/isolated PostgreSQL/Kotlin CI. Production Neon `0003`/ `0004` additive schema applied; restricted SQL-created `ekmivo_financial_runtime` role verified, default Neon API role rejected as elevated. **PG01 not accepted** pending real owner TOTP enrollment/confirmation and production Go runtime role query smoke/deployment. No PG02 work started. See [PG01 evidence](evidence/PG01/README.md); PG06 Kotlin signer/field validation remains partial, not real receipt collection.

### PG01 Render runtime evidence (acceptance still open)
Real Render service `ekmivo-go-api` deployed Singapore commit `16fd3351`; startup read-only PostgreSQL probe passed for least-privileged role and missing-context FORCE RLS against production Neon. Real owner TOTP enrollment confirmed (1 active MFA session). Production API `/readyz` remains unready for money workflows, and remaining production authenticated access/MFA revocation negative scenarios still require evidence. No serial advance to PG02; see `docs/evidence/PG01/README.md`.

### Independent PG01 HTTP audit — acceptance OPEN

Dedicated production HTTP fixture tests and browser reproduction steps are recorded in [PG01 evidence](evidence/PG01/README.md). Missing actual write/proxy/recovery/revocation paths remain required coverage; do not interpret read-only capability checks or fixture updates as complete acceptance. Inspect production-http-results.json for current test outcomes before advancing to PG02.
Concurrent update: the remote repository now contains PG02 UI work (observed during this audit and preserved). This does not change PG01's open acceptance status. The final verification run reports 34 passing assertions and 3 NOT_IMPLEMENTED coverage items; supported revocation/recovery lifecycle remains incomplete. See PG01 evidence for exact boundaries.

### Owner directive — per-PG UI acceptance contract (2026-10-11)
PG02 implementation was **explicitly authorized concurrently** while another agent verifies the final PG01 gates. Neither PG01 nor PG02 can be accepted based only on passing a code build, and **PG03 cannot begin until preceding acceptance evidence is closed**. Each PG's UI must first map applicable named screens/controls to `PRODUCT-UX-SPEC.bn.md`. Complete specified **real bound data, actual authorized actions, loading/error/retry/empty/success/forbidden states, EN/BN translations, Light/Dark/System, responsive mobile/drawer, keyboard, draft preservation and scoped URLs**. Do not relabel routes, sample cards, unconnected provider tiles or generated API endpoints as implemented screens. See `docs/evidence/PG02/README.md`.

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
