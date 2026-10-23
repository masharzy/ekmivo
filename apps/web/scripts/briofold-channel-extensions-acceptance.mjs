import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {spawn} from 'node:child_process';
export async function runBriofoldChannelExtensions({control,sessions,origin,apiOrigin,browser,apiBin,apiEnv}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Channel tests refuse shared databases');
 const db=postgres(control,{max:3,prepare:false});let context,worker;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const viewer=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  const workspace=randomUUID(),shop='https://fictional-shop.example';
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Fictional Phase6 channels','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner'),(${workspace},${viewer},'viewer')`;
  const op=randomUUID(),save=()=>db`SELECT briofold_website_save(${workspace},${actor},${shop},true,0,${op}) AS data`;
  const data=(await save())[0].data;assert.deepEqual((await save())[0].data,data);
  const site=data.site.id;
  await assert.rejects(()=>db`SELECT briofold_website_save(${workspace},${actor},${shop},false,0,${randomUUID()})`,e=>e.code==='40001');
  await assert.rejects(()=>db`SELECT briofold_website_save(${workspace},${actor},${shop},false,0,${op})`,e=>e.code==='23505');
  const publicCall=async(body,siteOrigin=shop,siteID=site)=>{const r=await fetch(`${apiOrigin}/v1/channels/website/${siteID}`,{method:'POST',headers:{Origin:siteOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cors:r.headers.get('Access-Control-Allow-Origin')};};
  assert.equal((await publicCall({action:'start'},shop+'.evil.test')).status,403);assert.equal((await publicCall({action:'start'},'null')).cors,null);
  const started=await publicCall({action:'start'});assert.equal(started.status,200);assert.equal(started.cors,shop);assert.match(started.body.secret,/^[0-9a-f]{64}$/);
  const secret=started.body.secret,key=randomUUID(),send=()=>publicCall({action:'send',secret,key,text:'বাংলা প্রশ্ন <img src=x onerror=alert(1)>'});
  assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal((await publicCall({action:'read',secret})).body.items.length,1);
  assert.equal((await publicCall({action:'send',secret,key,text:'Changed'})).status,409);
  const other=(await publicCall({action:'start'})).body.secret;assert.equal((await publicCall({action:'read',secret:other})).body.items.length,0,'visitor history leaked');assert.equal((await publicCall({action:'read',secret:'0'.repeat(64)})).status,403);
  const visitor=(await db`SELECT thread_id FROM briofold_website_visitors WHERE site_id=${site} AND secret_hash=${createHash('sha256').update(secret).digest('hex')}`)[0];
  await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state) VALUES(${workspace},${visitor.thread_id},'seller','Private queued reply','queued')`;assert.equal((await publicCall({action:'read',secret})).body.items.length,1,'unconfirmed output leaked');
  await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,sent_at) VALUES(${workspace},${visitor.thread_id},'seller','Delivered website reply','sent',now())`;assert.equal((await publicCall({action:'read',secret})).body.items.at(-1).body,'Delivered website reply');
  const media=randomUUID(),peerHash='a'.repeat(64);
  await db`INSERT INTO inbox_media(id,workspace_id,thread_id,object_key,name,mime,size_bytes,sha256) VALUES(${media},${workspace},${visitor.thread_id},${'fixture/'+media},'sample.png','image/png',1,${'0'.repeat(64)})`;
  const readMedia=token=>db`SELECT briofold_website_media(${site},${shop},${createHash('sha256').update(token).digest('hex')},${peerHash},${media}) AS data`;
  await assert.rejects(()=>readMedia(secret),e=>e.code==='42501');
  await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,type,state,content) VALUES(${workspace},${visitor.thread_id},'seller','Attachment','image','queued',${db.json({media_id:media})})`;
  await assert.rejects(()=>readMedia(secret),e=>e.code==='42501','queued attachment leaked');
  assert.equal((await publicCall({action:'media-get',secret:other,media_id:media})).status,403);
  await db`UPDATE inbox_messages SET state='sent',sent_at=now() WHERE thread_id=${visitor.thread_id} AND content->>'media_id'=${media}`;
  assert.equal((await readMedia(secret))[0].data.object_key,'fixture/'+media);
  await assert.rejects(()=>readMedia(other),e=>e.code==='42501','other visitor accessed attachment');
  const publicHistory=(await publicCall({action:'read',secret})).body.items;assert.equal(publicHistory.at(-1).media_id,media);assert.equal(JSON.stringify(publicHistory).includes('fixture/'),false);
  await db`UPDATE briofold_website_visitors SET expires_at=now()-interval '1 second' WHERE site_id=${site} AND secret_hash=${createHash('sha256').update(other).digest('hex')}`;assert.equal((await publicCall({action:'read',secret:other})).status,403);
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},{name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const p=await context.newPage();p.setDefaultTimeout(30000);p.setDefaultNavigationTimeout(90000);
  await p.goto(origin+'/settings/website');await p.getByLabel('Website origin',{exact:true}).waitFor();assert.equal(await p.getByLabel('Website origin',{exact:true}).inputValue(),shop);
  await p.getByLabel('Website origin',{exact:true}).fill('https://replacement-shop.example');await p.getByRole('button',{name:'Save',exact:true}).click();await p.getByText('Settings saved.',{exact:true}).waitFor();await p.reload();assert.equal(await p.getByLabel('Website origin',{exact:true}).inputValue(),'https://replacement-shop.example');
  const nestedWebsite=await p.goto(origin+'/settings/channels/website');
  assert.equal(nestedWebsite.status(),200,'canonical nested website Channel route did not resolve');
  await p.getByLabel('Website origin',{exact:true}).waitFor();
  assert.equal(await p.getByLabel('Website origin',{exact:true}).inputValue(),'https://replacement-shop.example',
   'nested website Channel route lost the same persisted Store settings');
  await p.getByText('Voice calling is currently unavailable.',{exact:true}).waitFor();
  assert.equal((await publicCall({action:'read',secret},'https://replacement-shop.example')).status,403,'origin change retained visitor');
  await db`SELECT briofold_website_save(${workspace},${actor},'https://replacement-shop.example',false,2,${randomUUID()})`;assert.equal((await publicCall({action:'start'},'https://replacement-shop.example')).status,403,'disabled site remained public');
  // Exercise public visitor admission through Go, not a mock response.
  await db`SELECT briofold_website_save(${workspace},${actor},'https://replacement-shop.example',true,3,${randomUUID()})`;
  let rateBlocked=false;
  for(let attempt=0;attempt<3&&!rateBlocked;attempt++){
   await db`INSERT INTO briofold_website_rates(site_id,identity,bucket,hits)
    VALUES(${site},'site-start',date_trunc('minute',now()),100)
    ON CONFLICT(site_id,identity) DO UPDATE SET bucket=excluded.bucket,hits=100`;
   const response=await publicCall({action:'start'},'https://replacement-shop.example');
   assert.ok([200,429].includes(response.status));rateBlocked=response.status===429;
  }
  assert.equal(rateBlocked,true,'site visitor rate admission was not enforced');
  await db`DELETE FROM briofold_website_rates WHERE site_id=${site} AND identity='site-start'`;
  await db`WITH created AS (
   INSERT INTO inbox_threads(workspace_id,connection_id,external_id,customer_name)
   SELECT ${workspace},connection_id,'capacity-'||n,'Capacity fixture'
   FROM briofold_website_sites CROSS JOIN generate_series(1,10000) n WHERE id=${site}
   RETURNING id)
   INSERT INTO briofold_website_visitors(site_id,secret_hash,thread_id)
   SELECT ${site},encode(sha256(convert_to(id::text,'UTF8')),'hex'),id FROM created`;
  const countBefore=Number((await db`SELECT count(*) n FROM briofold_website_visitors WHERE site_id=${site}`)[0].n);
  assert.ok(countBefore>=10000);
  assert.equal((await publicCall({action:'start'},'https://replacement-shop.example')).status,429,'site visitor capacity was not enforced');
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_website_visitors WHERE site_id=${site}`)[0].n),countBefore,'rejected capacity created an extra visitor');
  const account='comment-fixture-'+randomUUID(),connection=(await db`SELECT inbox_connection(${workspace},'live','ms',${account},decode('abcd','hex')) AS id`)[0].id;
  const endpoint=`${origin}/api/go/workspaces/${workspace}/comments`,rule={id:randomUUID(),revision:0,connection_id:connection,enabled:true,name:'Fictional price rule',posts:'selected',selected:['post_1'],excluded:['post_2'],match:'keyword',keywords:['price','দাম'],intent:'question',threshold:.9,mode:'fixed',reply:'See our catalog.',action:'reply'},operation=randomUUID();
  const command=(action,body,key=operation)=>context.request.post(endpoint,{headers:{Origin:origin},data:{action,operation_key:key,body}});
  assert.equal((await command('rule',rule)).status(),200);assert.equal((await command('rule',rule)).status(),200);assert.equal((await command('rule',{...rule,name:'changed'})).status(),409);assert.equal((await command('rule',{...rule,name:'stale'},randomUUID())).status(),409);
  const dry=async text=>context.request.post(endpoint,{headers:{Origin:origin},data:{action:'dry-run',body:rule,post_id:'post_1',text}});
  const preview=await (await dry('দাম কত?')).json();assert.equal(preview.provider_called,false);assert.equal(preview.credits_debited,false);assert.equal(preview.decision.reason,'RULE_MATCH');assert.equal((await (await dry('price 01712345678')).json()).decision.reason,'PII_REVIEW_REQUIRED');
  const payload=JSON.stringify({object:'page',entry:[{id:account,changes:[{field:'feed',value:{item:'comment',verb:'add',comment_id:'comment_1',post_id:'post_1',message:'price?',from:{id:'fixture-customer'}}}]}]}),signature='sha256='+createHmac('sha256','phase6-comment-test-secret').update(payload).digest('hex');
  const webhook=value=>fetch(apiOrigin+'/v1/channels/meta/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':value},body:payload});
  assert.equal((await webhook('sha256=bad')).status,403);assert.equal((await webhook(signature)).status,200);assert.equal((await webhook(signature)).status,200);assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_comments WHERE workspace_id=${workspace}`)[0].n),1);
  const claim=async phase=>(await db`SELECT briofold_comment_claim(${phase}) AS data`)[0].data,job=await claim('evaluate');assert.equal(job.body,'price?');
  const decision={rule_id:rule.id,mode:'fixed',action:'reply',reply:rule.reply,reason:'RULE_MATCH'};
  await assert.rejects(()=>db`SELECT briofold_comment_decide(${job.id},${job.lease_id},${job.revision},${db.json({...decision,mode:'ai'})},${actor},${rule.id},1,NULL)`,e=>e.code==='42501','unmetered AI comment output accepted');
  assert.equal((await db`SELECT briofold_comment_decide(${job.id},${job.lease_id},${job.revision},${db.json(decision)},${actor},${rule.id},1,NULL) AS ok`)[0].ok,true);
  const dispatch=await claim('send');assert.equal(dispatch.id,job.id);assert.equal((await db`SELECT briofold_comment_finish(${dispatch.id},${randomUUID()},${dispatch.revision},'sent','') AS ok`)[0].ok,false);
  await db`SELECT briofold_comment_finish(${dispatch.id},${dispatch.lease_id},${dispatch.revision},'uncertain','PROVIDER_OUTCOME_UNKNOWN')`;assert.equal(await claim('send'),null,'unknown outcome retried');
  assert.equal((await command('review',{id:job.id,revision:job.revision,action:'reply',reply:'Human reply',confirmed:true},randomUUID())).status(),422);assert.equal((await command('review',{id:job.id,revision:job.revision,action:'reply',reply:'Human reply',confirmed:true,acknowledge_unknown:true},randomUUID())).status(),200);
  await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${workspace} AND user_id=${actor}`;assert.equal(await claim('send'),null,'revoked publisher dispatched');assert.equal((await command('rule',{...rule,revision:1},randomUUID())).status(),403);await db`UPDATE workspace_members SET role='owner' WHERE workspace_id=${workspace} AND user_id=${actor}`;
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_ai_credit_journal WHERE workspace_id=${workspace}`)[0].n),0,'fixed reply debited credits');
  // Run the actual Go worker against the actual isolated control database. No
  // provider delivery or paid model is enabled; fixed policy is genuinely run.
  worker=spawn(apiBin,[],{env:{...apiEnv,PORT:'17914',GO_WEB_ORIGIN:apiOrigin,EKMIVO_REQUIRE_AUTHZ:'true',PG10_EXTENSIONS_ENABLED:'true',INBOX_SENDER_ENABLED:'false',BRIOFOLD_COMMENTS_ENABLED:'true',BRIOFOLD_COMMENT_DELIVERY_ENABLED:'false',BRIOFOLD_AI_RUNTIME_ENABLED:'false',BRIOFOLD_AI_TOPUPS_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  worker.stdout.resume();worker.stderr.resume();
  await db`SELECT briofold_comment_ingest('ms',${account},'comment_2','post_1','fixture-customer','price please',false)`;
  await db`SELECT briofold_comment_ingest('ms',${account},'comment_3','post_1','fixture-customer','price ০১৭১২৩৪৫৬৭৮',false)`;
  let worked=false;for(let i=0;i<100;i++){if(worker.exitCode!==null)throw Error('Comment worker exited before acceptance');const rows=await db`SELECT external_id,state,reason,decision FROM briofold_comments WHERE workspace_id=${workspace} AND external_id IN ('comment_2','comment_3') ORDER BY external_id`;if(rows[0]?.state==='queued'&&rows[1]?.state==='review'){assert.equal(rows[0].decision.reply,rule.reply);assert.equal(rows[1].reason,'PII_REVIEW_REQUIRED');worked=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.equal(worked,true,'actual Go comment worker did not complete policy');
  worker.kill('SIGTERM');worker=null;
  assert.equal(Number((await db`SELECT count(*) AS n FROM briofold_ai_credit_journal WHERE workspace_id=${workspace}`)[0].n),0,'fixed Go worker debited credits');
  await db`SELECT inbox_ingest(${connection},'alert-message','alert-customer','Alert customer','Need help','text',now())`;const thread=(await db`SELECT id FROM inbox_threads WHERE connection_id=${connection} AND external_id='alert-customer'`)[0].id;
  await db`INSERT INTO briofold_inbox_work(workspace_id,thread_id,owner_id,due_at,handover_reason) VALUES(${workspace},${thread},${actor},now()-interval '1 minute','Customer requested a person')`;await db`SELECT briofold_inbox_alert_sweep()`;await db.begin(async tx=>{await tx`SET LOCAL TIME ZONE 'Asia/Dhaka'`;await tx`SELECT briofold_inbox_alert_sweep()`;});
  const notices=async(user=actor)=>(await db`SELECT briofold_inbox_alert_read(${workspace},${user},0,'','',false) AS data`)[0].data.items,noticesList=await notices();assert.equal(noticesList.filter(x=>x.kind==='sla').length,1);assert.equal(noticesList.filter(x=>x.kind==='assignment').length,1);assert.equal((await notices(viewer)).filter(x=>x.kind==='assignment').length,0);
  const assigned=noticesList.find(x=>x.kind==='assignment').id;await db`SELECT briofold_inbox_alert_mark(${workspace},${actor},${assigned})`;await db`SELECT briofold_inbox_alert_mark(${workspace},${actor},${assigned})`;assert.ok((await notices()).find(x=>x.id===assigned).read_at);await assert.rejects(()=>db`SELECT briofold_inbox_alert_mark(${workspace},${viewer},${assigned})`,e=>e.code==='42501');
  for(const table of ['briofold_website_visitors','briofold_comments','briofold_comment_rules','briofold_comment_audit','briofold_inbox_alerts','briofold_inbox_alert_reads'])for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection'])assert.equal((await db`SELECT has_table_privilege(${role},${table},'SELECT') AS ok`)[0].ok,false);
  await p.goto(origin+'/inbox/comments');await p.getByRole('heading',{name:'Comment automation',exact:true}).waitFor();await p.getByText('price?',{exact:true}).waitFor();await p.getByText('Rules and post selection',{exact:true}).click();await p.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await p.getByLabel('Name',{exact:true}).inputValue(),rule.name);
  await p.getByLabel('Preview post ID',{exact:true}).fill('post_1');await p.getByLabel('Sample comment',{exact:true}).fill('price?');await p.getByRole('button',{name:'Dry-run without sending',exact:true}).click();await p.getByRole('status').filter({hasText:'RULE_MATCH'}).waitFor();await p.getByRole('button',{name:'Discard edits',exact:true}).click();await p.goto(origin+'/notifications');await p.getByRole('heading',{name:'Inbox notifications',exact:true}).waitFor();await p.getByText('Alert customer',{exact:true}).first().waitFor();
  assert.equal(await p.getByRole('heading',{level:1}).count(),1,'unified notification page has duplicate primary headings');
  await p.getByRole('button',{name:'Inbox & AI',exact:true}).click();
  await p.getByRole('combobox',{name:'Type',exact:true}).selectOption('handover');
  await p.getByText('Alert customer',{exact:true}).waitFor();
  assert.equal(await p.getByText('Response overdue',{exact:true}).count(),0,'handover filter included SLA notices');
  await p.getByRole('checkbox',{name:'Unread only',exact:true}).check();
  await p.getByRole('button',{name:'Mark read',exact:true}).click();
  await p.getByText('No notifications match.',{exact:true}).waitFor();
  const handed=(await db`SELECT briofold_inbox_alert_read(${workspace},${viewer},0,'','handover',true) data`)[0].data.items;
  assert.equal(handed.length,1,'owner marking a shared handover changed colleague read state');
  await p.getByRole('checkbox',{name:'Unread only',exact:true}).uncheck();await p.getByText('Alert customer',{exact:true}).waitFor();
  await p.getByRole('combobox',{name:'Type',exact:true}).selectOption('sla');await p.getByText('Alert customer',{exact:true}).waitFor();
  await p.getByRole('combobox',{name:'Type',exact:true}).selectOption('ai-review');await p.getByText('No notifications match.',{exact:true}).waitFor();
  // Private fictional notices exercise the real canonical server action's
  // pagination without triggering a provider or customer message.
  await db`INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key,recipient_id) SELECT ${workspace},${thread},'ai-review',${'phase10-pagination-'+workspace}||':'||n,${actor} FROM generate_series(1,51) n`;
  await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByText('Alert customer',{exact:true}).first().waitFor();
  assert.equal(await p.getByText('Alert customer',{exact:true}).count(),50);
  await p.getByRole('button',{name:'Next',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('article').length===1);assert.equal(await p.getByText('Alert customer',{exact:true}).count(),1);
  assert.equal((await db`SELECT briofold_inbox_alert_read(${workspace},${viewer},0,'','ai-review',false) data`)[0].data.items.length,0,'private AI alert leaked to colleague');
  console.log('Briofold website/comment signed HTTP, SQL and browser acceptance PASS; visitor rate/capacity denial and durable alerts PASS');
 }finally{if(worker)worker.kill('SIGTERM');if(context)await context.close();await db.end({timeout:3});}
}
