import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {safePolicyUrl,allPoliciesAccepted,verifiedSubscriptionQuote,validMinor,moneyBDT,consentPayload} from "../src/lib/subscription-order.ts";

const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const legal=Object.fromEntries(["terms","privacy","refund"].map(kind=>[kind,{id:"de16b0c1-a1c1-4fab-bc93-ff85cc4cc10e",sha256:"a".repeat(64),url:`https://ekmivo.com/${kind}`,version:"2026-10"}]));
const all={terms:true,privacy:true,refund:true};
const quote={id:"de16b0c1-a1c1-4fab-bc93-ff85cc4cc10e",subtotal_minor:"10500",annual_discount_minor:"0",bundle_discount_minor:"0",coupon_discount_minor:"1000",tax_minor:"0",total_minor:"9500",currency:"BDT",expires_at:"2030-01-01T00:00:00.000Z",coupon_code:"SAVE10",lines:[{label:"Standard",quantity:1,unit_price_minor:"10500",subtotal_minor:"10500"}]};

test("three independently accepted, valid, published legal identities",()=>{
 assert.equal(allPoliciesAccepted(legal,all),true);
 for(const kind of Object.keys(all))assert.equal(allPoliciesAccepted(legal,{...all,[kind]:false}),false);
 for(const kind of Object.keys(legal))assert.equal(allPoliciesAccepted({...legal,[kind]:null},all),false);
 assert.equal(safePolicyUrl("javascript:alert(1)"),null);
 assert.equal(safePolicyUrl("http://example.com/terms"),null);
 assert.equal(safePolicyUrl("https://example.com/terms#misleading"),null);
 assert.equal(safePolicyUrl("/terms"),null);
 assert.equal(consentPayload(legal,all).refund.sha256,"a".repeat(64));
});

test("quote requires server provided minor-unit strings and live expiry",()=>{
 assert.equal(verifiedSubscriptionQuote(quote,0),true);
 assert.equal(verifiedSubscriptionQuote({...quote,total_minor:"1.25"},0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,total_minor:"-1"},0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,total_minor:100},0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,expires_at:"2020-01-01T00:00:00Z"}),false);
 assert.equal(verifiedSubscriptionQuote({...quote,id:"broken"},0),false);
 assert.equal(validMinor("100000000001"),false);
 assert.equal(moneyBDT("12345","en"),"৳123.45");
});

test("summary uses opaque intent, no seller wallet and no client amount calculation",()=>{
 const summary=read("components/subscription-order-summary.tsx");
 const route=read("app/[locale]/checkout/order/[plan]/page.tsx");
 const proxy=read("app/api/go/[...path]/route.ts");
 const pay=read("app/[locale]/pay/subscription/[token]/page.tsx");
 assert.match(summary,/Go to Pay/);assert.match(summary,/Pay with Ekmivo/);
 for(const kind of ["terms","privacy","refund"])assert.match(summary,new RegExp(`policyConsent\\("${kind}"`));
 assert.match(summary,/postCoupon\(command\.code,command\.revision,command\.key\)/);
 assert.match(summary,/post\("confirm"/);
 assert.match(summary,/router\.push\(`\/pay\/subscription\/\$\{payment\.checkout_token\}`\)/);
 assert.match(summary,/verifiedSubscriptionQuote/);
 assert.doesNotMatch(summary,/name="(?:bkash|nagad|rocket)"|amount_minor\s*\*|amount_minor\s*\//);
 assert.match(route,/resumePurchase\(plan\)/);assert.match(route,/readPurchase\(plan\)/);
 assert.doesNotMatch(route,/database\(\)|public_token_sha256/);
 assert.doesNotMatch(route,/purchaseEnabled=\{false\}/);
 assert.match(proxy,/subscriptionOrderPath/);assert.match(proxy,/couponQuotePath/);
 assert.match(proxy,/subscriptionPaymentPath/);assert.match(pay,/CheckoutExperience/);
});

test("Go transaction revalidates Store, policy, offer, tax and invoice uniqueness",()=>{
 const sql=readFileSync(new URL("../../../infra/migrations/0152_platform_subscription_order_summary.sql",import.meta.url),"utf8");
 for(const term of ["platform_primary_stores","pg13_actor","FOR UPDATE","platform_subscription_policy_acceptances",
   "platform_subscription_order_confirmations","UNIQUE(workspace_id,idempotency_key)","TAX_POLICY_REQUIRED","QUOTE_STALE",
   "POLICY_CHANGED","ZERO_DUE_UNAPPROVED","FULFILLMENT_NOT_READY","pg13_platform_invoices","coupon_revision"])
  assert.ok(sql.includes(term),term);
 assert.match(sql,/REVOKE ALL ON FUNCTION platform_subscription_order_request/);
 assert.match(sql,/platform_subscription_coupon_current_quote\(uuid,uuid\)/);
 assert.match(sql,/tax_policy_id/);
 assert.match(sql,/tax_policy_revision/);
 assert.doesNotMatch(sql,/CREATE FUNCTION platform_subscription_tax_admin|CREATE TABLE platform_subscription_tax_settings/);
 assert.match(sql,/platform_subscription_coupon_commands/);
 assert.match(sql,/Phase 3 Apply command reserves this exact quote/);
 assert.doesNotMatch(sql,/ADD COLUMN coupon_revision bigint/);
 assert.doesNotMatch(sql,/UPDATE pg13_subscriptions|status='paid'\s*WHERE/);
 assert.doesNotMatch(sql,/chosen_coupon uuid;\s*status text;/);
 assert.doesNotMatch(sql,/;\s*kind text;/);
 const go=readFileSync(new URL("../../../backend/internal/checkout/subscription_order.go",import.meta.url),"utf8");
 assert.match(go,/EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED/);
 assert.match(go,/r\.Header\.Get\("Origin"\)\s*==\s*""/);
 assert.match(go,/platform_subscription_order_request/);
 assert.doesNotMatch(go,/SELECT pg10_intent|s\.token\(/);
});

test("seller pay route remains owned by existing merchant checkout",()=>{
 const merchant=read("app/[locale]/pay/[token]/page.tsx");
 assert.match(merchant,/PublicDocument/);
});
