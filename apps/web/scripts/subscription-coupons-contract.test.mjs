import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseBdtMinor,parsePercentageBps,formatBdtMinor,formatPercentBps} from "../src/lib/subscription-coupons.ts";
import {parseCouponQuote,couponErrorCode,couponErrorMessage} from "../src/lib/subscription-coupon-quote.ts";

const web=(path)=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
const migration=()=>readFileSync(new URL("../../../infra/migrations/0134_platform_subscription_coupon_admin.sql",import.meta.url),"utf8");

test("coupon money input uses exact integer poisha without float acceptance",()=>{
 for(const [input,want] of [["0",0],["0.01",1],["0.10",10],["100",10000],["250.99",25099],["999999999.99",99999999999]])assert.equal(parseBdtMinor(input),want);
 for(const input of ["-1","+1","1.001","1.2.3","10e3","1,000","1.00abc","NaN","Infinity","", "010.01", "1000000000.01"])assert.equal(parseBdtMinor(input),null,input);
 assert.equal(formatBdtMinor(12345),"123.45");
 assert.equal(formatBdtMinor(null),"");
});

test("percentage conversion is bounded to 0.01–100.00% in basis points",()=>{
 for(const [value,want] of [["0.01",1],["5.50",550],["100",10000]])assert.equal(parsePercentageBps(value),want);
 for(const value of ["0","100.01","101","10.001","-5","1e2",""])assert.equal(parsePercentageBps(value),null,value);
 assert.equal(formatPercentBps(1050),"10.50");
});

test("admin writes require verified super admin, reason, server-side SQL revision and role check",()=>{
 const action=web("actions/admin-subscription-coupons.ts");
 assert.match(action,/requireSuperAdmin\(\)/);
 assert.match(action,/reason\.length<10/);
 assert.match(action,/platform_subscription_coupon_admin/);
 assert.match(action,/revalidatePath/);
 const sql=migration();
 assert.match(sql,/p\.role='super_admin'/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/coupon\.revision IS DISTINCT FROM expected_revision/);
 assert.match(sql,/platform_subscription_purchase_intents/);
 assert.match(sql,/platform_admin_audit/);
 assert.match(sql,/operation='transition'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
});

test("coupons belong in existing Admin Billing tab and never turn on unverified checkout",()=>{
 const console=web("components/platform-admin-console.tsx");
 const pay=web("components/subscription-order-summary.tsx");
 assert.match(console,/billing:\["Subscriptions","Invoices","Revenue","Coupons","Offers"\]/);
 assert.match(console,/key==="billing"&&sub==="coupons"/);
 assert.match(pay,/Coupon redemption is not enabled/);
 assert.doesNotMatch(pay,/name="(?:bkash|nagad|rocket)"/);
 assert.match(web("app/[locale]/checkout/order/[plan]/page.tsx"),/purchaseEnabled=\{false\}/);
});

test("Phase 3 apply/remove/reload UI uses the authenticated server snapshot only",()=>{
 const quote={id:"7dbec4c0-8a24-4b80-96cb-0a4aba46bb8e",intent_revision:3,revision:3,
  coupon_id:"b3eae61f-7dea-47ee-9375-51eb00528496",coupon_code:"PROMO10",
  subtotal_minor:10000,annual_discount_minor:0,bundle_discount_minor:0,coupon_discount_minor:1000,
  tax_minor:900,total_minor:9900,expires_at:new Date(Date.now()+60000).toISOString(),
  lines:[{line_no:1,label:"Published item",quantity:1,unit_price_minor:10000,subtotal_minor:10000}]};
 assert.deepEqual(parseCouponQuote(quote),quote);
 assert.equal(parseCouponQuote({...quote,total_minor:10000}),null,"client cannot use a mismatched total");
 assert.equal(parseCouponQuote({...quote,subtotal_minor:Number.MAX_SAFE_INTEGER}),null,"overflow rejected");
 assert.equal(parseCouponQuote({...quote,coupon_code:"x".repeat(64)}),null);
 assert.match(couponErrorMessage("TAX_REQUOTE_REQUIRED","bn"),/করনীতি/);
 assert.equal(couponErrorCode({error:{code:"TAX_REQUOTE_REQUIRED",message:"Do not expose raw server details"}}),"TAX_REQUOTE_REQUIRED");
 assert.equal(couponErrorCode({code:"QUOTE_CHANGED"}),"QUOTE_CHANGED");
 assert.equal(couponErrorCode({error:{code:"<unsafe>"}}),"UNKNOWN");
 const widget=web("components/subscription-coupon-control.tsx");
 assert.match(widget,/operation_key:operation\.key/);
 assert.match(widget,/cache:"no-store"/);
 assert.match(widget,/parseCouponQuote/);
 assert.match(widget,/coupon_code:normalized/);
 assert.match(widget,/onQuoteRef\.current/);
 const api=web("app/api/go/[...path]/route.ts");
 assert.match(api,/couponQuotePath/);
 assert.match(api,/!read &&/);
 assert.match(api,/request\.headers\.get\("origin"\)/);
 const sql=readFileSync(new URL("../../../infra/migrations/0149_platform_subscription_coupon_quote_read.sql",import.meta.url),"utf8");
 assert.match(sql,/platform_subscription_coupon_current_quote/);
 assert.match(sql,/snapshot->>'code_normalized'/);
 const goRouter=readFileSync(new URL("../../../backend/cmd/api/main.go",import.meta.url),"utf8");
 assert.match(goRouter,/GET \/v1\/platform\/purchase-intents\/\{intentID\}\/quote/);
});
