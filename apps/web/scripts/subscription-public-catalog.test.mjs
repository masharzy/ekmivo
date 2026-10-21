import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parsePublishedSubscriptionOffer,priceInBdt} from "../src/lib/public-subscription-offers.ts";
const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const row={
 key:"payments_starter_monthly",version_id:"b2f21b52-dff6-4abd-9152-b13475a2a62b",
 product:"payments",term:"monthly",amount_minor:"10001",currency:"BDT",
 gateway_plan_version_id:"02c42f2c-b3a5-4c7c-8622-e190d62a1b7b",
 name:"Starter monthly",name_bn:"স্টার্টার",description:"Current month",
 description_bn:"চলতি মাস",included_ai_credits:null
};
test("catalog maps approved exact money and three distinct product/term rules",()=>{
 assert.equal(parsePublishedSubscriptionOffer(row)?.amount_minor,"10001");
 assert.equal(parsePublishedSubscriptionOffer({...row,product:"payments",term:"one_time"}),null);
 assert.equal(parsePublishedSubscriptionOffer({...row,product:"bundle",included_ai_credits:"100"})?.product,"bundle");
 assert.equal(parsePublishedSubscriptionOffer({...row,product:"ai_credit",term:"one_time",gateway_plan_version_id:null,included_ai_credits:"1000"})?.term,"one_time");
 assert.equal(parsePublishedSubscriptionOffer({...row,product:"ai_credit",term:"monthly",gateway_plan_version_id:null,included_ai_credits:"1000"}),null);
 for(const mutation of [{amount_minor:"100.1"},{amount_minor:"-1"},{amount_minor:"0"},{amount_minor:"100000000001"},{currency:"USD"},{gateway_plan_version_id:"invalid"},{included_ai_credits:"1"},{name:""},{version_id:"bad"}])
  assert.equal(parsePublishedSubscriptionOffer({...row,...mutation}),null,JSON.stringify(mutation));
 assert.equal(priceInBdt("10001","en"),"৳100.01");
 assert.equal(priceInBdt("10000","en"),"৳100");
 assert.equal(priceInBdt("1","en"),"৳0.01");
 assert.throws(()=>priceInBdt("1.5","en"));
});
test("public query has a strict published-current-version, visible Gateway and tenant-free boundary",()=>{
 const source=read("lib/server/public-subscription-offers.ts");
 assert.match(source,/o\.status='published'/);
 assert.match(source,/v\.id=o\.current_version_id/);
 assert.match(source,/c\.status='published'/);
 assert.match(source,/c\.visibility='public'/);
 assert.match(source,/v\.amount_minor::text/);
 assert.match(source,/o\.product='ai_credit'/);
 assert.doesNotMatch(source,/platform_subscription_offer_admin/);
 assert.doesNotMatch(source,/SELECT \*/);
});
test("home and pricing use the same catalog data; unpublished offers keep existing Gateway fallback",()=>{
 const pricing=read("components/public-pricing.tsx"),home=read("app/[locale]/page.tsx");
 assert.match(pricing,/Promise\.all\(\[publicPaymentPlans\(\),publicSubscriptionOffers\(\)\]\)/);
 assert.match(pricing,/SubscriptionOfferPricing/);
 assert.match(pricing,/compact\?offers\.filter\(o=>o\.product==="payments"\):offers/);
 assert.match(pricing,/remaining\.length>0&&<PaymentPlanCards/);
 assert.match(home,/<PublicPricing locale=\{locale\} compact\/>/);
 assert.match(read("app/[locale]/pricing/page.tsx"),/<PublicPricing locale=\{locale\}\/>/);
 assert.match(read("components/subscription-offer-pricing.tsx"),/aria-pressed/);
 assert.match(read("components/subscription-offer-pricing.tsx"),/Purchase handoff opens after verified checkout release/);
 assert.doesNotMatch(read("components/subscription-offer-pricing.tsx"),/Go to Pay|name="bkash"|yearly.*free/i);
 assert.doesNotMatch(read("components/landing/landing-pricing.tsx"),/৳30 free once/);
});
