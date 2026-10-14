# Key-scoped merchant API and approachable developer documentation — 2026-10-15

## Scope / owner decisions
- No hero for /developers. Docs use a fixed desktop sidebar, playful home-inspired pastel cards/icons, code editor styled after VS Code, and responsive BN/EN + theme-compatible layout.
- Merchant server-to-server requests use one `/v1/payment-intents` surface, with verified API key (not a URL tenant or user-supplied environment field) determining workspace and Sandbox/Live realm. Legacy workspace routes remain for authenticated dashboard/internal clients.
- Live payment creation continues to require payment subscription/grace. Sandbox tests bypass billing but remain isolated in the existing financial Sandbox DB. No real money is issued by any docs simulation.

## Source changes in draft PR #56
- Added key-derived list/create/read/cancel operations and key-only merchant context in Go. Shared verified financial handler retains rate limit, activity audit, immutable intent, source scoping and idempotency semantics. The cancel route maps to existing finance cancellation guard.
- Added trusted configured-HTTPS checkout URL to payment creation response; no forwarded Host header or customer-provided URL is trusted to generate it.
- Added source OpenAPI operations and key-scoped SDK generation, with internal legacy-path compatibility.
- Consolidated /developers and /docs into a compact colorful documentation guide, searchable left sidebar, required/optional inputs, signed webhooks, sandbox tutorial, VS Code-style code samples for cURL/Node/Python/PHP, and a strictly illustrative Run/checkout success/cancel/expire preview.
- Added Go route, trusted origin, and SDK key-only transport tests. Updated manual checklist in docs/MANUAL-VERIFICATION.md.

## Database evidence: READ-ONLY Neon inspection
Project sparkling-mountain-38618629 / production branch br-solitary-river-b3ztvg8j; NO SQL writes performed.

| Context | Result |
|---|---|
| Control DB | `ekmivo`; `merchant_api_keys` stores key workspace and environment |
| Sandbox financial DB | `ekmivo_sandbox_financial`, realm sandbox, 3 registered workspaces, 15 stored payment intents |
| Sandbox functions | `pg05_create_intent`, `pg05_checkout_view`, `pg14_run`, `pg14_runs`, `pg14_reset` exist |
| Live financial DB | `ekmivo_live_financial`, realm live, 2 registered workspaces |
| Sandbox credentials | 2 total, 1 active at inspection; no secrets read or disclosed |
| Public shared TEST config | exists but `enabled=false`, left disabled |
| Billing gate | Go `billingAllowsNew` bypasses for Sandbox; Live checks SQL `pg13_billing_allowed` with `pg13_subscriptions.grace_until > now()` |

## Checks and blockers
- Read-only database realm/schema checks: PASS, metadata only; **not** payment execution evidence.
- Repo changes pushed to `codex/key-scoped-api-cute-docs`; PR: https://github.com/masharzy/ekmivo/pull/56 (DRAFT, NOT MERGED).
- GitHub Actions reported failure on several PR runs, and job logs/steps were unavailable via connector. Source unit/CI cannot be claimed passed.
- Vercel status reported: "Deployment rate limited — retry in 24 hours." No deployed browser check or live E2E evidence.
- Local Docs Run is an illustrative response preview; actual authenticated Sandbox create/checkout/verify/webhooks and real provider/device acceptance **remain OPEN**.
- Performance target 10ms has not been measured. No promise of network/SQL response timing.
- OpenAPI/SDK generation is invoked before web builds/contract validation; generated outputs still require successful CI and repository artifact consistency checks.

## Security boundaries
- Merchant API keys are server-only, scoped, revocable and hash-verified; token prefix selects candidate realm but never establishes authorization.
- Public merchant route rejects `?environment=` and accepts no client workspace identifier. Unauthorized key/tenant must fail closed.
- Public shared Sandbox demo activation, subscription changes, production migration and live payment transfer are **out of scope** and were not performed.

## Next acceptance step
Repair/inspect CI availability; run Go and Next/web tests and OpenAPI/SDK checks, run real tenant-key sandbox end-to-end, then review responsive BN/EN/light/dark screenshots and live plan-denial cases. Full manual test ledger: docs/MANUAL-VERIFICATION.md.
