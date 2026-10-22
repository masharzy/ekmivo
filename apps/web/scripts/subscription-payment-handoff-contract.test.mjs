import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";

const root=new URL("../../..",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");


test("nested SaaS order status route resolves both server and component imports",()=>{
 const path="apps/web/src/app/[locale]/checkout/order/[plan]/status/page.tsx";
 const source=read(path);
 const routeURL=new URL(path,root);
 const imports=[...source.matchAll(/from "([^"]+)"/g)].map(match=>match[1]).filter(target=>target.startsWith("../"));
 assert.equal(imports.length,2,"expected auth and status component relative imports");
 for(const target of imports){
  assert.ok(
   existsSync(new URL(target+".ts",routeURL))||existsSync(new URL(target+".tsx",routeURL)),
   "Unresolved nested route import: "+target
  );
 }
});

test("subscription wallet requires exact current owner-bound capability; seller checkout stays separate",()=>{
 const wallet=read("apps/web/src/app/[locale]/pay/subscription/[token]/page.tsx");
 const seller=read("apps/web/src/app/[locale]/pay/[token]/page.tsx");
 const generic=read("apps/web/src/app/[locale]/checkout/[token]/page.tsx");
 assert.match(wallet,/platform_subscription_payment_capability/);
 assert.match(wallet,/requireUser/);
 assert.match(wallet,/EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED/);
 assert.match(wallet,/hashToken\(token\)/);
 assert.match(wallet,/subscriptionReturnPath/);
 assert.match(seller,/PublicDocument/);
 assert.doesNotMatch(seller,/subscription-purchases/);
 assert.ok(generic.length>50);
});

test("subscription status cannot be marked paid by browser, can outlast closed tab and exposes real invoice",()=>{
 const status=read("apps/web/src/components/subscription-payment-status.tsx");
 const proxy=read("apps/web/src/app/api/go/[...path]/route.ts");
 const client=read("apps/web/src/lib/subscription-payment-client.ts");
 assert.match(client,/subscription-purchases/);
 assert.match(status,/billing-invoices/);
 assert.match(client,/next.verified!==\(next.status==="completed"\)/);
 assert.match(status,/window.setInterval/);
 assert.match(status,/window.setTimeout/);
 assert.match(status,/window.clearTimeout\(initial\)/);
 assert.match(status,/ac.abort\(\)/);
 assert.doesNotMatch(status,/const ac=new AbortController\(\);\s*void refresh\(ac.signal\)/);
 assert.match(proxy,/subscriptionPaymentPath/);
 assert.match(proxy,/ORIGIN_DENIED/);
 assert.doesNotMatch(status,/setData\(\{[^}]*status:"completed"/);
});

test("Go payment issue/reconciliation is default-off and never trusts client paid status",()=>{
 const go=read("backend/internal/checkout/subscription_payment.go");
 const worker=read("backend/internal/checkout/subscription_payment_recovery.go");
 const legacy=read("backend/internal/checkout/maintenance_worker.go");
 assert.match(go,/EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED/);
 assert.match(go,/platform_subscription_payment_bind/);
 assert.match(go,/pg10_public_payment_sources/);
 assert.match(go,/approvedSubscriptionSources/);
 assert.match(worker,/pg13_platform_payment/);
 assert.match(worker,/platform_subscription_payment_settle/);
 assert.match(worker,/platform_subscription_payment_recover/);
 assert.match(legacy,/platform_subscription_payment_is_handoff/);
 assert.doesNotMatch(go,/json:"paid"/);
});

test("control payment schema has exactly-once coupon, three consent snapshots, recovery and restricted roles",()=>{
 const sql=read("infra/migrations/0153_platform_subscription_payment_handoff.sql");
 assert.match(sql,/count\(DISTINCT acceptance.policy_kind\).*?<>3/s);
 assert.match(sql,/platform_subscription_order_confirmations/);
 assert.doesNotMatch(sql,/policy.status='published'/);
 assert.match(sql,/last_reconciled_at=clock_timestamp\(\)/);
 assert.match(sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(sql,/0153 requires isolated Ekmivo control database/);
 assert.match(sql,/UNIQUE\(intent_id,payment_id\)/);
 assert.match(sql,/reservation_id.*?invoice_id/s);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION platform_subscription_payment_capability/);
 assert.match(sql,/TO ekmivo_financial_projection/);
 assert.doesNotMatch(sql,/INSERT INTO financial_payments/i);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});
