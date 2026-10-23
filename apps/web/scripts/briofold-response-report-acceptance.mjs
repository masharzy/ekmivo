import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import postgres from "postgres";
export async function runBriofoldResponseReport({control,sessions,origin,browser}){
 const url=new URL(control);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&!/prod/i.test(url.pathname));
 const db=postgres(control,{max:3,prepare:false});let context,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(token).digest("hex")}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID(),connection=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional response reports','both',${owner}),(${foreign},'Foreign reports','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  await db`INSERT INTO inbox_connections(id,workspace_id,environment,provider,external_id,credential_cipher)
   VALUES(${connection},${store},'live','ms',${'response-'+connection},decode('abcd','hex'))`;
  const thread=async(days=1)=>{
   const id=randomUUID();await db`INSERT INTO inbox_threads(id,workspace_id,connection_id,external_id,customer_name) VALUES(${id},${store},${connection},${id},'Fictional report contact')`;
   await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,created_at) VALUES(${store},${id},'customer','Private report contact message','received',now()-make_interval(days=>${days}))`;return id;
  };
  const human=await thread(),ai=await thread(),waiting=await thread(),old=await thread(9);
  const reply=async(id,sender,state,seconds)=>db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,created_at,sent_at)
   SELECT ${store},${id},${sender},'Fictional report reply',${state},min(created_at)+make_interval(secs=>${seconds}),min(created_at)+make_interval(secs=>${seconds})
   FROM inbox_messages WHERE thread_id=${id} AND sender='customer'`;
  await reply(human,'ai','failed',10);await reply(human,'seller','sent',120);await reply(human,'ai','sent',180);
  await reply(ai,'seller','queued',5);await reply(ai,'ai','delivered',600);await reply(waiting,'ai','failed',1);await reply(old,'seller','sent',30);
  await db`INSERT INTO briofold_inbox_work(workspace_id,thread_id,owner_id,due_at,status) VALUES(${store},${human},${owner},now()-interval '1 hour','open')`;
  const read=async(who=owner,scope=store,realm='live')=>(await db`SELECT briofold_response_snapshot(${scope},${realm},${who}) data`)[0].data;
  const report=await read();
  assert.deepEqual(report.totals,{conversations:3,responded:2,unanswered:1,human_first:1,ai_first:1,within_five_minutes:1,average_seconds:360});
  assert.equal(report.channels.length,1);assert.equal(report.channels[0].provider,'ms');assert.equal(report.channels[0].responded,2);
  assert.equal(report.people[0].id,owner);assert.equal(report.people[0].open,1);assert.equal(report.people[0].overdue,1);
  assert.deepEqual((await read(viewer)).people,[]);assert.equal((await read(viewer)).can_view_people,false);
  assert.equal((await read(owner,store,'sandbox')).totals.conversations,0);assert.equal((await read(owner,store,'sandbox')).totals.average_seconds,null,'empty source became a fake zero latency');
  await db`INSERT INTO briofold_customers(workspace_id,environment,name,stage) VALUES
   (${store},'live','Won stage fixture one','won'),(${store},'live','Won stage fixture two','won'),
   (${store},'live','Qualified stage fixture','qualified'),(${store},'live','New stage fixture','new')`;
  const growth=async(realm='live',who=owner,scope=store)=>(await db`SELECT briofold_growth_snapshot(${scope},${realm},${who}) data`)[0].data;
  assert.equal(Number((await growth()).customers.total),4);
  assert.equal(Number((await growth()).customers.won),2);
  assert.equal(Number((await growth()).customers.qualified),1);
  assert.equal(Number((await growth('sandbox')).customers.total),0,'lead-stage conversion denominator crossed realms');
  assert.equal(Number((await growth('live',viewer)).customers.won),2,'stage aggregate leaked or changed for viewer');
  await assert.rejects(()=>growth('live',owner,foreign),e=>e.code==='42501');
  await assert.rejects(()=>read(owner,foreign),e=>e.code==='42501');await assert.rejects(()=>read(owner,store,'invalid'),e=>e.code==='22023');
  for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection'])assert.equal((await db`SELECT has_table_privilege(${role},'inbox_messages','SELECT') ok`)[0].ok,false);
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'ekmivo-session',value:token,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:user+':'+store,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const page=await context.newPage();page.setDefaultNavigationTimeout(90000);
  await page.goto(origin+'/reports');const region=page.getByRole('region',{name:'Response time and team workload',exact:true});await region.waitFor();
  const conversion=page.getByRole('region',{name:'Lead stage conversion',exact:true});
  await conversion.getByText('50%',{exact:false}).waitFor();
  await conversion.getByText('2 / 4',{exact:true}).waitFor();
  await conversion.getByText('A current CRM stage ratio, not attributed marketing conversions or verified payment revenue.',{exact:true}).waitFor();
  assert.equal(await region.getByRole('alert').count(),0);
  assert.equal(await region.locator('dl div').filter({has:page.getByText('Average first response (seconds)',{exact:true})}).locator('dd').innerText(),'360');
  await region.getByRole('heading',{name:'Current team workload (up to 50 members)',exact:true}).waitFor();
  assert.equal((await page.content()).includes('Private report contact message'),false,'report leaked message bodies');
  const viewerPage=await viewerContext.newPage();await viewerPage.goto(origin+'/reports');
  await viewerPage.getByRole('region',{name:'Response time and team workload',exact:true}).waitFor();
  assert.equal(await viewerPage.getByRole('heading',{name:'Current team workload (up to 50 members)',exact:true}).count(),0);
  let cases=0;
  for(const locale of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:locale,url:origin,sameSite:'Lax'}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin,sameSite:'Lax'}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/reports');await page.getByRole('region',{name:locale==='bn'?'উত্তরের সময় ও টিমের কাজ':'Response time and team workload',exact:true}).waitFor();assert.equal(await page.locator('main [role="alert"]').count(),0);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.equal(cases,16);
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${store},${viewer},'inbox:read',false)`;
  await assert.rejects(()=>read(viewer),e=>e.code==='42501','granular revoked Inbox permission still read response reporting');
  console.log('Phase10 RESPONSE REPORT PASS: authoritative first successful reply, failed/queued exclusion, AI/human/source breakdown, empty latency, rolling window, tenant/realm/granular role privacy, current assignment workload, current won-stage/total lead conversion denominator (no revenue attribution), actual SSR/browser and 16 responsive cases');
 }finally{if(context)await context.close();if(viewerContext)await viewerContext.close();await db.end({timeout:3});}
}
