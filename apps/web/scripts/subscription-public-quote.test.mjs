import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quotePublishedPrice} from "../src/lib/public-subscription-quote.ts";
import {parsePublishedSubscriptionOffer} from "../src/lib/public-subscription-offers.ts";
const valid=parsePublishedSubscriptionOffer({
 key:"payments_monthly",version_id:"6f757833-36d8-45bb-91dc-dc4df6b0638a",product:"payments",term:"monthly",
 amount_minor:"12345",currency:"BDT",gateway_plan_version_id:"24f75419-3903-4b93-8910-3f6959485e12",
 name:"Published month",name_bn:"",description:"",description_bn:"",included_ai_credits:null
});
assert.ok(valid);
test("server-side exact version/term recheck; no stale quote or arbitrary client amount",()=>{
 const request={key:valid.key,version_id:valid.version_id,term:valid.term};
 assert.deepEqual(quotePublishedPrice([valid],request),{status:"ok",offer:valid,catalog_price_minor:"12345",currency:"BDT"});
 assert.deepEqual(quotePublishedPrice([valid],{...request,version_id:"b159d2e2-091b-4e3f-b19a-21a39ab3dffc"}),{status:"price_changed"});
 assert.deepEqual(quotePublishedPrice([valid],{...request,term:"yearly"}),{status:"price_changed"});
 assert.deepEqual(quotePublishedPrice([valid],{...request,key:"another_offer"}),{status:"not_found"});
 assert.deepEqual(quotePublishedPrice([valid],{...request,key:"../payments_monthly"}),{status:"invalid"});
 assert.deepEqual(quotePublishedPrice([],request),{status:"not_found"});
});
test("read-only API re-reads published catalog and never enables checkout",()=>{
 const route=readFileSync(new URL("../src/app/api/subscription/quote/route.ts",import.meta.url),"utf8");
 assert.match(route,/publicSubscriptionOffers\(\)/);
 assert.match(route,/quotePublishedPrice\(catalog\.offers/);
 assert.match(route,/checkout_enabled:false/);
 assert.match(route,/"PRICE_CHANGED"/);
 assert.match(route,/\"Cache-Control\":\"no-store, max-age=0\"/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE |payment_plan_claim_free|CheckoutExperience|paymentIntent/i);
});

// Phase 2 catalog quote remains read-only until the later payment release gates.
