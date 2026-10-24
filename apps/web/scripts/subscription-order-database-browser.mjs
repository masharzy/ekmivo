// Actual React + Chromium backed by a disposable PostgreSQL quote/confirm
// transaction, with only the Phase 6 external-payment handoff stubbed.
// Run after subscription-order-postgres-smoke.mjs in the SAME isolated CI job.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {resolve} from "node:path";
import postgres from "postgres";
import {build} from "esbuild";
import {chromium} from "@playwright/test";

const source=process.env.PG00_TEST_DATABASE_URL;
if(!source)throw Error("Isolated CI PostgreSQL URL required");
const url=new URL(source);
if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.pathname!=="/ekmivo_pg00")
 throw Error("Database browser acceptance refuses shared or remote databases");
url.pathname="/ekmivo";
const sql=postgres(url.toString(),{ssl:false,prepare:false,max:4,connect_timeout:8});
const query=(command,args=[])=>sql.unsafe(command,args);
const actor=(await query("SELECT id::text FROM app_users WHERE email='a@example.invalid'"))[0]?.id;
const workspace=(await query("SELECT id::text FROM workspaces WHERE name='CI primary'"))[0]?.id;
const offer=(await query("SELECT id::text FROM platform_subscription_offer_versions WHERE offer_key='phase5_ci_plan' AND revision=1"))[0]?.id;
if(!actor||!workspace||!offer)throw Error("Phase 5 SQL smoke fixture must run first");

const root=resolve("src");
const css=readFileSync(new URL("../src/components/subscription-order-summary.css",import.meta.url),"utf8");
const entry='import React from "react";import {createRoot} from "react-dom/client";'
 +'import {SubscriptionOrderSummary} from "./components/subscription-order-summary";'
 +'createRoot(document.getElementById("test-root")).render(React.createElement(SubscriptionOrderSummary,'
 +'{locale:window.__locale,intentId:window.__intent,storeId:window.__store,storeName:"CI primary"}));';
const built=await build({stdin:{contents:entry,resolveDir:root,sourcefile:"phase5-db-browser-entry.tsx",loader:"tsx"},
 bundle:true,write:false,outdir:"phase5-db-browser",format:"iife",platform:"browser",target:"es2022",plugins:[{
  name:"stub-next-router",setup(plugin){
   plugin.onResolve({filter:/^next\/(?:link|navigation)$/},args=>({path:args.path,namespace:"phase5-next"}));
   plugin.onLoad({filter:/.*/,namespace:"phase5-next"},args=>({loader:"jsx",resolveDir:root,contents:
    args.path==="next/link"?
    'import React from "react";export default function Link({href,children,...rest}){return <a href={href} {...rest}>{children}</a>}':
    'export const useRouter=()=>({push:url=>window.__routes.push(url)});'}));
  }
 }]});
const bundle=(built.outputFiles.find(x=>x.path.endsWith(".js"))||built.outputFiles[0]).text;
function jsonRoute(route,status,data){
 return route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
}
async function request(intent,operation,payload={}){
 const result=await query("SELECT platform_subscription_order_request($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb) AS value",
  [workspace,actor,intent,operation,payload]);
 return result[0].value;
}
async function newIntent(){
 const id=randomUUID();
 const digest=createHash("sha256").update(randomBytes(32)).digest("hex");
 await query("INSERT INTO platform_subscription_purchase_intents(id,actor_id,workspace_id,offer_version_id,public_token_sha256) VALUES($1,$2,$3,$4,$5)",
  [id,actor,workspace,offer,digest]);
 return id;
}
async function setup(page,locale,intent){
 await page.route("http://localhost:45679/",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>SQL-backed Ekmivo</title>"}));
 await page.goto("http://localhost:45679/",{waitUntil:"domcontentloaded"});
 page.setDefaultTimeout(9000);
 await page.route("**/api/go/platform/purchase-intents/*/quote",async route=>{
  const data=JSON.parse(route.request().postData()||"{}");
  try{
   const result=await query("SELECT platform_subscription_coupon_quote($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5) AS result",
    [actor,intent,data.operation_key,data.revision,data.coupon_code]);
   return jsonRoute(route,200,result[0].result);
  }catch(e){return jsonRoute(route,409,{code:e.message})}
 });
 await page.route("**/api/go/workspaces/*/subscription-orders/**",async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  let operation="read";
  if(path.endsWith("/quote"))operation="quote";
  if(path.endsWith("/confirm"))operation="confirm";
  try{
   const data=operation==="read"?{}:JSON.parse(req.postData()||"{}");
   if(operation==="confirm")data.idempotency_key=req.headers()["idempotency-key"];
   const result=await request(intent,operation,data);
   if(operation==="read")result.checkout_enabled=true;
   return jsonRoute(route,200,result);
  }catch(e){return jsonRoute(route,409,{code:e.message})}
 });
 await page.route("**/api/go/workspaces/*/subscription-purchases/*/payment",async route=>{
  const data=JSON.parse(route.request().postData()||"{}");
  const rows=await query("SELECT invoice_id::text,quote_id::text FROM platform_subscription_order_confirmations WHERE intent_id=$1",[intent]);
  assert.equal(rows.length,1,"Go handoff cannot precede the authoritative invoice");
  assert.equal(data.invoice_id,rows[0].invoice_id);
  assert.equal(data.quote_id,rows[0].quote_id);
  return jsonRoute(route,200,{checkout_token:"A".repeat(43)});
 });
 await render(page,locale,intent);
 await page.waitForFunction(()=>{
  const input=document.querySelector("#ek-order-coupon-code");
  return input && !input.disabled;
 });
}
async function render(page,locale,intent){
 const head='<!doctype html><html lang="'+locale+'" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">'
  +'<style>html,body{margin:0;padding:0}'+css+'</style></head><body><div id="test-root"></div><script>'
  +'window.__locale='+JSON.stringify(locale)+';window.__intent='+JSON.stringify(intent)+';'
  +'window.__store='+JSON.stringify(workspace)+';window.__routes=[];</script><script>'+bundle+'</script></body></html>';
 await page.setContent(head,{waitUntil:"load"});
 await page.getByRole("button",{name:"Go to Pay"}).waitFor();
}
const browser=await chromium.launch({headless:true});
try{
 for(const [locale,width] of [["en",375],["bn",1024]]){
  const intent=await newIntent();
  const page=await browser.newPage({viewport:{width,height:860}});
  try{
   await setup(page,locale,intent);
   await page.getByText(locale==="bn"?"সর্বমোট পরিশোধযোগ্য":"Total payable").waitFor();
   const start=await request(intent,"read");
   assert.equal(start.quote.total_minor,"10500","React starts with SQL-backed 5% tax");
   const consents=page.locator('.ek-order-legal input[type="checkbox"]');
   assert.equal(await consents.count(),3);
   for(let i=0;i<3;i++)assert.equal(await consents.nth(i).isChecked(),false);
   assert.equal(await page.getByRole("button",{name:"Go to Pay"}).isDisabled(),true);
   const coupon=page.locator("#ek-order-coupon-code");
   await coupon.fill("PHASE5_CI_10");
   await page.locator(".ek-order-coupon button[type=submit]").click();
   await page.getByText(locale==="bn"?"কুপন প্রয়োগ হয়েছে। সার্ভার নতুন মোট হিসাব করেছে।":"Coupon applied. The server recalculated your total.").waitFor();
   const applied=await request(intent,"read");
   assert.equal(applied.quote.total_minor,"9450","browser Apply reflects real PostgreSQL coupon + tax");
   await page.locator(".ek-order-coupon button[type=button]").click();
   await page.getByText(locale==="bn"?"কুপন সরানো হয়েছে। নতুন মোট হিসাব হয়েছে।":"Coupon removed. Total recalculated.").waitFor();
   const removed=await request(intent,"read");
   assert.equal(removed.quote.total_minor,"10500","browser Remove restores real tax");
   for(let i=0;i<3;i++){
    await consents.nth(i).check();
    assert.equal(await page.getByRole("button",{name:"Go to Pay"}).isDisabled(),i!==2);
   }
   await page.getByRole("button",{name:"Go to Pay"}).click();
   await page.waitForFunction(()=>window.__routes.length>0);
   assert.deepEqual(await page.evaluate(()=>window.__routes),["/pay/subscription/"+"A".repeat(43)]);
   const rows=await query("SELECT count(*)::int AS total FROM platform_subscription_order_confirmations WHERE intent_id=$1",[intent]);
   assert.equal(rows[0].total,1,"browser confirm creates only one authoritative invoice");
   await render(page,locale,intent);
   const recovered=await request(intent,"read");
   assert.equal(recovered.status,"confirmed","refresh resumes existing invoice");
   const totals=await query("SELECT count(*)::int AS total FROM platform_subscription_order_confirmations WHERE intent_id=$1",[intent]);
   assert.equal(totals[0].total,1,"refresh never creates a second invoice");
   console.log("PHASE5 DB-BACKED CHROMIUM PASS:",locale,width,"coupon, 3 consents, confirm, refresh/recovery");
  }finally{await page.close()}
 }
}finally{
 await browser.close();
 await sql.end({timeout:4});
}
