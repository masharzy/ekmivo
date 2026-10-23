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
  await page.getByLabel('Courier provider',{exact:true}).selectOption('pathao');
  const clientID='fictional-pathao-'+randomUUID(),clientSecret='fictional-client-secret-'+randomUUID(),merchantPassword='fictional-merchant-password-'+randomUUID();
  await page.getByLabel('Client ID',{exact:true}).fill(clientID);await page.getByLabel('Client secret',{exact:true}).fill(clientSecret);await page.getByLabel('Merchant email',{exact:true}).fill('merchant@example.invalid');await page.getByLabel('Merchant password',{exact:true}).fill(merchantPassword);
  await page.getByRole('button',{name:'Save courier credentials',exact:true}).click();await page.getByText('Courier credentials saved.',{exact:true}).waitFor();
  const pathao=(await db`SELECT secret_cipher,enabled FROM commerce_integrations WHERE workspace_id=${store} AND environment='live' AND provider='pathao'`)[0];assert.equal(pathao.enabled,true);assert.equal(pathao.secret_cipher.includes(Buffer.from(merchantPassword)),false);
  const decode=createDecipheriv('aes-256-gcm',Buffer.alloc(32,88),pathao.secret_cipher.subarray(0,12));decode.setAAD(Buffer.from(store+'|live|commerce|pathao'));decode.setAuthTag(pathao.secret_cipher.subarray(-16));const plain=JSON.parse(Buffer.concat([decode.update(pathao.secret_cipher.subarray(12,-16)),decode.final()]).toString());assert.equal(plain.api_key,clientID);assert.equal(plain.secret,clientSecret);assert.equal(plain.username,'merchant@example.invalid');assert.equal(plain.password,merchantPassword);
  assert.equal(await page.getByLabel('Merchant password',{exact:true}).inputValue(),'');assert.equal(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),merchantPassword),false);
  assert.equal((await viewerContext.request.post(endpoint,{headers:{Origin:origin},data:{action:'integration-save',operation_key:randomUUID(),body:{provider:'pathao',api_key:clientID,secret:clientSecret,username:'merchant@example.invalid',password:merchantPassword}}})).status(),403);
  const hidden=await context.request.get(endpoint+'&resource=integrations');assert.equal((await hidden.text()).includes(merchantPassword),false);assert.equal((await hidden.text()).includes('secret_cipher'),false);
  const oid=randomUUID(),did=randomUUID();await db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,status,recipient,subtotal_minor,total_minor) VALUES(${oid},${store},'live','Fictional Pathao parcel','manual','confirmed','{"name":"Fictional Recipient","phone":"01700001234","address":"Fictional address only"}',10000,10000)`;
  await db`INSERT INTO commerce_deliveries(id,workspace_id,environment,order_id,provider,status,cod_minor) VALUES(${did},${store},'live',${oid},'pathao','ready',10000)`;
  await page.goto(origin+'/orders/courier');await page.getByRole('button',{name:'Book with Pathao',exact:true}).click();await page.getByRole('button',{name:'Load Pathao locations',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm Pathao booking',exact:true}).isDisabled(),true,'unreviewed parcel could be booked');
  assert.equal((await db`SELECT status FROM commerce_deliveries WHERE id=${did}`)[0].status,'ready','opening a parcel form dispatched a booking');
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/settings/integrations/courier');await page.getByRole('heading',{name:lang==='bn'?'কুরিয়ার সংযোগ':'Courier integrations',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.deepEqual(errors,[]);console.log('COURIER SETTINGS SQL/Go/Next/browser PASS: authenticated encrypted save/read/reload/disable, key confidentiality, role/realm denial, Pathao encrypted credentials and explicit parcel/location confirmation and responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
