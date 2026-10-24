# Ekmivo web DATABASE_URL least-privilege cutover — 2026-10-22

**Status: ISOLATED SQL PASS; PRODUCTION WEB CUTOVER AND CHECKOUT FLAGS NOT YET VERIFIED.**

This work does not alter the financial Live/Sandbox databases, buyer invoices,
coupon redemption, receipts, or existing production DB credentials. Target:
the control database named `ekmivo` and its Next.js server-only connection.

## Why a new login is required

- Existing Vercel `DATABASE_URL` resolves to `ekmivo_owner`, with
  CREATEROLE, CREATEDB, BYPASSRLS and `neon_superuser` membership.
- The authenticated Go API already uses a separate restricted runtime.
- Neon API-created roles inherit `neon_superuser` in this project. One was
  created only in the isolated branch to demonstrate this issue. Provision
  `ekmivo_web_app` via SQL, with no privileged attributes or memberships.
- Migration `0156_web_runtime_least_privilege.sql` enumerates web-used tables,
  scoped DML grants, approved functions and web-facing RLS policies. The server
  still enforces actor/Store authorization; this is not database-level tenant
  isolation. Raw subscription payment tables and worker-only financial
  settlement functions remain forbidden.
- `merchant_api_keys.secret_digest` is not readable by the web runtime,
  though selected key metadata columns are.

## Isolated PostgreSQL proof

Neon project `sparkling-mountain-38618629`, own isolated branch
`br-gentle-sea-b36d5af0` (`store-subscription-web-runtime-hardening-20261022`),
cloned from production, database `ekmivo`:

- SQL-created `ekmivo_web_app`: LOGIN, no superuser, CREATEROLE, CREATEDB,
  BYPASSRLS, REPLICATION or role memberships.
- 0156 grants and policies ran in a real PostgreSQL transaction. Narrow
  key-metadata SELECT applied and verified afterward.
- `tools/testing/subscription-web-runtime-grants.sql` passed all role,
  object, function, digest-denial and financial-ledger-denial assertions.
- `SET LOCAL ROLE ekmivo_web_app` read existing users, memberships, bound
  stores, invoice counts, public plan catalog and published offers.
- Restricted-role synthetic registration created user, Store, owner membership,
  primary Store binding, business onboarding and auth session successfully,
  then `ROLLBACK TO SAVEPOINT`. **No production fixtures were created.**
- Exact reconstructed SQL passed pinned `pglast==8.7` syntax parsing locally.
- Vercel branch-specific Preview `DATABASE_URL` now uses the isolated SQL
  login, not the production owner. Fresh deployment
  `dpl_24v7nfEWhrMG7cJQg3aBp6YoJjCm` (SHA `49b421b`) is READY;
  protected GET smoke of EN/BN pricing, login, register and unauthenticated
  checkout route returned HTTP 200 without displayed server exceptions.
  This does **not** prove authenticated writes, sessions or wallet handoff.

## Remaining production release gates

1. Publish/review the exact 0156 source and focused CI. Confirm latest
   migration allocations; provision a fresh SQL-created LOGIN with random
   password. Never store the password in Git or evidence logs.
2. Apply 0156 through the checksummed control migration ledger. Run the
   read-only role contract against production.
3. Test preview Next.js registration, login/logout, email verification,
   OAuth, admin MFA, dashboards, API key lifecycle, Store onboarding, AI,
   payment/billing, and Order Summary against the actual restricted LOGIN.
4. Rotate only Vercel production `DATABASE_URL`, retain encrypted rollback
   capability, redeploy exact main SHA, inspect live auth/dashboard errors.
5. After consent/confirm, quote/coupon and configured wallet readiness tests,
   enable backend flags in this order on the confirmed Render API service:
   `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`,
   `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED`,
   `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED`,
   `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED`.
   The last flag must also be enabled on Vercel production web because the
   separate subscription payment and status pages enforce it server-side.
   Verify API health and actual responses. Provider/real-money acceptance
   remains the user's manual responsibility.

**Do not report checkout ACTIVATED until production evidence supports it.**
