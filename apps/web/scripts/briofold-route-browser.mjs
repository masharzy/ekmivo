import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import postgres from "postgres";

// Real Next browser routes + real disposable control DB. No provider mocks or writes.
export async function runBriofoldRouteBrowser({origin,browser,control,tenant,sessions}){
 const url=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||/prod/i.test(url.pathname))throw Error("Phase2 browser refuses shared DB");
 const db=postgres(control,{max:1,prepare:false});
 let actor,aiEnabled;
 try{
  const rows=await db.unsafe("SELECT user_id FROM auth_sessions WHERE token_hash=$1",[createHash("sha256").update(sessions.owner).digest("hex")]);
  assert.equal(rows.length,1);actor=String(rows[0].user_id);
  const products=await db.unsafe("SELECT product,enabled FROM workspace_product_access WHERE workspace_id=$1",[tenant]);
  aiEnabled=products.some(row=>row.product==="ai"&&row.enabled===true);
  assert.ok(products.some(row=>row.product==="payments"&&row.enabled===true),"Canonical fixture requires active payment access");
 }finally{await db.end({timeout:3});}
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 try{
  await context.addCookies([
   {name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},
   {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"},
   {name:"ekmivo-default-workspace",value:actor+":"+tenant,url:origin,httpOnly:true,sameSite:"Lax"}
  ]);
  const page=await context.newPage();page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(30000);
  for(const path of ["/dashboard","/inbox","/orders","/payments","/sms-data","/invoices","/customers","/reports","/settings"]){
   const response=await page.goto(origin+path);
   assert.equal(response.status(),path==="/inbox"&&!aiEnabled?404:200,"Canonical route failed: "+path);
   assert.equal(new URL(page.url()).pathname,path,"Canonical URL changed: "+path);
   if(response.status()===200)await page.locator('.ds-app[data-unified="true"]').waitFor();
  }
  await page.locator('.ds-navigation a[href="/payments"]').first().click();
  await page.waitForURL(url=>url.pathname==="/payments");
  await page.locator('.ds-navigation a[href="/invoices"]').first().click();
  await page.waitForURL(url=>url.pathname==="/invoices");
  await page.goBack();await page.waitForURL(url=>url.pathname==="/payments");
  await page.goForward();await page.waitForURL(url=>url.pathname==="/invoices");
  assert.equal((await page.reload()).status(),200,"Canonical reload failed");
  await page.goto(origin+"/en/payments?phase2_probe=history");
  assert.equal(new URL(page.url()).pathname,"/payments");
  assert.equal(new URL(page.url()).searchParams.get("phase2_probe"),"history");
  for(const path of ["/payments/constructor","/orders/__proto__","/reports/toString","/settings/not-a-setting"]){
   assert.equal((await page.goto(origin+path)).status(),404,"Unknown/inherited route was accepted: "+path);
  }
  assert.equal((await page.goto(origin+"/w/"+tenant+"/payments/requests")).status(),200,"Authorized legacy bookmark failed");
  console.log("Phase2 REAL NEXT BROWSER PASS: nine canonical roots, product gate, client navigation, back/forward, reload, locale-neutral redirects/query, unknown 404 and authorized legacy bookmark");
 }finally{await context.close();}
 const guest=await browser.newContext();
 try{
  const page=await guest.newPage();page.setDefaultNavigationTimeout(90000);
  await page.goto(origin+"/dashboard");
  assert.equal(new URL(page.url()).pathname,"/login","Anonymous dashboard did not require login");
 }finally{await guest.close();}
}
