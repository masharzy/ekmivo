import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runInterestAcceptance({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Interest acceptance refuses shared DB');
 const db=postgres(control,{max:3,prepare:false});let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const viewer=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  const store=randomUUID(),foreign=randomUUID();await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional sales interest','both',${actor}),(${foreign},'Foreign sales interest','both',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${actor},'owner'),(${store},${viewer},'viewer')`;
  const lead=async(name,stage,realm='live')=>(await db`INSERT INTO briofold_customers(workspace_id,environment,name,stage,email,temperature) VALUES(${store},${realm},${name},${stage},'private@example.invalid','hot') RETURNING id`)[0].id;
  const interested=await lead('Fictional qualified interest','qualified'),proposal=await lead('Fictional proposal interest','proposal'),ordered=await lead('Fictional active order customer','qualified'),cancelled=await lead('Fictional cancelled-order interest','qualified');
  await lead('Fictional won contact','won');await lead('Fictional new contact','new');await lead('Fictional sandbox interest','qualified','sandbox');
  for(const [customer,status] of [[ordered,'draft'],[cancelled,'cancelled']]){const id=randomUUID();await db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,customer_id,recipient,subtotal_minor,total_minor,status,created_by) VALUES(${id},${store},'live',${'INTEREST-'+id},'manual',${customer},'{}',0,0,${status},${actor})`;}
  const read=async(who=actor,realm='live',scope=store)=>(await db`SELECT briofold_customers_search(${scope},${realm},${who},0,'','unconverted','','','') data`)[0].data;
  let data=await read();assert.deepEqual(new Set(data.items.map(x=>x.id)),new Set([interested,proposal,cancelled]));
  assert.equal((await read(viewer)).items.every(x=>x.email===''&&x.phone===''),true);assert.equal((await read(actor,'sandbox')).items.length,1);
  await assert.rejects(()=>read(actor,'live',foreign),e=>e.code==='42501');
  const reminder=randomUUID();await db`SELECT briofold_customers_write(${store},'live',${actor},${randomUUID()},'followup',${db.json({id:interested,revision:1,followup_id:reminder,due_at:new Date(Date.now()+3600000).toISOString(),time_zone:'Asia/Dhaka',body:'Fictional sales follow-up',kind:'reminder',quiet_start:'',quiet_end:''})})`;
  assert.equal((await db`SELECT status FROM briofold_customer_followups WHERE id=${reminder}`)[0].status,'scheduled');
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin},{name:'ekmivo-default-workspace',value:actor+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
  const page=await context.newPage();await page.goto(origin+'/orders/to-chase');await page.getByRole('heading',{name:'Qualified interest without an order',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fictional qualified interest',exact:true}).click();await page.getByText('Fictional sales follow-up',{exact:true}).waitFor();
  await page.getByLabel('Lead stage',{exact:true}).selectOption('won');await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Qualified interest without an order',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Fictional qualified interest',exact:true}).count(),0,'Won lead stayed in not-converted interest');
  const response=await context.request.get(origin+`/api/go/workspaces/${store}/crm?environment=live&filter=unconverted`);assert.equal(response.status(),200);assert.deepEqual(new Set((await response.json()).items.map(x=>x.id)),new Set([proposal,cancelled]));
  console.log('UNCONVERTED INTEREST SQL/Go/Next/browser PASS: no draft order required, stage/order/realm filter, viewer masking, internal follow-up and won transition after reload');
 }finally{await context?.close();await db.end({timeout:3});}
}
