# Simple payment API and developer documentation — 2026-10-15

Branch: `codex/simple-payment-api-docs-20261015` (from 5c6b662).

## Source changes
- POST /v1/payment-intents accepts `amount` (BDT) and required `redirect_url` in the simple integration form. JSON decimal is parsed without float arithmetic; internal finance functions retain integer `amount_minor`. `reference`, currency and expiry have defaults.
- Existing `amount_minor`, `merchant_reference`, order_id/invoice_id and idempotency requests remain accepted. If `Idempotency-Key` is omitted, a fresh random key is generated; safe merchant retries should supply a stable key.
- Request may include `cancel_url`, `customer_name`, `customer_email`, `customer_phone`, `metadata`, and `webhook_url`. HTTPS URLs are validated and `webhook_url` must exactly match an active registered endpoint in that workspace/realm. The pg62 BEFORE INSERT delivery routing trigger selects that endpoint for this intent; when not specified, normal active-endpoint broadcast remains. Existing signed event delivery and retries handle notifications; arbitrary URLs are never sent unsigned.
- Additive finance migration 0062 stores merchant-only options scoped to an immutable intent. Public checkout response exposes only return/cancel navigation URLs, not customer PII or merchant metadata. Cancellation screen has Return to merchant.
- Rebuilt /developers with readable tables, simple-language EN/BN, six server-language examples, API key setup, verification, signed webhook flow and real per-key Sandbox test. Updated YAML + downloadable OpenAPI JSON.
- Existing GET status, automatic provider receipt verification, checkout status and signed endpoint-worker delivery are retained. Redirect is navigation only, never evidence of payment.

## Checks / limitations
- GitHub remote source inspected and patch/diff anchors reviewed. **No Go tests, TypeScript compiler, SQL migration execution, browser end-to-end, signed webhook delivery, Android/device, Live money or production deployment were run in this tool session.** Do not treat code commit as passing verification.
- Migration 0062 must be applied to **both** isolated sandbox and live finance databases using the normal guarded migration process **before** a Go API deployment using this code. Do not run the new API against unmigrated databases.
- Per-payment `webhook_url` requires an active registered endpoint and routes intent-related events to its endpoint ID through the pg62 delivery filter. No URL means existing active-endpoint broadcast. This is not an arbitrary URL sender; it reuses existing signing/retry. Verify all event types and retries in an actual DB before release.
- Consumer must verify webhook timestamp, signature, durable event deduplication and current server status before fulfilment.

## Required tests
1. `cd backend && go test ./...`; `go vet ./...`.
2. `cd apps/web && npx tsc --noEmit`; targeted lint / build; run `npm run payment:contract-check` and inspect generator drift.
3. Parse and apply 0062 in isolated test sandbox/live finance DBs; verify guarded grants, SELECT visibility and rollback.
4. Authenticated Sandbox key create POST with exactly `amount:150, redirect_url:HTTPS`; verify 201 + checkout_url; GET status; public checkout response includes return_url; cancelled public checkout includes cancel_url.
5. Test 150.50 -> 15050 paisa, 0.01, rejected negatives/third decimals/float exponent, optional customer data/metadata privacy, invalid/private URLs, wrong-tenant/wrong-realm keys and webhook endpoint membership.
6. Confirm old `amount_minor` requests and linked invoice/order flows still work; retry idempotency unchanged request returns one intent; changed request returns conflict.
7. Verify signed event retries + configured endpoint handling and no forged paid via redirect.
8. EN/BN Light/Dark 320/768/1024/desktop docs, code copy and Sandbox form.
