import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runWalletBrowser({origin,browser,control,sessions}){
 const url=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/prod/i.test(url.pathname))throw Error('Wallet browser refuses shared DB');
 const db=postgres(control,{max:2,prepare:false});let context,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional prepaid statement business','ai',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  // Fictional administrative journal rows, never represented as verified payments.
  await db`INSERT INTO briofold_ai_wallets(workspace_id,available_minor) VALUES(${store},3250)`;
  await db`INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,actor_id,reason,created_at) SELECT ${store},'fixture-correction-'||n,'correction',50,0,n*50,0,${owner},'Fictional isolated display adjustment',now()-make_interval(secs=>66-n) FROM generate_series(1,65) n`;
  await db`INSERT INTO briofold_ai_topups(workspace_id,actor_id,idempotency_key,amount_minor,receiving_workspace_id) VALUES(${store},${owner},${randomUUID()},1000,${store})`;
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'ekmivo-session',value:token,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:user+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const endpoint=origin+'/api/ai-credits/statement?workspace_id='+store;
  let response=await context.request.get(endpoint);assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/private.*no-store/);
  const first=await response.json();assert.equal(first.entries.length,50);assert.ok(first.next_cursor);
  response=await context.request.get(endpoint+'&cursor='+encodeURIComponent(first.next_cursor));const second=await response.json();assert.equal(second.entries.length,15);assert.equal(second.next_cursor,null);
  assert.equal(new Set([...first.entries,...second.entries].map(x=>x.id)).size,65);
  assert.equal((await context.request.get(origin+'/api/ai-credits/statement?workspace_id='+randomUUID())).status(),409);
  assert.equal((await viewerContext.request.get(endpoint)).status(),403);
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/settings/billing');await page.getByRole('heading',{name:'AI prepaid credits',exact:true}).waitFor();
  await page.getByText('Awaiting verification',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue to payment',exact:true}).count(),0,'paused top-up offered a live purchase');
  await page.getByText('AI credit statement',{exact:true}).click();
  const statement=page.locator('details').filter({has:page.getByText('AI credit statement',{exact:true})});
  assert.equal(await statement.locator('tbody tr').count(),30);
  await page.getByRole('button',{name:'Load older activity',exact:true}).click();await statement.locator('tbody tr').nth(64).waitFor();assert.equal(await statement.locator('tbody tr').count(),65);
  assert.equal(await page.getByRole('button',{name:'Load older activity',exact:true}).count(),0);
  await db`UPDATE briofold_ai_wallets SET available_minor=0 WHERE workspace_id=${store}`;
  await page.reload();await page.getByRole('status').filter({hasText:/No spendable AI credits remain|No published AI model rate/}).waitFor();
  const privatePage=await viewerContext.newPage();await privatePage.goto(origin+'/settings/billing');await privatePage.getByRole('alert').filter({hasText:'AI credit balance is currently unavailable'}).waitFor();
  assert.equal(await privatePage.getByText('AI credit statement',{exact:true}).count(),0);
  await db`UPDATE workspace_members SET role='admin' WHERE workspace_id=${store} AND user_id=${viewer}`;
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${store},${viewer},'product:ai',false)`;
  assert.equal((await viewerContext.request.get(endpoint)).status(),403,'AI product denial exposed prepaid activity');
  await privatePage.reload();await privatePage.getByRole('alert').filter({hasText:'AI credit balance is currently unavailable'}).waitFor();
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/settings/billing');await page.getByRole('heading',{name:lang==='bn'?'AI প্রিপেইড ক্রেডিট':'AI prepaid credits',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.deepEqual(errors,[]);console.log('AI WALLET CANONICAL BROWSER PASS: authoritative balance/low credit/pending top-up, 65-row keyset statement, server Store binding, current role/product denial, paused funding and responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
