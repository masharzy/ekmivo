# Store subscription — Phase 1 code-level seal

**Status:** **100% CODE-LEVEL SEALED** (2026-10-21). Physical-device, live-wallet and production cutover evidence remain independent.

**Implementation:** [PR #133](https://github.com/masharzy/ekmivo/pull/133), merged/squashed as `bf177043d4ea8839b041c6b17fe93f0e8dbc8c6c`.

## Passing gates

- [Pre-merge CI on exact PR head `cb96872c`](https://github.com/masharzy/ekmivo/actions/runs/39635033029) — all four jobs **completed/success**.
- [Post-merge CI on exact main SHA `bf177043`](https://github.com/masharzy/ekmivo/actions/runs/39642600743) — **all four jobs completed/success**, including Next.js lint, typecheck, production build, Go/PostgreSQL auth and financial smoke, browser acceptance, Go unit/race/vet, Android Kotlin assemble/unit, runtime/financial Docker images.
- Mandatory `primary-store-binding-contract.test.mjs`, legacy and signup transaction simulation, onboarding action/permission tests, existing RLS and financial isolation tests remain in CI.

## Sealed code scope

1. Password and Google new-user creation bind one primary Store in the same transactional workspace/owner-membership write, guarded by existing unique constraint and authorized create mutex. Failed transactions do not commit a partial binding.
2. Primary-bound account keeps one preferred Store, cannot select another Store or visit a different `/w/{id}` through a deep link; existing legacy multi-Store owner/member records retain their compatible picker, without data deletion.
3. Desktop/mobile sidebar shows static Store identity for one-Store users. Business search doesn't offer switching to the current sole Store. Existing dashboard, product permissions and merchant financial IDs stay unchanged.
4. Store list and auth/navigation handoffs use canonical URLs without visible `/bn` or `/en` prefix. Bengali Payments dashboard uses local Hind Siliguri, preserving theme and product CSS scopes.
5. Absent additive schema in isolated/old databases is detected before querying the table; financial realms, seller checkout and billing activation code are not altered.

## Read-only production prerequisites and rollback

The production control database already had additive migration 0133 before this PR; role `ekmivo_runtime` had read/insert permission confirmed by aggregate/read-only inspection. No existing store/member/payment record was rewritten by this phase. Legacy owners remain unbound pending a separately approved legacy policy.

Rollback: revert this additive web auth/sidebar release without dropping the primary-binding table or deleting legacy memberships. Existing payment verification/reconciliation must continue for in-flight seller and SaaS payments.

**Not claimed by this seal:** real wallet/SMS acceptance, a production deploy, Phase 2 pricing publication, Phase 3 coupons, Phase 4 intent persistence, Phase 5 consent confirm, Phase 6 entitlement verification, or Phase 7 cutover.
