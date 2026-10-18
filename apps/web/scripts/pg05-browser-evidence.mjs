import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID,randomBytes} from "node:crypto";
import {chromium} from "@playwright/test";

// Executed only inside pg04-financial-smoke's disposable localhost DB/API
// lifetime. No mocked route, provider result or browser-created paid state.
export async function runPG05Browser({control,goOrigin,tenant,sessions,token,expiredToken}) {
 const origin="http://127.0.0.1:17886";
 execFileSync(process.execPath,["scripts/sync-tokens.mjs"],{cwd:new URL("../",import.meta.url),stdio:"inherit"});
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","17886"],{
  cwd:new URL("../",import.meta.url),env:{...process.env,NODE_ENV:"development",DATABASE_URL:control,GO_API_URL:goOrigin,GO_WEB_ORIGIN:goOrigin},stdio:["ignore","pipe","pipe"]
 });
 let logs="",browser;
 server.stdout.on("data",d=>{logs=(logs+String(d)).slice(-5000)});
 server.stderr.on("data",d=>{logs=(logs+String(d)).slice(-5000)});
 const results=[];
 const record=name=>{results.push({name,result:"PASS"});console.log("PG05 browser PASS:",name)};
 try{
  let ready=false;
  for(let i=0;i<150;i++){
   if(server.exitCode!==null)throw Error("Next test server stopped: "+logs);
   try{const response=await fetch(origin+"/api/checkout/invalid",{signal:AbortSignal.timeout(1000)});if(response.status===404){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  assert.ok(ready,"Next server did not start: "+logs);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},permissions:["clipboard-read","clipboard-write"]});
  await context.addCookies([{name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},{name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  // Capture only public URL paths/statuses; never log session headers/tokens.
  const redirectTrace=[];
  page.on("response",response=>{
   if(response.status()>=300&&response.status()<400&&redirectTrace.length<55){
    const target=response.headers()["location"]||"";
    const url=new URL(response.url());
    const dest=target?new URL(target,url).pathname:"";
    redirectTrace.push(response.status()+" "+url.pathname+" -> "+dest);
   }
  });
  page.on("dialog",dialog=>dialog.accept());
  // The merchant dashboard is intentionally live-only. The historical
  // sandbox invoice creation form no longer exists here; PG04's real SQL and
  // Go HTTP tests above still validate invoice line pricing and linked intents.
  const merchantPath="/w/"+tenant+"/payments/requests";
  await page.goto(origin+merchantPath);
  await page.locator(".pg05-merchant").getByRole("heading",{name:"Payment links",exact:true}).waitFor();
  const newRequest=page.getByRole("button",{name:"New request",exact:true});
  // This disposable control-plane tenant has no paid subscription. The modern
  // plan gate correctly disables creation in that case. Assert the visible
  // fail-closed reason rather than waiting 30s for a disabled button to click.
  const limit=page.locator(".pg-plan-limit[data-blocked='true']");
  await newRequest.waitFor({state:"visible"});
  if(await newRequest.isEnabled()){
   await newRequest.click();
   await page.getByRole("heading",{name:"New request",exact:true}).waitFor();
   await page.getByRole("button",{name:"Issue source document",exact:true}).click();
   await page.getByRole("heading",{name:"Issue document",exact:true}).waitFor();
   assert.ok(await page.getByRole("button",{name:"Issue document",exact:true}).isDisabled(),
    "live-only merchant UI improperly enabled sandbox invoice issuance");
   record("owner UI uses current modal flow and forbids sandbox document issuance in live context");
   await page.getByRole("button",{name:"Close",exact:true}).first().click();
  }else{
   await limit.waitFor({state:"visible"});
   record("owner UI disables new requests without an active plan; financial writes fail closed");
  }

  // Checkout below uses a genuine Go-signed sandbox token created and
  // payer-locked in PG04's actual isolated financial database above.
  const checkoutUrl=origin+"/en/checkout/"+token;
  const [loaded]=await Promise.all([
   page.waitForResponse(r=>r.url().includes("/api/checkout/"+token)&&r.request().method()==="GET"),
   page.goto(checkoutUrl)
  ]);
  assert.equal(loaded.status(),200,"real checkout did not load");
  const checkout=await loaded.json();
  assert.equal(checkout.amount_minor,12345,"checkout amount differs from authoritative DB");
  assert.equal(checkout.state,"awaiting_payment","seeded payer lock state was lost");
  await page.locator('[data-customer-checkout="true"]').waitFor();
  assert.ok((await page.locator('[data-customer-checkout="true"]').innerText()).includes("123.45"),
   "correct currency amount missing from checkout");
  assert.equal(await page.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
  await page.reload();
  await page.locator('[data-customer-checkout="true"]').waitFor();
  record("real DB/Go signed checkout token, authoritative exact amount, locked-payer refresh, no mark-paid");

  // The public checkout is explicitly bilingual, themed and responsive.
  for(const width of [320,768,1440])for(const locale of ["en","bn"])for(const theme of ["light","dark"]){
   const c=await browser.newContext({viewport:{width,height:900}});
   await c.addCookies([{name:"ekmivo-theme",value:theme,url:origin},{name:"ekmivo-locale",value:locale,url:origin}]);
   const p=await c.newPage();
   try{
    const [checkResponse]=await Promise.all([
     p.waitForResponse(r=>r.url().includes("/api/checkout/"+token)&&r.request().method()==="GET"),
     p.goto(origin+"/"+locale+"/checkout/"+token)
    ]);
    assert.equal(checkResponse.status(),200,"localized checkout API failed");
    assert.equal((await checkResponse.json()).amount_minor,12345,"localized checkout amount changed");
    await p.locator('[data-customer-checkout="true"]').waitFor();
    assert.equal(await p.locator("html").getAttribute("lang"),locale);
    assert.equal(await p.locator("html").getAttribute("data-theme"),theme);
    await p.waitForFunction(()=>{
     const v=document.querySelector('[data-customer-checkout="true"]')?.textContent||"";
     return v.replace(/[০-৯]/g,d=>String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/,/g,"").includes("123.45");
    },null,{timeout:15000});
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),
     "horizontal checkout overflow at "+width+"px "+locale+" "+theme);
    assert.equal(await p.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
    if(width===320&&locale==="bn"&&theme==="dark"){
     await mkdir("test-results/pg05",{recursive:true});
     await p.screenshot({path:"test-results/pg05/checkout-bn-dark-320.png",fullPage:true});
    }
    record("public checkout "+width+"px "+locale+" "+theme+": real token, amount, locale, theme, responsive");
   }finally{await c.close()}
  }
  await page.goto(origin+"/en/checkout/"+randomBytes(32).toString("base64url"));
  await page.getByRole("heading",{name:"Payment link not found",exact:true}).waitFor();
  record("invalid opaque checkout token has a truthful missing-state message");
  await page.goto(origin+"/en/checkout/"+expiredToken);
  await page.getByRole("heading",{name:"Checkout expired",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
  record("expired real checkout is read-only and cannot be manually paid");

  await context.close();
  const viewer=await browser.newContext();
  try{
   await viewer.addCookies([{name:"ekmivo-session",value:sessions.viewer,url:origin,httpOnly:true,sameSite:"Lax"},{name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);
   const viewerPage=await viewer.newPage();
   await viewerPage.goto(origin+merchantPath);
   await viewerPage.locator(".pg05-merchant").getByRole("heading",{name:"Payment links",exact:true}).waitFor();
   assert.equal(await viewerPage.getByRole("button",{name:"New request",exact:true}).count(),0);
   record("real viewer session cannot access merchant request creation controls");
  }finally{await viewer.close()}

  // PG09 UI-only coverage uses this genuine logged-in Next shell and real
  // owner/viewer sessions, but stubs PG09 HTTP operations responses.
  // Actual PG09 SQL correctness is exercised independently in pg04 smoke.
  const {runPG09Browser}=await import("./pg09-browser-evidence.mjs");
  await runPG09Browser({origin,browser,tenant,sessions});
  await mkdir("test-results/pg05",{recursive:true});
  await writeFile("test-results/pg05/browser-results.json",JSON.stringify({classification:"isolated actual DB/Go checkout + live-only merchant modal smoke; PG05 source/intent HTTP and SQL exercised separately; no provider acceptance",results},null,2));
 }catch(error){await mkdir("test-results/pg05",{recursive:true});await writeFile("test-results/pg05/failure.txt",String(error)+"\n"+logs);throw error}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
}
