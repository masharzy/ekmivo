import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import postgres from 'postgres';

export async function runBriofoldGrowthOperations({origin,browser,control,sessions,apiOrigin}){
 const url=new URL(control);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/prod/i.test(url.pathname))throw Error('Growth acceptance refuses shared database');
 const db=postgres(control,{max:4,prepare:false});let ctx,viewerCtx;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional growth Store','both',${owner}),(${foreign},'Unrelated growth Store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const profile=(await db`INSERT INTO briofold_customers(workspace_id,environment,name,email,stage,preferences)
   VALUES(${store},'live','Fictional opted-in person','test-only@example.invalid','qualified',${db.json({marketing:'opted-in',do_not_contact:false})}) RETURNING id`)[0].id;
  const identityProof=(await db`INSERT INTO briofold_customer_proofs(workspace_id,environment,customer_id,kind,value)
   VALUES(${store},'live',${profile},'email','test-only@example.invalid') RETURNING id`)[0].id;
  const preview=async(ch='email',segment='all',who=owner,realm='live',scope=store)=>(await db`SELECT briofold_growth_audience_preview(${scope},${realm},${who},${ch},${segment}) data`)[0].data;
  assert.equal((await preview()).candidate_profiles,1);
  assert.equal((await preview()).potentially_eligible_with_proof,0,'CRM opt-in must not authorize broadcast');
  assert.equal((await preview()).channel_proof_missing,1);
  await assert.rejects(()=>preview('email','all',viewer),e=>e.code==='42501');
  await assert.rejects(()=>preview('email','all',owner,'live',foreign),e=>e.code==='42501');
  await db`INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_proof_id,source_kind,evidence_digest,verified_at)
   VALUES(${store},'live',${profile},'email',${identityProof},'confirmed-double-opt-in',${createHash('sha256').update(randomUUID()).digest('hex')},now())`;
  await assert.rejects(()=>db`UPDATE briofold_growth_channel_consents SET evidence_digest=${createHash('sha256').update(randomUUID()).digest('hex')} WHERE customer_id=${profile}`,
   e=>e.code==='42501','provider proof evidence cannot be silently rewritten');
  assert.equal((await preview()).potentially_eligible_with_proof,1,'active evidence + identity + profile only');
  await db`UPDATE briofold_customer_proofs SET revoked_at=now() WHERE id=${identityProof}`;
  await db`INSERT INTO briofold_customer_proofs(workspace_id,environment,customer_id,kind,value)
   VALUES(${store},'live',${profile},'email','test-only@example.invalid')`;
  assert.equal((await preview()).potentially_eligible_with_proof,0,'renewed identity proof must not inherit former marketing opt-in');
  await db`INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_proof_id,source_kind,evidence_digest,verified_at)
   SELECT ${store},'live',${profile},'email',id,'confirmed-double-opt-in',${createHash('sha256').update(randomUUID()).digest('hex')},now()
    FROM briofold_customer_proofs WHERE customer_id=${profile} AND revoked_at IS NULL`;
  assert.equal((await preview()).potentially_eligible_with_proof,1,'new proof needs its own explicit consent evidence');
  assert.equal((await preview('email','won')).candidate_profiles,0,'audience stage is authoritative');
  assert.equal((await preview('email','all',owner,'sandbox')).candidate_profiles,0,'realm isolated');
  assert.equal((await preview()).send_ready,false,'no provider delivery capability');
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
  const ops=(await db`SELECT briofold_growth_operational_snapshot(${store},'live',${owner}) data`)[0].data;
  assert.equal(Number(ops.campaigns.broadcast_planned),1);
  assert.equal(Number(ops.campaigns.post_drafts),1);
  assert.equal(Number(ops.bookings.booking_cancelled),1);
  assert.equal(Number(ops.bookings.booking_requested),1);
  assert.equal(Number(ops.team.open),0);
  assert.equal(Number(ops.messages.ai_outbound_7d),0);
  const connection=randomUUID(),thread=randomUUID();
  await db`INSERT INTO inbox_connections(id,workspace_id,environment,provider,external_id,credential_cipher)
   VALUES(${connection},${store},'live','ms',${'growth-fixture-'+connection},decode('12ab','hex'))`;
  await db`INSERT INTO inbox_threads(id,workspace_id,connection_id,external_id,customer_name)
   VALUES(${thread},${store},${connection},${'growth-thread-'+thread},'Isolated test-only conversation')`;
  const withUnassigned=(await db`SELECT briofold_growth_operational_snapshot(${store},'live',${owner}) data`)[0].data;
  assert.equal(Number(withUnassigned.team.unassigned),1,'unassigned includes threads before a workflow row is created');
  assert.equal(Number(withUnassigned.team.open),1,'open includes threads with implicit default status');
  const sandbox=(await db`SELECT briofold_growth_operational_snapshot(${store},'sandbox',${owner}) data`)[0].data;
  assert.equal(Number(sandbox.campaigns.broadcast_planned),0);
  assert.equal(Number(sandbox.team.open),0);
  await assert.rejects(()=>db`SELECT briofold_growth_operational_snapshot(${foreign},'live',${viewer})`,e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT briofold_growth_export(${store},'live',${viewer})`,e=>e.code==='42501');
  const exported=(await db`SELECT briofold_growth_export(${store},'live',${owner}) data`)[0].data;
  assert.equal(exported.version,1);
  assert.equal(Number(exported.operations.bookings.booking_requested),1);
  assert.equal(typeof exported.core.customers.total,'number');
  for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection']){
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_campaign_drafts','SELECT') ok`)[0].ok,false);
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_growth_channel_consents','SELECT') ok`)[0].ok,false);
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_growth_suppressions','INSERT') ok`)[0].ok,false);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_operations_read(uuid,text,uuid,text)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_audience_preview(uuid,text,uuid,text,text)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_export(uuid,text,uuid)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_provider_opt_out(uuid,text)','EXECUTE') ok`)[0].ok,role==='ekmivo_financial_runtime');
  }
  ctx=await browser.newContext();await ctx.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await ctx.newPage();page.setDefaultNavigationTimeout(90000);
  assert.equal((await page.goto(origin+'/customers/bookings')).status(),200);
  await page.getByRole('heading',{name:'Bookings & availability'}).waitFor();
  await page.getByText('Fictional consultation room').first().waitFor();
  assert.equal((await ctx.request.get(origin+`/api/go/workspaces/${store}/growth?environment=live&kind=broadcast`)).status(),200);
  const audienceUrl=origin+`/api/go/workspaces/${store}/growth?environment=live&kind=audience&channel=email&audience=all`;
  const safePreview=await ctx.request.get(audienceUrl);
  assert.equal(safePreview.status(),200);assert.equal((await safePreview.json()).potentially_eligible_with_proof,1);
  const suppressKey=randomUUID();
  const suppressBody={customer_id:profile,channel:'email',reason:'customer-request'};
  const suppress=async(body=suppressBody,key=suppressKey)=>ctx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,
   {headers:{Origin:origin},data:{action:'suppress-contact',operation_key:key,body}});
  const suppressResponse=await suppress();assert.equal(suppressResponse.status(),200);
  assert.equal((await suppress()).status(),200,'same suppression is idempotent after lost response');
  assert.ok([409,422].includes((await suppress({...suppressBody,reason:'legal'})).status()),'same key changed body must fail');
  assert.equal((await preview()).potentially_eligible_with_proof,0,'opt-out defeats existing verified proof');
  assert.equal((await preview()).suppressed,1);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppression_events WHERE workspace_id=${store}`)[0].n),1,'single append-only audit event');
  assert.equal((await suppress({...suppressBody,customer_id:randomUUID()},randomUUID())).status(),403,'foreign customer opt-out rejected');
  const result=await ctx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,{headers:{Origin:origin},data:{action:'draft-create',operation_key:randomUUID(),body:{...content,title:'Through actual API'}}});
  assert.equal(result.status(),200);
  const pageReport=await page.goto(origin+'/reports');
  assert.equal(pageReport.status(),200);
  await page.getByText('Broadcasts planned (not sent)').first().waitFor();
  await page.getByText('Bookings confirmed internally').first().waitFor();
  const csvResponse=await ctx.request.get(origin+'/api/reports/growth-export');
  assert.equal(csvResponse.status(),200);
  assert.match(csvResponse.headers()['content-disposition'],/attachment; filename=ekmivo-growth-metrics\.csv/);
  const csv=await csvResponse.text();
  assert.match(csv,/campaigns,broadcast_planned,1/);
  assert.match(csv,/bookings,booking_requested,1/);
  assert.ok(!csv.includes('Fictional consultation room'),'aggregate-only CSV contains no resource identifiers or PII');
  viewerCtx=await browser.newContext();await viewerCtx.addCookies([{name:'ekmivo-session',value:sessions.viewer,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:viewer+':'+store,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const denied=await viewerCtx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,{headers:{Origin:origin},data:{action:'resource-create',operation_key:randomUUID(),body:{title:'Denied'}}});
  assert.equal(denied.status(),403);
  assert.equal((await viewerCtx.request.get(origin+'/api/reports/growth-export')).status(),403);
  assert.equal((await viewerCtx.request.get(audienceUrl)).status(),403,'viewer cannot enumerate consent eligibility');
  assert.equal((await viewerCtx.request.post(origin+`/api/go/workspaces/${store}/growth?environment=live`,
   {headers:{Origin:origin},data:{action:'suppress-contact',operation_key:randomUUID(),body:suppressBody}})).status(),403,'viewer cannot suppress a customer');
  const canonical=(await db`INSERT INTO briofold_customers(workspace_id,environment,name)
   VALUES(${store},'live','Fictional merged canonical contact') RETURNING id`)[0].id;
  await db`UPDATE briofold_customers SET merged_into=${canonical} WHERE id=${profile}`;
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppressions
    WHERE workspace_id=${store} AND customer_id=${canonical} AND channel='email'`)[0].n),1,
   'verified CRM merge must preserve opt-out on the surviving profile');
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppression_events
    WHERE workspace_id=${store}`)[0].n),2,'merge propagation must be audited exactly once');
  // A connected Meta customer can opt out using a signed inbound message.
  // A merchant-entered CRM flag, forged signature or unrelated text cannot
  // create this audit record; the event can only reduce marketing eligibility.
  const sourceProfile=(await db`SELECT s.customer_id FROM briofold_customer_sources s
    WHERE s.workspace_id=${store} AND s.environment='live' AND s.kind='thread' AND s.source_id=${thread}`)[0].customer_id;
  const metaEvent=(text,id)=>JSON.stringify({object:'page',entry:[{
    id:'growth-fixture-'+connection,messaging:[{sender:{id:'growth-thread-'+thread},timestamp:Date.now(),
      message:{mid:id,text}}]}]});
  const signedMeta=async(raw,signature)=>fetch(apiOrigin+'/v1/channels/meta/webhook',{
    method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body:raw});
  const stopId='growth-stop-'+randomUUID(),stopBody=metaEvent(' STOP ',stopId);
  assert.equal((await signedMeta(stopBody,'sha256='+''.padStart(64,'0'))).status,403,'unsigned STOP is rejected');
  const signature=raw=>'sha256='+createHmac('sha256','phase6-comment-test-secret').update(raw).digest('hex');
  assert.equal((await signedMeta(stopBody,signature(stopBody))).status,200,'signed STOP is durably accepted');
  assert.equal((await signedMeta(stopBody,signature(stopBody))).status,200,'duplicate provider callback is idempotent');
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppressions
    WHERE customer_id=${sourceProfile} AND channel='messenger' AND actor_id IS NULL AND provider_message_id IS NOT NULL`)[0].n),1);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppression_events
    WHERE customer_id=${sourceProfile} AND channel='messenger' AND actor_id IS NULL AND provider_message_id IS NOT NULL`)[0].n),1,
   'provider opt-out has one immutable signed-message audit reference');
  const ambiguous=metaEvent('please stop order 123','growth-other-'+randomUUID());
  assert.equal((await signedMeta(ambiguous,signature(ambiguous))).status,200);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppression_events
    WHERE customer_id=${sourceProfile}`)[0].n),1,'ordinary support chat cannot create an opt-out');
  const global=metaEvent('STOP ALL','growth-global-'+randomUUID());
  assert.equal((await signedMeta(global,signature(global))).status,200);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppressions
    WHERE customer_id=${sourceProfile} AND channel='all'`)[0].n),1,'signed STOP ALL blocks future channels');
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_channel_consents
    WHERE customer_id=${sourceProfile}`)[0].n),0,'opt-out cannot self-grant consent');
  await assert.rejects(()=>db`UPDATE briofold_growth_suppression_events SET reason='legal'
    WHERE customer_id=${sourceProfile}`,e=>e.code==='42501','signed suppression audit is immutable');
  await page.goto(origin+'/customers/broadcasts');
  await page.getByRole('button',{name:'Review consent evidence'}).click();
  await page.getByText('Channel proof missing:').first().waitFor();
  let count=0;for(const lang of ['en','bn']){await ctx.addCookies([{name:'ekmivo-locale',value:lang,url:origin,sameSite:'Lax'}]);for(const theme of ['light','dark']){await ctx.addCookies([{name:'ekmivo-theme',value:theme,url:origin,sameSite:'Lax'}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});for(const [path,heading] of [['broadcasts',lang==='bn'?'ব্রডকাস্ট ড্রাফট':'Broadcast drafts'],['posts',lang==='bn'?'ক্যাম্পেইন পোস্ট':'Campaign posts'],['bookings',lang==='bn'?'বুকিং ও সময়সূচি':'Bookings & availability']]){await page.goto(origin+'/customers/'+path);await page.getByRole('heading',{name:heading,exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`growth overflow ${lang}/${theme}/${width}/${path}`);count++;}}}}
  console.log('Phase10 growth operations responsive cases PASS:',count);
  console.log('Phase10 growth operations PASS: CONTROL tenant/realm/RBAC, idempotency, consent-safe no-send drafts, editorial plan, booking slot conflicts and review, operational aggregates, role-safe CSV export, real Go/Next/browser and viewer denial. No provider delivery claimed.');
 }finally{if(ctx)await ctx.close();if(viewerCtx)await viewerCtx.close();await db.end({timeout:3});}
}
