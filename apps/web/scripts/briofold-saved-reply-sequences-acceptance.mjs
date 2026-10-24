import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
export async function runSavedReplySequences({control,sessions,origin,browser,privateStorage}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Saved reply acceptance refuses shared databases');
 const db=postgres(control,{max:3,prepare:false});let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const colleague=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  const workspace=randomUUID();await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Fictional saved reply store','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner'),(${workspace},${colleague},'admin')`;
  const connection=(await db`SELECT inbox_connection(${workspace},'live','ms',${'sequence-'+workspace},decode('abcd','hex')) id`)[0].id;
  const threads=[];
  for(const customer of ['source','destination']){
   await db`SELECT inbox_ingest(${connection},${randomUUID()},${customer},'Fictional reply customer','Fictional inbound','text',now())`;
   threads.push((await db`SELECT id FROM inbox_threads WHERE connection_id=${connection} AND external_id=${customer}`)[0]?.id);
  }
  assert.ok(threads.every(Boolean));
  const [source,destination]=threads;
  const voice=JSON.parse(await readFile(new URL('./fixtures/phase10-inbox-voice.json',import.meta.url),'utf8'));
  const voiceBytes=Buffer.from(voice.data,'base64'),voiceSha=createHash('sha256').update(voiceBytes).digest('hex');
  const media=randomUUID(),voiceKey='inbox/live/'+workspace+'/'+media+'/'+voiceSha;privateStorage.put(voiceKey,voiceBytes);
  await db`SELECT inbox_media_save(${workspace},'live',${source},${media},${voiceKey},'Fictional voice.ogg','audio/ogg',${voiceBytes.length},${voiceSha},1500)`;
  const message=(await db`INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,state,content) VALUES(${workspace},${source},'seller','audio','','sent',${db.json({media_id:media,name:'Fictional voice.ogg',mime:'audio/ogg',duration_ms:1500})}) RETURNING id`)[0].id;
  const write=(body,key=randomUUID(),user=actor,action='saved-reply')=>db`SELECT briofold_inbox_work_write(${workspace},'live',${user},NULL,${key},${action},${db.json(body)}) result`;
  const read=(user=actor,realm='live',filters={})=>db`SELECT briofold_inbox_work_read(${workspace},${realm},${user},NULL,0,0,0,${db.json(filters)}) data`;
  const send=(body,key=randomUUID(),user=actor,thread=destination)=>db`SELECT briofold_saved_reply_send(${workspace},'live',${user},${thread},${key},${db.json(body)}) result`;
  const reply=randomUUID(),parts=[{type:'text',text:'Hello {{customer_name}}'},{type:'audio',message_id:message},{type:'text',text:'Please review.'}];
  const input={id:reply,revision:0,title:'Fictional sequence',category:'Service',body:'Hello {{customer_name}}',messages:parts,shortcut:'voice-help',visibility:'team'};
  const key=randomUUID();await write(input,key);await write(input,key);
  let data=(await read())[0].data;assert.equal(data.saved_replies.length,1);assert.deepEqual(data.saved_replies[0].messages,parts);assert.equal(data.saved_replies[0].revision,1);
  assert.equal((await read(colleague))[0].data.saved_replies.length,1);
  await assert.rejects(()=>write({...input,revision:0},randomUUID()),e=>e.code==='40001');
  await assert.rejects(()=>write({...input,id:randomUUID(),messages:[{type:'audio',message_id:randomUUID()}]}),e=>e.code==='42501');
  await assert.rejects(()=>write({...input,id:randomUUID(),messages:[{type:'text',text:'{{private_secret}}'}]}),e=>e.code==='22023');
  await assert.rejects(()=>write({...input,id:randomUUID(),messages:Array(11).fill(parts[0])}),e=>e.code==='22023');
  await assert.rejects(()=>write({...input,id:randomUUID()}),e=>e.code==='23505');
  await assert.rejects(()=>send({id:reply,revision:1,confirmed:false}),e=>e.code==='22023');
  await assert.rejects(()=>send({id:reply,revision:0,confirmed:true}),e=>e.code==='40001');
  const sendKey=randomUUID(),payload={id:reply,revision:1,confirmed:true};
  const first=(await send(payload,sendKey))[0].result;assert.equal(first.queued.length,3);
  assert.deepEqual((await send(payload,sendKey))[0].result,first);
  const sent=await db`SELECT type,body FROM inbox_messages WHERE thread_id=${destination} AND sender='seller' ORDER BY sequence`;
  assert.deepEqual(sent.map(x=>x.type),['text','audio','text']);assert.equal(sent[0].body,'Hello Fictional reply customer');
  assert.equal((await send(payload,randomUUID(),actor,source))[0].result.queued.length,3,'Same-thread media can be reused');
  await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${workspace} AND user_id=${colleague}`;
  await assert.rejects(()=>send(payload,randomUUID(),colleague),e=>e.code==='42501');
  await write({...input,revision:1,visibility:'private'});
  assert.equal((await read(colleague))[0].data.saved_replies.length,0,'Private sequence leaked to colleague');
  await assert.rejects(()=>send({...payload,revision:2},randomUUID(),colleague),e=>e.code==='42501');
  assert.equal((await read(actor,'sandbox'))[0].data.saved_replies.length,0,'Reply escaped its realm');
  await write({id:reply,revision:2},randomUUID(),actor,'archive-reply');
  assert.equal((await read())[0].data.saved_replies.length,0);
  assert.equal((await read(actor,'live',{reply_state:'archived'}))[0].data.saved_replies.length,1);
  await assert.rejects(()=>send({...payload,revision:3}),e=>e.code==='42501');
  await write({...input,revision:3,visibility:'team'});
  await db`UPDATE inbox_threads SET last_customer_at=now()-interval '25 hours' WHERE id=${destination}`;
  const before=Number((await db`SELECT count(*) n FROM inbox_messages WHERE thread_id=${destination}`)[0].n);
  await assert.rejects(()=>send({...payload,revision:4}),e=>e.code==='22023');
  assert.equal(Number((await db`SELECT count(*) n FROM inbox_messages WHERE thread_id=${destination}`)[0].n),before,'Rejected batch partially queued');
  await db`UPDATE inbox_threads SET last_customer_at=now() WHERE id=${destination}`;
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin},{name:'ekmivo-locale',value:'en',url:origin},{name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();await page.goto(origin+'/inbox/saved-replies');
  await page.getByText('Fictional sequence',{exact:true}).waitFor();await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Reply shortcut',exact:true}).fill('voice-help-updated');
  await page.getByRole('button',{name:'Save reply',exact:true}).click();await page.reload();await page.getByText(/voice-help-updated/).waitFor();
  const api=await context.request.post(origin+`/api/go/workspaces/${workspace}/inbox?environment=live`,{headers:{Origin:origin},data:{action:'send-saved-reply',thread_id:destination,body:{id:reply,revision:5,confirmed:true,operation_key:randomUUID()}}});
  assert.equal(api.status(),200);assert.equal((await api.json()).queued.length,3);
  const mediaEndpoint=origin+`/api/go/workspaces/${workspace}/inbox?environment=live`;
  const getMedia=(thread,realm='live')=>context.request.post(mediaEndpoint.replace('environment=live','environment='+realm),{headers:{Origin:origin},data:{action:'media-get',thread_id:thread,body:{media_id:media}}});
  for(const thread of [source,destination]){const response=await getMedia(thread);assert.equal(response.status(),200,await response.text());const file=await response.json();assert.equal(file.mime,'audio/ogg');assert.equal(createHash('sha256').update(Buffer.from(file.data,'base64')).digest('hex'),voiceSha,'forwarded voice bytes changed');}
  assert.ok(privateStorage.requests.some(x=>x.method==='GET'&&x.key===voiceKey),'voice did not pass through signed private TLS storage');
  const reads=privateStorage.requests.length;assert.notEqual((await getMedia(destination,'sandbox')).status(),200);assert.equal(privateStorage.requests.length,reads,'wrong realm fetched private voice');
  await page.goto(origin+'/inbox?thread='+destination);await page.getByRole('button',{name:'Open attachment · Fictional voice.ogg',exact:true}).first().click();await page.locator('audio').first().waitFor();
  const audio=page.locator('audio').first();await audio.evaluate(async element=>{element.load();await element.play();});assert.ok(await audio.evaluate(element=>element.duration>1&&element.duration<2),'voice is not decodable by browser');await audio.evaluate(element=>element.pause());
  console.log('SAVED REPLY SEQUENCES SQL/Go/Next/browser PASS: private/team, archive, shortcut, media, voice, variables, ordered atomic queue, signed private voice bytes and native playback, retry and denial');
 }finally{await context?.close();await db.end({timeout:3});}
}
