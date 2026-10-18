import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";

// UI-only proof with a REAL authenticated Next.js workspace, and explicitly
// MOCKED Go payment rows. Real isolated PostgreSQL and Go finance behavior is
// independently verified by pg04-financial-smoke.mjs. No live/provider claims.
export async function runPG09Browser({origin,browser,tenant,sessions}){
 const uuid="1d7c6c81-987e-4a44-a7a0-51b5a4c81234";
 const paymentId="1d7c6c81-987e-4a44-a7a0-51b5a4c81235";
 const root="/w/"+tenant+"/payments/transactions";
 const calls=[],results=[];
 let offlineSource=false;
 const example={id:paymentId,merchant_reference:"PG09-FAKE-UI-REFERENCE",
  verified_amount_minor:5500,method:"bkash",status:"verified",
  payer_suffix:"1234",payer_number:"01712345678",transaction_id:"FAKE123456",
  verification_method:"sandbox_fixture",verified_at:"2026-10-11T18:02:00Z",webhook_status:"delivered"};
 const setup=async(context)=>{
  await context.route("**/api/go/workspaces/"+tenant+"/operations/**",async route=>{
   const request=route.request(),url=new URL(request.url());
   const resource=(url.pathname.split("/operations/")[1]||"").split("/")[0];
   calls.push({resource,method:request.method(),environment:url.searchParams.get("environment"),
    q:url.searchParams.get("q"),status:url.searchParams.get("status")});
   if(resource==="payments"&&offlineSource)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({code:"PIPELINE_SOURCE_UNAVAILABLE"})});
   const items=resource==="payments"?[example]:resource==="gateways"?[{id:uuid,method:"bkash",display_suffix:"7890"}]:[];
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({items,next_cursor:null})});
  });
 };
 const pass=(name)=>{results.push(name);console.log("PG09 UI-only PASS: "+name)};
 await mkdir("test-results/pg09",{recursive:true});
 try{
  const owner=await browser.newContext({viewport:{width:1280,height:900}});
  try{
   await owner.addCookies([{name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);
   await setup(owner);
   const p=await owner.newPage();p.setDefaultTimeout(30000);
   await p.goto(origin+root);
   await p.getByRole("heading",{name:"Payments",exact:true}).waitFor();
   await p.getByRole("button",{name:"Refresh",exact:true}).click();
   await p.getByText("PG09-FAKE-UI-REFERENCE").first().waitFor();
   assert.ok(calls.some(x=>x.resource==="payments"&&x.environment==="live"),
    "payments table did not request the current server-validated live environment");
   assert.equal(await p.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
   pass("authenticated owner views read-only provider-verified rows, no manual mark-paid");

   await p.getByRole("button",{name:"Filters",exact:true}).click();
   await p.locator("#payment-filters").getByLabel("Status").selectOption("verified");
   await p.locator("#payment-filters").getByRole("button",{name:"Apply",exact:true}).click();
   await p.getByText("PG09-FAKE-UI-REFERENCE").first().waitFor();
   assert.ok(calls.some(x=>x.resource==="payments"&&x.status==="verified"),
    "server status filter was not forwarded to scoped payment operations API");
   pass("current transaction filter is passed to Go API, not filtered locally");

   await p.getByLabel("Search records").fill("PG09-FAKE");
   await p.getByRole("button",{name:"Search",exact:true}).click();
   await p.getByText("PG09-FAKE-UI-REFERENCE").first().waitFor();
   assert.ok(calls.some(x=>x.resource==="payments"&&x.q==="PG09-FAKE"),
    "server-side search was not passed through");
   pass("current transaction search reaches backend with scoped query");

   offlineSource=true;
   await p.getByRole("button",{name:"Refresh",exact:true}).click();
   await p.getByRole("alert").getByText("Unable to load records.").waitFor();
   assert.equal(await p.getByText("No verified transactions yet").count(),0);
   pass("503 payment outage is not mislabeled as no transactions");
  }finally{await owner.close()}

  const viewer=await browser.newContext({viewport:{width:1024,height:900}});
  try{
   offlineSource=false;
   await viewer.addCookies([{name:"ekmivo-session",value:sessions.viewer,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);
   await setup(viewer);
   const p=await viewer.newPage();p.setDefaultTimeout(30000);
   await p.goto(origin+root);
   await p.getByRole("heading",{name:"Payments",exact:true}).waitFor();
   await p.getByRole("button",{name:"Refresh",exact:true}).click();
   await p.getByText("PG09-FAKE-UI-REFERENCE").first().waitFor();
   assert.equal(await p.getByRole("button",{name:/mark.*paid|approve.*payment/i}).count(),0);
   pass("viewer sees transactions but cannot manually approve a payment");
  }finally{await viewer.close()}

  for(const locale of ["en","bn"])for(const theme of ["light","dark"]){
   const c=await browser.newContext({viewport:{width:768,height:900}});
   try{
    await c.addCookies([{name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},
     {name:"ekmivo-locale",value:locale,url:origin},{name:"ekmivo-theme",value:theme,url:origin}]);
    await setup(c);
    const p=await c.newPage();p.setDefaultTimeout(30000);
    await p.goto(origin+"/"+locale+root);
    await p.getByRole("heading",{name:locale==="bn"?"পেমেন্ট":"Payments",exact:true}).waitFor();
    assert.equal(await p.locator("html").getAttribute("lang"),locale);
    assert.equal(await p.locator("html").getAttribute("data-theme"),theme);
    await p.getByRole("button",{name:locale==="bn"?"রিফ্রেশ":"Refresh"}).click();
    await p.getByText("PG09-FAKE-UI-REFERENCE").first().waitFor();
    pass("transactions "+locale+"/"+theme+": real authenticated shell + mocked data");
   }finally{await c.close()}
  }
  await writeFile("test-results/pg09/browser-results.json",JSON.stringify({
   classification:"UI ONLY: real user sessions, Next routes; Go operations responses MOCKED. PG04 SQL/HTTP separate.",
   results,calls
  },null,2));
 }catch(e){
  await writeFile("test-results/pg09/failure.txt",String(e));
  throw e;
 }
}
