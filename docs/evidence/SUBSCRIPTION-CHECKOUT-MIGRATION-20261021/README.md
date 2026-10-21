# Subscription checkout control schema — production migration evidence

Date: 2026-10-21 (Asia/Dhaka). Owner specifically authorized direct production migration without an isolated branch.

- Migration: `infra/migrations/0133_platform_subscription_checkout_foundation.sql`.
- Neon project: `sparkling-mountain-38618629` (Ekmivo); branch: `br-solitary-river-b3ztvg8j` (production); database: `ekmivo` (control only).
- Applied as one Neon SQL transaction. Result: success, 26 statements including checksum ledger insertion; no partial commit.
- Read-only verification: 12/12 new public tables present; `dashboard_reference_migrations` contains SHA-256 `430d1cd8cb0576926fea10bcd4ccdf78ecc3776cd2b5921f46ae0acc74f6c6ff` for this file; control database has no financial realm.
- Existing invoices, subscription grants, Store memberships, wallets, two financial databases, and historical records were not updated or deleted by the migration. No coupon, offer, policy document or payment was seeded.
- Read-only privilege verification: all 12 tables have `relrowsecurity` and `relforcerowsecurity`; zero grant `SELECT/INSERT/UPDATE/DELETE` privileges to `ekmivo_financial_runtime`. Future Go handlers must expose restricted and audited mutations.
- Future replay: `backend/cmd/financial-migrate/dashboard_reference.go` lists the migration under the checksum-controlled control-only coordinator. Do not hand-apply the same file twice.
- Not done: isolated database test (owner waived), Go backend implementation/tests (`go` unavailable in current environment), admin coupon UI, live yearly/bundle prices, three-consent confirmation, payment handoff, browser E2E, code commit/push, API/web production deploy. The purchase preview remains disabled.
- Rollback policy: no destructive drop rollback was attempted. Retain inert additive tables until a separately reviewed rollback/migration is authorized.

## Admin coupon schema/function follow-up — 2026-10-21

- `0134_platform_subscription_coupon_admin.sql`: applied in an atomic production-control transaction to the same project/branch/database, ledger SHA-256 `0d9572ac2d173eb6e1fe2963d9dd44f3f31b13202338a853e139b0f44aa469a6` verified. Provides permission-checked, audit-reason-required coupon list, draft create/edit, revision-CAS and status transition, but **not** checkout redemption.
- The initial rollback-only DB smoke exposed a real FK mismatch: `platform_admin_audit.subject_id` references **app_users**, not coupons. The failed call committed nothing.
- `0135_subscription_coupon_admin_audit_subject_fix.sql`: applied as atomic follow-up with checksum `3493b89bfcc65f532a9d9c9ee2f6530cf6452e625a7c46105556961974d59350`. It leaves immutable 0134 intact and uses a guarded function-definition rewrite to omit the incorrect user subject_id, preserving coupon ID in the audit description.
- Re-ran save + activate inside a production transaction/savepoint and **rolled back the savepoint before commit**; both responses were correct (`draft` revision 1 → `active` revision 2) and the final query returned `coupons_remaining=0`. No real campaign or redemption was created. Runtime-role authorized `list` returned zero entries.
- Web evidence: dedicated Admin Billing → Coupons UI and server actions, strict currency/basis-points parsing, real search/filter/pagination, explicit draft/pause/activate/audit, scoped Admin styles. Next.js production build passed; all 24 web contract test files passed; scoped ESLint 0 errors, 3 pre-existing warnings; Admin design validator passed. Authenticated visual/E2E and Go suites remain outstanding.
- **Critical pre-existing database role issue found:** `ekmivo_runtime` inherits `neon_superuser` and has `BYPASSRLS`; despite 0133 having no direct table grants, its effective `SELECT/INSERT/UPDATE/DELETE` on new tables reads `true`. The control schema does not presently provide true raw-table isolation from this web role. This was observed read-only; **no global Neon roles were changed** because removing inherited elevated rights could break existing production services. A new least-privileged runtime/credential migration and controlled rollout are required before production checkout acceptance. This applies to old and new schema access, not just coupons.
- No active offer prices, policy records, accepted consents, coupon reservations, financial payment intents or entitlements were modified. Checkout new purchases remain disabled (`purchaseEnabled=false`).
