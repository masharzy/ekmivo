import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

export async function runBriofoldCRMParity({origin,browser,control,sessions}){
 const target=new URL(control);
 assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname)&&!/prod/i.test(target.pathname),"CRM parity refuses shared databases");
 const db=postgres(control,{max:3,prepare:false});let context,viewerContext;
 try{
  const actor=async token=>String((await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(token).digest("hex")}`)[0].user_id);
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),foreignMember=await actor(sessions.editor);
  const store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional CRM parity','both',${owner}),(${foreign},'Foreign CRM parity','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  // Newer non-matches deliberately fill the first unfiltered page. Filtering
  // an already paginated response would lose every older matching lead.
  const matches=await db`INSERT INTO briofold_customers(workspace_id,environment,name,email,stage,temperature,assignee,updated_at)
   SELECT ${store},'live','API page '||lpad(n::text,3,'0'),'fixture@example.invalid','qualified','hot',${owner},now()-interval '1 day'
   FROM generate_series(1,55) n RETURNING id`;
  await db`INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id)
   SELECT workspace_id,environment,id,'api',gen_random_uuid() FROM briofold_customers WHERE workspace_id=${store}`;
  await db`INSERT INTO briofold_customers(workspace_id,environment,name,stage,temperature,updated_at)
   SELECT ${store},'live','Unmatched newer '||n,'new','cold',now()+interval '1 minute' FROM generate_series(1,60) n`;
  const search=async({user=owner,scope=store,realm="live",offset=0,q="",stage="",source="",priority="",assignee=""}={})=>
   (await db`SELECT briofold_customers_search(${scope},${realm},${user},${offset},${q},${stage},${source},${priority},${assignee}) data`)[0].data;
  const first=await search({stage:"qualified",source:"api",priority:"hot",assignee:owner});
  const next=await search({stage:"qualified",source:"api",priority:"hot",assignee:owner,offset:50});
  assert.equal(first.items.length,51);assert.equal(next.items.length,5);
  assert.equal(new Set([...first.items.slice(0,50),...next.items].map(row=>row.id)).size,55,"filtered pagination lost/duplicated leads");
  assert.ok(first.items.every(row=>row.assignee===owner&&row.temperature==="hot"&&row.stage==="qualified"));
  assert.equal((await search({source:"api",priority:"cold"})).items.length,0,"source and priority were not combined");
  assert.equal((await search({assignee:"unassigned"})).items.length,51);
  assert.equal((await search({realm:"sandbox",source:"api"})).items.length,0,"CRM source filter leaked another realm");
  await assert.rejects(()=>search({scope:foreign}),e=>e.code==="42501");
  await assert.rejects(()=>search({source:"unknown"}),e=>e.code==="22023");
  await assert.rejects(()=>search({priority:"urgent"}),e=>e.code==="22023");
  await assert.rejects(()=>search({assignee:foreignMember}),e=>e.code==="42501");
  await assert.rejects(()=>search({user:viewer,assignee:owner}),e=>e.code==="42501","viewer enumerated staff assignment");
  const masked=await search({user:viewer,source:"api",priority:"hot"});
  assert.deepEqual(masked.members,[]);assert.equal(masked.can_export,false);
  assert.ok(masked.items.every(row=>row.email===""&&row.phone===""&&row.assignee===null));
  const due=async(time,zone,start,end)=>(await db`SELECT briofold_followup_due(${time}::timestamptz,${zone},${start}::time,${end}::time) value`)[0].value.toISOString();
  assert.equal(await due("2027-01-02T17:30:00Z","Asia/Dhaka","22:00","08:00"),"2027-01-03T02:00:00.000Z");
  assert.equal(await due("2027-01-02T01:00:00Z","Asia/Dhaka","22:00","08:00"),"2027-01-02T02:00:00.000Z");
  assert.equal(await due("2027-01-02T02:00:00Z","Asia/Dhaka","22:00","08:00"),"2027-01-02T02:00:00.000Z","quiet end must be exclusive");
  assert.equal(await due("2027-01-02T09:00:00Z","Asia/Dhaka","13:00","16:00"),"2027-01-02T10:00:00.000Z");
  assert.equal(await due("2027-03-14T06:30:00Z","America/New_York","00:00","04:00"),"2027-03-14T08:00:00.000Z","spring DST quiet end was calculated as a fixed offset");
  assert.equal(await due("2027-11-07T05:30:00Z","America/New_York","00:00","02:00"),"2027-11-07T07:00:00.000Z","fall DST quiet end was calculated as a fixed offset");
  await assert.rejects(()=>due("2027-01-02T17:30:00Z","Asia/Dhaka","08:00","08:00"),e=>e.code==="22023");
  const customer=matches[0].id,followup=randomUUID(),key=randomUUID();
  const write=async(action,body,operation=randomUUID(),user=owner)=>(await db`SELECT briofold_customers_write(${store},'live',${user},${operation},${action},${db.json(body)}) data`)[0].data;
  const command={id:customer,revision:1,followup_id:followup,due_at:"2027-01-02T17:30:00Z",time_zone:"Asia/Dhaka",body:"Private fictional offer reminder",kind:"offer",quiet_start:"22:00",quiet_end:"08:00"};
  const saved=await write("followup",command,key);assert.deepEqual(await write("followup",command,key),saved,"reminder retry changed the committed schedule");
  const reminder=(await db`SELECT * FROM briofold_customer_followups WHERE id=${followup}`)[0];
  assert.equal(reminder.due_at.toISOString(),"2027-01-03T02:00:00.000Z");assert.equal(reminder.kind,"offer");
  assert.equal(reminder.requested_due_at.toISOString(),"2027-01-02T17:30:00.000Z");
  await assert.rejects(()=>write("followup",{...command,revision:saved.revision,followup_id:randomUUID(),quiet_end:"22:00"}),e=>e.code==="22023");
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_customer_followups WHERE customer_id=${customer}`)[0].n),1,"invalid quiet window left a partial reminder");
  await assert.rejects(()=>write("followup-status",{id:customer,revision:saved.revision,followup_id:followup,status:"skipped"},randomUUID(),viewer),e=>e.code==="42501");
  const skipped=await write("followup-status",{id:customer,revision:saved.revision,followup_id:followup,status:"skipped"});
  assert.equal((await db`SELECT status FROM briofold_customer_followups WHERE id=${followup}`)[0].status,"skipped");
  await assert.rejects(()=>write("followup-status",{id:customer,revision:skipped.revision,followup_id:followup,status:"done"}),e=>e.code==="40001");
  const maskedDetail=(await db`SELECT briofold_customers_read(${store},'live',${viewer},${customer},0,'','') data`)[0].data;
  assert.equal(maskedDetail.followups[0].body,"");assert.equal(maskedDetail.followups[0].kind,"offer");
  assert.equal(maskedDetail.followups[0].created_by,undefined);
  const browserLead=(await write("save",{name:"Browser filtered lead",email:"browser-parity@example.invalid",tags:[],stage:"qualified",temperature:"hot",assignee:owner})).id;
  await db`INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(${store},'live',${browserLead},'api',${randomUUID()})`;
  const authenticated=async(token,user)=>{
   const c=await browser.newContext({timezoneId:"Asia/Dhaka",viewport:{width:1280,height:900}});
   await c.addCookies([{name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},{name:"ekmivo-default-workspace",value:user+":"+store,url:origin,httpOnly:true,sameSite:"Lax"},{name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);return c;
  };
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const endpoint=origin+`/api/go/workspaces/${store}/crm?environment=live`;
  const filtered=await context.request.get(endpoint+`&source=api&priority=hot&assignee=${owner}&filter=qualified`);
  assert.equal(filtered.status(),200);assert.equal((await filtered.json()).items.length,51);
  assert.equal((await context.request.get(endpoint+"&source=unknown")).status(),422);
  assert.equal((await viewerContext.request.get(endpoint+"&assignee="+owner)).status(),403);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(origin+"/customers/leads");await page.getByRole("heading",{name:"Leads",exact:true}).waitFor();
  await page.getByLabel("Search",{exact:true}).fill("Browser filtered lead");
  await page.getByLabel("Source filter",{exact:true}).selectOption("api");
  await page.getByLabel("Priority filter",{exact:true}).selectOption("hot");
  await page.getByLabel("Assignee filter",{exact:true}).selectOption(owner);
  await page.getByRole("button",{name:"Browser filtered lead",exact:true}).waitFor();
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Export visible page CSV (up to 50)",exact:true}).click()]);
  const csv=await readFile(await download.path(),"utf8");assert.ok(csv.includes("Browser filtered lead"));assert.ok(!csv.includes("API page"),"CSV ignored the active server filters");
  await page.getByLabel("Priority filter",{exact:true}).selectOption("cold");await page.getByText("No customers match.",{exact:true}).waitFor();
  await page.getByLabel("Priority filter",{exact:true}).selectOption("hot");
  await page.getByRole("button",{name:"Browser filtered lead",exact:true}).click();
  await page.getByLabel("Due date and time (your local time)",{exact:true}).fill("2027-01-02T23:30");
  await page.getByLabel("Reminder kind",{exact:true}).selectOption("offer");
  await page.getByLabel("Respect quiet hours",{exact:true}).check();
  await page.getByLabel("Reminder",{exact:true}).fill("Browser offer follow-up with quiet hours");
  const [scheduled]=await Promise.all([page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==="followup";}catch{return false;}}),page.getByRole("button",{name:"Schedule reminder",exact:true}).click()]);
  assert.equal(scheduled.status(),200);
  const browserReminder=(await db`SELECT * FROM briofold_customer_followups WHERE customer_id=${browserLead}`)[0];
  assert.equal(browserReminder.due_at.toISOString(),"2027-01-03T02:00:00.000Z");
  await page.getByText("Browser offer follow-up with quiet hours",{exact:true}).waitFor();
  await page.reload();await page.getByLabel("Search",{exact:true}).fill("Browser filtered lead");
  await page.getByRole("button",{name:"Browser filtered lead",exact:true}).click();
  await page.getByText("Browser offer follow-up with quiet hours",{exact:true}).waitFor();
  const [skip]=await Promise.all([page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==="followup-status";}catch{return false;}}),page.getByRole("button",{name:"Skip",exact:true}).click()]);
  assert.equal(skip.status(),200);assert.equal((await db`SELECT status FROM briofold_customer_followups WHERE id=${browserReminder.id}`)[0].status,"skipped");
  await page.getByRole("button",{name:"Skip",exact:true}).waitFor({state:"hidden"});
  const viewerPage=await viewerContext.newPage();await viewerPage.goto(origin+"/customers/leads");
  assert.equal(await viewerPage.getByLabel("Assignee filter",{exact:true}).count(),0);
  let cases=0;
  for(const locale of ["en","bn"]){await context.addCookies([{name:"ekmivo-locale",value:locale,url:origin,sameSite:"Lax"}]);for(const theme of ["light","dark"]){await context.addCookies([{name:"ekmivo-theme",value:theme,url:origin,sameSite:"Lax"}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:900});for(const route of ["/customers/leads","/customers/follow-ups"]){await page.goto(origin+route);await page.locator("h1").last().waitFor();assert.equal(await page.locator('main [role="alert"]').count(),0);assert.equal(await page.locator("html").getAttribute("data-theme"),theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`CRM filter overflow ${locale}/${theme}/${width}/${route}`);cases++;}}}}
  assert.equal(cases,32);assert.deepEqual(errors,[]);
  for(const role of ["ekmivo_financial_runtime","ekmivo_financial_projection"]){
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_customers_search(uuid,text,uuid,integer,text,text,text,text,text)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_customers','SELECT') ok`)[0].ok,false);
  }
  console.log("Phase10 CRM PARITY PASS: filtered server pagination/source/stage/priority/assignee/CSV, tenant/realm/role privacy, persisted offer/skip, overnight/daytime/DST quiet hours, revision/idempotency, actual Go/Next/browser and 32 responsive cases; internal reminders only");
 }finally{if(context)await context.close();if(viewerContext)await viewerContext.close();await db.end({timeout:3});}
}
