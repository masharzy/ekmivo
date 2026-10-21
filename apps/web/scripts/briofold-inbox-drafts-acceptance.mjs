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
   {name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-default-workspace',value:actor+':'+workspace,url:origin,httpOnly:true,sameSite:'Lax'},
   {name:'ekmivo-locale',value:'en',url:origin,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(30000);
  await page.goto(origin+'/inbox');
  const choose=async n=>{await page.getByRole('button',{name:new RegExp('Draft fixture customer '+n)}).click();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();};
  await choose(0);
  await page.getByRole('button',{name:'Older messages',exact:true}).click();await page.getByText('Fictional long conversation 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Latest messages',exact:true}).click();await page.getByText('Fictional long conversation 65',{exact:true}).last().waitFor();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent first conversation');
  await choose(1);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Unsent second conversation');
  await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  await page.getByRole('link',{name:'Channels',exact:true}).last().click();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForURL('**/settings/channels');
  await page.goto(origin+'/inbox');await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  // Commit a real send, lose only the response, then reload and retry the saved intent.
  let dropped=false;const endpoint='**/api/go/workspaces/'+workspace+'/inbox?*';
  await page.route(endpoint,async route=>{const body=route.request().postDataJSON();if(body?.action==='send'&&!dropped){await route.fetch();dropped=true;await route.abort('failed');}else await route.continue();});
  const failed=page.waitForEvent('requestfailed',{predicate:r=>{try{return r.postDataJSON()?.action==='send';}catch{return false;}}});
  await page.getByRole('button',{name:'Send',exact:true}).click();await failed;
  await page.getByRole('button',{name:'Send',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Message"]')?.disabled);
  await page.reload();await choose(0);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent first conversation');
  await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Message"]')?.value==='');
  assert.equal(Number((await db`SELECT count(*) AS n FROM inbox_messages WHERE workspace_id=${workspace} AND sender='seller' AND body='Unsent first conversation'`)[0].n),1,'lost-response retry queued duplicate reply');
  await choose(1);assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Unsent second conversation');
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  await page.getByText('You no longer have access to this Inbox. Retrying when access is restored.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).count(),0,'revocation retained conversation composer');
  assert.deepEqual(errors,[]);
  console.log('Phase6 INBOX DRAFT PASS: 8 long conversations across 3 mock channels, thread isolation, saved navigation/reload, lost-response retry exactly once, revoked-access clearing');
 }finally{if(context)await context.close();await db.end({timeout:3});}
}
