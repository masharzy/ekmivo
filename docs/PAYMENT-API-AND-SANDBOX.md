> **Owner pricing decision — 2026-10-16:** Payment gateway subscriptions belong to a workspace. Unlimited websites, apps and bots share one successful-payment allowance across all API keys; domain matching is not licensing. Reserve on new Live checkout, consume once on verified completion, release unpaid cancellation/expiry. Exhaustion/expiry restricts new checkout creation only; accepted verification, receipt forwarding, refunds and webhook retries continue. Admin configures versioned Free (finite or always free), Paid and Custom plans, feature/resource limits and audited grants. AI remains separate prepaid billing. Earlier limits-OFF wording is historical: production activation requires reviewed 0067/0068 plus matching runtime rollout. No production activation or real subscription purchase is claimed. [Implementation and evidence](evidence/MANAGED-PLANS-20261016/README.md).

# Payment API, sandbox and developer documentation specification

> Latest owner correction — 2026-10-12: PG10–PG17 implementation is authorized now; combined release verification follows after source completion. Refund requests carry customer/contact/payment information to the seller. The seller returns money outside the platform; there is no automatic native refund execution. Seller-reported returned remains distinct from independently verified completion. Default bKash/Nagad/Rocket phone verification requires no additional official provider API or gateway approval. Additional receiving/source connections are merchant-configured; SMS sender/app identity is distinct from the actual payer number. Optional native API connections require their own real contract and merchant credentials, and are not prerequisites for the default phone path. Older conflicting refund/native-adapter requirements below are superseded by this correction. No feature or live acceptance is inferred from this note.

2026-10-11 · **Proposed contract, not deployed endpoints.** Current [OpenAPI](../contracts/openapi.yaml) documents health only. This file defines what the agent must implement, generate and test before phase 1 can be marked complete. Architecture: [payment design](PAYMENT-SYSTEM-DESIGN.bn.md); sequence: [backlog](IMPLEMENTATION-BACKLOG.md).

## Briofold simple payment API: what the code does today (read this first)

Source of truth: `backend/cmd/api/main.go`, `backend/internal/checkout/simple_payment.go`, `backend/internal/merchantwebhook/delivery.go`. Routes below are registered in code and unit-tested; a deployed environment must still be checked with a sandbox payment before anyone relies on them. The long sections that follow describe the wider design.

| Step | Call | Notes |
|---|---|---|
| Create | `POST /v1/payment/create` (same body as `POST /v1/payment-intents`) | `Authorization: Bearer <key>`. Send `amount` in BDT, `reference`, `redirect_url`, `cancel_url`, `webhook_url`, `customer_email`, `expires_in_minutes` (5-60). Send `Idempotency-Key` (16-128 chars). Returns `invoice_id`, `payment_url`, `checkout_url`, `checkout_token`, `status` (`PENDING`...). `invoice_id` is the payment request id. |
| Verify | `POST /v1/payment/verify` with `{"invoice_id": "<uuid>"}` | Returns `status` = `COMPLETED`, `PENDING`, `CANCELLED`, `EXPIRED`, `FAILED` or `REFUNDED`, plus `amount_minor`, `currency`, `reference`. Check all of them against your own order before fulfilling. |
| Read | `GET /v1/payment-intents/{intentID}` | Key-scoped: workspace and environment come from the key, so no `workspaceID` or `environment` parameter. Returns `{data:{state,...}}`; `state` is `completed` when paid. |

- **Checkout link.** `checkout_url` is `<GO_PUBLIC_WEB_ORIGIN>/checkout/<token>`. The API host must set `GO_PUBLIC_WEB_ORIGIN` (HTTPS origin, no path). If unset it defaults to `https://briofold.tech`. There is no locale segment.
- **Webhook headers.** Deliveries send `X-Briofold-Timestamp`, `-Event-ID`, `-Delivery-ID`, `-Key-ID`, `-Signature` and, with identical values, the older `X-Ekmivo-*` names. New receivers should read `X-Briofold-*` and may fall back to `X-Ekmivo-*`. Device-ingress headers (`X-Ekmivo-Device-ID` and friends) are a separate protocol and are unchanged.
- **Webhook body for `payment.verified`.** `data` holds `payment_id`, `payment_intent_id` (equals the `invoice_id` returned by create), `merchant_reference` (your `reference`), `amount_minor`, `currency`, `verification_status`, `verification_method`, `verified_at`. There is no top-level `invoice_id`. Treat the event as a signal, then call verify or read before fulfilling.
- **Which secret signs a per-payment `webhook_url`.** The automatic signing secret of the workspace and environment that owns the API key. It is the same for every payment in that workspace and environment, and the dashboard shows it under API Keys. A secret registered on a dashboard webhook endpoint signs deliveries to that endpoint only. Sandbox and live secrets differ.
- **Signature.** `v1=` + hex(HMAC-SHA256(secret, timestamp + "." + raw body)). Reject timestamps more than 300 seconds old. Key id is the first 8 bytes of SHA-256(secret), hex.

## 1. Boundary and conventions

One versioned Go API; merchant API uses /v1, locale-independent stable codes. Deployed base URL comes from environment config and developer dashboard; examples below use a placeholder, not a working Briofold domain.

| Concern | Required contract |
|---|---|
| Merchant authentication | Authorization: Bearer with hashed scoped key; key binds workspace + sandbox/live. No browser-exposed merchant key. |
| Key format | ek_test_<publicId>_<secret> / ek_live_<publicId>_<secret>; strong random secret, hash-only DB, displayed once, constant-time check, revocation/expiry. Prefix alone does not decide authorization. |
| Key scopes | payments:read, payments:write, customers:read/write, invoices:read/write, refunds:read/write, webhooks:manage; documented least-privilege examples. Device enrollment/privileged account changes use authenticated user capability, not general merchant key. |
| Session API | Current user membership/capability + authenticated web proxy or mobile token. Session, merchant key, public checkout capability and device routes are separate authorization schemes. |
| Idempotency | Required for payment/invoice/refund creation and external-effect commands. Scope workspace + environment + operation + key; request hash mismatch 409. Concurrent replay returns original outcome/pending status, not duplicate mutation. Retain at least 30 days initially; document expiration behavior. |
| Money | Positive integer amount_minor, currency code; BDT 500 = 50000 paisa. Reject floats/overflow/unsupported currency. Exact decimal provider parsing. |
| Time | ISO 8601 UTC on wire, explicit expiry and source precision/timezone; UI workspace timezone. |
| Pagination | Cursor + limit default 25/max 100; deterministic sort, environment/tenant scoping, next_cursor. Export async for larger datasets. |
| Errors | error.code, safe message, correlation_id, field_errors where relevant; stable retryable flag. No SQL/raw provider credential/stack. |
| Codes | 400 malformed; 401 invalid credential; 403 capability; 404 unavailable scoped resource; 409 idempotency/state/collision; 422 validation; 429 quota with Retry-After; 503 dependency unavailable. |
| Rate limit | Per key/workspace/environment, separate checkout/device/ingress budgets; safe 429/retry; initial quotas measured and published at release. |
| Versioning | OpenAPI 3.1 source, typed Go/TS generation, event schema version. Backward-compatible additions; breaking path/event version with migration guide. |

OpenAPI contains complete request/response/error schemas, security schemes, operation IDs, idempotency headers, enums, decimal/phone rules, cursor and examples. CI validates schema, generated-client drift and real API conformance. No authoritative business rule duplicated in Next.js.

## 2. Endpoint inventory to implement

All paths here are proposed. Resource detail/list authorization must be tested using other tenants and the wrong environment.

| Group | Routes | Required behavior |
|---|---|---|
| Requests | POST/GET /v1/payment-intents; GET /v1/payment-intents/{id}; POST /v1/payment-intents/{id}/cancel | Standalone and linked intent; immutable issued terms; server amounts; scoped current status/reasons; no customer TrxID field. |
| Payments | GET /v1/payments; GET /v1/payments/{id} | Verified fields/provenance, gross/allocations/refundable/settlement distinct, no arbitrary mark-paid command. |
| Links | POST/GET /v1/payment-links; GET/PATCH /v1/payment-links/{id}; POST publish/archive commands | Versioned fixed-price template; server price; separate visitor intent; safe custom fields. |
| Invoices | POST/GET /v1/invoices; GET/PATCH /v1/invoices/{id}; POST issue/cancel/send commands | Draft versus issued snapshot; server totals; payments derive paid status; safe idempotent send. |
| Customers | POST/GET /v1/customers; GET/PATCH /v1/customers/{id}; POST import-preview/import commands | Scoped identity/contact; validation/dedup/import audit; no contact-to-payer substitution. |
| Refunds | POST/GET /v1/refunds; GET /v1/refunds/{id}; session-only authorize/cancel commands | Key scope may request refund; execution requires configured authorization policy. Concurrent refundable cap; unknown provider outcome query first. |
| Receiving | Session /v1/receiving-accounts + detail/test/disable/rotate | Provider-specific config and account proof/source binding. Secrets not returned in ordinary GET. |
| Devices | Session POST /v1/device-enrollments; GET /v1/devices; revoke/detail; device claim endpoint | Short-lived one-use pairing; explicit tenant/account/env; public key registered; secure revocation. |
| Device ingress | POST /v1/device-events; POST /v1/device-heartbeats | Signed envelope, durable dedup, enrollment mapping, server parser. Never trusts tenant/verified provided in body. |
| Receipts | Session GET /v1/receipts + detail; scoped reprocess command | Evidence/candidates/reasons; extra authorization for full raw receipt; audited parser replay. |
| Reconciliation | Session /v1/reconciliation-cases, statement preview/import, provider query commands | Separate unmatched payment versus settlement; safe correction/proof lifecycle. |
| API keys | Session create/list/rotate/revoke | Once-visible secret, scope/expiry/last use and audit; no raw secret list. |
| Webhooks | /v1/webhook-endpoints + detail/config; /v1/webhook-deliveries; replay command | Permission/scope/environment, signing secret/rotation, SSRF guard, durable delivery logs. |
| Provider ingress | POST /webhooks/payments/{connection} | Provider-native auth + validation/query; connection mapping, fast durable receipt. Forged browser return not proof. |
| Live UI | GET /v1/events | User-scoped SSE with sequence/resume; stale cursor signals full refetch. No cross-tenant/env events. |
| Reports/exports | Session /v1/reports/{report}; POST /v1/exports; GET export status/download capability | Defined metrics, permission-scoped query; private signed export, retention and spreadsheet formula-injection handling. |
| Shared operational API | Session onboarding/team/settings/notifications/billing/security routes | Actual authorized mutations, business subscription independent of AI; no fake save buttons. |
| Sandbox tools | /v1/sandbox/scenarios and scenario-run commands | Sandbox-only identity/database routing; not available in production deployment. |

Public checkout namespace /public/v1/checkout-sessions/{token}: GET summary/status; POST attempt creation; GET receipt/events. High-entropy capability binds one workspace/environment/intent with expiry, limits and no privileged records. Backend may use equivalent session IDs plus token header internally; concrete representation frozen in PG04 OpenAPI. No merchant secret on public page.

## 3. Payment request example

Design example, to become an executable quickstart after the Go routes exist:

~~~json
{
  "amount_minor": 50000,
  "currency": "BDT",
  "merchant_reference": "order-1042-advance",
  "expected_sender_number": "+8801XXXXXXXXX",
  "allowed_receiving_account_ids": ["<account_uuid>"],
  "expires_in_seconds": 900,
  "return_url": "https://merchant.example/checkout/result",
  "metadata": {"order_reference": "1042"}
}
~~~

Placeholder phone must be replaced by documented sandbox fixture or actual expected payer. API-supplied payer optional until hosted checkout; route selection + payer lock creates immutable attempt. Default 15-minute window, configurable 5–60 minutes initial product policy, subject to provider timing tests; explicit expiry persisted. Merchant return domain pre-registered. Order/invoice-linked amount derived from server record, never client-tampered.

Response: intent id, environment, lifecycle/verification status, amount_minor/currency, expiry, opaque checkout_url, merchant_reference, attempt if issued, verification method/verified_at if available. GET additionally returns allocations and last safe reason. No database/provider credential or raw sensitive receipt.

The quickstart must demonstrate create → hosted checkout → receive signed event → query current status → idempotent fulfilment. Success return URL is only navigation. Merchant fulfils from verified server state, correct reference/amount and event identity.

## 4. Signed outbound webhook contract

Events initially: payment.verified, payment.exception, payment.expired, payment.reversed, refund.updated, invoice.paid. Event schema version 1; subscription to explicit supported event list.

~~~json
{
  "id": "<event_uuid>",
  "type": "payment.verified",
  "schema_version": 1,
  "environment": "sandbox",
  "workspace_id": "<workspace_uuid>",
  "occurred_at": "<UTC timestamp>",
  "delivery_id": "<delivery_uuid>",
  "data": {
    "payment_intent_id": "<intent_uuid>",
    "payment_id": "<payment_uuid>",
    "merchant_reference": "order-1042-advance",
    "amount_minor": 50000,
    "currency": "BDT",
    "verification_status": "verified",
    "verification_method": "sms_match",
    "verified_at": "<UTC timestamp>",
    "resource_version": 3
  }
}
~~~

Headers: X-Briofold-Event-Id, X-Briofold-Delivery-Id, X-Briofold-Timestamp, X-Briofold-Key-Id, X-Briofold-Signature (the same values are also sent as X-Ekmivo-* for older receivers). Signature **v1=hex(HMAC-SHA256(secret, timestamp + "." + raw_body_bytes))**. Header IDs must agree with signed payload. JSON reserialize before signature validation is invalid.

Consumer: read raw bytes → verify known signing key, signature with constant-time equal and timestamp within ±300 seconds → validate environment/schema/IDs → durably dedup event id → atomic own mutation → quick 2xx. Out-of-order resource_version doesn't undo later state; query current resource if needed. In-memory duplicate cache alone not correctness.

Stable event ID across retries; each dispatch fresh delivery ID/timestamp/signature. Exactly-once network delivery not promised. Retry 1m, 5m, 15m, 1h, 3h, 6h, 12h with bounded jitter, then exhausted/alert; 2xx success, 408/429/5xx/network retry, most other 4xx action required, redirects disallowed. Receiver may return 409 for its own transient lock only if documented; default no infinite retry. Manual replay creates a fresh delivery for the same event.

Secret rotation: pending next key shown once; receiver confirms readiness/test; overlap 24h target with explicit activation/retirement; emergency revoke old key immediately. Audit every change/replay. Sandbox secrets never accepted for live event.

Endpoint HTTPS only; validate DNS/IP at save and connect, block private/loopback/link-local/metadata/mapped IPv6, pin validated resolution, no automatic redirect, timeout/body-size caps. Redact request/response logs and cap retention. Controlled local test receiver outside production configuration.

## 5. Device signed evidence contract

Pair claim returns bound enrollment ID; private P-256 key remains Android Keystore, public key registered. No source-embedded shared signing secret. Signed envelope has event_id, enrollment_id, key_id, transport_sent_at, sequence, source type/package/SMS sender label, original transaction evidence/time precision, observed_at, account-source binding and parser-hint version. Parser hint not trusted financial fields.

Signing design: ECDSA P-256 SHA-256 over method + path + transport timestamp + event ID + SHA-256(raw body), newline-delimited UTF-8; DER signature Base64. Exact byte-level fixtures specified in OpenAPI/device contract; Kotlin and Go cross-language positive/tamper tests required.

Transport timestamp freshness ±300 seconds; offline queue signs again at send time with preserved event ID/original source time. Durable event ID/sequence dedup; server enrollment determines tenant/env. Reply accepted = stored, not verified payment. ACK replay returns same receipt/event handle. Key rotation/revocation, reordered events, packet modification, different account/env and nonce/event replay tests required.

Raw approved payment evidence cannot carry arbitrary caller paid status. Sensitive unrelated SMS/OTP filtered on device before submission; incomplete payment evidence safe exception. Signature is device provenance, not financial-provider authenticity.

## 6. Sandbox operation

Sandbox is a durable real test environment, not a landing-page illustration. Real schema/auth/API/worker/webhook code with separate credentials/data; only payment source/provider side simulated. No actual receiving account numbers or money instruction.

Developer flow: switch Sandbox → create scoped test key → create test request → open sandbox checkout → use approved fixture payer/method → run a named scenario → observe matched/exceptions/live status → inspect webhook receiver logs → GET status → replay same request/event → validate one outcome.

| Scenario group | Supported cases |
|---|---|
| Valid | exact unique match, exact advance, several verified intents against same invoice |
| Matching failures | wrong full payer, SMS sender-label confusion, amount/method/account/currency mismatch, masked payer, missing time, outgoing receipt |
| Time | before window, after window, in-window late sync, minute precision boundary, future/clock drift, old evidence after new attempt |
| Dedup/race | same transport retry, SMS+notification same receipt, later API observation, simultaneous workers, overlapping request collision |
| Device/source | offline/reboot/revoked key/permission loss, dual-SIM ambiguous account, parser revision |
| Provider | callback lost, query pending, success, reversal, native refund failure/unknown |
| Delivery | endpoint timeout/429/500, bad signature, replay, out-of-order event, exhausted retry, secret rotation |
| Finance | under/over amount exception, split/advance allocations, cancelled request receiving funds, concurrent refund cap |
| Boundaries | wrong tenant/key/env, disabled module, expired subscription accepted callback, rate limit/invalid input |

Sandbox simulator available only to sandbox-authorized developer grants; cannot select arbitrary production workspace/event destination. Server does not trust requested environment string with a live key. Reset only sandbox data through scoped audited command; no live cleanup command. Safe reset retains test-run evidence required for release.

Tests tagged **simulation**, **provider sandbox**, **real device**, **live transaction** separately. Passing simulator is not a live bridge/provider claim. Each named provider has documented native sandbox behavior or explicit unavailability; fake adapter not named provider sandbox.

## 7. Developer documentation deliverables

Bilingual docs site planned /{locale}/docs/payments; dashboard Developers links to exact page/context. Public read docs never reveals account keys. Generated API reference may keep machine field names English; surrounding explanation/error guide BN+EN.

| Page/artifact | Required contents and acceptance |
|---|---|
| Start here | What verification means/provenance, sandbox/live distinction, setup/account/device requirements; no PIN/OTP/TrxID entry |
| Quickstart | Working create/checkout/webhook/query example from a clean sandbox account |
| Authentication | Scopes, once-visible token, expiry/revocation/rotation, server-only key storage |
| API reference | Generated from contracts/openapi.yaml, all endpoints/errors/enums/pagination/idempotency |
| Checkout guide | Links/invoices/own website/custom bot, payer number, expiry, return URL limitations |
| Automatic verification | Five fields, source/account mapping, precision/offline/exception reasons, historical evidence |
| Webhooks | Raw-body verifier examples, signature fixtures, version/order/dedup/retries/replay/rotation |
| Sandbox guide | Named scenarios, fixture identities, receiver setup, assertions, reset and production separation |
| Refund/reconciliation | Native/assisted distinction, unknown outcomes, limits, evidence, settlement versus receipt |
| SDK/examples | TypeScript/Node, Go, PHP, Python plus curl; generated client where appropriate, tested raw-body verification |
| Store integration | WooCommerce/Shopify payment capabilities and tested configuration; full sync separately scoped |
| Device guide | Pair/permission/source/battery/offline/revoke, supported tested OS matrix, privacy |
| Troubleshooting | Stable error/reason code → user action; correlation ID; no blind resend-money advice |
| Changelog/versioning | Contract/event releases, upgrade/deprecation policy, backward compatibility |
| Operator docs | Secrets/restore/migration/rollback/provider outage/financial incident/escalation checklist |

SDK examples may be small audited samples initially; do not claim published maintained packages unless actually released. CI runs quickstart and signature examples against sandbox service. PHP/Python examples require installed supported runtime in CI; not just syntax screenshots.

## 8. Test and phase-1 release evidence

Required actual assertions:

- Three-tenant and cross-env negative tests through runtime DB role for HTTP/jobs/SSE/export/receipt/file links.
- Concurrent requests/match workers/refunds, retry/rollback/crash injection: one receipt/payment/allocation/domain event, no accepted-event loss.
- Customer browser faked success never paid; wrong key/account/payer/time/currency never verified; missing required evidence no arbitrary match.
- Healthy unique real-device receipt automatically confirms without routine approval and merchant consumer receives valid signature; replay settles once.
- Distinct real samples/devices for bKash/Nagad/Rocket; dual SIM, background/reboot/offline/permission revoke; original transaction time preserved.
- Native required adapters sandbox/live smoke + lost callback/query/refund where supported; credentials/merchant identity checked.
- Merchant documentation quickstart executed from clean account; API conformance/client generation checks pass.
- UI four theme-locale combinations, mobile/keyboard/draft/back/filter states; all promised buttons real.
- Load/recovery targets from system design measured; timed isolated restore; reconciliation after restore.
- Production paid cohort 7–14 days with real receipts, exception/delivery/latency log, operator response, no unresolved release-blocking financial/auth/isolation defect.

Evidence path per work item: docs/evidence/<ID>/README.md with commit/change, environment, redacted commands/check results, schema/DB assertions, screenshots, real provider/device results, failures/dependencies. Direct account/retention/hosting business decisions documented; sample data or proposed endpoints not marked deployed.

## PG06–PG09 source contract checkpoint (not deployed)
The canonical contracts/openapi.yaml now includes operational and signed-device paths. Merchant signatures follow timestamp + period + exact raw body; key ID is the first eight SHA-256 bytes of the signing secret, hex. Event/delivery IDs agree with the signed envelope. See evidence/PG06-PG09-CODE-CHECKPOINT.md. Only payment.verified currently has a producer; other events/notices retain their lifecycle/channel dependencies. All new contract validation and generated-client compatibility checks are pending.


## Owner dashboard/API refinement — 2026-10-15

The latest owner instruction refines the payment dashboard: Payments replaces Transactions in navigation; Payment Links includes the existing one-time requests flow; SMS Data replaces Incoming Receipts. Workspace Billing, Team and Settings are accessed through the workspace gear, and Help through the header. Developers contains API Keys and external API Docs. Legacy deep links and integrations remain compatible. The operational dashboard uses the semantic payment tokens and an original visual direction documented in `docs/design/ekmivo-dashboard/SKILL.md`.

Create Payment may accept an optional per-payment `webhook_url` without dashboard registration. Reuse signed delivery, retries and tenant isolation; callbacks are notifications and merchants must verify server-side before fulfillment. Existing default registered endpoints remain supported. Additive migrations 0063/0064 (financial) and 0065 (control) are implemented and tested on an isolated Neon branch only; production rollout and end-to-end acceptance remain pending. Do not use Docker: the owner requires Neon for database work. See `docs/evidence/DASHBOARD-REFINEMENT-20261015/README.md` and the consolidated manual ledger.
