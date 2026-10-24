import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
// A single fictional raster pixel, no customer data or external storage.
const screenshot='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
export async function runFeedbackAcceptance({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Feedback acceptance refuses shared databases');
 const db=postgres(control,{max:2,prepare:false});let context;
 try{
  const owner=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const viewer=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  const store=randomUUID();await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional feedback store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
  const endpoint=origin+`/api/go/workspaces/${store}/workspace-tools/help?environment=live`;
  const input={topic:'bug',subject:'Fictional screenshot issue',message:'Fictional reproduction details for support.',screenshot:{data:screenshot,consent:true}};
  const key=randomUUID();let response=await context.request.post(endpoint,{headers:{Origin:origin,'Idempotency-Key':key},data:input});assert.equal(response.status(),200,await response.text());
  const ticket=(await response.json()).id;
  response=await context.request.post(endpoint,{headers:{Origin:origin,'Idempotency-Key':key},data:input});assert.equal(response.status(),200);assert.equal((await response.json()).id,ticket);
  assert.equal(Number((await db`SELECT count(*) n FROM pg13_support WHERE workspace_id=${store}`)[0].n),1,'Lost-response retry duplicated feedback');
  response=await context.request.post(endpoint,{headers:{Origin:origin,'Idempotency-Key':key},data:{...input,subject:'Changed screenshot issue'}});assert.equal(response.status(),409);
  response=await context.request.post(endpoint,{headers:{Origin:origin},data:{...input,screenshot:{data:screenshot,consent:false}}});assert.equal(response.status(),422);
  response=await context.request.post(endpoint,{headers:{Origin:origin},data:{...input,screenshot:{data:Buffer.from('<svg onload="x"/>').toString('base64'),consent:true}}});assert.equal(response.status(),422);
  response=await context.request.get(endpoint);assert.equal(response.status(),200);const items=(await response.json()).items;assert.equal(items[0].screenshot_available,true);assert.equal(Object.hasOwn(items[0],'screenshot'),false,'History eagerly exposed attachment bytes');
  response=await context.request.get(endpoint.replace('?environment=live','/'+ticket+'?environment=live'));assert.equal(response.status(),200);assert.equal((await response.json()).screenshot.mime,'image/png');
  await assert.rejects(()=>db`SELECT briofold_feedback_screenshot_read(${store},${viewer},${ticket})`,e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT briofold_feedback_screenshot_read(${randomUUID()},${owner},${ticket})`,e=>e.code==='42501');
  const page=await context.newPage();await page.goto(origin+'/settings/help/feedback');await page.getByText('Fictional screenshot issue',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Bug report',exact:true}).click();await page.getByLabel('Subject',{exact:true}).fill('Browser screenshot feedback');await page.getByLabel('Describe the issue',{exact:true}).fill('Fictional screenshot attached from the real browser form.');
  await page.getByLabel('Optional screenshot',{exact:true}).setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:Buffer.from(screenshot,'base64')});
  await page.getByText('Screenshot selected.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Submit request',exact:true}).isDisabled(),true);
  await page.getByLabel('I agree to share this screenshot with support.',{exact:true}).check();await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.locator('[data-feedback="success"]').waitFor();
  await page.reload();await page.getByText('Browser screenshot feedback',{exact:true}).click();await page.getByRole('button',{name:'View screenshot',exact:true}).last().click();await page.getByRole('link',{name:'Download screenshot',exact:true}).waitFor();
  console.log('FEEDBACK SCREENSHOT SQL/Go/Next/browser PASS: consent, normalized raster, actor/Store isolation, small history, reload and idempotent retry');
 }finally{await context?.close();await db.end({timeout:3});}
}
