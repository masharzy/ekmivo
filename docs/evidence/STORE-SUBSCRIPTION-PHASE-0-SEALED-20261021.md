# Ekmivo subscription purchase — Phase 0 contract and baseline evidence

**Phase:** 0 (architecture, inventory and safety contract)  
**Status:** **100% CODE-LEVEL SEALED** (baseline/inventory scope only, not a claim about phases 1–7)  
**Date:** 2026-10-21 UTC  
**Baseline commit:** `4aee19b01f9c680fbb1c96f015db06aedab7819a`  
**Baseline CI:** [Foundation CI run 39629263875](https://github.com/masharzy/ekmivo/actions/runs/39629263875) — **completed/success**.

## Authoritative route/ownership diagram

1. Public pricing `/` and `/pricing` → `/subscribe/{plan}`; auth cookie and selected plan must survive login, Google OAuth, verification and new Store setup.
2. Purchase summary `/checkout/order/{plan}` is currently **preview-only**, guarded by `EKMIVO_SUBSCRIPTION_ORDER_PREVIEW`; the checkout component also has `purchaseEnabled={false}`. The summary **must not** show bKash/Nagad/Rocket or issue an invoice before secured server confirmation.
3. Future SaaS payment route `/pay/subscription/{opaque-token}` uses `CheckoutExperience`. This is separate from seller document `/pay/{document-token}` using `PublicDocument`, and from the seller-customer checkout `/checkout/{token}`.
4. Existing subscription billing quote/invoice and independently verified activation live in Go `backend/internal/checkout/billing.go` and the control Postgres `pg13_platform_invoices`/subscription tables. Do not duplicate authority in Next.js or activate on browser redirect.
5. System/platform receiving account configuration, NOT a buyer Store receiving account, is the only permitted source for SaaS subscription wallet methods.

## Live inventory — READ ONLY

Neon project `sparkling-mountain-38618629`, branch `br-solitary-river-b3ztvg8j`, control database `ekmivo` queried with aggregate-only SELECT; **no PII retrieved or records changed**:

| Measure | Count |
| --- | ---: |
| App users | 6 |
| Workspaces (legacy internal IDs) | 8 |
| Workspace memberships | 7 |
| Primary-Store bindings | 0 |
| Users with multiple memberships | 1 |
| Users with multiple owned workspaces | 1 |
| Users with no membership | 0 |

**Legacy resolution invariant:** one legacy multi-Store owner exists. Preserve their data and membership. A new single-Store binding policy is for new accounts; do not auto-reparent or delete the historical owner records.

## Production migration boundary observed (not performed by Phase 0)

Control database schema already has applied, checksum-ledgered migrations `0133`, `0134`, `0135`, `0140`, `0141`, `0142`, `0143` (all separately applied earlier on 2026-10-21). Databases `ekmivo_live_financial` and `ekmivo_sandbox_financial` are separate and were NOT touched by this Phase 0 audit.

## Security/product contracts

- One user-facing Store, internal `workspace_id` compatibility until an approved legacy policy exists. A bound owner cannot pick another Store, and owner/member authorization must remain scoped to the authenticated user.
- Store-selected plan survives auth/setup; price versions, discount rules and exact minor-unit BDT math are server-authoritative.
- Coupon admin is platform-only with MFA, limits/eligibility and audit; seller order coupons are different entities. Final redemption happens only after verified paid invoice.
- Three distinct versioned HTTPS policies (Terms, Privacy, Refund) require explicit consent. Missing owner-approved legal text means no live purchase activation.
- Unpaid/pending/failed/duplicate SMS evidence cannot activate an entitlement. Unknown request results must re-use idempotency keys.
- `EKMIVO_SUBSCRIPTION_ORDER_PREVIEW=0` by default. Existing billing purchase path remains available until a subsequent phase passes gates.
- Public locale URLs must remain canonical without visible `/bn` or `/en` prefixes. Preserve Hind Siliguri for Bengali and separately scoped landing/dashboard/admin CSS.

## Phase 0 acceptance checklist

- [x] Route-to-handler ownership documented and seller vs SaaS token namespaces separated.
- [x] Original billing/payment engine and control vs financial realm boundaries documented.
- [x] Read-only live legacy inventory performed; no data written or deleted for this phase.
- [x] Preview feature gate and ability to fall back to existing billing documented.
- [x] Main baseline CI completed successfully at the above SHA.
- [x] Rollback: leave additive schemas in place, disable preview, revert offending web/Go release; **continue reconciliation for in-flight verified payment** rather than shutting it off.

**Manual/live-wallet confirmation:** out of scope for Phase 0; tracked for Phase 6/7. **Phases 1–7 remain NOT SEALED.**
