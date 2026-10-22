// Real React + Chromium acceptance on mocked Go responses. No DB or real charge.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {build} from "esbuild";
import {chromium} from "@playwright/test";

const css=readFileSync(new URL("../src/components/subscription-order-summary.css",import.meta.url),"utf8");
const root=resolve("src");
const entry=`import React from "react";
import {createRoot} from "react-dom/client";
import {SubscriptionOrderSummary} from "./components/subscription-order-summary";
createRoot(document.getElementById("test-root")).render(React.createElement(SubscriptionOrderSummary,
 {locale:window.__locale,intentId:"de16b0c1-a1c1-4fab-bc93-ff85cc4cc10e",
 storeId:"a152fb05-39e2-489e-8ed5-3f55cd24d074",storeName:"My test Store"}));`;
const built=await build({stdin:{contents:entry,resolveDir:root,sourcefile:"phase5-browser-entry.tsx",loader:"tsx"},
 bundle:true,write:false,outdir:"phase5-compiled",format:"iife",platform:"browser",target:"es2022",plugins:[{
 name:"stub-next-router",setup(plugin){
  plugin.onResolve({filter:/^next\/(?:link|navigation)$/},args=>({path:args.path,namespace:"phase5-next"}));
  plugin.onLoad({filter:/.*/,namespace:"phase5-next"},args=>({loader:"jsx",resolveDir:root,contents:args.path==="next/link"?
   'import React from "react";export default function Link({href,children,...rest}){return <a href={href} {...rest}>{children}</a>}' :
   'export const useRouter=()=>({push:url=>window.__routes.push(url)});'}));
 }}],external:[]});
const bundle=(built.outputFiles.find(file=>file.path.endsWith(".js"))||built.outputFiles[0]).text;
const key="de16b0c1-a1c1-4fab-bc93-ff85cc4cc10e";
const sha="a".repeat(64);
function legal(version="v1"){
 return Object.fromEntries(["terms","privacy","refund"].map(kind=>[kind,{id:key,sha256:sha,url:`https://ekmivo.example/${kind}`,version}]));
}
function quote(coupon=""){
 return {id:key,subtotal_minor:"129900",annual_discount_minor:"0",bundle_discount_minor:"0",
  coupon_discount_minor:coupon?"5000":"0",tax_minor:"0",total_minor:coupon?"124900":"129900",
  currency:"BDT",expires_at:"2035-10-22T10:00:00.000Z",coupon_code:coupon||null,
  lines:[{label:"Payments Starter",quantity:1,unit_price_minor:"129900",subtotal_minor:"129900"}]};
}
function order(coupon="",status="quoted",version="v1"){
 return {status,intent_id:key,store_id:"a152fb05-39e2-489e-8ed5-3f55cd24d074",
  expires_at:"2035-10-22T10:00:00Z",offer:{key:"pay_monthly",product:"payments",term:"monthly",version_id:key,
   quantity:1,name:"Payments Starter",name_bn:"পেমেন্টস স্টার্টার",included_ai_credits:null},
  policies:legal(version),quote:quote(coupon)};
}
const sandbox=function(){return {current:order(),lastCode:null,requests:[],confirmed:0,failRead:null,policyVersion:"v1",networkLost:false};};
async function setup(page,locale,theme,state){
 await page.route("http://localhost:45678/",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>Order test</title>"}));
 await page.goto("http://localhost:45678/",{waitUntil:"domcontentloaded"});
 page.setDefaultTimeout(8000);
 await page.route("**/api/go/workspaces/*/subscription-orders/**",async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();state.requests.push({method,path:url.pathname,body:req.postData()});
  if(method==="GET"){
   if(state.failRead)return route.fulfill({status:state.failRead,contentType:"application/json",body:JSON.stringify({code:state.failRead===403?"ACCESS_DENIED":"PRICE_CHANGED"})});
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(state.current)});
  }
  const data=JSON.parse(req.postData()||"{}");
  if(url.pathname.endsWith("/quote")){
   if(data.coupon_code&&data.coupon_code.startsWith("BAD"))return route.fulfill({status:422,contentType:"application/json",body:JSON.stringify({code:"COUPON_INVALID"})});
   if(data.coupon_code==="EXPIRED")return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:"COUPON_EXPIRED"})});
   if(data.coupon_code==="EXHAUSTED")return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:"COUPON_EXHAUSTED"})});
   state.current=order(data.coupon_code||"");
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({status:"quoted",quote_id:key})});
  }
  if(url.pathname.endsWith("/confirm")){
   if(state.networkLost){state.networkLost=false;return route.abort("failed");}
   if(state.policyVersion!=="v1")return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:"POLICY_CHANGED"})});
   state.confirmed++;
   if(state.current.status!=="confirmed")for(const kind of ["terms","privacy","refund"])assert.equal(data.consents[kind].accepted,true);
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({invoice_id:key,checkout_token:"A".repeat(43)})});
  }
  return route.fulfill({status:404,body:"{}"});
 });
 await page.setContent(`<!DOCTYPE html><html lang="${locale}" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{padding:0;margin:0}${css}</style></head><body><div id="test-root"></div><script>window.__locale=${JSON.stringify(locale)};window.__routes=[];</script><script>${bundle}</script></body></html>`,{waitUntil:"load"});
 if(state.current.status!=="confirmed")await page.getByText(locale==="bn"?"পেমেন্টস স্টার্টার":"Payments Starter").first().waitFor();
 await page.getByRole("button",{name:"Go to Pay"}).waitFor();
}
function consents(page){return page.locator('.ek-order-legal input[type="checkbox"]');}
test("Phase 5: 320/375/768/1024/1440 × EN/BN × light/dark/system, no overflow, keyboard focus",async t=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const locale of ["en","bn"])for(const theme of ["light","dark","system"])for(const width of [320,375,768,1024,1440]){
   await t.test(`${locale}/${theme}/${width}`,async()=>{
    const page=await browser.newPage({viewport:{width,height:850},colorScheme:theme==="dark"?"dark":"light"});
    try{
     const state=sandbox();await setup(page,locale,theme,state);
     const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
     assert.ok(dimensions.scroll<=dimensions.viewport+1,JSON.stringify(dimensions));
     assert.equal(await page.getByRole("radio",{name:/Pay with Ekmivo/}).count(),1);
     assert.equal(await consents(page).count(),3);
     for(let i=0;i<3;i++)assert.equal(await consents(page).nth(i).isChecked(),false);
     assert.equal(await page.getByRole("button",{name:"Go to Pay"}).isDisabled(),true);
     assert.equal(await page.getByRole("button",{name:/Apply|প্রয়োগ/}).count(),1);
     assert.equal(await page.locator('input[name="bkash"],input[name="nagad"],input[name="rocket"]').count(),0);
     await page.keyboard.press("Tab");
     assert.equal(await page.evaluate(()=>document.activeElement?.tagName),"A");
     assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),"solid");
    }finally{await page.close();}
   });
  }
 }finally{await browser.close();}
});

test("Phase 5: apply/remove, coupon errors, three independent consents, duplicate prevention and handoff",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:375,height:800}});const state=sandbox();await setup(page,"en","light",state);
  const input=page.getByLabel("Coupon code");
  await input.fill("BADCODE");await page.getByRole("button",{name:"Apply"}).click();
  await page.getByText("This coupon is invalid or unavailable.").waitFor();
  await input.fill("EXPIRED");await page.getByRole("button",{name:"Apply"}).click();await page.getByText("This coupon has expired.").waitFor();
  await input.fill("EXHAUSTED");await page.getByRole("button",{name:"Apply"}).click();await page.getByText("This coupon has reached its usage limit.").waitFor();
  await input.fill("SAVE10");await page.getByRole("button",{name:"Apply"}).click();await page.getByText("Coupon applied. The server recalculated your total.").waitFor();
  assert.ok(await page.getByText("৳1,249").count()>0);
  await page.getByRole("button",{name:"Remove"}).click();await page.getByText("Coupon removed. Total recalculated.").waitFor();
  for(let i=0;i<3;i++){await consents(page).nth(i).check();assert.equal(await page.getByRole("button",{name:"Go to Pay"}).isDisabled(),i!==2);}
  await consents(page).nth(1).uncheck();assert.equal(await page.getByRole("button",{name:"Go to Pay"}).isDisabled(),true);
  await consents(page).nth(1).check();await page.getByRole("button",{name:"Go to Pay"}).click();
  await page.waitForTimeout(400);
  assert.ok((await page.evaluate(()=>window.__routes)).length>0,JSON.stringify({requests:state.requests,warnings:await page.locator(".ek-order-warning").allTextContents()}));
  assert.deepEqual(await page.evaluate(()=>window.__routes),["/pay/subscription/"+"A".repeat(43)]);
  assert.equal(state.confirmed,1);
  await page.close();
 }finally{await browser.close();}
});

test("Phase 5: policy update, network failure, stale quote and zoom states",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:768,height:700}});const state=sandbox();await setup(page,"bn","dark",state);
  await page.evaluate(()=>{document.documentElement.style.zoom="2";});
  assert.equal(await consents(page).count(),3);
  const zoomLayout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(zoomLayout.scroll<=zoomLayout.viewport+1,JSON.stringify(zoomLayout));
  state.policyVersion="v2";
  for(let i=0;i<3;i++)await consents(page).nth(i).check();
  await page.getByRole("button",{name:"Go to Pay"}).click();await page.waitForTimeout(400);
  assert.ok(await page.getByText("নীতিমালার নতুন সংস্করণ এসেছে। পড়ে আবার সম্মতি দিন।").isVisible(),JSON.stringify({requests:state.requests,warnings:await page.locator(".ek-order-warning").allTextContents()}));
  for(let i=0;i<3;i++)assert.equal(await consents(page).nth(i).isChecked(),false);
  state.policyVersion="v1";state.networkLost=true;
  for(let i=0;i<3;i++)await consents(page).nth(i).check();
  await page.getByRole("button",{name:"Go to Pay"}).click();await page.getByRole("alert").last().waitFor();
  state.failRead=409;
  await page.getByRole("button",{name:/নতুন মূল্য যাচাই/}).click();
  await page.getByText("প্রকাশিত মূল্য বদলেছে। আবার অফার বাছুন।").waitFor();
  state.failRead=403;
  await page.getByRole("button",{name:/নতুন মূল্য যাচাই/}).click();
  await page.getByText("শুধু অনুমোদিত স্টোর মালিক বা বিলিং অ্যাডমিন এগোতে পারবেন।").waitFor();
  await page.close();
 }finally{await browser.close();}
});

test("Phase 5: refresh a confirmed order resumes original invoice, never issues a second checkout",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:800}});
  const state=sandbox();state.current={status:"confirmed",invoice_id:key,quote_id:key,total_minor:"129900",
   currency:"BDT",snapshot:{total_minor:"129900"}};
  await setup(page,"en","system",state);
  assert.ok(await page.getByText("Your confirmed invoice will be resumed, not recreated.").isVisible());
  assert.equal(await consents(page).count(),3);
  await page.getByRole("button",{name:"Go to Pay"}).click();
  await page.waitForFunction(()=>window.__routes.length>0);
  assert.equal(state.confirmed,1);
  const confirm=state.requests.filter(item=>item.path.endsWith("/confirm"));
  assert.equal(confirm.length,1);assert.equal(JSON.parse(confirm[0].body).quote_id,key);
  await page.close();
 }finally{await browser.close();}
});
