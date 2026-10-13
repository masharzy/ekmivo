# First-release feature inventory

> **Owner correction — 2026-10-13:** Paired SMS devices forward provider receipts without SIM selector or physical receiver-number mapping. Actual backend checkout verification is unique immutable-attempt provider/full sender/amount/original transaction time matching (receiving-account display selection does not block success). Expired/cancelled attempts with late receipts create seller-managed refund requests, never automatic money transfer. Mobile encrypted history/retry and optional restricted user-initiated SMS recovery. Account/device quotas currently not enforced while plans OFF; this is not permanent "unlimited" licensing. Supersedes older receiver-required scope.


> Latest owner correction — 2026-10-12: PG10–PG17 implementation is authorized now; combined release verification follows after source completion. Refund requests carry customer/contact/payment information to the seller. The seller returns money outside the platform; there is no automatic native refund execution. Seller-reported returned remains distinct from independently verified completion. Default bKash/Nagad/Rocket phone verification requires no additional official provider API or gateway approval. Additional receiving/source connections are merchant-configured; SMS sender/app identity is distinct from the actual payer number. Optional native API connections require their own real contract and merchant credentials, and are not prerequisites for the default phone path. Older conflicting refund/native-adapter requirements below are superseded by this correction. No feature or live acceptance is inferred from this note.

Revision 5, 2026-10-11. Latest build order: payment gateway first, then full Android app/inbox, then remaining full dual-service MVP. User decisions: **সব feature MVP-তে থাকবে। Payment verification হবে automatic: time + sender number + amount + receiving account/method; customer TrxID submission বা routine merchant approval নয়। Minimal design, light/dark mode এবং EN/BN switcher-ও required।** Status: full capability inventory; foundation source is partially implemented. No financial feature is accepted as live. See [actual progress](IMPLEMENTATION-STATUS.md).

Agent main plan: [DUAL-SAAS-MVP-PLAN.bn.md](./DUAL-SAAS-MVP-PLAN.bn.md)। Design authority: [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)।

This inventory covers user-facing capabilities described in the four supplied references, plus features deferred by the earlier plan. Every row is required for the first full public release. Internal milestones and private tests may cover subsets; they are not completion of the requested MVP. A blocked integration stays on the launch checklist until resolved or the user explicitly changes scope.

“All features” is not a promise of unsupported provider APIs, unlimited custom development, zero AI error, guaranteed cost savings, zero account restrictions, or identical native UI across channels. Alternative implementation technologies in the references do not all need to be installed. Go/PostgreSQL remains the selected core.

Sources: supplied competitor analysis (MD), dual-service architecture (PDF), marketing transcript (TXT), platform explanation (HTML); previous master-plan deferred list. Details and verified policy references remain in the [master plan](./DUAL-SAAS-MVP-PLAN.bn.md).

| ID | Capability and reference | Required acceptance | Backlog |
|---|---|---|---|
| S01 | Public site, separate service/pricing pages, demo, signup, help/FAQ, support widget, privacy/terms/deletion/status; MD/HTML/PDF | Claims match actual services; sample demo labelled; accessible/mobile flow | L01 |
| S02 | Public / merchant / platform-admin surfaces; HTML/PDF | Separate permissions; tenant users cannot access cross-tenant admin | F03,F05,O01 |
| S03 | A-only, B-only, combined, service switching; PDF and user correction 2026-10-11 | Separate AI and payment dashboards, grouped icon navigation and clear bilingual labels; modern product switch keeps the business, business switch keeps the enabled product; both work independently; disabling one preserves data and in-flight financial work | D02,F05,B02 |
| S04 | Multi-brand/workspace/agency, invitations, per-page/assigned-chat roles, shared agency credit with per-client limits; MD/PDF | Cross-client isolation and atomic usage allocation; auditable agency access | F04,X09 |
| S05 | Self-serve/resumable onboarding, connection status, practice/live/off, trial and migration tools; all references | Resume without duplicate import; actual external-account tests; no instant-approval promise | F05,A02,L01,X06 |
| S06 | Messenger; MD/TXT/HTML | Inbound/outbound text/media/cards, permitted receipt/status messaging, reconnect, human takeover | A02,A05 |
| S07 | Instagram DM and comments; MD/TXT/PDF | Approved external account; comments→private reply according to provider rules; capability fallbacks | X01 |
| S08 | Official WhatsApp, managed ready-bot and own-system integration; MD/PDF/HTML | Official onboarding, native supported messages/templates, consent/opt-out, coexistence only where supported | X01,P04 |
| S09 | Facebook comments/product context/private replies, reminder and spam moderation; MD/TXT | Correct post/catalog association, policy window check, reversible/audited moderation where possible | X01 |
| S10 | Website widget, product cards, attachments, live human chat, branding; MD/TXT | Origin/tenant isolation, mobile UI, rate limits, actual send/delivery | A01,X02 |
| S11 | Telegram managed ready bot and merchant-owned bot, physical and digital sales/channel subscriptions; HTML/MD | Safe bot-token ownership, physical checkout flow, digital Stars payment/refund/support/access lifecycle | T01,X10 |
| S12 | Unified inbox/search by customer/phone/order/content, unread/assigned/needs-attention, resolve/reopen/snooze; MD/TXT/PDF | Correct search scoping, scheduled resurfacing, actual live updates | A01,X04 |
| S13 | Customer timeline: text/image descriptions/transcripts, notes/tags, orders, booking, ticket, handover history; MD/TXT | Complete paginated history/export; no unverified cross-channel identity merging | A01,X04,O02 |
| S14 | Natural Bangla/English/Banglish, configurable tone, short-message batching, reply context, seen/typing; MD/TXT | Language/context evals; channel capability-aware rendering; respectful neutral address by default | A04,A06,X02 |
| S15 | Image/screenshot recognition: SKU/OCR, near-duplicate and visual similarity, ambiguity choices; MD/TXT/PDF | Tenant-only retrieval, held-out product/image tests, no invented exact match | X02,A06 |
| S16 | Voice-note understanding, transcription, voice order fields; MD/TXT/PDF | Bengali/noisy-audio evals, correction/confirmation before order write | X02,A06 |
| S17 | Website realtime voice conversation with the same agent; MD/TXT | Permission, turn interruption, reconnect, handover, bounded duration/cost, transcript retention | X02,A06 |
| S18 | Product cards/carousels/buttons, extra photos/video-guide links, related items, product detail page and buy form; MD/TXT | Channel-supported rendering, server prices, confirmed order reflected in chat | C01,A04,X02 |
| S19 | Text/MD/CSV/Q&A knowledge plus PDF/Word/URL ingestion from identified gap list; MD/PDF | Safe parsing/fetching, version/source tracking, tenant retrieval and update/delete propagation | A03,X03 |
| S20 | Agent Desk natural-language changes, preview/test/publish/undo, unanswered-question queue; MD/TXT | Validated draft only until merchant publishes; change diff/rollback; human-authored answers retained | A05,X03 |
| S21 | Human takeover/release, configurable timer, native-inbox takeover shortcut where detectable, persistent alerts, per-chat/global off; MD/TXT | Race-safe stop; no automatic dispute release; unsupported native shortcut cannot be claimed | A05,X04 |
| S22 | Moderator assistant: summary, history questions, reply draft, extract lead; MD/TXT | Uses permitted records only; human sends draft; separate metering | X03,A06 |
| S23 | Leads, six-stage pipeline, hot/warm/cold, call schedule/outcome, lost-sale reason; MD/TXT | Timezone-correct reminders and stage history, editable AI classification | X04 |
| S24 | Smart follow-up, abandoned interest, broadcasts, offer audience/expiry, opt-out; MD/TXT/PDF | Send-time consent/window/template checks; no duplicate campaign; audience-bound discounts | X04,X01 |
| S25 | Support tickets, complaint/return/refund escalation, ownership/status/age, spam controls; MD/TXT | Human ownership, explicit resolution, audit and notification; no unauthorized refund | X04,C02 |
| S26 | Catalog variants/sizes/colors/charts, pricing, availability, stock count, CSV/Excel import and images; MD/TXT/PDF | Import preview/errors, exact price snapshots, actual variant selection | C01,X06 |
| S27 | Stock reservation, warehouse locations/transfers, release/return inspection; PDF/earlier deferred list | Atomic stock invariant across locations and orders; no duplicate movement | C02,X05 |
| S28 | Manual/chat/API/store orders, draft editing, approval/hold/packing/shipment/delivery, cancel/return/damage/exchange/refund; MD/TXT/PDF | State transitions and permissions enforced; payment/fulfilment separate; no silent financial mutation | C02,P03,X05 |
| S29 | Coupons: fixed/percent/free delivery, eligible audience and deadline, advance-payment rules; TXT/PDF | Same server calculation in chat/checkout/invoice; redemption concurrency and expiry tests | X05,P03 |
| S30 | Customer receipt/order page, QR invoice, picking list, packing scan, handover sheet, batch updates; MD/TXT/PDF | Private order links, correct line totals, scan permissions, safe partial batch failures | C03,X05 |
| S31 | Android SMS/notification bridge, bKash/Nagad/Rocket receipt parsers, device health/offline recovery; HTML/PDF | Real consented samples/devices; parser versions, dedup, source-account binding, no OTP collection | G0-6,X08 |
| S32 | Automatic payment verification, incoming/pending split view, partial advance/COD/refund/reconciliation; HTML and user's explicit correction | Exact time + sender number + amount + receiving account/method match automatically verifies/confirms; no customer TrxID or routine merchant approval; dedup and exception handling | P02,P03,X08 |
| S33 | Official merchant/gateway adapters, hosted checkout: bKash/Nagad/Rocket options, SSLCOMMERZ/AamarPay, bank evidence/import; PDF/HTML | Per-provider access/capability agreement; API-backed versus device/manual proof explicit; no invented personal-account lookup | G0-2,X07 |
| S34 | Developer payment API, merchant website/own bot integration, signed webhook/replay, SDK examples; HTML and latest user request | Isolated sandbox/live, executable bilingual quickstart, generated API reference, tested SDK/signature examples, idempotency/scoped key rotation/replay/status verification | P04,T01,PG03,PG08,PG14 |
| S35 | Steadfast, Pathao, RedX, eCourier booking/status/bulk/returns/COD reconciliation; MD/PDF | Each has documented capability and real account smoke test; no blind retry | G0-4,C03,X06 |
| S36 | Delivery updates, ratings and post-delivery review requests; MD/TXT/PDF | Accurate provider status, consent/window enforcement, no duplicate notification or fabricated arrival date | X04,X06 |
| S37 | Customer order/courier history and return-risk assistance; MD/TXT/PDF | Permitted data only; explainable factors; held-out evaluation where predicting; insufficient data shown as unknown | X11 |
| S38 | WooCommerce, Shopify, Google Sheets/Excel/CSV, scheduled/webhook sync, Daraz feasibility; MD/PDF | Ownership/conflict rules, retries, deletion and duplicate sync tests; Daraz requires actual authorized capability | G0-7,X06 |
| S39 | Service business intake, resource/calendar slots, booking request/confirmation, advance payment/reminders; MD/TXT/PDF | Concurrent booking prevention, timezone/duration, cancel/refund and permitted reminders | X10,P03 |
| S40 | Prepaid AI usage, traceable cost, subscription/bundle, volume rates/trial/low-credit notifications; MD/TXT/PDF | Reserve/settle once, trial abuse control, no hidden markup, plan transition tests | B01,B02,X09 |
| S41 | Analytics: AI/human, response time/topics, order source, lead loss, sales/payment/returns, exports; MD/TXT/PDF | Metric definitions/reconciliation; reports scoped by role and workspace | X11,O02 |
| S42 | Android and iOS merchant app, PWA, push, inbox/orders/payments/settings, QR scan; MD/PDF | Device/OS test matrix, notification delivery, deep-link auth, offline/reconnect; Android-only receipt permission clearly distinguished | X12 |
| S43 | Chrome extension assistant next to Meta Business Suite; MD/TXT | Minimum permissions, explicit account mapping, takeover/draft/history; interface-change failure path | X13 |
| S44 | In-product text/voice feature requests, status tracking, help and migration assistance surfaces; TXT/MD | Feedback records/status, attachment consent, support contact and export/import guide | X14,L01 |
| S45 | Security, audit, admin incidents/replay, backups/restore, retention/export/deletion, cost/health monitoring; MD/PDF | Tenant security, disaster recovery and incident evidence; all added storage/jobs included | O01,O02,O03,O04 |
| S46 | Minimal shared design system, Light/Dark/System, full EN/BN switcher; explicit user request | All surfaces readable in four theme-locale combinations, personal preference persistence, no flash/lost drafts, full translations/formatting, keyboard/mobile checks; all other features preserved | D01,D02,O04 |

## Payment-first phase mapping — same full-MVP scope

Latest user sequencing 2026-10-11: Phase 1 payment product running with sandbox/test/developer docs; Phase 2 full Android/inbox; Phase 3 remaining full dual-service MVP. Timing below is implementation order, not a scope removal or whole-row completion claim.

| Scope IDs | Phase coverage |
|---|---|
| S01–S05 | Phase 1 payment public/shared surfaces, signup/business/product/sandbox onboarding and access; full AI/agency onboarding in phases 2–3 |
| S06,S10,S12,S13,S21,S25 | Phase 2 live website/Messenger human inbox and Android management foundation; full modality/AI/ticket coverage phase 3 |
| S07–S09,S11,S14–S20,S22–S24 | Phase 3 remaining channels/Stars/AI/media/voice/Agent Desk/leads/campaign capabilities; generic merchant/custom bot payment API already phase 1 |
| S26–S30 | Full commerce phase 3; invoice/public payment receipt and financial refund subset phase 1 |
| S31–S34 | Phase 1 core phone bridge/auto-verification/receiving/API/sandbox; advanced commerce-linked COD/shipping and managed-channel integration coverage retained phase 3 |
| S35–S39 | Phase 3 couriers/full store sync/risk/booking; required payment-only adapter/store capability subset phase 1 |
| S40–S41 | Phase 1 payment-service subscription/reporting; AI prepaid/agency/all-product analytics phase 3 |
| S42 | Native receipt collector inside the Kotlin Android app phase 1; full Kotlin/Compose payment/inbox UI phase 2; iOS/PWA/full remaining client tasks phase 3 |
| S43–S44 | Phase 3 extension/full voice-feedback; payment help/text support/docs phase 1 |
| S45–S46 | Required at every phase gate; full cross-product/client coverage final phase |

All 46 S-IDs are covered; overlapping items remain open until complete acceptance. Exact sequence [backlog](IMPLEMENTATION-BACKLOG.md); [status](IMPLEMENTATION-STATUS.md) distinguishes local code from verified operations.

## Completion rules

1. Every S-ID has implementation + relevant tests + actual provider/device evidence where required. A screenshot, route stub, mock response or disabled menu is not completion.
2. Provider-dependent items require approved access and permitted capabilities. If access is unavailable, the item remains blocked and the full public release does not silently omit it.
3. Platform differences need a documented supported equivalent where possible. An iOS merchant app does not imply it can read another app's SMS or notifications like Android. Native messaging cards and calling capabilities also differ by channel.
4. Courier history/return prediction requires permitted data and measured quality. A fabricated score is not a substitute for data access; a prediction blocked by missing data remains visibly unresolved.
5. No fixed full-launch date or total budget is currently validated. The prior 8–12 week / $125–400 monthly small-pilot assumptions cannot be used as estimates for this entire inventory.

## Payment example used for acceptance

```text
Order #1042: BDT 500 due
Request records expected payer number, receiving account/method and time window
Customer sends money; no TrxID form or screenshot submission
Merchant Android app reads incoming receipt and syncs it
Server checks sender number + transaction time + amount + receiving account/method
Exactly one pending request matches and receipt has not been consumed
  -> automatically VERIFIED
  -> payment/order update + confirmation + merchant webhook
  -> no routine merchant approval or gateway API dependency

Mismatch / missing required field / multiple candidates
  -> pending or exception; retry when new evidence arrives

Additional gateway route verifies its own transactions through its provider API.
```

Any transaction ID in the receipt is extracted automatically for internal deduplication/audit. It is not requested from the customer. Sender number means the actual payer number contained in the receipt, not the SMS sender label. Checkout/API must identify the expected payment number; an order contact number cannot silently stand in for a different payer account. Receipt transaction time, device receive time and server ingest time remain separate. Gateway confirmation is not required for a successful phone-based verification; its method remains visible in the audit.
