# PG05 — standalone/linked payment intent, hosted checkout and payer lock

**Source branch:** `pg05-checkout-payer-lock-20261011`  
**Review:** [PR #7](https://github.com/masharzy/ekmivo/pull/7), depends on the *unmerged* PG04 staging branch.  
**Classification:** SANDBOX SOURCE UNDER FINAL CI — standalone + in-app issued order/invoice source and linked intent implemented. Latest extended run pending; owner browser acceptance and production provisioning pending. **NOT** a live-money release.

## Implemented in source
- Independent PG04 sandbox/live databases preserved. PG05 migrations `0010_pg05_checkout.sql` **and additive `0011_pg05_linked_sources.sql`** run **only with explicit** `PG05_ALLOW_MIGRATION=true`, `PG05_FINANCIAL_MIGRATION_FILE` and `PG05_LINKED_MIGRATION_FILE` on each separately provisioned financial realm, after PG04. A previously installed 0010 still receives 0011. No finance migration applied to production here.
- Minimal **authoritative in-app order/invoice source**: `0011_pg05_linked_sources.sql` creates tenant/environment-bound immutable issued documents with 1–20 validated line items. Merchant authors unit prices and quantities under `payments:write`; PostgreSQL calculates the total, caps overflow and freezes the original document. Replayed identical document reference returns the same source; same reference with changed lines conflicts. This is a real in-app source snapshot, **not** an unimplemented external catalog/OMS or the full PG10 invoice lifecycle.
- **Linked payment intent** accepts exactly one valid `order_id` or `invoice_id` with **no amount submitted by the client**. The SQL issuance function fetches the server-frozen amount in the same tenant/realm, binds it immutably to the intent, rejects missing/mismatched sources, preserves idempotency and serializes one active full-amount intent per source. A cancelled or expired source's old intent stays append-only, and a fresh distinct request can use it. Merchant list shows linkage provenance.
- Real server-side standalone sandbox BDT request creation with actor/key `payments:write` authorization, tenant+environment binding, 5–60 minute expiry, reference+minor units, **idempotency key**, immutable amount/terms. Read and append-only cancel operations scoped to `payments:read` / `payments:write`.
- High-entropy signed opaque checkout capability (HMAC of workspace, realm, idempotency key with an independent >=32-byte secret); only digest stored at rest. Does not put API key in browser.
- Public capability-only checkout view with **finance-server-time expiry**, payer confirmation (Bangla digit normalization, actual full +880 mobile number), locked method/receiving identity/amount/window and blocking of competing active attempts. A suspended tenant cannot view checkout or lock an additional payer. Actual payer is stored only via keyed digest + 4-digit suffix; no client payment proof fields.
- Append-only cancellation, derived expiry, original attempt retained, cancellation-aware overlap retry. Completed only when verified financial allocations exist (future PG07), **never** on redirect/refresh/customer assertion.
- Real merchant request list/create/cancel/share UI, multi-line source issuance and linked source selection, and public hosted checkout with EN/BN, Ink & Bone light/dark/system via shared locale layout, mobile 320px through desktop, simulated sandbox destination, expiry timer, polling/refetch fallback, copy/status, accessible labels and service-unavailable/no-record explanations. Dashboard draft save/discard/stay registration.
- Go routes under `/v1/workspaces/{workspaceID}/payment-intents` and `/v1/public/checkout/{token}`; Next same-origin authenticated merchant proxy and public capability proxy. Live checkout creation explicitly unavailable. API contract in `contracts/openapi.yaml`.

## Isolated automated evidence and gates

**Only record PASS after observing the exact PG05 head SHA and green workflow.**

- [x] Go compile and unit suite: `go test ./...`; Bengali payer normalization, token isolation, forged linked amount rejected. 
- [ ] Latest extended CI: actual restricted Go HTTP process with public opaque token, payer lock, cross-origin POST refusal, unauthorized merchant/source list denial, invalid token and live fail-closed. Code committed; this checkbox is only checked after a green run.
- [x] Next.js `npm run lint`, `npx tsc --noEmit`, production build.
- [x] OpenAPI `node scripts/openapi-check.mjs`: strict schema parser (dedicated GitHub Actions gate).
- [x] Pre-extension CI `apps/web/scripts/pg04-financial-smoke.mjs` provisions physical sandbox/live PostgreSQL 17 and PG05 schema via explicit migration; repeated migration, restricted finance reader, request idempotency, full payer+route lock, collision, cancellation/history+retry, opaque invalid token and no-scope list denial. Includes server-time and suspension regressions and PG04 killed-worker River recovery.
- [ ] Latest CI extension: 0011 schema rerun; server-computed 30,000-paisa invoice from line items; document idempotent replay and changed-line rejection; linked amount, source provenance, conflicting second active intent denial, missing source, restricted SQL scope, Postgres immutability, plus real HTTP path.
- [ ] Real owner/editor/viewer HTTP authorization and browser-key vs session matrix, concurrent payer lock with remote clients, public traffic rate limiting. Local Go HTTP subset now present in CI; completed job result awaited.
- [ ] End-to-end Playwright/Chrome on real responsive widths, locale+theme toggles, reload/cancel/expiry state, autofill, focus/contrast, copy and share deep links.
- [ ] Browser script and physical customer SMS/provider/device verification intentionally **not** claimed, since PG06/PG07 and PG12 are not implemented.

**Previously verified standalone baseline CI evidence:** [Actions run 38142901441](https://github.com/masharzy/ekmivo/actions/runs/38142901441) — all **three jobs PASS**; Go unit + HTTP smoke, native Kotlin/Compose assemble + unit, strict OpenAPI schema/ref parsing, Next.js lint/TypeScript/production build and independent PostgreSQL 17 PG00–PG05 smoke, including killed-worker River recovery, payer/route lock, idempotency and suspended-workspace rejection. No real-browser, real-provider or production payment success claimed.

## Release blockers / honest limitations
1. PG04 staging base has not been merged into `main` or safely provisioned in production; real database, service roles, key material and deployment preflight must be arranged separately. No production DDL without explicit authorization.
2. Live receiving accounts/device/provider adapters not onboarded; `live` returns unavailable, and sandbox shows **SIMULATED — DO NOT SEND MONEY**. No actual payer should transfer funds during PG05 sandbox tests.
3. **Linked in-app order/invoice source** now exists for immutable sandbox snapshots; full invoice lifecycle, customer/contact, tax/shipping/discount rules, refunds, fulfillment, imports and externally synchronized OMS/catalog are **PG10/phase 3**, not falsely marketed as part of this PG05 minimal source. Linked intent amount is never client controlled.
4. Provider receipt ingest (PG06), unique five-field matching (PG07), live confirmation/webhooks/receipts (PG08) are subsequent release gates. Sandbox pending does NOT imply a paid or settled payment.
5. URL path is a scoped bearer capability. Referrer policy disables referrer leakage; complete CDN/WAF log scrubbing, hosting security checks, broad rate limiting and full public route production tests before launch.

Owner's one-time combined manual checks live in `docs/MANUAL-VERIFICATION.md` under PG05; no separate test session requested.
