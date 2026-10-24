// An isolated Chromium client-hydration check of the actual Phase 3 React
// control. Browser fetch is fictional; real Go/PG auth + money checks run in
// subscription_coupons_pg_test.go, and no production route is ever invoked.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
import {chromium} from "@playwright/test";

const require=createRequire(new URL("../package.json",import.meta.url));
const ts=require("typescript");
const cjs=(name,file)=>readFileSync(resolve(dirname(require.resolve(name)),"cjs",file),"utf8");
const moduleSource={
 react:cjs("react","react.development.js"),
 "react/jsx-runtime":cjs("react","react-jsx-runtime.development.js"),
 "react-dom":cjs("react-dom","react-dom.development.js"),
 scheduler:cjs("scheduler","scheduler.development.js"),
 "react-dom/client":cjs("react-dom","react-dom-client.development.js"),
 "../lib/subscription-coupon-quote":ts.transpileModule(readFileSync(new URL("../src/lib/subscription-coupon-quote.ts",import.meta.url),"utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 widget:ts.transpileModule(readFileSync(new URL("../src/components/subscription-coupon-control.tsx",import.meta.url),"utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
};
const css=readFileSync(new URL("../src/components/subscription-order-summary.css",import.meta.url),"utf8");
const screenshots=resolve("test-results","subscription-coupon-control");
const html=(theme,locale)=>`<!doctype html><html lang="${locale}" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;max-width:100%;}button,input{font-size:14px} ${css}</style></head><body><main class="ek-order" lang="${locale}"><div class="ek-order-shell"><div class="ek-order-card" id="app"></div></div></main></body></html>`;

test("real coupon React control performs Apply, GET reload, Remove and safe unknown-response recovery in Chromium",async t=>{
 if(process.env.PHASE3_RENDER_ONLY==="1")return;
 const browser=await chromium.launch({headless:true});mkdirSync(screenshots,{recursive:true});
 try{
  for(const [locale,theme,width] of [["en","light",375],["bn","dark",320],["en","dark",1440]]){
   await t.test(`${locale}-${theme}-${width}`,async()=>{
    const page=await browser.newPage({viewport:{width,height:790}});
    try{
     await page.setContent(html(theme,locale));
     await page.evaluate((sources)=>{
      // about:blank's opaque origin may not expose secure-context randomUUID;
      // deployed checkout always uses HTTPS. This fixture needs UUIDs only.
      if(typeof crypto.randomUUID!=="function"){
       let next=0;
       Object.defineProperty(crypto,"randomUUID",{configurable:true,value:()=>`00000000-0000-4000-a000-${String(++next).padStart(12,"0")}`});
      }
      const cache={};
      function load(name){
       if(cache[name])return cache[name].exports;
       if(typeof sources[name]!=="string")throw Error("missing isolated module "+name);
       const mod={exports:{}};cache[name]=mod;
       new Function("module","exports","require","process",sources[name])(mod,mod.exports,load,{env:{NODE_ENV:"development"}});
       return mod.exports;
      }
      const React=load("react"),client=load("react-dom/client"),Widget=load("widget").SubscriptionCouponControl;
      const couponID="b3eae61f-7dea-47ee-9375-51eb00528496";
      let quotation={id:"7dbec4c0-8a24-4b80-96cb-0a4aba46bb8e",intent_revision:1,revision:1,
       coupon_id:null,coupon_code:"",subtotal_minor:10000,annual_discount_minor:0,bundle_discount_minor:0,
       coupon_discount_minor:0,tax_minor:1000,total_minor:11000,expires_at:new Date(Date.now()+600000).toISOString(),
       lines:[{line_no:1,label:"Fictional published pack",quantity:1,unit_price_minor:10000,subtotal_minor:10000}]};
      let unknownNext=false,postCount=0;
      window.__dropNextCouponResponse=()=>{unknownNext=true;};
      window.__couponPostCount=()=>postCount;
      window.fetch=async (_url,options={})=>{
       if((options.method||"GET")==="GET")return new Response(JSON.stringify(quotation),{status:200,headers:{"Content-Type":"application/json"}});
       postCount++;
       const payload=JSON.parse(options.body||"{}");
       if(payload.revision!==quotation.intent_revision)return new Response(JSON.stringify({error:{code:"QUOTE_CHANGED"}}),{status:409});
       if(payload.coupon_code&&payload.coupon_code!=="PROMO10")return new Response(JSON.stringify({error:{code:"COUPON_INELIGIBLE"}}),{status:422});
       const applied=Boolean(payload.coupon_code);
       quotation={...quotation,id:crypto.randomUUID(),revision:quotation.revision+1,intent_revision:quotation.intent_revision+1,
        coupon_id:applied?couponID:null,coupon_code:applied?"PROMO10":"",coupon_discount_minor:applied?1000:0,
        tax_minor:applied?900:1000,total_minor:applied?9900:11000};
       if(unknownNext){unknownNext=false;throw new TypeError("Network response lost after commit");}
       return new Response(JSON.stringify(quotation),{status:200,headers:{"Content-Type":"application/json"}});
      };
      let root;
      window.__mountCoupon=(loc)=>{if(root)root.unmount();root=client.createRoot(document.getElementById("app"));
       root.render(React.createElement(Widget,{intentId:"11111111-1111-4111-a111-111111111111",locale:loc,onQuote:q=>{window.__lastCouponQuote=q;}}));};
      window.__mountCoupon(document.documentElement.lang);
     },moduleSource);
     const input=page.locator("#ek-order-verified-coupon");
     await input.waitFor({state:"visible"});
     await page.waitForFunction(()=>!document.querySelector("#ek-order-verified-coupon")?.disabled);
     assert.equal(await page.getByText(locale==="bn"?/যাচাইকৃত মোট/:/Verified total/).count()>0,true);
     await input.fill("BOGUS");
     await page.getByRole("button",{name:locale==="bn"?"প্রয়োগ":"Apply"}).click();
     try{
      await page.waitForFunction(()=>/unavailable|পাওয়া যাচ্ছে না/.test(document.body.textContent||""),null,{timeout:6000});
     }catch{
      const detail=await page.evaluate(()=>({postCount:window.__couponPostCount(),quote:window.__lastCouponQuote,
       live:[...document.querySelectorAll('[role="status"],[role="alert"]')].map(el=>el.textContent),
       input:document.querySelector('#ek-order-verified-coupon')?.value}));
      throw Error("Coupon invalid-response UI did not settle: "+JSON.stringify(detail));
     }
     assert.equal(await page.evaluate(()=>window.__lastCouponQuote?.coupon_id),null,"invalid coupon changed persisted state");
     await input.fill("PROMO10");
     await page.evaluate(()=>window.__dropNextCouponResponse());
     await page.getByRole("button",{name:locale==="bn"?"প্রয়োগ":"Apply"}).click();
     await page.waitForFunction(()=>window.__lastCouponQuote?.coupon_code==="PROMO10");
     assert.equal(await input.inputValue(),"PROMO10","unknown response not recovered with authoritative GET");
     await page.evaluate(loc=>window.__mountCoupon(loc),locale);
     await page.waitForFunction(()=>document.querySelector("#ek-order-verified-coupon")?.value==="PROMO10");
     await page.getByRole("button",{name:locale==="bn"?"সরান":"Remove"}).click();
     await page.waitForFunction(()=>window.__lastCouponQuote?.coupon_code==="");
     assert.equal(await page.evaluate(()=>window.__lastCouponQuote?.total_minor),11000,"Remove/requote did not restore tax and payable total");
     const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
     assert.ok(size.document<=size.width+1,`coupon control overflow ${JSON.stringify(size)}`);
     await page.screenshot({path:resolve(screenshots,`${locale}-${theme}-${width}.png`),fullPage:true});
    }finally{await page.close()}
   });
  }
 }finally{await browser.close()}
});
