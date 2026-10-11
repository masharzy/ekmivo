# PG05 — standalone payment intent, hosted checkout and payer lock

**Source branch:** `pg05-checkout-payer-lock-20261011`  
**Review:** [PR #7](https://github.com/masharzy/ekmivo/pull/7), depends on the *unmerged* PG04 staging branch.  
**Classification:** SOURCE IMPLEMENTED; integration/CI and owner browser acceptance pending. **NOT** a live-money release.

## Implemented in source
- Independent PG04 sandbox/live databases preserved. PG05 migration `0010_pg05_checkout.sql` applies **only by explicit** `PG05_ALLOW_MIGRATION=true` on each separately provisioned financial realm, after PG04 migration. No finance migration applied to production here.
- Real server-side standalone sandbox BDT request creation with actor/key `payments:write` authorization, tenant+environment binding, 5–60 minute expiry, reference+minor units, **idempotency key**, immutable amount/terms. Read and append-only cancel operations scoped to `payments:read` / `payments:write`.
- High-entropy signed opaque checkout capability (HMAC of workspace, realm, idempotency key with an independent >=32-byte secret); only digest stored at rest. Does not put API key in browser.
- Public capability-only checkout view with **finance-server-time expiry**, payer confirmation (Bangla digit normalization, actual full +880 mobile number), locked method/receiving identity/amount/window and blocking of competing active attempts. A suspended tenant cannot view checkout or lock an additional payer. Actual payer is stored only via keyed digest + 4-digit suffix; no client payment proof fields.
- Append-only cancellation, derived expiry, original attempt retained, cancellation-aware overlap retry. Completed only when verified financial allocations exist (future PG07), **never** on redirect/refresh/customer assertion.
- Real merchant request list/create/cancel/share UI and public hosted checkout with EN/BN, Ink & Bone light/dark/system via shared locale layout, mobile 320px through desktop, simulated sandbox destination, expiry timer, polling/refetch fallback, copy/status, accessible labels and service-unavailable/no-record explanations. Dashboard draft save/discard/stay registration.
- Go routes under `/v1/workspaces/{workspaceID}/payment-intents` and `/v1/public/checkout/{token}`; Next same-origin authenticated merchant proxy and public capability proxy. Live checkout creation explicitly unavailable. API contract in `contracts/openapi.yaml`.

## Isolated automated evidence and gates

**Only record PASS after observing the exact PG05 head SHA and green workflow.**

- [ ] Go compile and unit suite: `go test ./...`; Bengali payer normalization, token isolation, client-forged linked amount reject.
- [ ] Next.js `npm run lint`, `npx tsc --noEmit`, production build.
- [ ] OpenAPI `npm run ...` or `node scripts/openapi-check.mjs`: strict schema parser.
- [ ] CI `apps/web/scripts/pg04-financial-smoke.mjs` provisions physical sandbox/live PostgreSQL 17 and PG05 schema via explicit migration; repeated migration, restricted finance reader, request idempotency, full payer+route lock, collision, cancellation/history+retry, opaque invalid token and no-scope list denial.
- [ ] Real HTTP tests using local Go API + separate restricted control and finance sessions, owner/editor/viewer vs scoped merchant keys, environment mismatch, CSRF, POST replay, 503 fail-closed, concurrent payer locks.
- [ ] End-to-end Playwright/Chrome on real responsive widths, locale+theme toggles, reload/cancel/expiry state, autofill, focus/contrast, copy and share deep links.
- [ ] Browser script and physical customer SMS/provider/device verification intentionally **not** claimed, since PG06/PG07 and PG12 are not implemented.

## Release blockers / honest limitations
1. PG04 staging base has not been merged into `main` or safely provisioned in production; real database, service roles, key material and deployment preflight must be arranged separately. No production DDL without explicit authorization.
2. Live receiving accounts/device/provider adapters not onboarded; `live` returns unavailable, and sandbox shows **SIMULATED — DO NOT SEND MONEY**. No actual payer should transfer funds during PG05 sandbox tests.
3. **Linked order/invoice intent amount** requires authoritative server-side order/invoice snapshot APIs/tables that are not present. For now those inputs are explicitly rejected, never accepted with a caller-supplied total. Finish linkage when source-of-truth entity exists, then test correction/versioning/idempotent snapshot.
4. Provider receipt ingest (PG06), unique five-field matching (PG07), live confirmation/webhooks/receipts (PG08) are subsequent release gates. Sandbox pending does NOT imply a paid or settled payment.
5. URL path is a scoped bearer capability. Referrer policy disables referrer leakage; complete CDN/WAF log scrubbing, hosting security checks, broad rate limiting and full public route production tests before launch.

Owner's one-time combined manual checks live in `docs/MANUAL-VERIFICATION.md` under PG05; no separate test session requested.
