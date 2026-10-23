import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID,scryptSync} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

// This is an actual browser -> Next server action -> CONTROL database test.
// Never substitute a production account/password or print returned credentials.
export async function runBriofoldKeyLifecycle({origin,browser,control,sessions,workspaceId}){
 const target=new URL(control);
 assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname)&&!/prod/i.test(target.pathname),"Key acceptance refuses shared databases");
 const db=postgres(control,{max:1,prepare:false});
 let context,viewerContext,owner,originalHash,createdBindingTable=false,createdBinding=false;
 try{
  const actor=async token=>String((await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(token).digest("hex")}`)[0].user_id);
  owner=await actor(sessions.owner);
  const viewer=await actor(sessions.viewer);
  // Install only the exact authoritative binding-table definition when this
  // older disposable fixture predates subscription checkout. This does not
  // assert that the full subscription migration has been applied or verified.
  if(!(await db`SELECT to_regclass('public.platform_primary_stores') AS ready`)[0].ready){
   const source=await readFile(new URL("../../../infra/migrations/0133_platform_subscription_checkout_foundation.sql",import.meta.url),"utf8");
   const definition=source.match(/CREATE TABLE platform_primary_stores \([\s\S]*?\n\);/);
   assert.ok(definition,"authoritative Store binding fixture definition missing");
   await db.unsafe(definition[0]);createdBindingTable=true;
  }
  createdBinding=(await db`INSERT INTO platform_primary_stores(user_id,workspace_id,bound_by) VALUES(${owner}::uuid,${workspaceId}::uuid,${owner}::uuid) ON CONFLICT DO NOTHING RETURNING user_id`).length===1;
  assert.equal((await db`SELECT workspace_id FROM platform_primary_stores WHERE user_id=${owner}::uuid`)[0]?.workspace_id,workspaceId,"key fixture conflicts with an existing binding");
  originalHash=(await db`SELECT password_hash FROM app_users WHERE id=${owner}::uuid`)[0].password_hash;
  const password="Isolated-key-check-"+randomUUID(),salt=randomBytes(24);
  const hash=`scrypt-v1:${salt.toString("hex")}:${scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString("hex")}`;
  await db`UPDATE app_users SET password_hash=${hash} WHERE id=${owner}::uuid`;
  const authenticated=async(token,user)=>{
   const c=await browser.newContext({viewport:{width:1280,height:900}});
   await c.addCookies([
    {name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-default-workspace",value:user+":"+workspaceId,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
   ]);return c;
  };
  context=await authenticated(sessions.owner,owner);
  viewerContext=await authenticated(sessions.viewer,viewer);
  const page=await context.newPage();
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  let submittedAction;
  page.on("request",request=>{
   const headers=request.headers();
   if(request.method()==="POST"&&headers["next-action"]&&new URL(request.url()).pathname.endsWith("/settings/api-keys")){
    submittedAction={data:request.postDataBuffer(),headers:Object.fromEntries(
     ["content-type","next-action","next-router-state-tree"].filter(name=>headers[name]).map(name=>[name,headers[name]]))};
   }
  });
  assert.equal((await page.goto(origin+"/settings/api-keys")).status(),200);
  const realm=page.getByRole("group",{name:"API key environment",exact:true});
  await realm.getByRole("button",{name:"Sandbox",exact:true}).click();
  const name="Fictional key lifecycle "+randomUUID().slice(0,8);
  const rows=()=>db`SELECT id,public_id,name,secret_digest,scopes,expires_at,revoked_at FROM merchant_api_keys WHERE workspace_id=${workspaceId}::uuid AND environment='sandbox' AND name=${name} ORDER BY created_at,id`;
  await page.getByRole("button",{name:"Create key",exact:true}).click();
  const create=page.getByRole("dialog",{name:"Create API key",exact:true});
  await create.getByLabel("Key name",{exact:true}).fill(name);
  await create.getByLabel("Confirm current password",{exact:true}).fill("Wrong isolated password");
  await create.getByRole("button",{name:"Create API key",exact:true}).click();
  await create.getByRole("alert").filter({hasText:"Confirm your current password"}).waitFor();
  assert.equal((await rows()).length,0,"wrong password minted a secret");
  await create.getByLabel("Confirm current password",{exact:true}).fill(password);
  await create.getByRole("button",{name:"Create API key",exact:true}).click();
  const copy=page.getByRole("dialog",{name:"Copy your key now",exact:true});
  await copy.waitFor();
  const firstSecret=(await copy.locator(".keyv .mono").innerText()).trim();
  assert.ok(/^ek_test_[a-f0-9]{16}_[\w-]{43}$/.test(firstSecret),"invalid one-time key shape");
  const first=(await rows())[0];assert.ok(first,"created key missing from database");
  assert.equal(first.secret_digest.trim(),createHash("sha256").update(firstSecret).digest("hex"),"key secret was not hash-only");
  assert.deepEqual(first.scopes,["payments:read","payments:write"]);
  assert.ok(submittedAction?.data,"canonical form did not submit an actual Next action");
  const forged=await viewerContext.request.post(origin+"/settings/api-keys",{
   headers:{...submittedAction.headers,Origin:origin},data:submittedAction.data
  });
  assert.equal(forged.status(),200,"viewer denial did not return a handled action result");
  assert.ok((await forged.text()).includes("Only an authorized owner or admin can manage payment keys."),"forged viewer action bypassed server authorization");
  assert.equal((await rows()).length,1,"forged viewer action minted a key despite hidden UI");
  const foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${foreign}::uuid,'Fictional historical Store','commerce',${owner}::uuid)`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${foreign}::uuid,${owner}::uuid,'owner')`;
  await db`UPDATE platform_primary_stores SET workspace_id=${foreign}::uuid WHERE user_id=${owner}::uuid`;
  try{
   const stale=await context.request.post(origin+"/settings/api-keys",{headers:{...submittedAction.headers,Origin:origin},data:submittedAction.data});
   assert.equal(stale.status(),200);
   assert.ok((await stale.text()).includes("Only an authorized owner or admin can manage payment keys."),"historical owner membership bypassed the authoritative Store binding");
   assert.equal((await rows()).length,1,"stale Store form minted another key");
  }finally{
   await db`UPDATE platform_primary_stores SET workspace_id=${workspaceId}::uuid WHERE user_id=${owner}::uuid`;
  }
  const lookup=async publicId=>db`SELECT key_id,allowed_scopes,stored_digest FROM resolve_merchant_api_key(${publicId})`;
  assert.equal((await lookup(first.public_id.trim()))[0]?.key_id,first.id,"new key cannot authenticate");
  await copy.getByRole("button",{name:"Done",exact:true}).click();
  // The canonical page must reflect a completed action without a manual reload.
  const keyRow=()=>page.getByRole("row").filter({hasText:name});
  await keyRow().filter({hasText:"Active"}).waitFor();
  await page.reload();
  assert.equal((await page.content()).includes(firstSecret),false,"raw secret reappeared after reload");
  await realm.getByRole("button",{name:"Sandbox",exact:true}).click();
  await keyRow().filter({hasText:"Active"}).click();
  await page.getByRole("dialog",{name:"Details",exact:true}).getByRole("button",{name:"Rotate key",exact:true}).click();
  const change=page.getByRole("dialog",{name:"Confirm credential change",exact:true});
  await change.getByLabel("Current password",{exact:true}).fill(password);
  await change.getByRole("button",{name:"Rotate key",exact:true}).click();
  await copy.waitFor();
  const nextSecret=(await copy.locator(".keyv .mono").innerText()).trim();
  assert.ok(nextSecret!==firstSecret,"rotation reused the secret");
  const afterRotation=await rows();
  assert.equal(afterRotation.length,2,"rotation did not mint exactly one successor");
  const old=afterRotation.find(key=>key.id===first.id),next=afterRotation.find(key=>key.id!==first.id);
  assert.ok(old.revoked_at,"rotation left predecessor active");
  assert.equal((await lookup(first.public_id.trim())).length,0,"rotated predecessor still authenticates");
  assert.equal((await lookup(next.public_id.trim()))[0]?.key_id,next.id,"successor cannot authenticate");
  assert.deepEqual(next.scopes,first.scopes,"rotation broadened key scopes");
  assert.equal(new Date(next.expires_at).getTime(),new Date(first.expires_at).getTime(),"rotation extended expiry");
  assert.equal(next.secret_digest.trim(),createHash("sha256").update(nextSecret).digest("hex"));
  await copy.getByRole("button",{name:"Done",exact:true}).click();
  await keyRow().filter({hasText:"Active"}).click();
  await page.getByRole("dialog",{name:"Details",exact:true}).getByRole("button",{name:"Revoke key",exact:true}).click();
  await change.getByLabel("Current password",{exact:true}).fill(password);
  await change.getByRole("button",{name:"Revoke key",exact:true}).click();
  await page.getByRole("status").filter({hasText:"API key revoked."}).waitFor();
  assert.equal((await lookup(next.public_id.trim())).length,0,"revoked successor still authenticates");
  assert.equal((await rows()).length,2,"revocation unexpectedly minted another secret");
  assert.ok((await rows()).every(key=>key.revoked_at),"revoked status did not persist");
  await page.reload();
  assert.equal((await page.content()).includes(nextSecret),false,"rotation secret persisted in the page");
  const viewerPage=await viewerContext.newPage();viewerPage.setDefaultNavigationTimeout(90000);
  assert.equal((await viewerPage.goto(origin+"/settings/api-keys")).status(),200);
  await viewerPage.getByRole("heading",{name:"Key management restricted",exact:true}).waitFor();
  assert.equal((await viewerPage.content()).includes(first.public_id.trim()),false,"viewer received a private key reference");
  assert.equal((await viewerPage.content()).includes(name),false,"viewer received the private key inventory");
  const audit=await db`SELECT action FROM merchant_api_key_audit WHERE key_id IN (${first.id}::uuid,${next.id}::uuid) ORDER BY action`;
  assert.deepEqual(audit.map(row=>row.action),["created","created","revoked","rotated"],"key audit does not match actual lifecycle");
  // The preceding Phase 9 fixture installs a genuine unpublished plan. Live
  // issuance must use that entitlement even if optional receiver SQL is absent.
  await realm.getByRole("button",{name:"Live",exact:true}).click();
  await page.getByRole("button",{name:"Create key",exact:true}).click();
  await create.getByLabel("Key name",{exact:true}).fill(name+" Live");
  await create.getByLabel("Confirm current password",{exact:true}).fill(password);
  await create.getByRole("button",{name:"Create API key",exact:true}).click();
  await copy.waitFor();
  const liveSecret=(await copy.locator(".keyv .mono").innerText()).trim();
  assert.ok(liveSecret.startsWith("ek_live_"),"entitled Live creation failed");
  const liveKeys=await db`SELECT id,secret_digest FROM merchant_api_keys WHERE workspace_id=${workspaceId}::uuid AND environment='live' AND name=${name+" Live"}`;
  assert.equal(liveKeys.length,1,"Live create duplicated credential");
  assert.equal(liveKeys[0].secret_digest.trim(),createHash("sha256").update(liveSecret).digest("hex"));
  await copy.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByRole("row").filter({hasText:name+" Live"}).click();
  await page.getByRole("dialog",{name:"Details",exact:true}).getByRole("button",{name:"Revoke key",exact:true}).click();
  await change.getByLabel("Current password",{exact:true}).fill(password);
  await change.getByRole("button",{name:"Revoke key",exact:true}).click();
  await page.getByRole("status").filter({hasText:"API key revoked."}).waitFor();
  assert.ok((await db`SELECT revoked_at FROM merchant_api_keys WHERE id=${liveKeys[0].id}::uuid`)[0].revoked_at,"Live key failed revocation");
  assert.deepEqual(errors,[],"credential browser runtime error");
  console.log("Phase10 API KEY LIFECYCLE PASS: real canonical create/password denial/hash-only secret/refresh/rotate/revoke, resolver invalidation, preserved expiry/scopes, private viewer and durable audit; disposable CONTROL only");
 }finally{
  if(context)await context.close();if(viewerContext)await viewerContext.close();
  if(owner&&originalHash)await db`UPDATE app_users SET password_hash=${originalHash} WHERE id=${owner}::uuid`;
  if(owner&&createdBinding)await db`DELETE FROM platform_primary_stores WHERE user_id=${owner}::uuid`;
  if(createdBindingTable)await db`DROP TABLE platform_primary_stores`;
  await db.end({timeout:3});
 }
}
