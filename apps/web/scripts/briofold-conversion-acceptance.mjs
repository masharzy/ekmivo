import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
export async function runLinkedOrderConversion({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Conversion acceptance refuses shared DB');
 const db=postgres(control,{max:3,prepare:false});let context,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),staff=randomUUID(),store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${staff},${staff+'@example.invalid'},'=2+3','invalid-fixture-hash',now())`;
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional linked conversion business','both',${owner}),(${foreign},'Foreign conversion business','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer'),(${store},${staff},'editor')`;
  const sourceLead=async provider=>{const c=(await db`SELECT inbox_connection(${store},'live',${provider},${provider+'-convert-'+store},decode('abcd','hex')) id`)[0].id;const thread=(await db`INSERT INTO inbox_threads(workspace_id,connection_id,external_id,customer_name) VALUES(${store},${c},${randomUUID()},'Fictional conversion source') RETURNING id`)[0].id;return(await db`SELECT customer_id FROM briofold_customer_sources WHERE workspace_id=${store} AND kind='thread' AND source_id=${thread}`)[0].customer_id;};
  const first=await sourceLead('ms'),won=await sourceLead('ig');await db`UPDATE briofold_customers SET assignee=${staff},stage=CASE WHEN id=${won} THEN 'won' ELSE 'qualified' END WHERE id IN (${first},${won})`;
  const profile=async(name,assignee=null,realm='live',created=new Date(),merged=null)=>(await db`INSERT INTO briofold_customers(workspace_id,environment,name,assignee,email,created_at,merged_into) VALUES(${store},${realm},${name},${assignee},'private-conversion@example.invalid',${created},${merged}) RETURNING id`)[0].id;
  const linked=await profile('Fictional source-linked order',owner),cancelled=await profile('Fictional cancelled only'),mergedRoot=await profile('Fictional merged root',owner);
  const oldDate=new Date(Date.now()-40*86400000),mergedChild=await profile('Fictional merged child',owner,'live',oldDate,mergedRoot),old=await profile('Fictional older cohort',owner,'live',oldDate),sandbox=await profile('Fictional sandbox cohort',owner,'sandbox');
  const order=async(customer,status,realm='live')=>{const id=randomUUID();await db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,customer_id,status,recipient,subtotal_minor,total_minor,created_by) VALUES(${id},${store},${realm},${'CONVERSION-'+id},'manual',${customer},${status},'{}',0,0,${owner})`;return id;};
  const firstOrder=await order(first,'confirmed');await db`INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(${store},'live',${first},'order',${firstOrder})`;
  const linkedOrder=await order(null,'delivered');await db`INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(${store},'live',${linked},'order',${linkedOrder})`;
  await order(cancelled,'cancelled');await order(cancelled,'draft');await order(cancelled,'hold');await order(cancelled,'returned');await order(mergedChild,'packed');await order(old,'shipped');await order(sandbox,'confirmed','sandbox');
  const read=async(who=owner,realm='live',days=30,scope=store)=>(await db`SELECT briofold_linked_order_conversion(${scope},${realm},${who},${days},0) data`)[0].data;
  const data=await read();assert.equal(data.profiles,5);assert.equal(data.converted,3,'Won-only, draft/cancelled, duplicates, merged roots or outside-cohort orders distorted conversion');
  assert.deepEqual(data.sources.map(x=>[x.key,x.profiles,x.converted]),[['ig',1,0],['ms',1,1],['unattributed',3,2]]);
  assert.equal((await read(owner,'live',90)).profiles,6);assert.equal((await read(owner,'live',90)).converted,4);assert.equal((await read(owner,'sandbox')).converted,1);
  const masked=await read(viewer);assert.equal(masked.can_export,false);assert.equal(JSON.stringify(masked).includes(staff),false);assert.equal(JSON.stringify(masked).includes('=2+3'),false);assert.equal(JSON.stringify(data).includes('private-conversion@example.invalid'),false);
  await assert.rejects(()=>read(owner,'live',30,foreign),e=>e.code==='42501');await assert.rejects(()=>read(owner,'live',31),e=>e.code==='22023');
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'ekmivo-session',value:token,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:user+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const endpoint=origin+`/api/go/workspaces/${store}/growth?environment=live&kind=conversion`;
  assert.equal((await context.request.get(endpoint+'&period=31')).status(),422);assert.equal((await context.request.get(endpoint+'&cursor=-1')).status(),422);
  let response=await context.request.get(endpoint);assert.equal(response.status(),200);assert.equal((await response.json()).converted,3);
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/reports');
  const region=page.getByRole('region',{name:'Linked-order conversion',exact:true});
  await region.locator('dl>div').filter({has:page.getByText('Profiles in cohort',{exact:true})}).getByText('5',{exact:true}).waitFor();
  await region.locator('dl>div').filter({has:page.getByText('Profiles with orders',{exact:true})}).getByText('3',{exact:true}).waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),region.getByRole('button',{name:'Export conversion page CSV',exact:true}).click()]);const csv=await readFile(await download.path(),'utf8');assert.ok(csv.includes("'=2+3"),'member formula was not escaped in conversion CSV');assert.equal(csv.includes('private-conversion@example.invalid'),false);
  await region.getByLabel('Conversion period',{exact:true}).selectOption('90');await region.locator('dl>div').filter({has:page.getByText('Profiles in cohort',{exact:true})}).getByText('6',{exact:true}).waitFor();
  const privatePage=await viewerContext.newPage();await privatePage.goto(origin+'/reports');const privateRegion=privatePage.getByRole('region',{name:'Linked-order conversion',exact:true});await privateRegion.getByText('Assigned members',{exact:true}).waitFor();assert.equal(await privateRegion.getByText('=2+3',{exact:true}).count(),0);assert.equal(await privateRegion.getByRole('button',{name:'Export conversion page CSV',exact:true}).count(),0);
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${store},${viewer},'inbox:read',false)`;assert.equal((await viewerContext.request.get(endpoint)).status(),403);
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/reports');await page.getByRole('heading',{name:lang==='bn'?'যুক্ত অর্ডারের কনভার্সন':'Linked-order conversion',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.deepEqual(errors,[]);console.log('LINKED ORDER CONVERSION SQL/Go/Next/browser PASS: actual cohort/order/source/merged identity dedup, current team privacy, window/realm/role denial, formula-safe CSV and responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
