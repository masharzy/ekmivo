import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {annualOfferSavings,parsePublishedSubscriptionOffer,priceInBdt,publishedPriceComparison} from "../src/lib/public-subscription-offers.ts";
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
 assert.equal(annualOfferSavings("10000","110000"),"10000");
 assert.equal(annualOfferSavings("10000","120000"),null);
 assert.equal(annualOfferSavings("10000","130000"),null);
 assert.equal(annualOfferSavings("bad","110000"),null);
 assert.throws(()=>priceInBdt("1.5","en"));
});
test("annual and bundle comparisons use unique current published components without double discount",()=>{
 const make=values=>{
  const parsed=parsePublishedSubscriptionOffer({...row,...values});
  assert.ok(parsed);return parsed;
 };
 const monthly=make({key:"pay_monthly",term:"monthly",amount_minor:"10000"});
 const yearly=make({key:"pay_yearly",version_id:"a2f21b52-dff6-4abd-9152-b13475a2a62b",term:"yearly",amount_minor:"110000"});
 const prepaid=make({key:"ai_pack",version_id:"a3f21b52-dff6-4abd-9152-b13475a2a62b",product:"ai_credit",term:"one_time",amount_minor:"35000",gateway_plan_version_id:null,included_ai_credits:"2500"});
 const bundle=make({key:"bundle_monthly",version_id:"a4f21b52-dff6-4abd-9152-b13475a2a62b",product:"bundle",term:"monthly",amount_minor:"39000",included_ai_credits:"2500"});
 const catalog=[monthly,yearly,prepaid,bundle];
 assert.deepEqual(publishedPriceComparison(catalog,yearly),{annual_saving_minor:"10000",bundle_saving_minor:null});
 assert.deepEqual(publishedPriceComparison(catalog,bundle),{annual_saving_minor:null,bundle_saving_minor:"6000"});
 assert.deepEqual(publishedPriceComparison(catalog,prepaid),{annual_saving_minor:null,bundle_saving_minor:null});
 assert.deepEqual(publishedPriceComparison([monthly,yearly,bundle],bundle),{annual_saving_minor:null,bundle_saving_minor:null});
 assert.deepEqual(publishedPriceComparison([...catalog,make({key:"ai_pack_other",version_id:"a5f21b52-dff6-4abd-9152-b13475a2a62b",product:"ai_credit",term:"one_time",amount_minor:"30000",gateway_plan_version_id:null,included_ai_credits:"2500"})],bundle),{annual_saving_minor:null,bundle_saving_minor:null});
 assert.deepEqual(publishedPriceComparison([monthly,yearly],bundle),{annual_saving_minor:null,bundle_saving_minor:null});
});
test("catalog projection is SECURITY DEFINER, current-version-only and never returns draft/private prices",()=>{
 const reader=read("lib/server/public-subscription-offers.ts");
 const migration=readFileSync(new URL("../../../infra/migrations/0144_platform_subscription_public_catalog.sql",import.meta.url),"utf8");
 assert.match(reader,/SELECT public\.platform_subscription_offers_public\(\) AS offers/);
 assert.match(migration,/SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp/);
 assert.match(migration,/o\.status='published'/);
 assert.match(migration,/v\.id=o\.current_version_id/);
 assert.match(migration,/c\.status='published'/);
 assert.match(migration,/c\.visibility='public'/);
 assert.match(migration,/v\.amount_minor::text/);
 assert.match(migration,/o\.product='ai_credit'/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.platform_subscription_offers_public\(\) FROM PUBLIC/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.platform_subscription_offers_public\(\) TO ekmivo_runtime/);
 assert.doesNotMatch(reader,/platform_subscription_offer_admin|SELECT \*/);
 const coordinator=readFileSync(new URL("../../../backend/cmd/financial-migrate/dashboard_reference.go",import.meta.url),"utf8");
 assert.match(coordinator,/"0143_platform_subscription_offer_admin\.sql", "0144_platform_subscription_public_catalog\.sql"/);
});
test("home and pricing use the same catalog data; unpublished offers keep existing Gateway fallback",()=>{
 const pricing=read("components/public-pricing.tsx"),home=read("app/[locale]/page.tsx");
 assert.match(pricing,/Promise\.all\(\[publicPaymentPlans\(\),publicSubscriptionOffers\(\)\]\)/);
 assert.match(pricing,/SubscriptionOfferPricing/);
 assert.match(pricing,/compact\?offers\.filter\(o=>o\.product==="payments"\):offers/);
 assert.match(pricing,/remaining\.length>0&&<PaymentPlanCards/);
 assert.match(home,/<PublicPricing locale=\{locale\} compact\/>/);
 assert.match(home,/PublicSubscriptionOfferSlot locale=\{locale\} product="ai_credit"/);
 assert.match(home,/PublicSubscriptionOfferSlot locale=\{locale\} product="bundle"/);
 assert.match(read("components/landing/landing-pricing.tsx"),/\{aiPricing\}/);
 assert.match(read("components/landing/landing-pricing.tsx"),/\{bundlePricing\}/);
 assert.match(read("app/[locale]/pricing/page.tsx"),/<PublicPricing locale=\{locale\} selectedProduct=\{product\}\/>/);
 assert.match(read("components/subscription-offer-pricing.tsx"),/aria-pressed/);
 assert.match(read("components/subscription-offer-pricing.tsx"),/Final eligibility and payable total are confirmed in checkout/);
 assert.doesNotMatch(read("components/subscription-offer-pricing.tsx"),/Go to Pay|name="bkash"|yearly.*free/i);
 assert.doesNotMatch(read("components/landing/landing-pricing.tsx"),/৳30 free once/);
});

// Public Home tabs are fed by the same published catalog as /pricing.
