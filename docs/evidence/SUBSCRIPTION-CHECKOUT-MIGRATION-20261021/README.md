# Subscription checkout control schema — production migration evidence

Date: 2026-10-21 (Asia/Dhaka). Owner specifically authorized direct production migration without an isolated branch.

- Migration: `infra/migrations/0133_platform_subscription_checkout_foundation.sql`.
- Neon project: `sparkling-mountain-38618629` (Ekmivo); branch: `br-solitary-river-b3ztvg8j` (production); database: `ekmivo` (control only).
- Applied as one Neon SQL transaction. Result: success, 26 statements including checksum ledger insertion; no partial commit.
- Read-only verification: 12/12 new public tables present; `dashboard_reference_migrations` contains SHA-256 `430d1cd8cb0576926fea10bcd4ccdf78ecc3776cd2b5921f46ae0acc74f6c6ff` for this file; control database has no financial realm.
- Existing invoices, subscription grants, Store memberships, wallets, two financial databases, and historical records were not updated or deleted by the migration. No coupon, offer, policy document or payment was seeded.
- Read-only privilege verification: all 12 tables have `relrowsecurity` and `relforcerowsecurity`; zero grant `SELECT/INSERT/UPDATE/DELETE` privileges to `ekmivo_financial_runtime`. Future Go handlers must expose restricted and audited mutations.
- Future replay: `backend/cmd/financial-migrate/dashboard_reference.go` lists the migration under the checksum-controlled control-only coordinator. Do not hand-apply the same file twice.
- At the original 0133-only checkpoint: isolated DB branch test (owner waived), Go endpoints, Admin, yearly/bundle offers, consent confirmation, payment handoff and end-to-end verification were pending. Subsequent incremental progress is recorded below; purchase activation remains disabled.
- Rollback policy: no destructive drop rollback was attempted. Retain inert additive tables until a separately reviewed rollback/migration is authorized.

## Admin coupon schema/function follow-up — 2026-10-21

- `0134_platform_subscription_coupon_admin.sql`: applied in an atomic production-control transaction to the same project/branch/database, ledger SHA-256 `0d9572ac2d173eb6e1fe2963d9dd44f3f31b13202338a853e139b0f44aa469a6` verified. Provides permission-checked, audit-reason-required coupon list, draft create/edit, revision-CAS and status transition, but **not** checkout redemption.
- The initial rollback-only DB smoke exposed a real FK mismatch: `platform_admin_audit.subject_id` references **app_users**, not coupons. The failed call committed nothing.
- `0135_subscription_coupon_admin_audit_subject_fix.sql`: applied as atomic follow-up with checksum `3493b89bfcc65f532a9d9c9ee2f6530cf6452e625a7c46105556961974d59350`. It leaves immutable 0134 intact and uses a guarded function-definition rewrite to omit the incorrect user subject_id, preserving coupon ID in the audit description.
- Re-ran save + activate inside a production transaction/savepoint and **rolled back the savepoint before commit**; both responses were correct (`draft` revision 1 → `active` revision 2) and the final query returned `coupons_remaining=0`. No real campaign or redemption was created. Runtime-role authorized `list` returned zero entries.
- Web evidence: dedicated Admin Billing → Coupons UI and server actions, strict currency/basis-points parsing, real search/filter/pagination, explicit draft/pause/activate/audit, scoped Admin styles. Next.js production build passed; all 24 web contract test files passed; scoped ESLint 0 errors, 3 pre-existing warnings; Admin design validator passed. Authenticated visual/E2E and Go suites remain outstanding.
- **Critical pre-existing database role issue found:** `ekmivo_runtime` inherits `neon_superuser` and has `BYPASSRLS`; despite 0133 having no direct table grants, its effective `SELECT/INSERT/UPDATE/DELETE` on new tables reads `true`. The control schema does not presently provide true raw-table isolation from this web role. This was observed read-only; **no global Neon roles were changed** because removing inherited elevated rights could break existing production services. A new least-privileged runtime/credential migration and controlled rollout are required before production checkout acceptance. This applies to old and new schema access, not just coupons.
- No active offer prices, policy records, accepted consents, coupon reservations, financial payment intents or entitlements were modified. Checkout new purchases remain disabled (`purchaseEnabled=false`).

## Versioned policy catalog — later 2026-10-21

- `0140_platform_subscription_policy_catalog.sql`: applied directly to production control DB (owner-directed); checksum `e10275c24db4246a9b83e38ef04edc3f7e4ccbfb9da91e8482971a0d5e275c97`. It adds super-admin policy create/publish/archive/list and a published-version read function. It does not seed policies.
- `0141_platform_subscription_policy_lock_concat_fix.sql`: checksum `5ee0301e073fef6d8c68cb10be31e90976e4d3d815d3b6544fad5e8aeb94c8e5`; fixes a PostgreSQL string concatenation issue revealed in transactional smoke.
- `0142_platform_subscription_policy_kind_qualification.sql`: checksum `bcbf205232d49d99b09e0e41da6b36c8aac5c3052d458d842bd9369fc8e13130`; qualifies a previously ambiguous PL/pgSQL column reference. Both hotfixes preserve the immutable applied 0140 file/ledger.
- Final create→publish smoke **passed inside savepoint and was rolled back before commit**: no `QATEST_20261021` record and zero published documents remained. Failed prior smoke calls committed nothing. Active Ekmivo Terms, Privacy and Refund URLs are **not** configured until the owner provides approved versions and content hashes.
- Admin Settings → Legal & contact provides actual versioned controls, and the order preview now reads versioned published URLs via `platform_subscription_policy_public()`, with no unversioned environment fallback. Server-side acceptance persistence/confirm remains pending and checkout is still payment-disabled.

## Versioned subscription offer admin (0143)

- Control migration `0143_platform_subscription_offer_admin.sql` applied directly to production Ekmivo Neon per owner instruction. SHA-256: `347ba59969a3c4fca3702a3f09f082cf13d846acdb8a2efbd7f353b4a5afaa98`.
- Added Admin → Billing & Revenue → Offers for immutable monthly/yearly Gateway prices, one-time AI credit packs and combined AI + Pay offers. No offer or price was seeded or published.
- Production SQL QA ran draft → publish → archive for a synthetic AI-credit offer **inside a savepoint**, rolled back to that savepoint, and confirmed `residual_offers=0` and `residual_audit=0`. This validates catalog mechanics, not financial settlement or entitlement delivery.
- Checkout stays disabled until server-backed quotes, coupon redemptions, three immutable policy acceptances, system receiving payment verification and invoice/entitlement handoff are verified. Admin offers are configuration, **not** an enabled payment pathway.
