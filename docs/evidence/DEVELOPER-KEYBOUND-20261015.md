# Developer docs and key-bound payment API — 2026-10-15

Scope: owner-approved cute developer entrance/docs redesign; server-side API-key-bound payment intents; Sandbox runner; read-only TrxID-assisted verification; Live key plan enforcement.

## Implemented source

- Public developers entrance: compact (no marketing hero), rounded colorful icon cards and quick-start.
- API docs: sticky left topic sidebar, EN/BN copy, readable fields/errors, code rail with VS Code-like syntax colors, cURL/Node.js/PHP/Python/Go/C, copy and labelled sample-output simulation. Separate action for an actual Sandbox create/status call with a user-supplied `ek_test_` credential; this is NOT arbitrary code execution.
- New `/v1/payment-intents` merchant route family. Workspace and Sandbox/Live financial realm derive exclusively from the fully authenticated/hashed/scoped key; callers cannot override the realm. Legacy scoped routes remain for dashboard consumers.
- Live payment creation still checks current subscription through `pg13_billing_allowed`; Live key create/rotate now requires a current entitlement, while revocation remains available. Sandbox keys are workspace-specific and subject to existing reasonable issue/active-key budgets; never shared as Live credentials.
- Create response includes `checkout_url` when the configured public origin is an HTTPS origin, in addition to the opaque checkout token.
- Custom UI guide: secure checkout capability with provider/payer lock, status/webhook-based automatic matching, optional read-only TrxID lookup. TrxID lookup does **not** consume a transaction, allocate funds or mark arbitrary evidence paid. It confirms only an existing verified payment on the same exact intent, payer, provider and amount.
- Additive migration `infra/migrations/0061_transaction_lookup.sql` installs `pg61_transaction_lookup` with finance-realm and tenant scope checks. Runtime function execution is limited to finance reader.

## Independently verified without GitHub CI

- Go 1.27.0 in a disposable Vercel Sandbox; branch source copied directly from linked GitHub at code checkpoint.
- `go test ./... -count=1`: **PASS** for all tested backend packages, including cmd/api, financial-migrate, checkout, authz, device evidence, financial, webhook and worker. One unused `net/http` import discovered and removed before the passing rerun.
- `go vet ./...`: **PASS**.
- Vercel **preview**, not production, for commit `3132479640826e4f6695e30396aec6122281d1ea`: `READY`; build log confirms Next.js TypeScript check and static page generation completed. The subsequent Go test fix and SQL correction do not change the frontend code verified by this preview.
- Neon control-plane read-only checks: separate `ekmivo`, `ekmivo_sandbox_financial`, `ekmivo_live_financial`; finance tables present, plan predicate installed.
- Additive SQL function 0061 applied to **both** existing Sandbox and Live financial databases (no payment rows or money state changed). Initial execution found a PL/pgSQL ambiguous `method` reference, fixed as `$4` and re-applied. Scoped, read-only invalid-intent lookup in **both** realms returned `{verified:false,status:pending}` correctly.

## Not verified / external or manual-pending

- Fresh account/browser screenshots at 320/768/desktop, Light/Dark/System and both languages, keyboard and contrast; preview build readiness alone does not assert visual acceptance.
- Signed-in owner/admin Sandbox key creation via browser, a **user-created** sandbox checkout, real receipt simulator forwarding, webhook delivery/retry and request cancellation/expiry end-to-end.
- Actual Go HTTP calls with a user-supplied valid individual Sandbox key on the **newly deployed** Go API, wrong-tenant isolation using independently owned keys, or Live subscription lifecycle HTTP testing. These were not simulated as success.
- Android device and real bKash/Nagad/Rocket transfer/provenance tests. No real provider or financial transaction acceptance is claimed.
- Original OpenAPI source and generated downloadable JSON may still list legacy scoped payment-intent paths; UI API reference remaps key-only routes for presentation. Synchronizing/generated contract artifacts and testing the downstream SDK generator remains separate work before API release acceptance.
- No production Go deployment or real browser tests performed by this branch verification. Apply/prove code deployment independently after merge; do not confuse database migration with API service rollout.

## Scope notes

- The public **shared-key** sandbox configuration already exists but was disabled in Neon and was not enabled, rotated or repurposed. Use individual Workspace Sandbox keys as the owner requested.
- Original automatic verification without TrxID remains the standard flow; TrxID-assisted lookup is optional and intentionally cannot bypass existing receipt matching.
- No automatic refunds or money movement are implemented by these developer API changes. This work does not close existing device pairing and receipt-report issues.
