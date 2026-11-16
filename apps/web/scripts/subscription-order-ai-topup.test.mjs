import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

// Owner 2026-11-17: "Both" is a cart — one order, two lines, one payment, amount is the sum.
test("0263: plan + AI credit in one order; ai_topup 0 keeps the old order exactly",()=>{
 const sql=read("infra/migrations/0263_subscription_order_ai_topup.sql");
 assert.match(sql,/CHECK\(ai_topup_minor=0 OR ai_topup_minor BETWEEN 2000 AND 10000000\)/,"৳20 to ৳100,000");
 assert.match(sql,/-coupon_discount_minor::numeric\+tax_minor::numeric\+ai_topup_minor::numeric\)/,"quote total = plan total + AI");
 assert.match(sql,/VALUES\(quote\.id,2,''AI credit'',NULL,1,intent\.ai_topup_minor,intent\.ai_topup_minor\)/,"second line");
 assert.match(sql,/OR i\.amount_minor\+q\.ai_topup_minor<>q\.total_minor/,"invoice is the plan part");
 assert.match(sql,/token_sha,q\.total_minor\)/,"customer pays the total");
 assert.match(sql,/pg13_billing_verified\(h\.workspace_id,h\.invoice_id,payment,amount-q\.ai_topup_minor,verified_time\)/,"plan activates with the plan part");
 assert.match(sql,/briofold_ai_topup_credit_proof\(h\.workspace_id,topup,payment,q\.ai_topup_minor\)/,"AI part credited once");
 assert.match(sql,/''saas-order:''\|\|purchase::text/,"idempotent per order");
 assert.match(sql,/inspect before applying 0263/,"stops on an unexpected function");
 assert.ok(read("backend/cmd/financial-migrate/dashboard_reference.go").includes('"0263_subscription_order_ai_topup.sql"'));
});
test("web: Both sends the AI amount only with the flag; legacy path never drops it silently",()=>{
 const route=read("apps/web/src/app/[locale]/subscribe/[plan]/route.ts");
 assert.ok(route.includes('process.env.BRIOFOLD_ORDER_AI_TOPUP_ENABLED==="true"'));
 assert.ok(route.includes("aiTopupMinor});")&&route.includes("&&!aiTopupMinor);"));
 assert.ok(read("apps/web/src/lib/server/purchase-intents.ts").includes("ai_topup_minor:String(input.aiTopupMinor)"));
 const summary=read("apps/web/src/components/subscription-order-summary.tsx");
 assert.ok(summary.includes('t("AI credit (recharge)","AI ক্রেডিট (রিচার্জ)")'));
 assert.ok(summary.includes('BigInt(quote.ai_topup_minor??"0")'),"subtotal shows both lines");
});
