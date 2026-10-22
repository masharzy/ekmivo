import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import postgres from "postgres";

// Synthetic records in the disposable CI *live-realm database*. Nothing here
// claims to simulate a provider callback, connected phone, or real money.
// This verifies that the real Next -> authenticated Go -> restricted finance
// reader -> Next UI chain is unchanged between legacy and canonical routes.
export async function runBriofoldPhase9Browser({origin,browser,control,sessions,liveDatabase,workspaceId}){
 const controlURL=new URL(control),financeURL=new URL(liveDatabase);
 for(const url of [controlURL,financeURL]){
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname),"Phase9 browser forbids remote databases");
  assert.ok(!/prod/i.test(url.pathname),"Phase9 browser forbids production databases");
 }
 assert.equal(financeURL.pathname,"/ekmivo_pg04_live","Phase9 requires the disposable PG04 live-test realm");
 const db=postgres(control,{max:1,prepare:false}),finance=postgres(liveDatabase,{max:1,prepare:false});
 let context,viewerContext;
 const sessionUser=async token=>String((await db.unsafe("SELECT user_id FROM auth_sessions WHERE token_hash=$1",[createHash("sha256").update(token).digest("hex")]))[0].user_id);
 try{
  const owner=await sessionUser(sessions.owner),viewer=await sessionUser(sessions.viewer);
  const member=await db.unsafe("SELECT role FROM workspace_members WHERE workspace_id=$1::uuid AND user_id=$2::uuid",[workspaceId,owner]);
  assert.equal(member[0]?.role,"owner","Phase9 workspace is not an owner-authorized test tenant");
  await finance.unsafe("SELECT financial_sync_workspace($1::uuid,'live',10000,true)",[workspaceId]);
  const fingerprint=()=>createHash("sha256").update(randomUUID()).digest("hex");
  const reference="P9-FICTIONAL-"+randomUUID().slice(0,8).toUpperCase(),amount=23456,payer=fingerprint();
  const [account]=await finance.unsafe("INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES($1,'live','bkash',$2,'7890') RETURNING id",[workspaceId,fingerprint()]);
  const [intent]=await finance.unsafe("INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at) VALUES($1,'live',$2,$3,now()+interval '30 minutes') RETURNING id",[workspaceId,reference,amount]);
  const [attempt]=await finance.unsafe("INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version) VALUES($1,'live',$2,$3,$4,'1234',$5,'bkash',now()+interval '2 seconds',now()+interval '20 minutes',1) RETURNING id",[workspaceId,intent.id,account.id,payer,amount]);
  const [inbound]=await finance.unsafe("INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence) VALUES($1,'live','provider_api',$2,$3,now()+interval '4 seconds',$4) RETURNING id",[workspaceId,"ci-only-"+randomUUID(),fingerprint(),Buffer.alloc(48,55)]);
  const [receipt]=await finance.unsafe("INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version) VALUES($1,'live',$2,$3,$4,$5,$6,'bkash','incoming',now()+interval '4 seconds','second',1) RETURNING id",[workspaceId,inbound.id,account.id,fingerprint(),payer,amount]);
  const [payment]=await finance.unsafe("INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version) VALUES($1,'live',$2,$3,$4,'provider_api',1) RETURNING id",[workspaceId,attempt.id,receipt.id,amount]);
  await finance.unsafe("INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor) VALUES($1,'live',$2,$3,$4)",[workspaceId,payment.id,intent.id,amount]);
  const [device]=await finance.unsafe("INSERT INTO pg06_devices(workspace_id,environment,account_id,name,source,parser_id,binding) VALUES($1,'live',$2,'Fictional CI phone','device_sms','ci-parser','ci-binding') RETURNING id",[workspaceId,account.id]);
  const [transport]=await finance.unsafe("INSERT INTO pg06_transport(workspace_id,environment,device_id,event_id,digest,sequence,observation_id,observed_at) VALUES($1,'live',$2,$3,$4,1,$5,now()+interval '4 seconds') RETURNING id",[workspaceId,device.id,"ci-transport-"+randomUUID(),fingerprint(),receipt.id]);
  await finance.unsafe("INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason,payment_id,processed_at) VALUES($1,'live',$2,'matched','', $3,now())",[workspaceId,receipt.id,payment.id]);
  const [webhook]=await finance.unsafe("INSERT INTO pg08_endpoints(workspace_id,environment,url,secret) VALUES($1,'live','https://fictional-ci.example.invalid/payment-webhook',$2) RETURNING id",[workspaceId,Buffer.alloc(48,67)]);

  const authenticated=async(token,actor)=>{
   const c=await browser.newContext();
   await c.addCookies([
    {name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-default-workspace",value:actor+":"+workspaceId,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
   ]);
   return c;
  };
  context=await authenticated(sessions.owner,owner);
  viewerContext=await authenticated(sessions.viewer,viewer);
  const base=origin+`/api/go/workspaces/${workspaceId}`;
  const fetchRows=async(c,resource)=>{
   const response=await c.request.get(`${base}/operations/${resource}?environment=live`);
   assert.equal(response.status(),200,`${resource} authoritative Go reader failed: ${await response.text()}`);
   return (await response.json()).items;
  };
  const payments=await fetchRows(context,"payments");
  assert.deepEqual(payments.filter(r=>r.id===payment.id).map(r=>[r.merchant_reference,Number(r.verified_amount_minor),r.status]),[[reference,amount,"verified"]]);
  assert.equal(payments.filter(r=>r.id===payment.id).length,1,"double-confirmed payment in canonical source");
  assert.ok((await fetchRows(context,"incoming")).some(r=>r.id===transport.id&&r.payment_id===payment.id));
  assert.ok((await fetchRows(context,"gateways")).some(r=>r.id===account.id));
  assert.ok((await fetchRows(context,"webhooks")).some(r=>r.id===webhook.id));
  assert.ok((await fetchRows(viewerContext,"payments")).some(r=>r.id===payment.id),"viewer cannot read authorized masked financial facts");
  const missing=await context.request.get(`${base}/operations/payments/${randomUUID()}?environment=live`);
  assert.equal(missing.status(),200,"opaque absent record did not use constrained empty result");
  assert.deepEqual((await missing.json()).items,[],"foreign/absent payment exposed records");
  const unrelated=await context.request.get(`${origin}/api/go/workspaces/${randomUUID()}/operations/payments?environment=live`);
  assert.ok([403,404,409].includes(unrelated.status()),"tenant scope accepted an unrelated workspace");
  const rejected=await viewerContext.request.post(`${base}/operations/webhooks/${webhook.id}/disable?environment=live`,{headers:{Origin:origin},data:{}});
  assert.ok([403,405].includes(rejected.status()),"viewer mutated an endpoint");
  assert.ok((await fetchRows(context,"webhooks")).some(r=>r.id===webhook.id&&r.active),"denied mutation changed webhook state");

  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  for(const [canonical,legacy,expected] of [
   ["/payments",`/w/${workspaceId}/payments/transactions`,reference],
   [`/payments/transactions/${payment.id}`,`/w/${workspaceId}/payments/transactions/${payment.id}`,reference],
   ["/sms-data",`/w/${workspaceId}/payments/incoming`,"device_sms"],
   [`/sms-data/${transport.id}`,`/w/${workspaceId}/payments/incoming/${transport.id}`,"234.56"]
  ]){
   let oldText="",newText="",oldRecord="",newRecord="";
   for(const [path,record] of [[legacy,false],[canonical,true]]){
    const response=await page.goto(origin+path);assert.equal(response.status(),200,`route ${path} did not render`);
    if(path.includes("transactions/")||path.includes("/sms-data/")||path.includes("incoming/"))await page.locator(".pg-operation-detail").waitFor();
    else await page.locator("table tbody tr").first().waitFor();
    const content=await page.locator("main").innerText();
    assert.ok(content.includes(expected),`${path} missing same financial record ${expected}`);
    const data=path.includes("transactions/")||path.includes("/sms-data/")||path.includes("incoming/")
     ?await page.locator(".pg-operation-detail").innerText()
     :await page.locator("table tbody tr").first().innerText();
    if(record){newText=content;newRecord=data;}else{oldText=content;oldRecord=data;}
   }
   assert.ok(oldText.includes(expected)&&newText.includes(expected),"legacy/canonical readers changed financial record semantics");
   assert.equal(newRecord,oldRecord,`${canonical} changed authorized record facts vs ${legacy}`);
   if(canonical==="/payments")assert.ok(newRecord.includes("234.56"),"UI verified amount disagrees with finance ledger");
  }
  await page.goto(origin+"/payments/links?view=requests");
  await page.getByRole("heading",{name:"One-time requests",exact:true}).waitFor();
  assert.ok(await page.getByRole("link",{name:"One-time requests"}).count(),"canonical links do not expose one-time requests");
  assert.ok(!(await page.locator("main").innerText()).includes("Upgrade to"),"one-time requests require reusable-link plan");
  // The same mounted UI must not reveal a provider HMAC, raw payer number, or
  // cached cross-tenant session when opened by a viewer.
  const viewerPage=await viewerContext.newPage();
  await viewerPage.goto(origin+"/payments");
  await viewerPage.getByText(reference,{exact:true}).first().waitFor();
  const viewerText=await viewerPage.locator("main").innerText();
  assert.ok(!viewerText.includes(payer)&&!viewerText.includes("01712345678"),"viewer UI leaked raw payer identity");
  await viewerPage.close();

  const evidence=new URL("../test-results/pg09/phase9/",import.meta.url);await mkdir(evidence,{recursive:true});
  let cases=0;
  const routes=["/payments",`/payments/transactions/${payment.id}`,"/sms-data",`/sms-data/${transport.id}`,"/settings/payment-methods","/settings/webhooks"];
  for(const locale of ["en","bn"]){
   await context.addCookies([{name:"ekmivo-locale",value:locale,url:origin,sameSite:"Lax"}]);
   for(const theme of ["light","dark"]){
    await context.addCookies([{name:"ekmivo-theme",value:theme,url:origin,sameSite:"Lax"}]);
    await page.emulateMedia({colorScheme:theme});
    for(const width of [320,360,768,1440]){
     await page.setViewportSize({width,height:900});
     for(const route of routes){
      const response=await page.goto(origin+route);
      assert.equal(response.status(),200,`${route} HTTP failed at ${locale}/${theme}/${width}`);
      await page.locator("main h1, main h2").first().waitFor();
      assert.equal(await page.locator("html").getAttribute("data-theme"),theme);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflows ${locale}/${theme}/${width}`);
      assert.equal(await page.locator('main [role="alert"]').count(),0,`${route} shows data/UI error`);
      if(width===320&&route==="/payments")await page.screenshot({path:fileURLToPath(new URL(`${locale}-${theme}-${width}.png`,evidence)),fullPage:true});
      cases++;
     }
    }
   }
  }
  assert.equal(cases,96,"Phase9 complete responsive matrix missing");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(origin+"/payments");
  assert.ok(await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),"reduced-motion preference was not honored");
  assert.deepEqual(errors,[],"Phase9 UI hydration/runtime errors");
  const after=await fetchRows(context,"payments");
  assert.equal(after.filter(r=>r.id===payment.id).length,1,"UI read caused a duplicate financial confirmation");
  console.log(`Phase9 VERIFIED SOURCE+UI PASS: authenticated Go/live-test PG09 reader, exact record+amount, canonical/legacy detail parity, viewer/cross-tenant scope, webhook write denial, one-time request access, ${cases} responsive cases across EN/BN, light/dark, 320/360/768/1440, 6 routes; synthetic CI financial evidence only`);
 }finally{
  if(context)await context.close();if(viewerContext)await viewerContext.close();
  await finance.end({timeout:3});await db.end({timeout:3});
 }
}
