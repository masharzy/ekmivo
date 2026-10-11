# PG05 — standalone/linked payment intent, hosted checkout and payer lock

**Source branch:** `pg05-checkout-payer-lock-20261011`  
**Review:** [PR #7](https://github.com/masharzy/ekmivo/pull/7), depends on the *unmerged* PG04 staging branch.  
**Classification:** SANDBOX SOURCE UNDER FINAL CI — standalone + in-app issued order/invoice source and linked intent implemented. Latest extended run pending; owner browser acceptance and production provisioning pending. **NOT** a live-money release.

## Implemented in source
- Independent PG04 sandbox/live databases preserved. PG05 migrations `0010_pg05_checkout.sql`, additive `0011_pg05_linked_sources.sql` **and `0012_pg05_source_integrity.sql`** run **only with explicit** `PG05_ALLOW_MIGRATION=true`, `PG05_FINANCIAL_MIGRATION_FILE` and `PG05_LINKED_MIGRATION_FILE` and `PG05_INTEGRITY_MIGRATION_FILE` on each separately provisioned financial realm, after PG04. A previously installed 0010 still receives 0011. Control-only `0013_pg05_public_business.sql` uses `PG05_CONTROL_MIGRATION_FILE`; it exposes only an active sandbox business name through a narrow definer read, preserving runtime RLS and column grants. No migration was applied to production here.
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

## PG05 continuation — source integrity and real browser verification

Implementation commit: `55d6322` on the existing PR branch. Final CI results are pending at this checkpoint.

- Additive 0012 authorizes the tenant/environment **before** source lookup, revokes access to legacy helper functions and validates linked intent amount/currency at the database boundary. Only an actual immutable issued order/invoice record is linkable; its item quantities and integer unit prices determine the total.
- Merchant GET detail endpoint reads original terms, source lines, masked payer/method/window and append-only created/locked/cancelled history, including records outside the latest-50 list. `?request=<id>` is a shareable authorized detail deep link.
- Public checkout resolves the current enabled business name from the control plane and includes frozen source lines. Public output strips the internal workspace field. Source unavailability remains an error; no placeholder business, fake totals or customer payment proof.
- Public capability and global budgets plus authenticated workspace budgets are bounded in memory and concurrency-tested. 429 includes Retry-After=60; web proxies preserve it. These process-local budgets complement, and do not replace, deployment-level WAF/global quotas.
- Viewer controls are read-only; a forged direct write still fails Go authorization. Unknown mutation outcomes retain the same idempotency key and request fields in a user/workspace/environment-scoped tab draft, allowing a reload/restore retry. Busy fields prevent payload changes while the outcome is pending. Hidden dirty forms remain guarded; Save/Discard update the guard immediately.
- Offline checkout preserves the last server result, marks sync failure and reconnects. Older poll responses cannot undo a newer payer-lock result. Amounts accept Bengali digits; timestamps show Asia/Dhaka explicitly.
- CI now runs real Chromium against **Next.js + the restricted Go API + disposable PostgreSQL**, without mocked financial routes: two-line invoice → linked 6735-paisa request → source/history/share → Bengali payer + Nagad lock → reload → locale/theme/system changes → offline/reconnect → merchant cancel → public cancelled state. Viewer UI and a 16-case 320/768/1024/1440 × EN/BN × light/dark checkout matrix check keyboard, real data, no horizontal overflow and no manual approval button. Results/screenshots are uploaded as `pg05-browser-evidence`.
- Isolated HTTP regressions cover five competing requests for one source (one issuance, four 409s), original lines in detail, invalid title types, unscoped/private helper denial, duplicate environment denial and effective public lock rate limits.

Local evidence observed during this continuation: Go all-package tests and checkout race suite PASS; web lint PASS (existing unused-variable warnings), TypeScript PASS, strict OpenAPI PASS, production build PASS. Final changed-source CI and browser evidence must be recorded below only after observation.

Production provisioning/deployment parity, owner/manual browser acceptance, PG06 receipt capture, PG07 five-field matching, PG08 signed consumer webhooks and full PG10 invoice lifecycle remain OPEN. No real-money, deployed or payment-verified claim is made by these source checks.

### Dependency audit

The local npm audit found five high entries tracing to the same development-only `braces` stack-exhaustion advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Upstream reports no patched release; the proposed eslint downgrade is incompatible with the pinned Next 16 toolchain and is not applied. Lint consumes repository patterns only, not merchant/customer input. Production-only dependency audit is checked separately; this records a remaining tooling advisory, not a zero-vulnerability claim.

### First continuation CI correction

[38146670615](https://github.com/masharzy/ekmivo/actions/runs/38146670615) failed at Go compile (`err :=` redeclared inside payer-lock branch). Additive source migrations passed before the HTTP binary compile. The declaration is corrected; rerun required. This run is not browser or implementation acceptance evidence.

Production-only `npm audit --omit=dev --audit-level=high`: PASS, 0 vulnerabilities observed. Added as a CI gate.

### Public identity runtime correction

[38147144189](https://github.com/masharzy/ekmivo/actions/runs/38147144189): Go/race and Android PASS, HTTP checkout GET failed 503. The restricted control role correctly refused a direct name/product/environment query. Fixed with additive control migration 0013 and a narrowly granted public-business read function, keeping normal tenant RLS and secret/identity grants intact. Startup fails closed if the explicit control upgrade is missing. New regressions cover enabled/disabled control state with stale finance projection, read/write bearer scopes, foreign workspace denial and expired checkout.

### Browser harness and input-boundary correction

CI [38147549215](https://github.com/masharzy/ekmivo/actions/runs/38147549215) passed the source/HTTP checks and Go/Android jobs, but the browser harness bypassed token generation normally run by `predev`; merchant page compilation failed. The harness now explicitly runs the same token sync before Next starts. No browser PASS is inferred from that failed run.

Public countdown uses a server timestamp plus monotonic elapsed time, with a browser device-clock regression. Web proxies bound the actual streamed body before parsing/forwarding and reject duplicate scope parameters. Source issuance permits 16 KiB for the supported 20 Unicode line descriptions; ordinary mutations remain capped at 4 KiB. Concurrent-source tests use distinct merchant references so the source uniqueness constraint is independently exercised.
