import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import postgres from "postgres";

export async function runBriofoldInboxAccess({origin,browser,control,sessions}){
 const url=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||/prod/i.test(url.pathname))throw Error("Inbox access refuses shared databases");
 const db=postgres(control,{max:1,prepare:false}),workspace=randomUUID();
 let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(sessions.owner).digest("hex")}`)[0].user_id;
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Phase6 Inbox permission fixture','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  const [connection]=await db`SELECT inbox_connection(${workspace},'live','ms',${"phase6-"+workspace},decode('abcd','hex')) AS id`;
  await db`SELECT inbox_ingest(${connection.id},'phase6-message','phase6-customer','Fictional permissions customer','Hello from a synthetic customer','text',now())`;
  const thread=(await db`SELECT id FROM inbox_threads WHERE connection_id=${connection.id}`)[0].id;
  context=await browser.newContext();
  await context.addCookies([
   {name:"ekmivo-session",value:sessions.owner,url:origin,httpOnly:true,sameSite:"Lax"},
   {name:"ekmivo-default-workspace",value:actor+":"+workspace,url:origin,httpOnly:true,sameSite:"Lax"},
   {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
  ]);
  const endpoint=origin+"/api/go/workspaces/"+workspace+"/inbox?environment=live";
  const request=(action,body={},target=endpoint)=>context.request.post(target,{headers:{Origin:origin},data:{action,thread_id:thread,body}});
  for(const role of ["owner","admin","editor","viewer"]){
   await db`UPDATE workspace_members SET role=${role} WHERE workspace_id=${workspace} AND user_id=${actor}`;
   assert.equal((await request("list")).status(),200,role+" Inbox read");
   assert.equal((await request("messages")).status(),200,role+" conversation read");
   const key=randomUUID(),send=()=>request("send",{text:"Synthetic "+role+" reply",idempotency_key:key});
   const response=await send();assert.equal(response.status(),role==="viewer"?403:200,role+" Inbox send");
   if(role!=="viewer")assert.equal((await (await send()).json()).id,(await response.json()).id);
   assert.equal((await request("ai",{enabled:true})).status(),["owner","admin"].includes(role)?200:403,role+" automation toggle");
  }
  const p=await context.newPage();p.setDefaultNavigationTimeout(90000);p.setDefaultTimeout(30000);
  await p.goto(origin+"/inbox");
  await p.getByRole("button",{name:/Fictional permissions customer/}).click();
  await p.getByText("You have read-only access to this Inbox.",{exact:true}).waitFor();
  assert.equal(await p.getByRole("textbox",{name:"Message",exact:true}).count(),0);
  assert.equal(await p.getByRole("button",{name:/^AI (on|off)$/}).count(),0);
  await p.close();
  await db`UPDATE workspace_members SET role='editor' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${workspace},${actor},'inbox:send',false)`;
  assert.equal((await request("list")).status(),200);
  assert.equal((await request("send",{text:"Denied reply",idempotency_key:randomUUID()})).status(),403);
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${workspace},${actor},'product:ai',false)`;
  assert.equal((await request("list")).status(),403,"AI product grant denial");
  await db`DELETE FROM pg13_member_grants WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await db`UPDATE workspace_product_access SET enabled=false WHERE workspace_id=${workspace} AND product='ai'`;
  assert.equal((await request("list")).status(),403,"disabled AI entitlement");
  await db`UPDATE workspace_product_access SET enabled=true WHERE workspace_id=${workspace} AND product='ai'`;
  assert.equal((await request("messages",{},endpoint.replace(workspace,randomUUID()))).status(),403,"cross-business Inbox access");
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  assert.equal((await request("list")).status(),403,"removed member");
  console.log("Phase6 INBOX ACCESS PASS: actual HTTP owner/admin/editor/viewer, read-only browser, idempotent send, automation separation, granular grant/product/revocation/tenant denial");
 }finally{
  if(context)await context.close();
  await db.end({timeout:3});
 }
}
