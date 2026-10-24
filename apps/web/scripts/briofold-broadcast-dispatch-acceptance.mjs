import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runBroadcastDispatch({control,sessions,origin,browser}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Broadcast refuses shared DB');
 const db=postgres(control,{max:3,prepare:false,connection:{application_name:'phase10_broadcast_dispatch',statement_timeout:20000,lock_timeout:5000}});let ctx;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional broadcast Store','ai',${owner}),(${foreign},'Foreign broadcast Store','ai',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const connection=(await db`SELECT inbox_connection(${store},'live','ms',${'broadcast-'+store},decode('abcd','hex')) id`)[0].id;
  await db`SELECT inbox_ingest(${connection},${randomUUID()},'fictional-broadcast-person','Fictional recipient','Fictional inbound','text',now())`;
  const thread=(await db`SELECT id FROM inbox_threads WHERE connection_id=${connection}`)[0].id;
  const customer=(await db`SELECT customer_id FROM briofold_customer_sources WHERE workspace_id=${store} AND source_id=${thread} AND kind='thread'`)[0]?.customer_id;
  assert.ok(customer,'inbound CRM source missing');
  await db`UPDATE briofold_customers SET preferences=${db.json({marketing:'opted-in',do_not_contact:false})},stage='qualified' WHERE id=${customer}`;
  const source=(await db`SELECT id FROM briofold_customer_sources WHERE workspace_id=${store} AND source_id=${thread} AND kind='thread'`)[0].id;
  const reply=randomUUID();await db`SELECT briofold_inbox_work_write(${store},'live',${owner},NULL,${randomUUID()},'saved-reply',${db.json({id:reply,revision:0,title:'Fictional broadcast sequence',body:'Hello {{customer_name}}',messages:[{type:'text',text:'Hello {{customer_name}}'},{type:'text',text:'Fictional consented offer'}],visibility:'team'})})`;
  const campaign=(await db`SELECT briofold_growth_operations_write(${store},'live',${owner},${randomUUID()},'draft-create',${db.json({kind:'broadcast',title:'Fictional scheduled campaign',body:'Planning only',audience:'qualified',time_zone:'Asia/Dhaka'})}) data`)[0].data.id;
  const command=async(action,body,key=randomUUID(),who=owner,scope=store,realm='live')=>(await db`SELECT briofold_broadcast_command(${scope},${realm},${who},${key},${action},${db.json(body)}) data`)[0].data;
  const input={campaign_id:campaign,campaign_revision:1,reply_id:reply,reply_revision:1,channel:'messenger'};
  assert.equal((await command('broadcast-preview',input)).recipients,0,'CRM preference alone permitted broadcast');
  await db`INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_source_id,source_kind,evidence_digest,verified_at) VALUES(${store},'live',${customer},'messenger',${source},'provider-opt-in',${createHash('sha256').update(randomUUID()).digest('hex')},now())`;
  let preview=await command('broadcast-preview',input);assert.equal(preview.recipients,1);assert.equal(preview.messages.length,2);
  await assert.rejects(()=>command('broadcast-preview',input,randomUUID(),viewer),e=>e.code==='42501');
  await assert.rejects(()=>command('broadcast-preview',input,randomUUID(),owner,foreign),e=>e.code==='42501');
  await assert.rejects(()=>command('broadcast-preview',input,randomUUID(),owner,store,'sandbox'),e=>e.code==='42501');
  await assert.rejects(()=>command('broadcast-preview',{...input,channel:'whatsapp'}),e=>e.code==='22023');
  await assert.rejects(()=>command('broadcast-preview',{...input,reply_revision:0}),e=>e.code==='40001');
  await assert.rejects(()=>command('broadcast-preview',{...input,test_customer:randomUUID()}),e=>e.code==='42501');
  const approval={...input,preview_token:preview.token,confirmed:true,due_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),time_zone:'Asia/Dhaka'};
  await assert.rejects(()=>command('broadcast-approve',{...approval,confirmed:false}),e=>e.code==='22023');
  await assert.rejects(()=>command('broadcast-approve',{...approval,preview_token:'stale'}),e=>e.code==='40001');
  const key=randomUUID(),run=await command('broadcast-approve',approval,key);assert.equal(run.recipients,1);
  assert.deepEqual(await command('broadcast-approve',approval,key),run);
  await assert.rejects(()=>command('broadcast-approve',{...approval,expires_at:new Date(Date.now()+7200000).toISOString()},key),e=>e.code==='23505');
  await assert.rejects(()=>command('broadcast-approve',approval),e=>e.code==='23505','same revision approved twice');
  await Promise.all([db`SELECT briofold_broadcast_tick()`,db`SELECT briofold_broadcast_tick()`]);
  const queued=await db`SELECT m.id,m.type,m.body,m.batch_id,m.state FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=${run.id} ORDER BY m.sequence`;
  assert.equal(queued.length,2);assert.equal(queued[0].body,'Hello Fictional recipient');assert.ok(queued.every(x=>x.state==='queued'));
  await db`SELECT briofold_broadcast_tick()`;assert.equal(Number((await db`SELECT count(*) n FROM inbox_messages WHERE batch_id=${queued[0].batch_id}`)[0].n),2,'tick duplicated messages');
  // A rollback-only claim transaction protects unrelated acceptance queues while
  // exercising the actual global sender selector, not a surrogate predicate.
  const claim=async body=>{try{await db.begin(async tx=>{await tx`UPDATE inbox_messages SET state='failed',error_code='FICTIONAL_ROLLBACK_ISOLATION' WHERE state='queued' AND batch_id IS DISTINCT FROM ${queued[0].batch_id}`;await body(tx);throw Error('ROLLBACK_ONLY_BROADCAST');});}catch(e){if(e.message!=='ROLLBACK_ONLY_BROADCAST')throw e;}};
  await claim(async tx=>{const job=(await tx`SELECT inbox_next_send() data`)[0].data;assert.equal(job.id,queued[0].id);assert.equal(job.type,'text');assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'sequence messages sent concurrently');});
  await claim(async tx=>{await tx`UPDATE briofold_broadcast_runs SET quiet_start=(now() AT TIME ZONE 'Asia/Dhaka'-interval '1 minute')::time,quiet_end=(now() AT TIME ZONE 'Asia/Dhaka'+interval '1 minute')::time WHERE id=${run.id}`;assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'quiet hours were ignored at claim');});
  await claim(async tx=>{await tx`UPDATE briofold_broadcast_runs SET due_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=${run.id}`;assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'expired campaign was dispatched');});
  await claim(async tx=>{await tx`UPDATE briofold_inbox_saved_replies SET revision=revision+1 WHERE id=${reply}`;assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'changed message revision was dispatched');});
  await claim(async tx=>{await tx`DELETE FROM workspace_members WHERE workspace_id=${store} AND user_id=${owner}`;assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'revoked approver still dispatched');});
  await db`SELECT briofold_growth_suppress_contact(${store},'live',${owner},${randomUUID()},${db.json({customer_id:customer,channel:'messenger',reason:'customer-request'})})`;
  await claim(async tx=>{assert.equal((await tx`SELECT inbox_next_send() data`)[0].data,null,'fresh opt-out did not block actual claim');assert.ok((await tx`SELECT state,error_code FROM inbox_messages WHERE batch_id=${queued[0].batch_id}`).every(x=>x.state==='failed'&&x.error_code==='BROADCAST_APPROVAL_INVALID'));});
  // Suppression is intentionally irreversible: use a separate consented profile
  // for UI test-send and schedule/quiet/role/expiry guards.
  await db`SELECT inbox_ingest(${connection},${randomUUID()},'second-fictional-person','Second fictional recipient','Fictional inbound','text',now())`;
  const second=(await db`SELECT t.id thread,s.id source,s.customer_id customer FROM inbox_threads t JOIN briofold_customer_sources s ON s.source_id=t.id AND s.kind='thread' WHERE t.connection_id=${connection} AND t.external_id='second-fictional-person'`)[0];
  await db`UPDATE briofold_customers SET preferences=${db.json({marketing:'opted-in',do_not_contact:false})},stage='qualified' WHERE id=${second.customer}`;
  await db`INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_source_id,source_kind,evidence_digest,verified_at) VALUES(${store},'live',${second.customer},'messenger',${second.source},'provider-opt-in',${createHash('sha256').update(randomUUID()).digest('hex')},now())`;
  const testInput={...input,test_customer:second.customer};preview=await command('broadcast-preview',testInput);assert.equal(preview.recipients,1);
  const testRun=await command('broadcast-approve',{...approval,...testInput,preview_token:preview.token,due_at:new Date(Date.now()+600000).toISOString()});
  await db`SELECT briofold_broadcast_tick()`;assert.equal(Number((await db`SELECT count(*) n FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=${testRun.id}`)[0].n),0,'scheduled messages queued early');
  const quiet=(await db`SELECT briofold_followup_due('2026-10-24T17:00:00Z','Asia/Dhaka','22:00','08:00') due`)[0].due;
  assert.equal(new Date(quiet).toISOString(),'2026-10-25T02:00:00.000Z');
  await command('broadcast-cancel',{id:testRun.id});await db`SELECT briofold_broadcast_tick()`;
  assert.equal((await db`SELECT state FROM briofold_broadcast_recipients WHERE run_id=${testRun.id}`)[0].state,'blocked');
  await db`UPDATE inbox_threads SET last_customer_at=now()-interval '25 hours' WHERE id=${second.thread}`;await assert.rejects(()=>command('broadcast-preview',testInput),e=>e.code==='42501','outside-window delivery allowed');
  await db`UPDATE inbox_threads SET last_customer_at=now() WHERE id=${second.thread}`;
  const uiCampaign=(await db`SELECT briofold_growth_operations_write(${store},'live',${owner},${randomUUID()},'draft-create',${db.json({kind:'broadcast',title:'Fictional browser campaign',body:'Planning only',audience:'qualified',time_zone:'Asia/Dhaka'})}) data`)[0].data.id;
  ctx=await browser.newContext();await ctx.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
  const page=await ctx.newPage();page.setDefaultNavigationTimeout(90000);await page.goto(origin+'/customers/broadcasts');
  const panel=page.getByRole('region',{name:'Broadcast delivery',exact:true});await panel.getByRole('button',{name:'Load delivery review',exact:true}).click();
  await panel.getByLabel('Broadcast campaign',{exact:true}).selectOption(uiCampaign);await panel.getByLabel('Saved message sequence',{exact:true}).selectOption(reply);
  await panel.getByRole('button',{name:'Preview eligible audience',exact:true}).click();await panel.getByRole('heading',{name:'Approval preview',exact:true}).waitFor();
  await panel.getByLabel('Test recipient (preview audience first)',{exact:true}).selectOption(second.customer);
  await panel.getByRole('button',{name:'Preview eligible audience',exact:true}).click();await panel.getByRole('heading',{name:'Approval preview',exact:true}).waitFor();
  await panel.getByText('Recipients: 1',{exact:false}).waitFor();await panel.getByLabel('I approve this audience, message sequence and schedule. Fresh opt-outs may reduce delivery.',{exact:true}).check();
  const approved=page.waitForResponse(r=>r.url().includes('/growth?')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Approve consented test send',exact:true}).click();assert.equal((await approved).status(),200);
  const uiRun=(await db`SELECT id FROM briofold_broadcast_runs WHERE campaign_id=${uiCampaign}`)[0];assert.ok(uiRun);
  assert.equal((await db`SELECT customer_id FROM briofold_broadcast_recipients WHERE run_id=${uiRun.id}`)[0].customer_id,second.customer);
  await db`SELECT briofold_broadcast_tick()`;assert.equal(Number((await db`SELECT count(*) n FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=${uiRun.id}`)[0].n),2);
  await panel.getByRole('button',{name:'Refresh delivery results',exact:true}).click();await panel.getByText('Recipients 1',{exact:false}).first().waitFor();
  await command('broadcast-cancel',{id:uiRun.id});assert.ok((await db`SELECT m.state FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=${uiRun.id}`).every(x=>x.state==='failed'));
  await panel.getByRole('button',{name:'Preview eligible audience',exact:true}).click();await panel.getByRole('heading',{name:'Approval preview',exact:true}).waitFor();await panel.getByLabel('I approve this audience, message sequence and schedule. Fresh opt-outs may reduce delivery.',{exact:true}).check();
  const rejected=page.waitForResponse(r=>r.url().includes('/growth?')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Approve consented test send',exact:true}).click();assert.equal((await rejected).status(),409);
  await panel.getByRole('alert').waitFor();assert.equal(Number((await db`SELECT count(*) n FROM briofold_broadcast_runs WHERE campaign_id=${uiCampaign}`)[0].n),1);
  let responsive=0;for(const locale of ['en','bn'])for(const theme of ['light','dark','system'])for(const width of [320,1280]){await ctx.addCookies([{name:'ekmivo-locale',value:locale,url:origin},{name:'ekmivo-theme',value:theme,url:origin}]);await page.setViewportSize({width,height:900});await page.goto(origin+'/customers/broadcasts');assert.equal(await page.locator('h1').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'broadcast overflow');responsive++;}
  await command('broadcast-cancel',{id:run.id});
  console.log(`BROADCAST DISPATCH SQL/Go/Next/browser PASS: exact consent versus preferences, frozen preview/approval, scheduled test audience, concurrency/idempotency, actual sequence queue/claim, fresh STOP suppression, outside-window/role/realm/foreign denial, cancellation, ${responsive} responsive cases; no provider transport executed`);
 }finally{await ctx?.close();await db.end();}
}
