import assert from 'node:assert/strict';
import {createDecipheriv,createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runCourierSettings({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Courier settings refuses shared DB');
 const db=postgres(control,{max:2,prepare:false});let context,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional courier settings business','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'ekmivo-session',value:token,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:user+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const endpoint=origin+`/api/go/workspaces/${store}/commerce?environment=live`;
  const apiKey='fictional-courier-key-'+randomUUID(),secret='fictional-courier-secret-'+randomUUID();
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
  await page.goto(origin+'/settings/integrations/courier');await page.getByRole('heading',{name:'Courier integrations',exact:true}).waitFor();
  await page.getByLabel('API key',{exact:true}).fill(apiKey);await page.getByLabel('Secret key',{exact:true}).fill(secret);
  await page.getByRole('button',{name:'Save courier credentials',exact:true}).click();await page.getByText('Courier credentials saved.',{exact:true}).waitFor();
  const configured=(await db`SELECT secret_cipher,enabled FROM commerce_integrations WHERE workspace_id=${store} AND environment='live' AND provider='steadfast'`)[0];assert.equal(configured.enabled,true);
  assert.equal(configured.secret_cipher.includes(Buffer.from(apiKey)),false,'stored courier key was plaintext');
  const decrypt=createDecipheriv('aes-256-gcm',Buffer.alloc(32,88),configured.secret_cipher.subarray(0,12));decrypt.setAAD(Buffer.from(store+'|live|commerce|steadfast'));decrypt.setAuthTag(configured.secret_cipher.subarray(-16));
  const credentials=JSON.parse(Buffer.concat([decrypt.update(configured.secret_cipher.subarray(12,-16)),decrypt.final()]).toString());assert.equal(credentials.APIKey??credentials.api_key,apiKey);assert.equal(credentials.secret,secret);
  assert.equal(await page.getByLabel('API key',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Secret key',{exact:true}).inputValue(),'');
  assert.equal(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),secret),false,'courier credentials leaked into a browser draft');
  await page.reload();await page.getByText('Credentials stored. Provider booking has not been verified by this status.',{exact:true}).waitFor();
  const metadata=await context.request.get(endpoint+'&resource=integrations');assert.equal(metadata.status(),200);assert.equal((await metadata.text()).includes(secret),false);assert.equal((await metadata.text()).includes('secret_cipher'),false);
  assert.equal((await viewerContext.request.post(endpoint,{headers:{Origin:origin},data:{action:'integration-disable',operation_key:randomUUID(),body:{provider:'steadfast'}}})).status(),403);
  const viewerPage=await viewerContext.newPage();await viewerPage.goto(origin+'/settings/integrations/courier');await viewerPage.getByText('Only an owner or administrator can change courier credentials.',{exact:true}).waitFor();assert.equal(await viewerPage.getByLabel('API key',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Disable courier connection',exact:true}).click();await page.getByText('No enabled credentials.',{exact:true}).waitFor();
  assert.equal((await db`SELECT enabled FROM commerce_integrations WHERE workspace_id=${store} AND environment='live' AND provider='steadfast'`)[0].enabled,false);
  assert.equal((await db`SELECT count(*)::integer n FROM commerce_integrations WHERE workspace_id=${store} AND environment='sandbox'`)[0].n,0);
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/settings/integrations/courier');await page.getByRole('heading',{name:lang==='bn'?'কুরিয়ার সংযোগ':'Courier integrations',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.deepEqual(errors,[]);console.log('COURIER SETTINGS SQL/Go/Next/browser PASS: authenticated encrypted save/read/reload/disable, key confidentiality, role/realm denial, honest unsupported Pathao and responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
