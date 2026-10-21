import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runBriofoldInboxWorkflow({control,sessions,origin,browser}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Workflow acceptance refuses shared databases');
 const db=postgres(control,{max:3,prepare:false}),workspace=randomUUID();let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const colleague=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Fictional workflow business','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner'),(${workspace},${colleague},'editor')`;
  const c=(await db`SELECT inbox_connection(${workspace},'live','ms',${'workflow-'+workspace},decode('abcd','hex')) AS id`)[0].id;
  await db`SELECT inbox_ingest(${c},'workflow-inbound','workflow-customer','Workflow fictional customer','Fictional complaint and follow-up','text',now())`;
  const thread=(await db`SELECT id FROM inbox_threads WHERE connection_id=${c}`)[0].id;
  const read=async(user=actor)=>(await db`SELECT briofold_inbox_work_read(${workspace},'live',${user},${thread},0) AS data`)[0].data;
  const write=async(action,body,key=randomUUID(),user=actor)=>(await db`SELECT briofold_inbox_work_write(${workspace},'live',${user},${thread},${key},${action},${db.json(body)}) AS data`)[0].data;
  const denied=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
  const ai=(await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state) VALUES(${workspace},${thread},'ai','Queued fictional AI draft','queued') RETURNING id`)[0].id;
  const take={revision:0,reason:'Human handles complaint',return_at:new Date(Date.now()+3600000).toISOString()},key=randomUUID();
  const results=await Promise.all([write('takeover',take,key),write('takeover',take,key)]);assert.deepEqual(results[0],results[1]);
  assert.equal((await db`SELECT state FROM inbox_messages WHERE id=${ai}`)[0].state,'failed','takeover retained queued AI');
  assert.equal((await db`SELECT ai_enabled FROM inbox_threads WHERE id=${thread}`)[0].ai_enabled,false);
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_inbox_events WHERE workspace_id=${workspace}`)[0].n),1,'retry duplicated workflow event');
  await denied(()=>write('takeover',{...take,reason:'Changed body'},key),'23505');
  let data=await read();await denied(()=>write('work',{...data.work,revision:0}),'40001');
  await write('work',{...data.work,owner_id:colleague,priority:'urgent',labels:[' delivery ','delivery','complaint'],due_at:new Date(Date.now()-60000).toISOString(),disputed:true});
  data=await read();assert.equal(data.work.owner_id,colleague);assert.deepEqual(data.work.labels,['complaint','delivery']);
  await denied(()=>write('release',{revision:data.work.revision,confirmed:true}),'22023');
  await denied(()=>db`SELECT inbox_action(${workspace},'live',${actor},${thread},'ai','{"enabled":true}')`,'22023');
  const ticket=randomUUID(),ticketBody={id:ticket,revision:0,category:'complaint',title:'Fictional delivery dispute',detail:'Package has not arrived',status:'open',priority:'high',owner_id:actor,resolution:''};
  await write('ticket',ticketBody);data=await read();assert.equal(data.tickets.length,1);
  await write('work',{...data.work,disputed:false});data=await read();
  await denied(()=>write('release',{revision:data.work.revision,confirmed:true}),'22023');
  await denied(()=>write('ticket',{...ticketBody,revision:1,status:'resolved'}),'22023');
  await write('ticket',{...ticketBody,revision:1,status:'resolved',resolution:'Customer confirmed resolved'});
  data=await read();await write('release',{revision:data.work.revision,confirmed:true});
  assert.equal((await db`SELECT ai_enabled FROM inbox_threads WHERE id=${thread}`)[0].ai_enabled,true);
  data=await read();await write('takeover',{revision:data.work.revision,reason:'Short scheduled human handover',return_at:new Date(Date.now()+3600000).toISOString()});
  await db`UPDATE briofold_inbox_work SET return_at=now()-interval '1 minute' WHERE thread_id=${thread}`;
  assert.equal((await db`SELECT briofold_inbox_due_returns() AS n`)[0].n,1);
  assert.equal((await read()).work.owner_id,null);
  data=await read();await write('takeover',{revision:data.work.revision,reason:'Disputed handover must remain human',return_at:new Date(Date.now()+3600000).toISOString()});
  data=await read();await write('work',{...data.work,disputed:true});
  await db`UPDATE briofold_inbox_work SET return_at=now()-interval '1 minute' WHERE thread_id=${thread}`;
  assert.equal((await db`SELECT briofold_inbox_due_returns() AS n`)[0].n,0);
  assert.equal((await db`SELECT ai_enabled FROM inbox_threads WHERE id=${thread}`)[0].ai_enabled,false);
  data=await read();await write('work',{...data.work,disputed:false,status:'resolved'});
  await db`SELECT inbox_ingest(${c},'workflow-reopen','workflow-customer','Workflow fictional customer','A new fictional question','text',now()+interval '1 second')`;
  assert.equal((await read()).work.status,'open');
  const reply=randomUUID();await write('saved-reply',{id:reply,revision:0,title:'Delivery reply',category:'Delivery',body:'Hello {{customer_name}}, we are checking delivery.'});
  await denied(()=>write('saved-reply',{id:reply,revision:0,title:'Conflicting reply',category:'Delivery',body:'Must not overwrite'}),'40001');
  await write('work-note',{text:'wrong action',version:0}).then(()=>assert.fail('unknown action accepted'),e=>assert.equal(e.code,'22023'));
  await write('note',{text:'Internal fictional handover note',version:0});
  await denied(()=>write('note',{text:'Lost concurrent note',version:0}),'40001');
  await write('duty',{state:'available'});assert.equal((await read()).duty,'available');
  for(const role of ['viewer','editor']){
   await db`UPDATE workspace_members SET role=${role} WHERE workspace_id=${workspace} AND user_id=${actor}`;
   assert.equal((await read()).can_send,role==='editor');
   if(role==='viewer')await denied(()=>write('duty',{state:'busy'}),'42501');
   await denied(()=>write('archive-reply',{id:reply,revision:1}),'42501');
  }
  await db`UPDATE workspace_members SET role='owner' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  const foreign=randomUUID();await denied(()=>db`SELECT briofold_inbox_work_read(${foreign},'live',${actor},${thread},0)`,'42501');
  await denied(()=>db`SELECT briofold_inbox_work_read(${workspace},'sandbox',${actor},${thread},0)`,'42501');
  await denied(()=>db`UPDATE briofold_inbox_events SET action='rewrite' WHERE workspace_id=${workspace}`,'42501');
  for(const table of ['briofold_inbox_work','briofold_inbox_events','briofold_inbox_saved_replies','briofold_inbox_tickets','briofold_inbox_duty'])assert.equal((await db`SELECT has_table_privilege('ekmivo_financial_runtime',${table},'SELECT') AS allowed`)[0].allowed,false);
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_ai_credit_journal WHERE workspace_id=${workspace}`)[0].n),0);
  context=await browser.newContext();await context.addCookies([
   {name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  await page.goto(origin+'/inbox');await page.getByRole('button',{name:/Workflow fictional customer/}).click();await page.getByText(/Conversation tools/).click();
  const save=async(action,button)=>{const response=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action===action;}catch{return false;}});await page.getByRole('button',{name:button,exact:true}).click();assert.equal((await response).status(),200);};
  await page.getByLabel('Internal note',{exact:true}).fill('Browser internal note persisted');await save('work-note','Save note');assert.equal((await read()).note,'Browser internal note persisted');
  await page.getByLabel('Labels (comma separated)',{exact:true}).fill('browser,follow-up');await save('work','Save conversation');assert.deepEqual((await read()).work.labels,['browser','follow-up']);
  await page.getByRole('button',{name:'Insert draft',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Hello Workflow fictional customer, we are checking delivery.');
  assert.equal(Number((await db`SELECT count(*) AS n FROM inbox_messages WHERE workspace_id=${workspace} AND sender='seller'`)[0].n),0,'saved reply was automatically sent');
  // A real Unicode manual send remains permitted with zero AI credit.
  const endpoint=origin+'/api/go/workspaces/'+workspace+'/inbox?environment=live';
  const sent=await context.request.post(endpoint,{headers:{Origin:origin},data:{action:'send',thread_id:thread,body:{text:'ক'.repeat(8000),idempotency_key:randomUUID()}}});assert.equal(sent.status(),200,'Bangla reply hit an incorrect byte/character limit');
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_inbox_duty WHERE workspace_id=${workspace} AND user_id=${actor}`)[0].n),0,'duty record blocked membership revocation');
  await denied(read,'42501');assert.deepEqual(errors,[]);
  console.log('Phase6 WORKFLOW PASS: actual takeover/cancel/idempotency/revisions/assignment/labels/dispute/release/auto-return/tickets/notes/duty/saved replies/RLS; browser save/insert; Unicode human reply at zero credit');
 }finally{if(context)await context.close();await db.end({timeout:3});}
}
