import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import postgres from "postgres";

// Real browser -> Server Action -> control PostgreSQL. Never production/provider.
export async function runBriofoldOnboardingBrowser({origin,browser,control,sessions}){
 const url=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||/prod/i.test(url.pathname))throw Error("Onboarding refuses shared database");
 const db=postgres(control,{max:2,prepare:false});
 const contexts=[];
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(sessions.owner).digest("hex")}`)[0].user_id;
  const context=async workspace=>{
   const c=await browser.newContext();contexts.push(c);
   await c.addCookies([
    {name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-default-workspace",value:actor+":"+workspace,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
   ]);return c;
  };
  for(const mode of ["ai","commerce","both"]){
   const workspace=randomUUID();
   await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'New business','both',${actor})`;
   await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
   await db`INSERT INTO briofold_business_onboarding(workspace_id,owner_id) VALUES(${workspace},${actor})`;
   const c=await context(workspace),p=await c.newPage();
   p.setDefaultTimeout(30000);p.setDefaultNavigationTimeout(90000);
   assert.equal((await p.goto(origin+"/setup")).status(),200);
   const name="Phase4 "+mode+" fixture";
   await p.locator('input[name="name"]').fill(name);
   await p.locator('select[name="business_type"]').selectOption("service");
   await p.locator('input[name="description"]').fill("Synthetic setup metadata");
   await p.locator('input[name="address"]').fill("Fixture address");
   await p.getByRole("button",{name:"Continue",exact:true}).click();
   await p.locator('input[name="mode"]').first().waitFor();
   assert.equal((await db`SELECT name FROM workspaces WHERE id=${workspace}`)[0].name,name);
   const profile=(await db`SELECT body FROM dashboard_store_profiles WHERE workspace_id=${workspace}`)[0].body;
   assert.equal(profile.address,"Fixture address");assert.equal(profile.business_type,"service");assert.equal(profile.description,"Synthetic setup metadata");assert.equal(Object.keys(profile).length,13);
   await p.reload();
   await p.locator('input[name="mode"][value="'+mode+'"]').check();
   await p.getByRole("button",{name:"Continue",exact:true}).click();
   await p.getByRole("button",{name:"Finish setup",exact:true}).waitFor();
   const access=await db`SELECT product,enabled FROM workspace_product_access WHERE workspace_id=${workspace} ORDER BY product`;
   assert.deepEqual(access.map(r=>[r.product,r.enabled]),[["ai",mode!=="commerce"],["payments",mode!=="ai"]]);
   if(mode==="ai"){
    assert.equal(await p.locator('input[name="plan"]').count(),0);
    await p.getByRole("button",{name:"Finish setup",exact:true}).click();
    await p.waitForURL(origin+"/dashboard");
    assert.equal((await db`SELECT count(*)::int AS n FROM pg13_subscriptions WHERE workspace_id=${workspace}`)[0].n,0);
   }else{
    const [catalogue]=await db`SELECT payment_plan_public() AS plans`;
    const plan=catalogue.plans.find(x=>x.terms.kind==="paid")||catalogue.plans.find(x=>x.terms.kind==="free");
    assert.ok(plan,"Public selectable Gateway plan fixture required");
    await p.locator('input[name="plan"][value="'+plan.id+'"]').check();
    await p.getByRole("button",{name:"Finish setup",exact:true}).click();
    if(plan.terms.kind==="paid"){
     await p.waitForURL(u=>u.pathname==="/settings/billing");
     assert.equal((await db`SELECT count(*)::int AS n FROM pg13_subscriptions WHERE workspace_id=${workspace}`)[0].n,0,"Paid selection activated subscription");
    }else{
     await p.waitForURL(origin+"/dashboard");
     assert.equal((await db`SELECT plan_id FROM pg13_subscriptions WHERE workspace_id=${workspace}`)[0].plan_id,plan.id);
    }
   }
   assert.equal((await db`SELECT step FROM briofold_business_onboarding WHERE workspace_id=${workspace}`)[0].step,"complete");
   await p.goto(origin+"/setup");await p.waitForURL(origin+"/dashboard");
   // A transferred creator is no longer an authorized owner even on a stale form.
   await db`UPDATE briofold_business_onboarding SET step='services',completed_at=NULL WHERE workspace_id=${workspace}`;
   await p.goto(origin+"/setup");await p.locator('input[name="mode"]').first().waitFor();
   await db`UPDATE workspace_members SET role='admin' WHERE workspace_id=${workspace} AND user_id=${actor}`;
   await p.getByRole("button",{name:"Continue",exact:true}).click();
   await p.getByRole("alert").filter({hasText:"Owner access required."}).waitFor();
   assert.equal((await db`SELECT step FROM briofold_business_onboarding WHERE workspace_id=${workspace}`)[0].step,"services");
   await p.reload();await p.waitForURL(origin+"/dashboard");
   await c.close();
  }
  console.log("Phase4 REAL ONBOARDING BROWSER PASS: AI/Payments/Both business/services/billing, interrupted reload, paid selection grants no subscription, completed replay, stale former-owner denial");
 }finally{
  for(const c of contexts)await c.close();
  // Preserve append-only audit records; disposable workflow DB teardown cleans fixtures.
  await db.end({timeout:3});
 }
}
