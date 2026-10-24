import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");

test("product analytics is an additive isolated control reader with no financial revenue calculation",()=>{
 const migration=read("infra/migrations/0195_briofold_product_operational_analytics.sql");
 assert.match(migration,/to_regclass\('public\.financial_realm'\) IS NOT NULL/);
 assert.match(migration,/commerce_actor\(w,a,false\)/);
 assert.match(migration,/o\.status IN \('confirmed','packed','shipped','delivered','returned'\)/);
 assert.match(migration,/coalesce\(sum\(l\.returned\)/);
 assert.match(migration,/REVOKE ALL ON FUNCTION commerce_product_operational_analytics/);
 assert.doesNotMatch(migration,/financial_payments|payment_intents|amount_minor|revenue_minor|UPDATE commerce_orders/i);
});

test("real product analytics is gated in Go and Next and only shown in product catalog",()=>{
 const go=read("backend/internal/checkout/commerce.go"),page=read("apps/web/src/components/commerce-page.tsx"),ui=read("apps/web/src/components/commerce-workspace.tsx"),panel=read("apps/web/src/components/commerce-product-analytics.tsx");
 assert.match(go,/resource"\) == "product-analytics"/);
 assert.match(go,/BRIOFOLD_COMMERCE_PRODUCT_ANALYTICS_ENABLED/);
 assert.match(go,/commerce_product_operational_analytics/);
 assert.match(page,/productAnalyticsEnabled=\{process\.env\.BRIOFOLD_COMMERCE_PRODUCT_ANALYTICS_ENABLED==="true"\}/);
 assert.match(ui,/resource==="products"&&productAnalyticsEnabled&&!syncMode/);
 assert.match(panel,/resource:"product-analytics"/);
 assert.match(panel,/Operational report unavailable\. No totals are inferred/);
 assert.match(panel,/never verified sales, settlement, refunds or income/);
});
