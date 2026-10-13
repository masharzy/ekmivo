# Product UX specification: web, checkout ও Android

> **Owner screen correction — 2026-10-13:** On Android's SMS Forwarder tab, list ONLY **unsent/pending** payment SMS (provider, amount, sender, time). Remove a receipt as soon as it receives the durable server ACK. Empty list: "সব SMS সার্ভারে পাঠানো হয়েছে". Avoid forwarding-history list and verbose offline/recovery explanation on the main screen; the optional missed-SMS recovery control is under Settings. SMS capture is manifest-broadcast-driven (no open UI required); immediately schedule constrained WorkManager when an SMS arrives and after boot/replacement. Queue is durable across internet outages and auto-retries when network returns. Status is about **server forwarding**, not payment verification. Do not imply app can execute while the phone is powered off or after a force stop.


> **Owner correction — 2026-10-13 (overrides older Devices and checkout receiver-binding descriptions):** SMS Devices website: connect/revoke multiple paired Android phones, show permission, heartbeat, queued SMS count and network health; no SIM number or source-account mapping. Mobile connected screen: scrollable recent relevant provider receipts with amount, payer, original time and forwarded/pending states, with retry and optional user-requested missed SMS recovery. Encrypted queue auto-syncs when network returns; phone power-off/force-stop cannot be described as always-running. Refunds UI lists automatic late-payment refund requests with sender contact and seller decision flow (no automatic return). Checkout-selected number is for customer instruction only and not part of the provider+full-payer+amount+original-time unique receipt match. Account/device count plans OFF for now; no permanent unlimited entitlement. This latest flow supersedes historical five-field receiver text.


> Latest owner correction — 2026-10-12: PG10–PG17 implementation is authorized now; combined release verification follows after source completion. Refund requests carry customer/contact/payment information to the seller. The seller returns money outside the platform; there is no automatic native refund execution. Seller-reported returned remains distinct from independently verified completion. Default bKash/Nagad/Rocket phone verification requires no additional official provider API or gateway approval. Additional receiving/source connections are merchant-configured; SMS sender/app identity is distinct from the actual payer number. Optional native API connections require their own real contract and merchant credentials, and are not prerequisites for the default phone path. Older conflicting refund/native-adapter requirements below are superseded by this correction. No feature or live acceptance is inferred from this note.

২০২৬-১০-১১ · Specification, functional completion নয়। [Master plan](DUAL-SAAS-MVP-PLAN.bn.md), [design guide](DESIGN-SYSTEM.md), [tokens](design/tokens.css), [feature inventory](MVP-FEATURE-SCOPE.md), [payment architecture](PAYMENT-SYSTEM-DESIGN.bn.md) এবং [API contract](PAYMENT-API-AND-SANDBOX.md) অনুসরণ করতে হবে।

## ১. Buttons এবং shell placement

~~~text
DESKTOP
┌─232px sidebar──────┬─sticky header, min 64px─────────────────────────────────┐
│ ekmivo · PAY       │ [Payment gateway ▾] [Sandbox ▾] [Search CtrlK / ⌘K]       │
│ [Business name ▾]  │                   [EN/বাংলা] [Theme ▾] [Bell] [Avatar ▾]│
│ [Find a page…]     ├─Business / Payment gateway / Payments───────────────────┤
│ GROUP TITLE       │ Payments                               [Create request]│
│ Icon + menu       │ one-line explanation                        [Export ⋯]│
│ Icon + menu       │ Status tabs                                            │
│ …                 │ Search / Method / Account / Date / More filters        │
│ Help · Admin*     │ Table + loading/empty/error                             │
│ Account / Logout  │ Record -> detail route or optional side drawer         │
└───────────────────┴────────────────────────────────────────────────────────┘
*Platform admin only if explicitly authorized.
~~~

| Control | অবস্থান ও ভিতরের options |
|---|---|
| Business switch | Sidebar brand-এর নিচে: avatar/name, current check, search/recent businesses, role, Manage businesses/Create business। Agency aggregate financial view আলাদা। |
| Product switch | Header first control: Payment gateway / পেমেন্ট গেটওয়ে; AI workspace / AI ওয়ার্কস্পেস। দুই icon cards, purpose, selected check, entitlement/release state। |
| Environment | Product switch-এর পাশে Sandbox/Live। Sandbox persistent banner; keys/data separate। Live unavailable হলে setup checklist। |
| Global search | Header middle, CtrlK/⌘K dialog: current product/environment authorized records + navigation; arrows/Enter/Escape। Sidebar search শুধু menu। |
| Language/theme | Header right EN/বাংলা এবং labelled Light/Dark/System menu; settings-এর ভিতরে শুধু লুকানো নয়। |
| Notifications | Header right bell unread count; recent actionable events, mark read, exact authorized deep links; full view events?tab=notifications। |
| Profile | Header far right avatar: profile/security/password/MFA/passkeys where implemented, sessions, preferences, help, sign out। |
| Main action | Page heading right, e.g. Create request; Export/More secondary। Dangerous operation secondary contextual menu। |
| Detail navigation | Parent/back link, amount/reference/status title, context actions, details/audit tabs; stable bookmarkable URL। Drawer full-page equivalent, Escape/focus restore। |

Product switch preserves business; target product last authorized page, first visit Overview। Current card click route reset নয়। Business switch preserves enabled product otherwise available one। Phase 1 onboarding defaults Payment; saved authorized AI preference respected। Disabled/unreleased card reason স্পষ্ট; working feature হিসেবে fake link নয়।

Environment switch corresponding list opens; source record IDs/secrets/filters that refer to another environment carry নয়। Unsaved draft হলে Save draft/Discard/Stay। Theme/locale change drafts/search/current record preserve করবে এবং payment/order create করবে না। Browser back/deep links context restore; revoked permission safe access state।

Mobile <768px: sticky top row menu/product/environment/bell; compact EN/বাংলা/theme visible, second row if needed। Drawer business/search/groups/profile। One pane at a time; Back list filter/scroll restore। Public header retains floating animation; operational header stays stable। Header min-height can grow for BN/zoom; no clipped labels।

## ২. Routes ও navigation

Merchant path: **/{locale}/w/{workspaceId}/{product}/{section}**, products ai/payments। Payment environment explicit **?env=sandbox|live**; server authorized binding determines actual environment, query alone authority নয়। First payment visit sandbox; preference per business/product after explicit selection।

Existing Next folders [section]/[serviceSection] map product/section। Same depth sibling [service] তৈরি নয়। Deeper new/detail routes extend current tree। Legacy redirects authorization-এর পরে; invalid section safe 404/403।

| Group | Menu labels EN / BN | Section paths | Phase |
|---|---|---|---|
| Overview / সারসংক্ষেপ | Overview / সারসংক্ষেপ; Reports / রিপোর্ট | overview, reports | 1 |
| Payments / পেমেন্ট | Payments / পেমেন্ট; Requests / পেমেন্ট রিকোয়েস্ট; Incoming receipts / আসা পেমেন্ট; Payment links / পেমেন্ট লিংক; Invoices / ইনভয়েস; Customers / গ্রাহক; Refunds / ফেরত পেমেন্ট | payments, requests, incoming, payment-links, invoices, customers, refunds | 1 |
| Receiving & verification / টাকা গ্রহণ ও যাচাই | Receiving accounts / টাকা গ্রহণের মাধ্যম; Devices / ডিভাইস; Reconciliation / হিসাব মিল | gateways, devices, reconciliation | 1 |
| Integrations & events / ইন্টিগ্রেশন ও ইভেন্ট | Developers / ডেভেলপার; Webhooks / ওয়েবহুক; Events & logs / ইভেন্ট ও লগ; Integrations / সংযোগ | developers, webhooks, events, integrations | Payment capabilities 1; full commerce sync 3 |
| Commerce / পণ্য ও অর্ডার | Orders / অর্ডার; Products / পণ্য; Inventory / মজুত; Coupons / কুপন; Shipping / ডেলিভারি; Returns / রিটার্ন | orders, products, inventory, coupons, shipping, returns | Full operations 3; payment read model 1 |
| Workspace / ওয়ার্কস্পেস | Team / টিম; Billing / বিলিং; Settings / সেটিংস; Help / সহায়তা | team, billing, settings, help | Payment/shared parts 1 |

Phase 1 sidebar payment work first; unfinished Commerce group collapsible with Build in progress explanation। All menus retain scope coverage; scaffolding does not imply functionality। Payment onboarding never requires Meta/LLM connection।

## ৩. Shared page behavior

Lists: URL-backed search/filter/sort/cursor pagination, clear selected count, refresh/last update, permission-scoped Export। Real connected empty data = 0; disconnected/unavailable = — plus reason। Each route loading, empty, error+retry, forbidden, stale/offline, detail-not-found; refetch retains known data।

Default table row click opens detail; keyboard accessible explicit link। Amount right aligned; status text and method visible। Sensitive values masked by role; authorized reveal with audit where required। Forms labelled, field validation, unsaved state, idempotent submission, server errors translated।

## ৪. Payment screens: complete contents/actions

### Overview / Reports

| Screen | Inside | Actions |
|---|---|---|
| Overview | Date period; verified gross/allocated total, pending count, exception count, webhook failures, online devices। Recent verified payments, action queue, setup checklist, volume chart with data table। | Create request; metrics drill through filtered lists; setup receiving/device/API; actual fees/net only where measured। No AI tokens/messages। |
| Reports | Overview, received volume, methods/accounts, refunds, customers, settlement tabs; date/account/environment filters, timezone/freshness/metric definitions। | CSV async export/download; drill-through; reconciled totals। SaaS revenue not merchant volume। |

### Payments / Requests / Incoming

| Screen | Tabs, fields and detail | Actions and constraints |
|---|---|---|
| Payments | All, Verified, Partial, Pending/Processing, Exceptions, Partially refunded, Refunded, Reversed। Payment/ref, customer/payer, gross/currency, method of verification, receiving account, transaction/verified time, status, webhook delivery। | Open detail, opaque receipt link, authorized refund, export। No arbitrary Set paid। |
| payments/{id} | Summary gross/allocated/refundable; Verification tab five-field comparison/provenance; allocations/invoice/order links; receipt; refunds; timeline; delivery history। | Request refund; resend permitted receipt notice; safe replay webhook। No reposting funds। |
| Requests | All, Awaiting payer, Awaiting payment, Processing, Completed, Expired, Cancelled, Exceptions। Reference/customer, amount/received/due, method/account/payer/window/status। | Create; copy/open checkout; cancel unpaid; explicit new retry attempt। Issued amount/window/payer not editable। |
| requests/new | Amount/currency, reference, optional customer/order/invoice, allowed routes, expected payer optional until checkout, expiry, full/advance label, bounded metadata, registered return URL। | Create → actual checkout URL; copy/open/live status। Linked amount server snapshot, idempotent submit and inline error। |
| requests/{id} | Original terms, attempt payer/window, allocations, checkout share, cancellation reason, late-evidence/exception/history। | Cancel allowed state; explicit new request; no financial-history delete। |
| Incoming receipts | All, Matched, Unmatched, Ambiguous, Invalid, Duplicate, Reversed। Sender/method/account, amount, transaction time, sync time, device, parser/reason। Filters source/account/method/reason। | Open, compare candidates, safe authorized Reprocess। No live manual TrxID/Approved receipt injection। Simulator sandbox only। |
| incoming/{id} | Parsed fields, redacted relevant evidence/hash, source identity, parser/policy, three timestamps, candidates/exclusion reasons, linked payment/duplicates। | Safe reparse/match; escalate exception। Missing payer/time cannot be guessed or replaced। |

### Links / Invoices / Customers / Refunds

| Screen | Inside/options | Actions |
|---|---|---|
| Payment links | Active/Expired/Archived; name/link ID, amount, usage/received total, expiry; detail preview/config versions/payments। | Create draft title/description/image, fixed amount/currency, quantity policy, expiry/max uses/routes, contact/custom fields, registered return URL; publish/share/archive। Every visitor own intent। |
| Link custom fields | Text/textarea/select/radio/checkbox/safe file where required; label/options/required/quotas/privacy। | Server validation/private upload/type+malware checks। File field not payment screenshot verification। |
| Invoices | Draft/Issued/Partial/Paid/Overdue/Cancelled/Partial refund/Refunded; customer/invoice no./total/paid/due/date। | Draft repeatable description/quantity/unit price, tax/discount/fee/shipping rules, public/private notes; save/preview/issue/send/pay link/print/export। Paid derived, no status dropdown to fabricate payment। |
| invoices/{id} | Printable issued snapshot, line items, allocations, delivery/reminders, corrections/refunds history। | Draft edit; issued correction preserves history; reminders where permitted, receipt links। |
| Customers | Name/contact/reference/tags/source search; payment count, verified/refund total, last activity। | Create/edit contact/notes/tags, import preview/duplicate prevention/export; detail Payments/Invoices/Notes/Activity। Contact not silently payer। |
| Refunds | Requested/Approved/Processing/Completed/Failed/Unknown/Cancelled; amount/source payment/customer, authorizer/time/status। | Amount/reason request → explicit authorized refund approval → supported API or audited assisted workflow → independent completion evidence। Concurrent cap; unknown remains unknown। |

### Receiving / Devices / Reconciliation

| Screen | Inside/options | Actions |
|---|---|---|
| Receiving accounts (gateways) | Connected/Needs attention/Setup/Disabled; masked method/account, Phone/API/Statement connection type, environment, last event/health। | Add wizard method → route type → merchant identity → source/device or provider-specific credentials → test → availability। No one generic secret form for all methods। |
| gateways/{id} | Source binding, transfer types, expiry/time policy, health, incoming/payments, rotation/audit। | Disable new attempts but finish accepted receipts; masked encrypted secrets; no auto-accept opt-in। Account evidence not reassignable across tenant। |
| Devices | Online/Sync delayed/Offline/Permission required/Revoked; name/model/OS/app, receiving source, heartbeat/last receipt/backlog। | Connect short-lived one-use QR/code; explicit binding; test sample/real receipt; rename/revoke। Pair token not logged/persistent after expiry। |
| devices/{id} | Permission/network/battery/version health, receipt log, bindings, diagnostics, enrollment history। | Reconnect instructions, revoke/re-enroll; never silently grant OS permission। Affected checkout gets sync delay state। |
| Reconciliation | Side-by-side pending attempts/unmatched receipts and exceptions; reason/date/source filters; statement/import sessions and settlement totals। | Unique matches already auto-linked। Explain missing/collision/wrong sender/time/amount/late cancelled receipt; reparse/query under same rules। Controlled correction distinct/audited, not mislabeled phone verification। |
| Statement import | Account/environment, CSV mapping/preview/errors, original line identity/time/currency/direction, batch audit। | Idempotent supported bank import and settlement matching; typed arbitrary balance not provider proof। |

### Developer surfaces / Events / Integrations

| Screen | Inside/options | Actions |
|---|---|---|
| Developers | Quickstart, API keys, Reference, SDK/examples, Sandbox tabs; actual API URL/env, integration checklist, logs link। | Create key name/scopes/expiry/policy; once-visible raw secret, copy/rotate/revoke/last use; docs same context/public deep link। |
| Webhooks | Endpoints/Deliveries; HTTPS URL/event subscriptions/environment/status/last error। | Create endpoint/signing secret; sandbox test; activate/disable; rotation overlap; replay authorization। |
| webhooks/{id} | Attempt times/HTTP status, redacted payload/response, event version/correlation, next retry, config/audit। | Replay same business event ID with fresh delivery ID/signature; failed queue filtering; no payment re-execution। |
| Events & logs | Domain events, API logs, audit, exports, notifications; safe timestamp/type/resource/result/correlation details। | Trace intent→receipt→payment→webhook; protected support export; no Clear financial audit history action। |
| Integrations | Merchant website/custom bot payment API, WooCommerce/Shopify payment connectors/imports; capability/setup status and docs। | Test real permitted payment integration where required। Full catalog/order sync phase 3; provider name tile ≠ Connected। |

### Workspace surfaces

| Screen | Inside/options | Actions |
|---|---|---|
| Team | Members/invitations/roles/capabilities/activity, product access। | Invite/resend/revoke/remove/change grants; last-owner guard/secure transfer; immediate permission invalidation। |
| Billing | Payment-service subscription, platform invoices, usage/quota/plan history; AI balance separate context/link। | Verified renewal, expiry/grace/read-only policy; no unsupported automatic mandate promise; customer funds not spendable SaaS balance। |
| Settings | Business/contact/timezone; checkout logo/brand/legal/support/lang; payment expiry/account availability; notifications; security; export/delete। | Preview/save; secrets account detail; URL restrictions; precise dangerous-action impact; brand cannot break accessible controls। |
| Help | Search guides, setup, payment reasons, device/offline fixes, developer docs, tickets, feedback, migration/status। | Actual submission/history if claimed; later voice feedback explicit build state; no fabricated chatbot result। |
| Profile/security | Name/email, password/recovery, MFA, session list; implemented passkey support only if built/tested। | Re-auth changes; revoke sessions; platform admin boundary visibly separate। |

## ৫. Customer checkout / receipts

### Owner correction — 2026-10-12: standalone branded payment experience

- `/pay/{token}` এবং পরবর্তী checkout-এ marketing/dashboard header, footer, sidebar থাকবে না। Checkout-এর নিজস্ব back/close এবং EN/BN controls থাকবে। Close কেবল validated merchant return destination-এ যাবে; financial state পরিবর্তন করবে না।
- প্রথম screen: payment গ্রহণকারী workspace-এর নাম/logo, configured platform contact buttons, enabled receiving methods-এর logo/image cards এবং server-derived payable amount-সহ Pay action। Disabled/unavailable method selectable হবে না। Contact address বা availability বানানো যাবে না।
- Method নির্বাচন → Pay → প্রকৃত payer number input → server-side confirmation → receiving number ও transfer instructions। bKash-এর pink/white card layout এবং Nagad-এর red card layout owner-এর 2026-10-12 screenshot references অনুসরণ করবে; merchant নাম/reference/amount/contact অবশ্যই actual data। Provider-branded visual মানে official provider API integration দাবি নয়।
- Instruction screen-এ full receiving number ও copy button, configured account transfer type, method-specific instructional image, exact amount, automatic-verification waiting state এবং server-time expiry থাকবে। নতুন receiving method যোগ হলে supported actual flow ছাড়া fake working tile নয়।
- Customer PIN/OTP/TrxID/screenshot চাইবে না। Browser action কখনো paid status লিখবে না। Cancel/close-এ refund বা payment failure ধরে নেওয়া যাবে না।
- Bangla QR owner পরে যুক্ত করবেন; এই correction-এর implementation-এ QR requirement নেই।
- Full method logos/contact configuration/instruction assets এবং real browser flow evidence না থাকলে screenshot-equivalent design complete বলা যাবে না।

Public routes: /{locale}/checkout/{opaqueToken}, /{locale}/pay/{opaqueToken}, /{locale}/receipt/{opaqueToken}, /{locale}/invoice/{opaqueToken}। High-entropy scoped capability, no secret/PII in query/return URLs। URL logging and referrer leakage minimized।

1. **Summary:** merchant identity/logo/support, description/reference/total/currency/fees/legal; actual available methods, route unavailable reason।
2. **Payer:** actual sending number confirmation; BN digit normalization; no contact-number assumption।
3. **Pay:** destination copy/QR where supported, transfer type/exact amount, server-time countdown, current payer clearly visible। No PIN/OTP/customer TrxID/payment screenshot।
4. **Waiting:** clear auto-verification explanation; SSE and polling/refetch fallback। Refresh/reload same intent; browser navigation no double-create।
5. **Verified:** backend result only; receipt amount/ref/method/verified time, print/download, return merchant। Announce once without focus stealing। Merchant backend query before delivery।
6. **Exception/pending:** offline device, unknown provider, wrong sender/amount/route/time, missing field, collision, expiry/cancellation specific copy+refresh/help/contact merchant। No blind “টাকা আবার পাঠান” while previous funds unknown।

Sandbox persistent “পরীক্ষামূলক — আসল টাকা পাঠাবেন না / Sandbox — no real money”; fake destination clearly simulated। Verified receipt records method; no fabricated settled badge। Printable paper white, selected language retained।

## ৬. Role/action matrix

Existing owner/admin/editor/viewer retained; granular grants with explicit migrations/backfill। Finance/support are recommended grant presets, not already implemented roles।

| Capability | Owner | Admin | Editor default | Viewer |
|---|---|---|---|---|
| View scoped financial lists | Yes | Yes | Yes | Yes, masked |
| Create/cancel unpaid request/link/invoice | Yes | Yes | Yes | No |
| Refund authorize/execute | Step-up required | Explicit grant + step-up | No | No |
| Reveal full evidence/export sensitive data | Yes | Explicit finance grant | Masked default | No |
| Keys/webhooks/account/device enrollment | Step-up | Explicit grant | No | No |
| Team/billing/delete business | Yes, last-owner guard | Limited grants | No | No |
| Sandbox simulator | Yes | Yes | Explicit developer grant | Read only |

Server enforces every action/export/search। Webhook secret/key reveal re-auth; admin MFA production requirement। Cross-tenant support separate platform identity/reason/expiry/audit; merchant ownership never grants platform access।

## ৭. Separate AI product: every section

Payment phase 1 does not implement full AI। Phase 2 inbox/channel foundation; phase 3 remaining capabilities। All inventory still required for full MVP।

| Group/screens | Inside/options |
|---|---|
| Overview/Notifications/Reports | AI/human activity, attention queue, lead funnel, response/cost definitions, persistent alerts। |
| Inbox | All/unread/mine/unassigned/attention/resolved/snoozed; channel/customer/phone/order/content search; list→thread→customer rail। Reply/internal note, assignment/tags/notes, attachments/voice where implemented, delivery, saved replies, takeover/release, draft/reconnect। |
| Comments | Channel/post filters, post-product context, public/private permitted reply, moderation history/manual controls। |
| Saved replies | Categories/search, template variables preview, edit/archive; human send confirmation। |
| Contacts | Channel identities, notes/tags, history, linked payments/orders/bookings/tickets; no unverified identity merge। |
| Tickets | Ownership/priority/status/age; complaint/refund/return links, timeline, explicit resolution। |
| Leads | Six-stage pipeline, hot/warm/cold with editable reasoning, lost-sale reason, call schedule/outcome; list/board। |
| Follow-ups | Due/scheduled/suppressed/sent/failed, consent/timezone/audience/offer expiry/send-policy। |
| Broadcasts | Audience/draft/preview/schedule/approval/results, opt-out/suppression/templates, dedup। |
| Bookings | Resource/day/list/calendar, availability/concurrent slots, request/confirm/advance/reminders/cancel/refund। |
| AI Agent / Agent Desk | Practice/live/off, tone/language/tools, draft/live versions, natural-language edit/diff/test/publish/undo, unanswered questions। |
| Knowledge | Text/Q&A/MD/CSV/PDF/Word/URL, sources/versions/ingest/errors/retrieval test/delete propagation। |
| Products | Shared catalog variants/prices/images; recognition/ambiguity candidates; live stock authority B। |
| Posts | Post→product association/context, provider sync/errors। |
| Channels | Messenger/Instagram/WhatsApp/Telegram onboarding/status/access/reconnect, capability-specific options। |
| Website | Site/origin/widget/branding/install/test, human chat/cards/voice where permitted, rate limits/status। |
| Team/Billing/Settings/Help | Shared membership/preferences; AI prepaid credit/usage separate; help/feedback/support। |

Thread header AI replying/Human replying/AI off। Takeover atomically cancels queued AI send; release explicit, dispute not automatically released। Assistant drafts need human send। Payment chip links payment product record; AI customer claim cannot set paid।

## ৮. Commerce routes retained

| Screen | Contents/actions |
|---|---|
| Orders | List/Kanban/source/state filters, detail price snapshots/customer/address, confirmation/hold/pack/shipment/returns; payment independent; bulk per-row errors। |
| Products | Variants/sizes/colors/charts/prices/images/availability, import preview/ownership। |
| Inventory | Warehouse stock/reservations/movements/transfers/adjustment/inspection, audit; no negative available stock। |
| Coupons | Fixed/percent/free shipping, audience/expiry/limits; identical server totals across channels। |
| Shipping | All named courier setup, ready/booking/status/labels/picking/QR/handover, unknown outcome; COD settlement separate। |
| Returns | Request/approve/inspect/restock/exchange/refund links; damage/stock/money independent histories। |

## ৯. Kotlin + Jetpack Compose Android merchant app + inbox — phase 2

Kotlin/Jetpack Compose native merchant app-এ phase-1 native receipt module reuse হবে; কোনো RN/Flutter bridge নেই। একই Go APIs ব্যবহার করবে। Top-left business, header product switch, explicit payment environment। Bottom tabs vary by selected product।

| Product | Bottom tabs | Contents |
|---|---|---|
| Payment | Home, Payments, Requests, Devices, More | Payment/detail/refund permissions, create/share checkout, bridge health; More invoices/customers/reports/settings/help/security। |
| AI inbox | Inbox, Contacts, Tasks, Notifications, More | Human inbox/reply/assignment/tags/notes/snooze/resolve, tickets/leads/follow-up tasks; More channels/agent/settings/help। Live AI only after its gate। |

Phase 2 includes Go message/assignment/reply/snooze APIs, web inbox parity, website chat and approved Messenger live tests। Android screen alone not channel implementation। Remaining channels/AI/campaign/media capabilities phase 3; full MVP completion নয়।

Offline cached/redacted read; queued reply visibly Queued with cancel। Reconnect rechecks user/role/channel window before sending; expired window visibly fails। Financial actions server-confirmed, no offline paid/refund success। Push minimal private text/role-scoped deep links; no SMS/token in push। Logout/revoke clears appropriate cached data।

Safe-area/keyboard composer, attachments permission, duplicate send prevention, reconnect/refetch, OS theme/locale, session protection, Android/OEM/dual-SIM matrix required। iOS/PWA/extension remain full-MVP deliverables later; iOS receipt-reading equivalent assumed নয়।

## ১০. UX evidence

Each promised route/action has real data/mutation/success/error, loading/empty/offline/forbidden/detail states, permission checks, server-confirmed money, no BN translation gaps। Verify Light/EN, Light/BN, Dark/EN, Dark/BN + System; 320/768/1440px, 200% zoom, keyboard/reduced motion; route/back/filter/draft preservation।

Evidence links screenshots plus API/DB assertions and device/provider checks where relevant। Populated fixture screenshot only visual evidence, not live financial/channel proof।

## ১১. Payment platform-admin UX

Platform admin আলাদা shell/routes; বর্তমান /{locale}/admin page থেকে authorized section routes বাড়বে। Header persistent “Platform admin” context; tenant-selector support view সরাসরি merchant ownership নয়। Super admin/admin/support/analyst existing source roles permission tests ছাড়া complete নয়।

| Admin section | Contents/actions |
|---|---|
| Overview/health | API/worker/database/queue/device aggregate health, incident backlog, webhook error rates; no default full customer-chat browsing। |
| Merchants/workspaces | Merchant setup/entitlement/status/source ownership, subscription history, last activity; scoped support access request, reason/expiry/audit। |
| Payment incidents | Exception/unknown/refund/reversal history, authorized evidence comparisons/correlation; safe retry/query under same financial rules; no unrestricted Set verified/clear ledger। |
| Devices/parsers | Enrollment/source health, revoked devices, approved parser versions/fixtures/change diff; parser promotion audited/tested; reprocessing versioned and safe। |
| Webhook/API operations | Redacted delivery/request failure logs, quota metrics, replay/retry with actor reason; secrets never visible via list। |
| Plans/platform billing | Effective product entitlement/pricing/invoices, compensating billing correction; privileged change MFA/step-up/audit; merchant gross funds not revenue। |
| Support | Merchant support tickets/status/history, temporary read-only access where needed; impersonation clearly disclosed, financial mutations separately authorized। |
| Recovery/jobs | Failed jobs/export/restore status, runbook links, release/version health; dangerous replay precise resource/dry-run impact and least privilege। |
| Audit/privacy | Filter actor/tenant/action/time/correlation; export/retention/deletion request and backup-expiry state; immutable financial audit not deletable via “clear logs”। |

Finance investigation cannot quietly mutate source evidence. Emergency account/device revoke immediately effective; accepted financial work preserved. Platform support views also have complete locale/theme, keyboard and mobile states.
