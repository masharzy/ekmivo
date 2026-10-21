import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quotePublishedPrice} from "../src/lib/public-subscription-quote.ts";
import {parsePublishedSubscriptionOffer} from "../src/lib/public-subscription-offers.ts";
const file=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const offer=parsePublishedSubscriptionOffer({
 key:"payments_yearly",version_id:"f5a6d13b-9a02-43f3-804e-c7544b04d64d",
 product:"payments",term:"yearly",amount_minor:"345678",currency:"BDT",
 gateway_plan_version_id:"25b911c3-4666-4c62-a21e-6516f3f928fd",
 name:"Annual published",name_bn:"প্রকাশিত বার্ষিক",
 description:"Annual catalog price",description_bn:"প্রকাশিত বার্ষিক মূল্য",included_ai_credits:null
});
assert.ok(offer);
test("home price, API quote and authenticated review share a single version-pinned money source",()=>{
 const quote=quotePublishedPrice([offer],{key:offer.key,version_id:offer.version_id,term:"yearly"});
 assert.equal(quote.status,"ok");
 if(quote.status!=="ok")throw Error("expected quote");
 assert.equal(quote.catalog_price_minor,offer.amount_minor);
 const page=file("app/[locale]/checkout/offer/[offer]/page.tsx");
 const pricing=file("components/subscription-offer-pricing.tsx");
 const api=file("app/api/subscription/quote/route.ts");
 assert.match(page,/publicSubscriptionOffers\(\)/);
 assert.match(page,/quotePublishedPrice\(catalog\.offers/);
 assert.match(page,/priceInBdt\(current\.amount_minor,locale\)/);
 assert.match(page,/requireUser\(locale\)/);
 assert.match(page,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(page,/store\.role!=="owner"/);
 assert.match(api,/quotePublishedPrice\(catalog\.offers/);
 assert.match(pricing,/priceInBdt\(o\.amount_minor,locale\)/);
});
test("stale published versions fail closed; review creates no invoices, wallet selections or charges",()=>{
 const page=file("app/[locale]/checkout/offer/[offer]/page.tsx");
 assert.deepEqual(quotePublishedPrice([offer],{key:offer.key,version_id:"6b4fb517-ea9b-4c2a-a98c-f94a46622762",term:"yearly"}),{status:"price_changed"});
 assert.match(page,/result\.status==="price_changed"/);
 assert.match(page,/Go to Pay/);
 assert.match(page,/disabled/);
 assert.match(page,/Pay with Ekmivo/);
 assert.match(page,/policies\.terms/);
 assert.match(page,/policies\.privacy/);
 assert.match(page,/policies\.refund/);
 assert.doesNotMatch(page,/checkout_token|bkash|nagad|rocket|activateFree|INSERT INTO|POST.*billing/i);
});
