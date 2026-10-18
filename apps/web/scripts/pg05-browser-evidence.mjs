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
  await context.addCookies([{name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"}]);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  page.on("dialog",dialog=>dialog.accept());
  const path=`/w/${tenant}/payments/requests`;
  await page.goto(origin+path);
  await page.getByRole("heading",{name:"Order and invoice sources",exact:true}).waitFor();
  const ref="BROWSER-INVOICE-"+randomUUID();
  await page.getByLabel("Document reference",{exact:true}).fill(ref);
  await page.getByLabel("Line description",{exact:true}).fill("Browser-issued service");
  await page.getByLabel("Quantity",{exact:true}).fill("2");
  await page.getByLabel("Unit price (BDT)",{exact:true}).fill("25.00");
  await page.getByRole("button",{name:/Add another line/}).click();
  const line=page.locator(".pg05-two").filter({has:page.getByLabel("Line description (2)",{exact:true})});
  await line.getByLabel("Line description (2)",{exact:true}).fill("Delivery");
  await line.getByLabel("Quantity",{exact:true}).fill("1");
  await line.getByLabel("Unit price (BDT)",{exact:true}).fill("17.35");
  await page.getByRole("button",{name:"Issue document",exact:true}).click();
  await page.getByRole("option",{name:new RegExp(ref)}).waitFor({state:"attached"});
  await page.getByLabel("Merchant reference",{exact:true}).fill(ref+"-PAY");
  // Synchronize with the *rendered* submit action: a stale accessible name
  // previously left waitForResponse pending without ever submitting a POST.
  const createRequest=page.getByRole("button",{name:"Create request",exact:true});
  await createRequest.waitFor({state:"visible"});
  assert.ok(await createRequest.isEnabled(),"payment request submit unexpectedly disabled");
  const [createResponse]=await Promise.all([
   page.waitForResponse(r=>r.url().includes("/payment-intents?")&&r.request().method()==="POST"),
   createRequest.click()
  ]);
  assert.ok(createResponse.ok(),"financial POST rejected with HTTP "+createResponse.status());
  const issued=await createResponse.json();
  assert.equal(issued.amount_minor,6735,"browser linked source total must come from DB");
  const card=page.locator(".pg05-record").filter({has:page.getByText(ref+"-PAY",{exact:true})});
  await card.waitFor();
  await card.getByRole("button",{name:"Details and history",exact:true}).click();
  await page.getByRole("region",{name:"Request history"}).getByText("Browser-issued service",{exact:false}).waitFor();
  record("real owner UI issues two-line invoice, links server total, reads immutable history");
  await page.getByRole("button",{name:"Close details",exact:true}).click();
  await card.getByRole("button",{name:"Copy link",exact:true}).click();
  assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).endsWith(issued.checkout_token));
  record("checkout sharing copies the actual scoped capability");
  await card.getByRole("link",{name:/Open checkout/}).click();
  await page.getByLabel("Number you will pay from",{exact:true}).fill("০১৮১২৩৪৫৬৭৮");
  await page.getByLabel("Payment method",{exact:true}).selectOption("nagad");
  await page.getByRole("button",{name:"Confirm number and method",exact:true}).click();
  await page.getByRole("heading",{name:"Payer and route locked",exact:true}).waitFor();
  await page.reload();
  await page.getByRole("heading",{name:"Payer and route locked",exact:true}).waitFor();
  assert.equal(await page.getByLabel("Number you will pay from",{exact:true}).count(),0);
  record("Bengali payer normalization, route locking and refresh resume without duplicate attempt");
  await page.evaluate(()=>{const actual=Date.now;Date.now=()=>actual()+3*60*60*1000});
  await page.getByRole("button",{name:/Refresh server status/}).click();
  await page.getByRole("heading",{name:"Payer and route locked",exact:true}).waitFor();
  assert.notEqual(await page.getByRole("timer").textContent(),"00:00","device wall clock changed server countdown");
  record("server-time countdown survives a three-hour device wall-clock error");
  await page.locator("#site-theme").selectOption("dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"),"dark");
  await page.locator("#site-locale").selectOption("bn");
  await page.getByRole("heading",{name:"প্রেরক নম্বর নিশ্চিত হয়েছে",exact:true}).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"),"bn");
  await page.locator("#site-locale").selectOption("en");
  await page.getByRole("heading",{name:"Payer and route locked",exact:true}).waitFor();
  await page.locator("#site-theme").selectOption("system");
  await page.emulateMedia({colorScheme:"dark"});
  assert.equal(await page.locator("html").getAttribute("data-theme"),null);
  record("locale and Light/Dark/System changes retain locked payer and checkout capability");
  await context.setOffline(true);
  await page.getByRole("button",{name:/Refresh server status/}).click();
  await page.getByText(/You are offline/).waitFor();
  await page.getByRole("heading",{name:"Payer and route locked",exact:true}).waitFor();
  await context.setOffline(false);
  record("offline retains the last authoritative result and reconnect recovers");
  await page.goto(origin+path);
  const cancelCard=page.locator(".pg05-record").filter({has:page.getByText(ref+"-PAY",{exact:true})});
  await cancelCard.getByRole("button",{name:"Cancel request",exact:true}).click();
  await cancelCard.getByText("Cancelled",{exact:true}).waitFor();
  await page.goto(origin+"/checkout/"+issued.checkout_token);
  await page.getByRole("heading",{name:"Request cancelled",exact:true}).waitFor();
  record("real merchant cancellation survives public reload and preserves source history");
  await page.goto(origin+"/checkout/"+randomBytes(32).toString("base64url"));
  await page.getByRole("heading",{name:"Checkout not found",exact:true}).waitFor();
  record("invalid opaque capability displays actual missing state without payment instructions");
  await page.goto(origin+"/checkout/"+expiredToken);
  await page.getByRole("heading",{name:"Checkout expired",exact:true}).waitFor();
  assert.equal(await page.getByLabel("Number you will pay from",{exact:true}).count(),0);
  record("expired real server record retains summary and removes payer/payment actions");
  await context.close();
  const viewer=await browser.newContext();
  await viewer.addCookies([{name:"ekmivo-session",value:sessions.viewer,url:origin,httpOnly:true,sameSite:"Lax"}]);
  const viewerPage=await viewer.newPage();await viewerPage.goto(origin+path);
  await viewerPage.getByText(/Read-only access/).waitFor();
  assert.ok(await viewerPage.getByRole("button",{name:"Issue document",exact:true}).isDisabled());
  assert.equal(await viewerPage.getByRole("button",{name:"Cancel request",exact:true}).count(),0);
  record("viewer can read but cannot issue documents or cancel through UI");
  await viewer.close();
  for(const width of [320,768,1024,1440])for(const locale of ["en","bn"])for(const theme of ["light","dark"]){
   const c=await browser.newContext({viewport:{width,height:900}});
   await c.addCookies([{name:"ekmivo-theme",value:theme,url:origin}]);
   const p=await c.newPage();await p.goto(`${origin}/checkout/${token}`);
   await p.locator(".pg05-amount strong").waitFor();
   assert.equal(await p.locator("html").getAttribute("lang"),locale);
   assert.equal(await p.locator("html").getAttribute("data-theme"),theme);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),"horizontal overflow");
   assert.equal(await p.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
   await p.keyboard.press("Tab");assert.ok(await p.evaluate(()=>document.activeElement!==document.body));
   if(width===320&&locale==="bn"&&theme==="dark"){
    await mkdir("test-results/pg05",{recursive:true});await p.screenshot({path:"test-results/pg05/checkout-bn-dark-320.png",fullPage:true});
   }
   record(`public checkout ${width}px ${locale} ${theme}: real data, theme, locale, keyboard, no overflow`);
   await c.close();
  }
  // PG09 UI-only coverage uses this genuine logged-in Next shell and real
  // owner/viewer sessions, but stubs PG09 HTTP operations responses.
  // Actual PG09 SQL correctness is exercised independently in pg04 smoke.
  const {runPG09Browser}=await import("./pg09-browser-evidence.mjs");
  await runPG09Browser({origin,browser,tenant,sessions});
  await mkdir("test-results/pg05",{recursive:true});
  await writeFile("test-results/pg05/browser-results.json",JSON.stringify({classification:"isolated real DB/Go/Next browser evidence; no provider or deployment acceptance",results},null,2));
 }catch(error){await mkdir("test-results/pg05",{recursive:true});await writeFile("test-results/pg05/failure.txt",String(error)+"\n"+logs);throw error}
 finally{if(browser)await browser.close();server.kill("SIGTERM")}
}
