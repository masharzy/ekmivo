import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");

test("last phase is isolated from legacy seller pay, with safe default-off purchase flags",()=>{
 const phase6=read("backend/internal/checkout/subscription_order.go");
 const worker=read("backend/internal/checkout/maintenance_worker.go");
 const route=read("apps/web/src/app/[locale]/checkout/order/[plan]/page.tsx");
 assert.match(phase6,/EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED/);
 assert.match(phase6,/EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED/);
 assert.match(phase6,/EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED/);
 assert.match(phase6,/== "true"/);
 assert.match(worker,/reconcileSubscriptionPayments/);
 assert.match(route,/validPurchaseToken\(plan\)/);
 assert.match(route,/primaryStoreFor\(user\.id\)/);
 assert.ok(existsSync(new URL("apps/web/src/app/[locale]/pay/subscription/[token]/page.tsx",root)));
 assert.ok(existsSync(new URL("apps/web/src/app/api/checkout/[token]/route.ts",root)));
});

test("Super Admin MFA and restricted DB procedures gate monitoring/CSV; no financial mutation",()=>{
 const admin=read("apps/web/src/components/platform-admin-console.tsx");
 const ops=read("apps/web/src/components/admin-subscription-operations-page.tsx");
 const exportRoute=read("apps/web/src/app/[locale]/admin/exports/route.ts");
 const migration=read("infra/migrations/0154_platform_subscription_release_operations.sql");
 assert.match(admin,/sessionMfaValid\(user\.id\)/);
 assert.match(admin,/verifiedAdmin\(\)/);
 assert.match(admin,/isSuper\?<AdminSubscriptionOperationsPage/);
 assert.match(admin,/billing.*Recovery/);
 assert.match(ops,/platform_subscription_admin_operations/);
 assert.match(ops,/Subscription recovery unavailable/);
 assert.match(exportRoute,/admin\.role!=="super_admin"/);
 assert.match(exportRoute,/platform_subscription_admin_export/);
 assert.match(exportRoute,/admin\.csv_export/);
 assert.match(exportRoute,/SOURCE_UNAVAILABLE/);
 assert.match(exportRoute,/const safe=\/\^/);
 assert.match(migration,/SECURITY DEFINER SET search_path=public,pg_temp/g);
 assert.match(migration,/a\.role='super_admin'/);
 assert.match(migration,/m\.confirmed_at IS NOT NULL/);
 assert.match(migration,/REVOKE ALL ON FUNCTION/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION/);
 assert.doesNotMatch(migration,/(?:UPDATE|DELETE|TRUNCATE)\s+(?:platform_subscription_payment_handoffs|pg13_platform_invoices)/i);
});

test("Release migration ordered after Phase 3-6, without production enablement",()=>{
 const registry=read("backend/cmd/financial-migrate/dashboard_reference.go");
 const names=["0145_platform_subscription_coupon_versions.sql","0146_platform_subscription_coupon_lifecycle.sql",
  "0149_platform_subscription_coupon_quote_read.sql","0151_phase4_durable_purchase_intents.sql",
  "0152_platform_subscription_order_summary.sql","0153_platform_subscription_payment_handoff.sql",
  "0154_platform_subscription_release_operations.sql"];
 let previous=-1;
 for(const name of names){const pos=registry.indexOf(name);assert.ok(pos>previous,`${name} must follow predecessor`);previous=pos;}
 assert.doesNotMatch(read("infra/migrations/0154_platform_subscription_release_operations.sql"),/DROP TABLE|INSERT INTO pg13_subscriptions|UPDATE pg13_platform_invoices/i);
 const smoke=read("apps/web/scripts/subscription-release-postgres-smoke.mjs");
 assert.match(smoke,/ekmivo_pg00/);
 assert.match(smoke,/platform_subscription_admin_operations/);
});

test("SaaS account tiles and lock use strict online approved single-source allowlisting",()=>{
 const checkout=read("backend/internal/checkout/service.go");
 const guard=read("backend/internal/checkout/subscription_wallet_allowlist.go");
 assert.match(checkout,/subscriptionCheckout\(initial\)/);
 assert.match(checkout,/subscriptionAccountEligible\(s\.eligibleSubscriptionAccounts/);
 assert.match(checkout,/accounts = s\.eligibleSubscriptionAccounts/);
 assert.match(guard,/count\[method\] == 1/);
 assert.match(guard,/source_online/);
 assert.match(guard,/s\.liveMethods\(checkout\)/);
 assert.match(guard,/SAAS-/);
});
