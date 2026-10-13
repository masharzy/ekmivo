# Payment gateway system design

> **Owner correction — 2026-10-13, overrides older mandatory receiver identity/SIM mapping:** For signed Android SMS receipts, do not demand the receiver's own SIM/phone number or require customer payment to the checkout-selected receiving number. Verify uniquely via enrolled workspace, provider, full payer number from receipt, exact amount and original transaction time in the immutable issued attempt window; derived receiving account is only the selected attempt's accounting attribution. No SIM selector or device/account binding UI. Deduplicate provider references. Queue/retry offline SMS and list it in the app; optional consented recent inbox recovery. If receipt is processed after cancellation/expiry for an eligible original transfer, create a seller-managed refund request, not an automatic payout or successful payment. Quotas are plan-managed later; plans OFF now and never hard-coded as permanently unlimited.


> Latest owner correction — 2026-10-12: PG10–PG17 implementation is authorized now; combined release verification follows after source completion. Refund requests carry customer/contact/payment information to the seller. The seller returns money outside the platform; there is no automatic native refund execution. Seller-reported returned remains distinct from independently verified completion. Default bKash/Nagad/Rocket phone verification requires no additional official provider API or gateway approval. Additional receiving/source connections are merchant-configured; SMS sender/app identity is distinct from the actual payer number. Optional native API connections require their own real contract and merchant credentials, and are not prerequisites for the default phone path. Older conflicting refund/native-adapter requirements below are superseded by this correction. No feature or live acceptance is inferred from this note.

২০২৬-১০-১১ · Status: implementation specification; financial engine implemented নয়।

এটি [master plan](DUAL-SAAS-MVP-PLAN.bn.md)-এর architecture detail, দ্বিতীয় master plan নয়। [UX](PRODUCT-UX-SPEC.bn.md), [API/sandbox](PAYMENT-API-AND-SANDBOX.md), [backlog](IMPLEMENTATION-BACKLOG.md), [actual status](IMPLEMENTATION-STATUS.md) একসঙ্গে পড়তে হবে।

## ১. Phase 1-এর ফলাফল

Merchant account খুলে payment product-এ receiving account/phone connect করবেন। Sandbox integration test-এর পরে live request/link/invoice দেবেন। ক্রেতা টাকা পাঠালে actual payer number, transaction time, amount, receiving account এবং method মিলবে। Unique valid match হলে automatically verified, allocation, receipt এবং signed merchant webhook হবে। Merchant server একই status query করতে পারবে।

Phase 1-এ payment product-এর dashboard, checkout, financial operations, customer records, links/invoices/refunds/reconciliation, receiving sources/devices, API keys/webhooks, sandbox, reports, team/security, payment-service billing, developer docs এবং operational recovery শেষ করতে হবে। Required named provider adapters/bank import-এর evidence-ও লাগবে। Blocked adapter complete নয়; সব required payment gate না-পাস করলে phase complete নয়।

**পূর্ণ Android merchant app এবং inbox phase 2-তে। কিন্তু real phone auto-verification-এর জন্য phase 1-এই minimal Kotlin receipt bridge প্রয়োজন।** Bridge ছাড়া sandbox/API slice চালানো যায়; live phone verification complete বলা যায় না। Full commerce/inventory/courier এবং AI/client features পরের build phases-এ, full-MVP inventory থেকে বাদ নয়।

Merchant-owned receiving account-এর verification service এটি। Customer money platform wallet-এ জমা, escrow/cash-out/pooled payout এই plan-এর feature নয়। Merchant receipt, provider settlement এবং SaaS revenue আলাদা হিসাব।

## ২. এক business backend

~~~mermaid
flowchart LR
  UI[Dashboard / checkout] --> Web[Next.js on Vercel]
  Web --> API[Go API on container host]
  Merchant[Merchant server / SDK] --> API
  Phone[Kotlin receipt bridge] --> Ingress[Go authenticated ingress]
  Provider[Approved provider callback] --> Ingress
  API --> DB[(PostgreSQL)]
  Ingress --> DB
  DB --> Worker[River payment worker]
  Worker --> Matcher[Parser / matcher / allocations]
  Matcher --> DB
  Worker --> Hooks[Signed merchant webhooks]
  Worker --> Query[Provider query / refund / reconciliation]
~~~

| অংশ | Owner |
|---|---|
| Next.js | Pages, theme/locale, existing login/recovery, CSRF-protected session proxy, rendering। Financial rules/state writes নয়। |
| Go API | Dashboard domain API, merchant API, permission checks, public checkout, receipt/provider ingress, financial commands। |
| Go payment worker | Parsing/matching, reconciliation/expiry, notification/export, webhook delivery। API থেকে আলাদা process; একই domain packages। |
| PostgreSQL | Authoritative records, immutable evidence, dedup, allocations, audit/outbox এবং River jobs। |
| Kotlin receipt module (same app) | Constrained, consented relevant receipts, source binding, signed events, encrypted offline queue/heartbeat। Paid-status authority নেই; এই code একই Kotlin/Compose Android APK-এ থাকবে। |
| Kotlin/Compose Android app | Phase 2 merchant management/inbox; same Go APIs ও phase-1 native receipt module; দ্বিতীয় matcher নয়। |

Deploy proposal: Vercel web; Render managed Docker service Go API + separate background worker; Neon PostgreSQL। Worker HTTP service থেকে পৃথক operate করা যায়। Region, always-on capacity, connection budget এবং recovery quote release-এর আগে validate হবে; provisioning done নয়। [Render workers](https://render.com/docs/background-workers)

Frontend serverless হওয়ার কারণে commerce logic duplicate হবে না। Developer API সরাসরি Go-তে; dashboard session proxy হয়ে Go-তে। Timeout/retry একই idempotency key রাখবে। SSE proxy buffering/reconnect staging-এ verify হবে।

## ৩. Identity, tenancy ও environment

Existing source-এ scrypt login, opaque DB sessions, memberships ও recovery adapter আছে। Earlier Clerk recommendation implemented নয়। Existing identity harden করে Go authorization boundary implement করব; managed identity migration আলাদা ADR ছাড়া নয়।

- Web HttpOnly session token protected server-to-server proxy channel-এ Go-তে যাবে। Go hash lookup দিয়ে expiry/revocation, disabled user এবং current membership check করবে। Browser-provided user/role header trusted নয়। Session routes require authenticated proxy; merchant key routes পৃথক। Mutations-এর Origin/CSRF, proxy-secret rotation, replay/request scope tests লাগবে।
- Mobile: one-use login exchange, short-lived access tokens, rotated/revocable refresh family, secure OS storage। Web cookie copy নয়। Current privileges recheck; API key/device identity/user token আলাদা।
- Tenant root existing **workspaces**। Tenant domain tables-এ workspace_id; environment-specific records-এ environment_id; composite FK অন্য tenant/environment-এর object attach আটকাবে।
- Explicit scoped queries + FORCE RLS। Runtime role owner/superuser/BYPASSRLS নয়; missing context deny, transaction-local context/pool cleanup; migrations আলাদা role। Jobs/SSE/export একই boundary। [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- Sandbox/live: পৃথক financial DB/credentials/queues/storage prefixes এবং integration destinations; application environment binding-ও থাকবে। Live worker sandbox DB access পাবে না। Existing identity/control DB owns users/sessions/workspaces; Go narrowly scoped session/member lookup করে। Each financial DB has a minimal workspace_registry projection (workspace UUID, lifecycle/entitlement version only) for local FK targets; no password/session/provider-secret cloning, no cross-database FK assumption। Provisioning idempotent, partial provision unavailable until registry ready; deleted/revoked membership rechecked against control authority। Financial datasets cross-env join নয়।
- Current service_mode হলো UI entitlement seed; paid subscription truth নয়। Effective workspace_services + subscription/capability authoritative হবে। Expiry নতুন action আটকালেও accepted receipts/reconciliation/webhooks চলবে।

## ৪. Data ও module ownership

বর্তমান applied migration history preserve হবে। **infra/migrations/** phase 1-এর একমাত্র migration source/runner; দ্বিতীয় backend/db/migrations runner নয়। sqlc queries backend/db/queries/। Deploy migration job একবার চালাবে; request handler নয়।

| Module | Records | Invariant |
|---|---|---|
| Identity/access | users/sessions/members, service entitlements, capability grants | Revoked/removed member privileged action করতে পারবেন না |
| Receiving | receiving_accounts, provider_connections, account/source bindings | Active live external account unrelated tenant-এ duplicate binding নয় |
| Devices | enrollments, keys, source bindings, heartbeats | Key-bound tenant/environment; revoked key denied |
| Requests | payment_intents, immutable attempts, checkout_sessions, idempotency_records | Instructions issued হলে payer/account/amount/window immutable |
| Evidence | inbound_events, receipts, observations, parser versions | SMS/notification/API একই receipt দ্বিতীয় credit নয় |
| Finance | payments, allocations, refunds, reconciliation_cases | Allocated total ≤ verified funds; refunds ≤ refundable amount |
| Links/invoices | links/fields, invoices/items, invoice_payments | Issued snapshot; totals server-derived |
| Customers | tenant contacts/profile, notes/tags | Contact number silently expected payer নয় |
| Reliability | outbox/domain events, webhook endpoints/deliveries, River jobs, audit | Mutation+event/job same transaction |
| SaaS billing | subscriptions, platform invoices, usage | Merchant customer funds থেকে separate |

UUID IDs, tenant/environment-first indexes, money integer minor units/paisa, timezone-aware UTC। Gross/fee/net/provider balance separate fields। Secrets encrypted; API key hash-only; webhook signing secret encrypted recoverable storage। Raw relevant receipt restrictive access/retention; normal logs-এ raw SMS/phone/key নয়।

Merchant payments received-evidence accounting; settlement statement ছাড়া settled cash নয়। Platform billing/AI credit ledger balanced postings ও compensating correction ব্যবহার করবে; customer funds থেকে service credits তৈরি নয়।

## ৫. Checkout → automatic verification

1. Merchant amount_minor/currency/reference/allowed routes/expiry দিয়ে intent তৈরি করেন। Standalone intent-এর catalog/order prerequisite নেই। Linked order/invoice amount server snapshot থেকে।
2. Customer method ও **যে নম্বর থেকে টাকা পাঠাবেন / Number you will pay from** confirm করেন। API-তে থাকলে before issuance confirm/edit। Contact phone অন্ধভাবে payer নয়।
3. Go immutable attempt বানাবে: payer, amount, method, receiving identity, window_start/window_end, policy version। Same tuple-এ active overlapping attempts → 409 collision; identical idempotent call → previous result।
4. Destination/QR, correct transfer type, exact amount ও countdown। Customer PIN/OTP/TrxID/screenshot দিতে হবে না। “টাকা পাঠিয়েছি” refresh trigger হলেও proof নয়।
5. Device evidence durable sync; server enrollment/account mapping resolve করে approved parser incoming receipt থেকে fields নেবে। Client verified=true ignored/rejected।
6. Exactly one eligible candidate → receipt consumption, verified payment, allocation, intent update, event + River/outbox এক DB transaction। Commit-এর পরে checkout auto-update, receipt, merchant webhook।
7. Missing/mismatch/collision → concrete pending/exception; reparse/query/new evidence দিয়ে retry। Normal valid match-এ merchant approval নেই।

### Matching এবং race rules

| Field/case | Contract |
|---|---|
| Sender | Actual full payer number normalized +880…; SMS sender label নয়। Masked suffix থেকে payer guess নয়। |
| Amount | Exact requested transfer amount in paisa; unspecified tolerance নয়; fees explicitly separate। |
| Account | Receiving identity + tested SIM/subscription/provider-package binding। Receipt-এ account না-থাকলে exclusive tested source binding প্রয়োজন; ambiguous multiple accounts exception। |
| Method/direction | Provider/transfer type/incoming correct; debit/cash-out/reversal paid proof নয়। |
| Time | Original transaction time immutable attempt window-তে। Device receive/server ingest replacement নয়। Source precision/timezone retained; missing trustworthy time exception। |
| Coarse clocks | Minute-only source একটি uncertainty interval; entire interval safe window-তে ও unique candidate হলে eligible। Default tolerance zero; measured versioned provider rule ছাড়া widening নয়। |
| Race | Account/payer/amount/method bucket serialize; request version + row lock + unique receipt consumption/allocation। New concurrent request/candidate change recheck before commit। |
| Dedup | Provider/account/internal receipt reference stable key; SMS/notification/API observations একই receipt। Transport event ID alone sufficient নয়। No reliable receipt identity → tested strong fingerprint or exception। |
| Offline late sync | Original time window-তে হলে uncancelled expired request auto-verify হতে পারে, late-sync audit flag সহ। Cancelled business order/intent funds tracked but fulfilment auto-start নয়; reconcile/refund route। |
| Amend/retry | Issued payer/account/window backdate নয়। New attempt immutable new window; historical receipt later intent-এ reused নয়। |
| Partial/overpay | Exact advance intent auto-allocates; arbitrary under/over transfer দিয়ে expected amount rewrite/paid নয়; exception/residual/refund explanation। |

External provider call lock ধরে নয়। Transactional enqueue business commit-এর সঙ্গে job যুক্ত করে। [River enqueue](https://riverqueue.com/docs/transactional-enqueueing)

Device signature enrolled device submission বোঝায়; provider-authenticated receipt নয়। API/UI sms_match, notification_match, provider_api, bank_statement provenance স্পষ্ট থাকবে। Valid phone match দ্বিতীয় gateway approval-এর জন্য অপেক্ষা করবে না। Spoofed receipt/tampered device threat tests ছাড়া guaranteed accuracy/security claim নয়।

## ৬. State model

| Dimension | State |
|---|---|
| Intent lifecycle | requires_payer, awaiting_payment, processing, completed, expired, cancelled; late-evidence transition audited |
| Verification | pending, verified, exception; method/reason/policy/verified_at |
| Payment | unpaid, partially_paid, paid, partially_refunded, refunded; allocations/refunds থেকে derived |
| Receipt | received, parsed, matched, unmatched, ambiguous, duplicate, invalid, reversed |
| Refund | requested, approved, processing, completed, failed, unknown, cancelled |
| Settlement | not_applicable, pending, settled, mismatch |
| Webhook delivery | queued, delivering, succeeded, retrying, exhausted |

Verified advance মানে invoice full paid নয়। Paid মানে settled নয়। Device offline মানে failed payment নয়। Refund requested মানে ফেরত complete নয়। Financial history cancel/expire-এ delete নয়। Refund explicit human-authorized action, normal verification approval নয়। Native refund API unavailable হলে audited assisted workflow + independent completion evidence; শুধু Completed dropdown নয়।

Official adapters native callback authentication/validation + server query, merchant/reference/amount/currency check করবে। Browser success proof নয়। SSLCOMMERZ IPN route নিজের contract অনুসারে; অন্য provider-এর auth একই assumed নয়। [SSLCOMMERZ integration](https://developer.sslcommerz.com/doc/v4/)

## ৭. Native Kotlin receipt collector (same Android app) — phase 1

| Screen | Contents/actions |
|---|---|
| Welcome/consent | কেন/কোন account-এর relevant payment evidence; unrelated SMS/OTP নয়; BN/EN/theme |
| Pair | Web Devices থেকে short-lived one-use QR/code; local Keystore key; explicit business/environment/account confirmation |
| Permissions | Supported SMS/notification path, granted/denied/revoked status, settings deep link, troubleshooting |
| Sources | Receiving method/account, SIM/package allowlist binding, source validation receipt result |
| Health | Heartbeat/last sync, backlog, version, permission/network/battery status; Sync now/diagnostics |
| Receipt log | Relevant entries + sync/parse/match result, masked data; personal SMS inbox নয় |
| Account | Sign out/disconnect/revoke, queue/retention explanation |

Encrypted queue survives reboot/crash; event ID before sending; replay renews transport signature/time while original receipt time preserved। ACK = durable storage, processing result later। Force-stop/OS gaps measured; missing historical notification recovery guaranteed নয়। Reinstall/key revocation/account remap/dual-SIM tests required।

NotificationListenerService এবং restricted SMS permission পৃথক capability/review gate। Financial SMS eligibility declaration/review সাপেক্ষ; real devices-এ available fields ও capture route test করতে হবে। Sideload capability guarantee নয়। [Android API](https://developer.android.com/reference/android/service/notification/NotificationListenerService), [Play SMS policy](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en)

## ৮. Operations ও measurable targets

Acceptance workload: 25 workspaces; 50 ingress events/sec 15 minutes; 200/sec burst 60 seconds; simulated providers + real PostgreSQL/worker। Target non-provider API p95 <500ms; durable ACK p95 <1s; healthy worker ingress-to-verification p95 <5s। Phone/provider arrival delay separately measured। Targets, existing capacity proof নয়।

Proposed recovery: RPO ≤5 minutes, RTO ≤60 minutes; quote/PITR + isolated timed restore ছাড়া SLA নয়। Restore-এর পরে receipt/payment/webhook reconciliation before traffic reopen; blind provider refund replay নয়। Alerts: failed ingress, matching backlog age, offline devices, exhausted webhooks, provider unknown outcome, DB/worker health।

Relevant raw receipt default maximum 30 days proposal; diagnostic logs 14 days। Financial/audit retention business requirements দিয়ে release gate-এ documented হবে। DB/storage/jobs/mobile caches/backups export/deletion registry-তে। Undefined retention বা signing-key recovery missing হলে production gate incomplete।

## ৯. References

[Paymently](research/PAYMENTLY-BROWSER-AUDIT.bn.md), [ZiniPay](research/ZINIPAY-DASHBOARD-REFERENCE.md) grouped operations UI reference। [PipraPay diagnosis](research/PIPRAPAY-CORE-DIAGNOSIS.bn.md) independent reliability design input; upstream code vendored নয়। Competitor TrxID/manual Approved/amount-only workflow আমাদের contract নয়। Browser audit live payment evidence নয়।

## ১০. Payment source capability matrix to freeze in G0

নিচেরগুলো implementation targets, approved/connected provider claims নয়। Each account record declares provider, connection type, transfer types, available fields, callback authentication, query/dedup/refund/settlement support, quotas and actual tested evidence.

| Method/provider | Target route | Needed evidence |
|---|---|---|
| bKash | Phone receipt matching; approved merchant API adapter where available | Real full payer/time/amount/account-source/direction; account use terms; native docs/sandbox before API claims |
| Nagad | Phone receipt matching; official account-specific API capability where available | Real required fields/source binding; native access/callback/query/refund matrix, no invented personal TrxID lookup |
| Rocket | Phone receipt matching; account-specific official capability where available | Same real samples/account binding/transfer-type matrix; permission/access dependency explicit |
| SSLCOMMERZ | Approved merchant session/IPN/validation/query/refund adapter | Own native sandbox/live amount/currency/account validation; unknown callback/query/refund outcomes |
| AamarPay | Approved merchant native adapter | Supplied current account API/auth/sandbox/query/refund documentation + actual smoke evidence |
| Bank | Supported trusted statement/import reconciliation | Schema/line identity/account/time/direction/currency, audit/dedup; not presented as phone/provider-API proof without that capability |

Adapter interface separates create session, authenticate callback, normalize event, query transaction, refund/query refund and reconcile statement. Unsupported operation returns explicit capability-unavailable; no generic fake success implementation. Provider fee/currency/refund behavior stays provider-specific. Phone engine can run while native API access work is blocked.
