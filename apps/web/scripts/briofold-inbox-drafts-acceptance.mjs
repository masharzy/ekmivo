import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import postgres from 'postgres';
export async function runBriofoldInboxDrafts({origin,browser,control,sessions}){
 const url=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/prod/i.test(url.pathname))throw Error('Draft acceptance refuses shared databases');
 const db=postgres(control,{max:1,prepare:false}),workspace=randomUUID();let context;
 try{
  const actor=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Fictional long Inbox draft fixture','ai',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  const connections=[];for(const provider of ['ms','ig','wa'])connections.push((await db`SELECT inbox_connection(${workspace},'live',${provider},${'draft-'+provider+'-'+workspace},decode('abcd','hex')) AS id`)[0].id);
  for(let n=0;n<8;n++)await db`SELECT inbox_ingest(${connections[n%3]},'draft-fixture-'||${n}::text||'-'||i::text,${'customer-'+n},${'Draft fixture customer '+n},'Fictional long conversation '||i::text,'text',now()-interval '1 hour'+i*interval '1 second') FROM generate_series(1,65) i`;
  context=await browser.newContext();await context.addCookies([
   {name:'briofold-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'briofold-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'briofold-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(30000);
  await page.goto(origin+'/inbox');
  const choose=async n=>{await page.getByRole('button',{name:new RegExp('Draft fixture customer '+n)}).click();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();};
  await choose(0);
  await page.getByRole('button',{name:'Load older messages',exact:true}).click();await page.getByText('Fictional long conversation 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Scroll to latest',exact:true}).click();await page.getByText('Fictional long conversation 65',{exact:true}).last().waitFor();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent first conversation');
  await choose(1);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent second conversation');
  await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  await page.getByRole('link',{name:'Channels',exact:true}).last().click();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForURL('**/settings/channels');
  await page.goto(origin+'/inbox');await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  // Commit a real send, lose only the response, then reload and retry the saved intent.
  let dropped=false;const endpoint='**/api/go/workspaces/'+workspace+'/inbox?*';
  await page.route(endpoint,async route=>{const body=route.request().postDataJSON();if(body?.action==='send'&&!dropped){await route.fetch();dropped=true;await route.abort('failed');}else await route.continue();});
  await Promise.all([page.waitForEvent('requestfailed',{predicate:r=>{try{return r.postDataJSON()?.action==='send';}catch{return false;}}}),page.getByRole('button',{name:'Send',exact:true}).click()]);
  await page.getByRole('button',{name:'Send',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Message"]')?.disabled);
  await page.reload();await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Message"]')?.value==='');
  assert.equal(Number((await db`SELECT count(*) AS n FROM inbox_messages WHERE workspace_id=${workspace} AND sender='seller' AND body='Unsent first conversation'`)[0].n),1,'lost-response retry queued duplicate reply');
  await choose(1);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent second conversation');
  await choose(0);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXS0AAAAASUVORK5CYII=','base64');
  let mediaId='',lostMedia=false;
  // The browser fixture replaces private file storage/scanning only. Queueing and
  // authorization still run through the real Next proxy, Go API and PostgreSQL.
  let uploadIntent;
  const vpsEndpoint='https://api.briofold.tech/v1/workspaces/'+workspace+'/inbox?environment=live';
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
  await page.route(vpsEndpoint,async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
   const body=route.request().postDataJSON();
   if(body?.action==='media-upload-ticket'){
    uploadIntent=body;mediaId=body.body.media_id;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://api.briofold.tech/v1/channels/upload/'+mediaId,ticket:'fictional-private-storage-ticket'}),headers:cors});
   }else if(body?.action==='send-media'){
    const response=await context.request.post(origin+'/api/go/workspaces/'+workspace+'/inbox?environment=live',{headers:{Origin:origin},data:body});
    assert.equal(response.status(),200,await response.text());
    if(!lostMedia){lostMedia=true;await route.abort('failed');}else await route.fulfill({response,headers:{...response.headers(),...cors}});
   }else await route.continue();
  });
  await page.route('https://api.briofold.tech/v1/channels/upload/*',async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
   assert.equal(route.request().headers().authorization,'Bearer fictional-private-storage-ticket');
   const raw=route.request().postDataBuffer(),body=uploadIntent.body;
   assert.equal(createHash('sha256').update(raw).digest('hex'),body.sha256);
   await db`SELECT inbox_media_save(${workspace},'live',${uploadIntent.thread_id},${mediaId},${'fictional-ci/'+mediaId},${body.name},'image/png',${raw.length},${body.sha256},0)`;
   await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}',headers:cors});
  });
  await page.route(endpoint,async route=>{
   const body=route.request().postDataJSON();
   if(body?.action==='media-get')await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:png.toString('base64'),mime:'image/png',name:'Fictional attachment.png'})});
   else await route.fallback();
  });
  await page.getByLabel('Attach file',{exact:true}).setInputFiles({name:'Fictional attachment.png',mimeType:'image/png',buffer:png});
  await page.getByRole('dialog',{name:'Photo preview',exact:true}).getByRole('img',{name:'Fictional attachment.png',exact:true}).first().waitFor();
  await Promise.all([page.waitForEvent('requestfailed',{predicate:r=>{try{return r.postDataJSON()?.action==='send-media';}catch{return false;}}}),page.getByRole('button',{name:'Send attachment',exact:true}).click()]);
  await page.getByRole('alert').filter({hasText:'Could not confirm the attachment.'}).waitFor();
  await page.reload();await choose(0);await page.getByRole('button',{name:'Send attachment',exact:true}).click();
  await page.getByRole('button',{name:'Discard attachment',exact:true}).waitFor({state:'detached'});
  assert.equal(Number((await db`SELECT count(*) AS n FROM inbox_messages WHERE workspace_id=${workspace} AND sender='seller' AND content->>'media_id'=${mediaId}`)[0].n),1,'lost attachment response queued twice');
  await page.getByRole('img',{name:'Fictional attachment.png',exact:true}).last().click();await page.getByRole('dialog',{name:'Photo',exact:true}).getByRole('img',{name:'Fictional attachment.png',exact:true}).waitFor();
  // A payload over the former 32-KB proxy cap must reach the real Go scanner.
  const scan=await context.request.post(origin+'/api/go/workspaces/'+workspace+'/inbox?environment=live',{headers:{Origin:origin},data:{action:'media-upload',thread_id:(await db`SELECT id FROM inbox_threads WHERE workspace_id=${workspace} AND customer_name='Draft fixture customer 0'`)[0].id,body:{media_id:randomUUID(),data:Buffer.alloc(100000,65).toString('base64'),mime:'text/plain',name:'Fictional scanner probe.txt'}}});
  assert.equal(scan.status(),503);assert.equal((await scan.json()).error?.code,'FILE_SCAN_UNCONFIRMED','proxy blocked before secure scanner or scanner was bypassed');
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  // Both the unified shell and the Inbox may explain a revoked membership.
  // Assert the accessibility alert instead of a globally ambiguous text node.
  await page.getByRole('alert').filter({hasText:'You no longer have access to this Inbox. Retrying when access is restored.'}).first().waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).count(),0,'revocation retained conversation composer');
  assert.deepEqual(errors,[]);
  console.log('Phase6 INBOX DRAFT PASS: 8 long conversations across 3 mock channels, thread isolation, saved navigation/reload, lost-response text and attachment retry exactly once, mock private attachment rendering, real proxy scanner fail-closed, revoked-access clearing');
 }finally{if(context)await context.close();await db.end({timeout:3});}
}
