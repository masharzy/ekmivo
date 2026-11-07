// Browser UX checks only. Never submits an account or contacts payment providers.
import {createRequire} from "node:module";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_RUNTIME||"playwright");
function expect(locator){return {
 toBeVisible:()=>locator.waitFor({state:"visible",timeout:60000}),
 toHaveCount:async n=>{for(let i=0;i<100;i++){if(await locator.count()===n)return;await new Promise(r=>setTimeout(r,100))}assert.equal(await locator.count(),n)},
 toHaveAttribute:async(k,v)=>assert.equal(await locator.getAttribute(k),v),
 toHaveValue:async v=>assert.equal(await locator.inputValue(),v)
}}
import {mkdir} from "node:fs/promises";
const base=process.env.PUBLIC_SMOKE_URL||"http://localhost:3027";
const evidence=new URL("../../../docs/evidence/PUBLIC-AUTH-POLISH-20261014/",import.meta.url).pathname.replace(/^\/(\w:)/,"$1");
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.SMOKE_BROWSER_CHANNEL});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:"briofold-locale",value:"en",url:base},{name:"briofold-theme",value:"light",url:base}]);
 const page=await context.newPage();let submissions=0;
 page.on("request",r=>{if(r.method()==="POST"&&new URL(r.url()).pathname==="/register")submissions++;});
 await page.goto(base+"/register",{timeout:180000});
 await expect(page.locator(".site-header")).toBeVisible();
 await expect(page.getByLabel("Your name",{exact:true})).toHaveCount(0);
 await page.getByLabel("Email address",{exact:true}).fill("ux-check@example.invalid");
 await page.getByLabel("Password",{exact:true}).fill("short1");
 await page.getByRole("button",{name:"Continue",exact:true}).click();
 await expect(page.locator("#auth-password-error")).toBeVisible();
 await page.getByLabel("Password",{exact:true}).fill("hello123");
 await expect(page.locator(".ek-password-checks [data-met=true]")).toHaveCount(3);
 await page.getByRole("button",{name:"Continue",exact:true}).click();
 await expect(page.getByLabel("Your name",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Workspace / business name",{exact:true})).toBeVisible();
 await expect(page.locator('input[name=password]')).toHaveAttribute("type","hidden");
 if(submissions!==0)throw Error("Step one must not submit registration to the server");
 await page.screenshot({path:evidence+"signup-step-two-light.png"});
 await page.getByRole("button",{name:"Edit",exact:true}).click();
 await expect(page.getByLabel("Password",{exact:true})).toHaveValue("hello123");
 await page.evaluate(()=>{window.__publicSmokeMarker="retained"});
 await page.locator(".ek-auth-return").click();
 await page.waitForURL(base+"/",{timeout:180000});
 await expect(page.locator(".site-header")).toBeVisible();
 if(await page.evaluate(()=>window.__publicSmokeMarker)!=="retained")throw Error("Back-home navigation reloaded the document");
 await expect(page.locator(".em-pricing")).toHaveCount(0);
 await expect(page.locator(".em-ending .em-actions a")).toHaveCount(1);
 await expect(page.locator(".em-services .em-heading>p")).toHaveCount(0);
 await page.locator('.em-hero .em-actions a[href="/payment-gateway"]').click();
 await page.waitForURL(base+"/payment-gateway",{timeout:180000});
 if(await page.evaluate(()=>window.__publicSmokeMarker)!=="retained")throw Error("Hero navigation reloaded the document");
 await expect(page.locator(".site-header")).toBeVisible();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector(".ek-pg-intro")).opacity==="1");
 await page.screenshot({path:evidence+"payment-gateway-light.png"});
 console.log("PASS: two-step signup, eight-character checks, preserved inputs, shared header, SPA hero navigation and single homepage CTA");
 for(const locale of ["en","bn"]){
  await context.addCookies([{name:"briofold-locale",value:locale,url:base},{name:"briofold-theme",value:"dark",url:base}]);
  await page.setViewportSize({width:320,height:900});
  await page.goto(base+"/login",{timeout:180000});
  await expect(page.locator(".site-header")).toBeVisible();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error("Login overflows at 320px: "+locale);
  await page.screenshot({path:evidence+`login-${locale}-dark-mobile.png`});
  await page.goto(base+"/register",{timeout:180000});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error("Signup overflows at 320px: "+locale);
  await page.getByLabel(locale==="bn"?"ইমেইল ঠিকানা":"Email address",{exact:true}).fill("ux-check@example.invalid");
  await page.getByLabel(locale==="bn"?"পাসওয়ার্ড":"Password",{exact:true}).fill("hello123");
  await page.getByRole("button",{name:locale==="bn"?"পরবর্তী ধাপ":"Continue",exact:true}).click();
  await expect(page.getByLabel(locale==="bn"?"আপনার নাম":"Your name",{exact:true})).toBeVisible();
  await page.screenshot({path:evidence+`signup-${locale}-step-two-dark-mobile.png`});
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [768,1024]){
   await page.setViewportSize({width,height:1000});
   await page.goto(base+"/payment-gateway",{timeout:180000});
   await expect(page.locator(".site-header")).toBeVisible();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error("Payment Gateway overflow: "+locale+" "+width);
   const heading=await page.locator(".ek-product-heading").first().evaluate(el=>{const a=el.querySelector("span").getBoundingClientRect(),b=el.querySelector("h2").getBoundingClientRect();return a.bottom<=b.top+1});
   if(!heading)throw Error("Section label must sit above its heading");
  }
  if(await page.locator(".ek-pg-route-connector").first().evaluate(el=>getComputedStyle(el,"::after").animationName)!=="none")throw Error("Reduced motion did not disable receipt-path animation");
  await page.screenshot({path:evidence+`payment-gateway-${locale}-dark-tablet.png`});
 }
 console.log("PASS: EN/BN dark mobile auth at 320px, Payment Gateway at 768/1024px and reduced motion");
 await context.close();
}finally{await browser.close();}
