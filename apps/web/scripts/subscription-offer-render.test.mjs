import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {parsePublishedSubscriptionOffer,priceInBdt} from "../src/lib/public-subscription-offers.ts";
const require=createRequire(new URL("../package.json",import.meta.url));
const ts=require("typescript"),React=require("react"),jsx=require("react/jsx-runtime"),server=require("react-dom/server");
const source=readFileSync(new URL("../src/components/subscription-offer-pricing.tsx",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports,require:name=>{
 if(name==="react")return React;
 if(name==="react/jsx-runtime")return jsx;
 if(name==="../lib/public-subscription-offers")return {priceInBdt};
 throw Error("Unexpected dependency: "+name);
},Intl,BigInt});
const version="6f757833-36d8-45bb-91dc-dc4df6b0638a",plan="24f75419-3903-4b93-8910-3f6959485e12";
const make=(props)=>parsePublishedSubscriptionOffer({
 key:"payments_starter_monthly",version_id:version,product:"payments",term:"monthly",
 amount_minor:"10001",currency:"BDT",gateway_plan_version_id:plan,
 name:"Approved monthly",name_bn:"অনুমোদিত মাসিক",description:"Current catalog",
 description_bn:"বর্তমান মূল্য",included_ai_credits:null,...props
});
function html(rows,locale="en",compact=false){
 const offers=rows.map(make);
 assert.ok(offers.every(Boolean));
 return server.renderToStaticMarkup(React.createElement(mod.exports.SubscriptionOfferPricing,{offers,locale,compact}));
}
test("monthly and yearly are separate published prices, and the default never guesses a discount",()=>{
 const result=html([
  {},{key:"payments_starter_yearly",version_id:"c72189db-9d29-4b9f-824c-34909558997d",term:"yearly",name:"Approved yearly",amount_minor:"100000"}
 ]);
 assert.match(result,/Approved monthly/);
 assert.match(result,/৳100\.01/);
 assert.doesNotMatch(result,/৳1,000/);
 assert.match(result,/aria-pressed="true"/);
 assert.match(result,/Yearly/);
 assert.match(result,/Purchase handoff opens after verified checkout release/);
 assert.doesNotMatch(result,/name="(?:bkash|nagad|rocket)"|15%|2 months free/);
});
test("AI prepaid and bundles display only admin-published credits without imposing recurring AI billing",()=>{
 const ai=html([{key:"ai_credit_pack",product:"ai_credit",term:"one_time",
  gateway_plan_version_id:null,included_ai_credits:"2500",name:"One-time AI pack"}],"bn");
 assert.match(ai,/একবারের এআই ক্রেডিট/);
 assert.match(ai,/২,৫০০/);
 assert.match(ai,/৳১০০\.০১/);
 const bundle=html([{key:"ai_and_pay_monthly",product:"bundle",included_ai_credits:"4000",name:"Combo"}]);
 assert.match(bundle,/Combo/);
 assert.match(bundle,/4,000/);
});
test("responsive catalog styles are scoped with focus and mobile guards",()=>{
 const css=readFileSync(new URL("../src/app/subscription-offer-pricing.css",import.meta.url),"utf8");
 assert.match(css,/\.sop-root/);
 assert.match(css,/\.sop-selector button:focus-visible/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.doesNotMatch(css,/(?:^|\n)\s*(?:body|html|\.ds-app|\.pa-root)\s*[\{:]/);
});
