import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseBdtMinor,parsePercentageBps,formatBdtMinor,formatPercentBps} from "../src/lib/subscription-coupons.ts";

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
