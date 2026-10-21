// Isolated screenshot/width acceptance for the real public price-card component.
// Synthetic published offers only: does not access live DB, wallets or private users.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {resolve} from "node:path";
import {chromium} from "@playwright/test";
import {parsePublishedSubscriptionOffer,priceInBdt,annualOfferSavings} from "../src/lib/public-subscription-offers.ts";
const require=createRequire(new URL("../package.json",import.meta.url));
const ts=require("typescript"),React=require("react"),jsx=require("react/jsx-runtime"),htmlServer=require("react-dom/server");
const tsx=readFileSync(new URL("../src/components/subscription-offer-pricing.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(tsx,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
runInNewContext(compiled,{module,exports:module.exports,require:name=>{
 if(name==="react")return React;
 if(name==="react/jsx-runtime")return jsx;
 if(name==="../lib/public-subscription-offers")return {priceInBdt,annualOfferSavings};
 throw Error("Unexpected component dependency "+name);
},Intl,BigInt});
const css=readFileSync(new URL("../src/app/subscription-offer-pricing.css",import.meta.url),"utf8");
const fixtures=[
 {key:"pay_monthly",version_id:"6f757833-36d8-45bb-91dc-dc4df6b0638a",product:"payments",term:"monthly",amount_minor:"129900",currency:"BDT",gateway_plan_version_id:"24f75419-3903-4b93-8910-3f6959485e12",name:"Payment Starter",name_bn:"পেমেন্ট স্টার্টার",description:"Current published monthly price and verified successful-payment allowance.",description_bn:"প্রকাশিত মাসিক মূল্য ও যাচাইকৃত সফল পেমেন্টের সুবিধা।",included_ai_credits:null},
 {key:"pay_yearly",version_id:"b159d2e2-091b-4e3f-b19a-21a39ab3dffc",product:"payments",term:"yearly",amount_minor:"1399000",currency:"BDT",gateway_plan_version_id:"24f75419-3903-4b93-8910-3f6959485e12",name:"Payment Starter Yearly",name_bn:"পেমেন্ট স্টার্টার বার্ষিক",description:"Approved yearly price.",description_bn:"অনুমোদিত বার্ষিক মূল্য।",included_ai_credits:null},
 {key:"ai_credits",version_id:"386a0a7b-d2a4-4e47-9fc0-a5e66c04694a",product:"ai_credit",term:"one_time",amount_minor:"50000",currency:"BDT",gateway_plan_version_id:null,name:"Prepaid AI pack",name_bn:"প্রিপেইড এআই প্যাক",description:"No recurring AI billing",description_bn:"এআই মাসিক অটোচার্জ নয়",included_ai_credits:"5000"}
];
const offers=fixtures.map(parsePublishedSubscriptionOffer);
assert.ok(offers.every(Boolean));
const screenshots=resolve("test-results","subscription-pricing");
mkdirSync(screenshots,{recursive:true});
const baseCSS="*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%}body{font:16px/1.5 system-ui,sans-serif;padding:16px;background:var(--color-canvas)}main{width:min(1120px,100%);margin:0 auto}";
function markup(locale){
 const component=React.createElement(module.exports.SubscriptionOfferPricing,{offers,locale});
 return htmlServer.renderToStaticMarkup(component);
}
test("published price cards fit narrow-to-desktop, Bengali/English and both themes",async t=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const locale of ["en","bn"])for(const theme of ["light","dark"])for(const width of [320,375,768,1024,1440]){
   await t.test(locale+" "+theme+" "+width+"px",async()=>{
    const page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    try{
     const dark=theme==="dark";
     const themeCSS=dark?"--color-canvas:#0b0e0c;--color-surface-raised:#141915;--color-surface-subtle:#232a25;--color-border:#303a32;--color-text:#f1f5ef;--color-text-secondary:#abbab0;--color-text-muted:#95a49b;--color-focus:#a3f56a;--color-success:#a3f56a":"--color-canvas:#fff;--color-surface-raised:#fff;--color-surface-subtle:#f3f5f1;--color-border:#e3e8e0;--color-text:#0a1f12;--color-text-secondary:#5e6b62;--color-text-muted:#5e6b62;--color-focus:#1f8a3b;--color-success:#1f8a3b";
     await page.setContent('<!doctype html><html lang="'+locale+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{'+themeCSS+'}'+baseCSS+css+'</style></head><body><main>'+markup(locale)+'</main></body></html>');
     const geometry=await page.evaluate(()=>({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth,cards:document.querySelectorAll(".sop-card").length}));
     assert.ok(geometry.scroll<=geometry.viewport+1,"Horizontal page overflow "+JSON.stringify(geometry));
     assert.ok(geometry.cards>0,"No approved offer card rendered");
     assert.equal(await page.locator('.sop-selector button[aria-pressed="true"]').count()>0,true);
     await page.keyboard.press("Tab");
     assert.equal(await page.evaluate(()=>document.activeElement?.tagName),"BUTTON");
     await page.screenshot({path:resolve(screenshots,locale+"-"+theme+"-"+width+".png"),fullPage:true});
    }finally{await page.close()}
   });
  }
 }finally{await browser.close()}
});

// Screenshot fixtures are synthetic; no provider, wallet or production data read.
