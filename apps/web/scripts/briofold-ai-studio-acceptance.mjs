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
  // Privileged fixtures populate an independent pagination business. No API rate-limit bypass is shipped.
  const pages=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${pages},'Fictional pagination business','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${pages},${actor},'owner')`;
  await db`INSERT INTO briofold_ai_knowledge_sources(id,workspace_id) SELECT gen_random_uuid(),${pages} FROM generate_series(1,51)`;
  await db`INSERT INTO briofold_ai_knowledge_versions(workspace_id,source_id,title,kind,content,actor_id) SELECT ${pages},id,'Fictional page source','text','Fictional source content',${actor} FROM briofold_ai_knowledge_sources WHERE workspace_id=${pages}`;
  await db`UPDATE briofold_ai_knowledge_sources s SET current_version=v.id FROM briofold_ai_knowledge_versions v WHERE s.workspace_id=${pages} AND v.source_id=s.id`;
  await db`INSERT INTO briofold_ai_studio_versions(workspace_id,publication,config,actor_id,reason) SELECT ${pages},n,${db.json(config)},${actor},'Fictional history page' FROM generate_series(1,21) n`;
  const paged=async(s,v)=>(await db`SELECT briofold_ai_studio_read(${pages},${actor},${s},${v}) AS data`)[0].data;
  const p1=await paged(0,0),p2=await paged(50,20);
  assert.equal(p1.sources.length,50);assert.equal(p1.more_sources,true);assert.equal(p2.sources.length,1);assert.equal(p2.more_sources,false);
  assert.equal(new Set([...p1.sources,...p2.sources].map(x=>x.id)).size,51);
  assert.equal(p1.versions.length,20);assert.equal(p1.more_versions,true);assert.equal(p2.versions.length,1);assert.equal(p2.more_versions,false);
  await denied(()=>paged(-1,0),'22023');
  for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection']){
   const [privileges]=await db`SELECT has_table_privilege(${role},'briofold_ai_knowledge_versions','SELECT') AS readable,has_function_privilege(${role},'briofold_ai_studio_write(uuid,uuid,uuid,text,jsonb)','EXECUTE') AS writable`;
   assert.equal(privileges.readable,false);assert.equal(privileges.writable,false);
  }
  assert.equal(Number((await db`SELECT count(*) AS n FROM pg_class WHERE relname IN ('briofold_ai_studio_versions','briofold_ai_studio_drafts','briofold_ai_knowledge_sources','briofold_ai_knowledge_versions','briofold_ai_studio_sources','briofold_ai_studio_operations') AND relrowsecurity AND relforcerowsecurity`)[0].n),6);
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_ai_credit_journal WHERE workspace_id IN (${workspace},${pages},${foreign})`)[0].n),0,'configuration and retrieval never debit credits');
  // Real Server Actions through the running Next application, using the saved owner session.
  context=await browser.newContext();await context.addCookies([
   {name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  await page.goto(origin+'/settings/ai');
  try{await page.getByLabel('Instructions',{exact:true}).waitFor({timeout:5000});}catch{throw Error('Studio editor unavailable at '+page.url()+'; browser errors: '+JSON.stringify(errors)+'; rendered fixture page: '+(await page.locator('body').innerText()).slice(-6000));}
  await context.addCookies([{name:'ekmivo-default-workspace',value:actor+':'+foreign,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const stalePaid=await context.request.post(origin+'/api/go/workspaces/'+workspace+'/ai/studio-test',{headers:{Origin:origin,'Idempotency-Key':'studio-test:'+randomUUID()},data:{revision:(await read()).revision,question:'Fictional stale tab'}});
  assert.equal(stalePaid.status(),409);assert.equal((await stalePaid.json()).code,'STALE_BUSINESS');
  await context.addCookies([{name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'}]);
  // Only Next's UI flag is enabled in this isolated harness. Go remains paid-off.
  await page.getByLabel('Test question',{exact:true}).fill('Fictional practice question');
  await page.getByLabel('I agree to use AI credits for this test.',{exact:true}).check();
  await page.getByRole('button',{name:'Test answer',exact:true}).click();await page.getByRole('alert').filter({hasText:'Paid AI testing is paused.'}).waitFor();
  const requestKeys=[];let dropped=false;
  const proposal={...config,instructions:'Fictional proposed concise instructions'};
  await page.route('**/api/go/workspaces/'+workspace+'/ai/studio-test',async route=>{
   const body=route.request().postDataJSON();requestKeys.push(route.request().headers()['idempotency-key']);
   if(body.purpose==='edit')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({proposal,base_revision:body.revision,cost_minor:7})});
   if(!dropped){dropped=true;return route.abort('failed');}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Fictional practice response',cost_minor:7})});
  });
  await page.getByRole('button',{name:'Test answer',exact:true}).click();await page.getByRole('alert').filter({hasText:'The result could not be loaded. Retry preserves the request key.'}).waitFor();
  await page.getByRole('button',{name:'Test answer',exact:true}).click();await page.getByText('Fictional practice response',{exact:true}).waitFor();assert.equal(requestKeys[0],requestKeys[1],'practice retry changed paid request key');
  await page.reload();await page.getByLabel('Test question',{exact:true}).fill('Fictional practice question');await page.getByLabel('I agree to use AI credits for this test.',{exact:true}).check();
  await page.getByRole('button',{name:'Test answer',exact:true}).click();await page.getByText('Fictional practice response',{exact:true}).waitFor();assert.equal(requestKeys[0],requestKeys[2],'reload changed paid request key');
  await page.getByLabel('Practice task',{exact:true}).selectOption('edit');await page.getByLabel('Requested change',{exact:true}).fill('Make the instructions concise');
  const beforeProposal=(await read()).config.instructions;
  await page.getByRole('button',{name:'Propose edit',exact:true}).click();await page.getByText('Compare before applying. This proposal has not been saved or published.',{exact:true}).waitFor();
  assert.equal((await read()).config.instructions,beforeProposal,'proposal silently wrote configuration');
  await page.getByRole('button',{name:'Apply to unsaved draft',exact:true}).click();assert.equal(await page.getByLabel('Instructions',{exact:true}).inputValue(),proposal.instructions);
  assert.equal((await read()).config.instructions,beforeProposal,'accept silently saved draft');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  assert.equal((await read()).config.instructions,proposal.instructions);assert.notEqual((await read()).published.instructions,proposal.instructions,'save silently published proposal');
  await page.getByLabel('Instructions',{exact:true}).fill('Browser persisted instructions. Never invent a paid payment.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await page.reload();assert.equal(await page.getByLabel('Instructions',{exact:true}).inputValue(),'Browser persisted instructions. Never invent a paid payment.');
  await page.getByLabel('Reason (10–500 characters)',{exact:true}).fill('Browser confirmed publication');
  await page.getByLabel('I confirm this publication replaces the active configuration.',{exact:true}).check();
  await page.getByRole('button',{name:'Publish configuration',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  assert.equal((await read()).published.instructions,'Browser persisted instructions. Never invent a paid payment.');
  await page.goto(origin+'/settings/knowledge');
  const importPath=origin+'/api/go/workspaces/'+workspace+'/ai/knowledge-import';
  const scanned=await context.request.post(importPath,{headers:{Origin:origin},data:{name:'Fictional.docx',data:Buffer.from('Fictional scanner probe').toString('base64')}});
  assert.equal(scanned.status(),503);assert.equal((await scanned.json()).error?.code,'FILE_SCAN_UNCONFIRMED');
  await page.route('**/api/go/workspaces/'+workspace+'/ai/knowledge-import',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Fictional imported Word warranty is two years.',name:'Fictional Word.docx',kind:'text'})}));
  await page.getByLabel('Import document',{exact:true}).setInputFiles({name:'Fictional Word.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('Mocked document parser transport')});
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Content or answer"]')?.value==='Fictional imported Word warranty is two years.');
  assert.equal((await read()).sources.some(x=>x.title==='Fictional Word.docx'),false,'Word preview silently persisted a source');
  await page.getByRole('button',{name:'Save source',exact:true}).click();await page.getByText('Fictional Word.docx',{exact:true}).waitFor();
  const privateURL=await context.request.post(importPath,{headers:{Origin:origin},data:{url:'https://169.254.169.254/latest/meta-data'}});
  assert.equal(privateURL.status(),422);assert.equal((await privateURL.json()).error?.code,'URL_IMPORT_FAILED');
  await page.route('**/api/go/workspaces/'+workspace+'/ai/knowledge-import',route=>{const request=route.request().postDataJSON();return request.url?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Fictional imported public page delivery policy.',name:'public.example/policy',kind:'text'})}):route.fallback();});
  await page.getByLabel('Knowledge URL',{exact:true}).fill('https://public.example/policy');await page.getByRole('button',{name:'Import page text',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Content or answer"]')?.value==='Fictional imported public page delivery policy.');
  assert.equal((await read()).sources.some(x=>x.title==='public.example/policy'),false,'URL preview silently persisted a source');
  await page.getByRole('button',{name:'Save source',exact:true}).click();await page.getByText('public.example/policy',{exact:true}).waitFor();
  await page.getByLabel('Title or question',{exact:true}).fill('Browser warranty');await page.getByLabel('Content or answer',{exact:true}).fill('Marigold warranty is one year.');
  await page.getByRole('button',{name:'Save source',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await page.getByLabel('Test question',{exact:true}).fill('Marigold');await page.getByRole('button',{name:'Search sources',exact:true}).click();await page.getByText('Marigold warranty is one year.',{exact:true}).waitFor();
  await page.reload();await page.getByText('Browser warranty',{exact:true}).waitFor();
  await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await page.reload();await page.getByText('Owner or permitted admin access is required.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save source',exact:true}).count(),0);
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;await denied(read,'42501');
  assert.deepEqual(errors,[],'Studio browser runtime errors');
  console.log('Phase6 STUDIO ACCEPTANCE PASS: actual draft/publish/concurrent retry/rollback/immutable knowledge/tenant and role denial; real Next save/reload/publish/retrieval/permission browser; paid-off API enforced; mocked proposal comparison/apply/save and request retry UI');
 }finally{if(context)await context.close();await db.end({timeout:3});}
}
