import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import postgres from 'postgres';

export async function runBriofoldAiStudioAcceptance({control,sessions,origin,browser}){
 const target=new URL(control);
 if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Studio acceptance refuses shared databases');
 const db=postgres(control,{max:3,prepare:false}),workspace=randomUUID();let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Phase6 Studio fictional acceptance','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  const read=async()=> (await db`SELECT briofold_ai_studio_read(${workspace},${actor},0,0) AS data`)[0].data;
  const write=async(kind,payload,key=randomUUID())=>(await db`SELECT briofold_ai_studio_write(${workspace},${actor},${key},${kind},${db.json(payload)}) AS data`)[0].data;
  const search=async(q,published=false)=>(await db`SELECT briofold_ai_knowledge_search(${workspace},${actor},${q},${published}) AS data`)[0].data;
  const denied=async(fn,code)=>assert.rejects(fn,error=>error.code===code);
  const config={instructions:'Use only verified catalog facts. Never assert payment verification.',mode:'off',language:'auto',tone:'neutral',model:''};
  assert.equal((await read()).revision,0);
  await write('draft',{revision:0,config});
  assert.equal((await read()).published_id,null,'draft must not publish');
  await denied(()=>write('draft',{revision:0,config}),'40001');
  await denied(()=>write('publish',{revision:1,confirmed:false,reason:'Fictional acceptance release'}),'22023');
  const source=randomUUID();let saved=await write('source',{id:source,expected_version:null,title:'Delivery policy',kind:'qa',content:'Orchid delivery takes three business days.'});
  const publish={revision:saved.revision,confirmed:true,reason:'Fictional acceptance release'},key=randomUUID();
  const copies=await Promise.all([write('publish',publish,key),write('publish',publish,key)]);
  assert.deepEqual(copies[0],copies[1],'concurrent retry must publish once');
  assert.equal((await read()).versions.length,1);
  await denied(()=>write('publish',{...publish,reason:'Changed request body'},key),'23505');
  assert.equal((await search('Orchid',true)).length,1);
  const old=saved.version;
  saved=await write('source',{id:source,expected_version:old,title:'Delivery policy',kind:'qa',content:'Lotus delivery takes five business days.'});
  assert.equal((await search('Orchid',true)).length,1,'published snapshot survives draft edit');
  assert.equal((await search('Orchid')).length,0);
  assert.equal((await search('Lotus')).length,1);
  await denied(()=>write('archive',{id:source,expected_version:old}),'40001');
  const first=copies[0].id;
  await write('publish',{revision:saved.revision,confirmed:true,reason:'Publish revised source fixture'});
  let data=await read();assert.equal(data.versions.length,2);assert.equal((await search('Lotus',true)).length,1);
  await write('rollback',{revision:data.revision,confirmed:true,reason:'Restore immutable original fixture',target:first});
  data=await read();assert.equal(data.versions.length,3);assert.notEqual(data.published_id,first);assert.equal((await search('Orchid',true)).length,1);
  await write('archive',{id:source,expected_version:saved.version});
  assert.equal((await search('Orchid',true)).length,0,'archive removes even old published source from retrieval');
  await denied(()=>db`UPDATE briofold_ai_studio_versions SET reason='Mutated history' WHERE workspace_id=${workspace}`,'42501');
  await denied(()=>db`DELETE FROM briofold_ai_knowledge_versions WHERE workspace_id=${workspace}`,'42501');
  const foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${foreign},'Other fictional business','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${foreign},${actor},'owner')`;
  await denied(()=>db`SELECT briofold_ai_studio_write(${foreign},${actor},${randomUUID()},'source',${db.json({id:source,expected_version:saved.version,title:'Foreign edit',kind:'text',content:'Must fail'})})`,'42501');
  for(const role of ['editor','viewer']){
   await db`UPDATE workspace_members SET role=${role} WHERE workspace_id=${workspace} AND user_id=${actor}`;
   await denied(read,'42501');await denied(()=>write('draft',{revision:data.revision,config}),'42501');
  }
  await db`UPDATE workspace_members SET role='admin' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await read();
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${workspace},${actor},'inbox:manage',false)`;
  await denied(read,'42501');
  await db`DELETE FROM pg13_member_grants WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await db`UPDATE workspace_product_access SET enabled=false WHERE workspace_id=${workspace} AND product='ai'`;
  await denied(read,'42501');
  await db`UPDATE workspace_product_access SET enabled=true WHERE workspace_id=${workspace} AND product='ai'`;
  await db`UPDATE workspace_members SET role='owner' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  // Real Server Actions through the running Next application, using the saved owner session.
  context=await browser.newContext();await context.addCookies([
   {name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  await page.goto(origin+'/settings/ai');await page.getByLabel('Instructions',{exact:true}).fill('Browser persisted instructions. Never invent a paid payment.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await page.reload();assert.equal(await page.getByLabel('Instructions',{exact:true}).inputValue(),'Browser persisted instructions. Never invent a paid payment.');
  await page.getByLabel('Reason (10–500 characters)',{exact:true}).fill('Browser confirmed publication');
  await page.getByLabel('I confirm this publication replaces the active configuration.',{exact:true}).check();
  await page.getByRole('button',{name:'Publish configuration',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  assert.equal((await read()).published.instructions,'Browser persisted instructions. Never invent a paid payment.');
  await page.goto(origin+'/settings/knowledge');await page.getByLabel('Title or question',{exact:true}).fill('Browser warranty');await page.getByLabel('Content or answer',{exact:true}).fill('Marigold warranty is one year.');
  await page.getByRole('button',{name:'Save source',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await page.getByLabel('Test question',{exact:true}).fill('Marigold');await page.getByRole('button',{name:'Search sources',exact:true}).click();await page.getByText('Marigold warranty is one year.',{exact:true}).waitFor();
  await page.reload();await page.getByText('Browser warranty',{exact:true}).waitFor();
  await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await page.reload();await page.getByText('Owner or permitted admin access is required.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save source',exact:true}).count(),0);
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;await denied(read,'42501');
  assert.deepEqual(errors,[],'Studio browser runtime errors');
  console.log('Phase6 STUDIO ACCEPTANCE PASS: actual draft/publish/concurrent retry/rollback/immutable knowledge/tenant and role denial; real Next save/reload/publish/retrieval/permission browser');
 }finally{if(context)await context.close();await db.end({timeout:3});}
}
