import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';

export async function runBriofoldGrowthOperations({origin,browser,control,sessions}){
 const url=new URL(control);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/prod/i.test(url.pathname))throw Error('Growth acceptance refuses shared database');
 const db=postgres(control,{max:4,prepare:false});let ctx,viewerCtx;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional growth Store','both',${owner}),(${foreign},'Unrelated growth Store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const read=async(kind='broadcast',who=owner,scope=store,realm='live')=>(await db`SELECT briofold_growth_operations_read(${scope},${realm},${who},${kind}) data`)[0].data;
  const cmd=async(action,body,key=randomUUID(),who=owner,scope=store,realm='live')=>(await db`SELECT briofold_growth_operations_write(${scope},${realm},${who},${key},${action},${db.json(body)}) data`)[0].data;
  const content={kind:'broadcast',audience:'all',title:'Fictional consent-safe offer',body:'Only a planning draft, not a send',time_zone:'Asia/Dhaka'};
  const key=randomUUID(),draft=await cmd('draft-create',content,key);
  assert.deepEqual(await cmd('draft-create',content,key),draft,'same idempotency key duplicated draft');
  await assert.rejects(()=>cmd('draft-create',{...content,title:'Changed'},key),e=>e.code==='23505');
  assert.equal((await read()).items.length,1);
  assert.equal((await read('broadcast',owner,store,'sandbox')).items.length,0);
  assert.equal((await read('broadcast',viewer)).items.length,1);
  assert.equal((await read('broadcast',viewer)).send_ready,false);
  await assert.rejects(()=>read('broadcast',viewer,foreign),e=>e.code==='42501');
  await assert.rejects(()=>cmd('draft-create',content,randomUUID(),viewer),e=>e.code==='42501');
  const planned=new Date(Date.now()+86400000).toISOString();
  const saved=await cmd('draft-update',{...content,id:draft.id,revision:1,status:'planned',planned_at:planned});
  assert.equal(saved.revision,2);
  await assert.rejects(()=>cmd('draft-update',{...content,id:draft.id,revision:1,status:'draft'}),e=>e.code==='40001');
  assert.equal((await read()).items[0].status,'planned');
  const post=await cmd('draft-create',{...content,kind:'post',title:'Fictional social post'});
  assert.equal((await read('post')).items[0].id,post.id);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_commands WHERE workspace_id=${store}`)[0].n),3);
  const resource=(await cmd('resource-create',{title:'Fictional consultation room'})).id;
  const starts=new Date(Date.now()+86400000),ends=new Date(starts.getTime()+1800000);
  const first=await cmd('booking-create',{resource_id:resource,summary:'Fictional consultation',starts_at:starts.toISOString(),ends_at:ends.toISOString(),time_zone:'Asia/Dhaka'});
  await assert.rejects(()=>cmd('booking-create',{resource_id:resource,summary:'Conflicting slot',starts_at:new Date(starts.getTime()+60000).toISOString(),ends_at:new Date(ends.getTime()+60000).toISOString(),time_zone:'Asia/Dhaka'}),e=>e.code==='40001');
  const confirmed=await cmd('booking-status',{id:first.id,revision:1,status:'confirmed'});assert.equal(confirmed.revision,2);
  await assert.rejects(()=>cmd('booking-status',{id:first.id,revision:1,status:'completed'}),e=>e.code==='40001');
  await cmd('booking-status',{id:first.id,revision:2,status:'cancelled'});
  assert.equal((await read('booking')).items[0].status,'cancelled');
  await cmd('booking-create',{resource_id:resource,summary:'Rebook cancelled slot',starts_at:starts.toISOString(),ends_at:ends.toISOString(),time_zone:'Asia/Dhaka'});
  await assert.rejects(()=>cmd('booking-create',{resource_id:resource,summary:'Cross realm customer',customer_id:randomUUID(),starts_at:new Date(starts.getTime()+86400000).toISOString(),ends_at:new Date(ends.getTime()+86400000).toISOString(),time_zone:'Asia/Dhaka'}),e=>e.code==='22023');
  await assert.rejects(()=>cmd('resource-create',{title:'Outside Store'},randomUUID(),viewer),e=>e.code==='42501');
  for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection']){
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_campaign_drafts','SELECT') ok`)[0].ok,false);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_operations_read(uuid,text,uuid,text)','EXECUTE') ok`)[0].ok,true);
  }
  ctx=await browser.newContext();await ctx.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await ctx.newPage();page.setDefaultNavigationTimeout(90000);
  assert.equal((await page.goto(origin+'/customers/bookings')).status(),200);
  await page.getByRole('heading',{name:'Bookings & availability'}).waitFor();
  await page.getByText('Fictional consultation room').first().waitFor();
  assert.equal((await ctx.request.get(origin+`/api/go/workspaces/${store}/growth?environment=live&kind=broadcast`)).status(),200);
  const result=await ctx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,{headers:{Origin:origin},data:{action:'draft-create',operation_key:randomUUID(),body:{...content,title:'Through actual API'}}});
  assert.equal(result.status(),200);
  viewerCtx=await browser.newContext();await viewerCtx.addCookies([{name:'ekmivo-session',value:sessions.viewer,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:viewer+':'+store,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const denied=await viewerCtx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,{headers:{Origin:origin},data:{action:'resource-create',operation_key:randomUUID(),body:{title:'Denied'}}});
  assert.equal(denied.status(),403);
  let count=0;for(const lang of ['en','bn']){await ctx.addCookies([{name:'ekmivo-locale',value:lang,url:origin,sameSite:'Lax'}]);for(const theme of ['light','dark']){await ctx.addCookies([{name:'ekmivo-theme',value:theme,url:origin,sameSite:'Lax'}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});for(const [path,heading] of [['broadcasts',lang==='bn'?'ব্রডকাস্ট ড্রাফট':'Broadcast drafts'],['posts',lang==='bn'?'ক্যাম্পেইন পোস্ট':'Campaign posts'],['bookings',lang==='bn'?'বুকিং ও সময়সূচি':'Bookings & availability']]){await page.goto(origin+'/customers/'+path);await page.getByRole('heading',{name:heading,exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`growth overflow ${lang}/${theme}/${width}/${path}`);count++;}}}}
  console.log('Phase10 growth operations responsive cases PASS:',count);
  console.log('Phase10 growth operations PASS: CONTROL tenant/realm/RBAC, idempotency, consent-safe no-send drafts, editorial plan, booking slot conflicts and review, real Go/Next/browser and viewer denial. No provider delivery claimed.');
 }finally{if(ctx)await ctx.close();if(viewerCtx)await viewerCtx.close();await db.end({timeout:3});}
}
