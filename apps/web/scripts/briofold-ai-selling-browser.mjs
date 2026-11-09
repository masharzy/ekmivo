import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';

// Settings -> AI selling and Orders -> Payment review, driven through the real Next proxy, Go API and control database.
// Needs the AI commerce migrations (runBriofoldAiCommerce applies them first) and BRIOFOLD_AI_TOOLS_ENABLED on both servers.
export async function runBriofoldAiSellingBrowser({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('AI selling browser refuses shared DB');
 const db=postgres(control,{max:2,prepare:false,onnotice:()=>{}});let context,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional AI selling shop','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'briofold-session',value:token,url:origin,httpOnly:true},{name:'briofold-default-workspace',value:user+':'+store,url:origin,httpOnly:true},{name:'briofold-locale',value:'en',url:origin}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));

  // Settings: save, verify in the database, stale revision is refused with a clear message.
  await page.goto(origin+'/settings/ai-selling');await page.getByRole('heading',{name:'AI selling',exact:true}).waitFor();
  await page.locator('nav a[aria-current=page]',{hasText:'AI selling'}).waitFor();
  await page.getByLabel('AI can take orders from your catalog',{exact:true}).check();
  await page.getByLabel('Delivery inside Dhaka (৳)',{exact:true}).fill('80');
  await page.getByLabel('Offer cash on delivery',{exact:true}).check();await page.getByLabel('COD charge (৳)',{exact:true}).fill('20');
  await page.getByLabel('Hand orders above this total to a person (৳, 0 = never)',{exact:true}).fill('15000');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Saved.',{exact:true}).waitFor();
  const saved=(await db`SELECT ai_selling_enabled,delivery_dhaka_minor::int d,cod_enabled,cod_charge_minor::int c,handover_above_minor::bigint h,revision::int r FROM commerce_ai_settings WHERE workspace_id=${store} AND environment='live'`)[0];
  assert.deepEqual({...saved,h:Number(saved.h)},{ai_selling_enabled:true,d:8000,cod_enabled:true,c:2000,h:1500000,r:saved.r});
  assert.ok((await db`SELECT count(*)::int n FROM commerce_events WHERE workspace_id=${store} AND action='ai-selling-settings' AND actor_id=${owner}`)[0].n>=1,'settings change was not audited');
  await page.reload();await page.getByRole('heading',{name:'AI selling',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Delivery inside Dhaka (৳)',{exact:true}).inputValue(),'80');
  await db`UPDATE commerce_ai_settings SET revision=revision+1 WHERE workspace_id=${store} AND environment='live'`;
  await page.getByLabel('Delivery outside Dhaka (৳)',{exact:true}).fill('150');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'Someone else changed these settings. Reload and check before saving.'}).waitFor();
  assert.equal((await db`SELECT delivery_outside_minor::int v FROM commerce_ai_settings WHERE workspace_id=${store} AND environment='live'`)[0].v,13000,'a stale save was written');

  // A viewer can neither read nor change the settings or the review queue.
  const endpoint=origin+`/api/go/workspaces/${store}/ai-selling?environment=live`,reviews=origin+`/api/go/workspaces/${store}/ai-payment-reviews?environment=live`;
  assert.equal((await viewerContext.request.get(endpoint)).status(),403);
  assert.equal((await viewerContext.request.post(endpoint,{headers:{Origin:origin},data:{revision:0,patch:{ai_selling_enabled:false}}})).status(),403);
  assert.equal((await viewerContext.request.get(reviews)).status(),403);
  assert.equal((await context.request.post(endpoint,{headers:{Origin:origin},data:{revision:0,patch:{unknown:true}}})).status(),422);
  assert.equal((await context.request.post(endpoint,{headers:{Origin:'https://evil.example.invalid'},data:{revision:0,patch:{ai_selling_enabled:false}}})).status(),403);
  const viewerPage=await viewerContext.newPage();await viewerPage.goto(origin+'/settings/ai-selling');
  await viewerPage.getByRole('alert').filter({hasText:'Only the owner or an admin can open AI selling settings.'}).waitFor();

  // Review queue: a reported payment that could not be matched; the owner confirms it once.
  const order=randomUUID(),ref='AI-'+randomUUID().slice(0,8).toUpperCase(),hex=()=>createHash('sha256').update(randomUUID()).digest('hex');
  await db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,status,recipient,subtotal_minor,shipping_minor,total_minor,payment_state) VALUES(${order},${store},'live',${ref},'ai','draft','{"name":"Fictional Buyer"}',90000,7000,97000,'claimed')`;
  await db`INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,state,reason,claimed_amount_minor) VALUES(${store},'live',${order},'bkash',${hex()},'7K2Q',${hex()},'381','review','no_matching_sms',97000)`;
  await page.goto(origin+'/orders/payment-review');await page.getByRole('heading',{name:'Payment review',exact:true}).waitFor();
  await page.locator('nav a[aria-current=page]',{hasText:'Payment review'}).waitFor();
  await page.getByText(`Order ${ref} · ৳970`,{exact:true}).waitFor();
  await page.getByText('No matching payment SMS arrived in 15 minutes',{exact:false}).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(),/01[3-9]\d{8}/,'a full phone number was shown');
  await page.getByRole('button',{name:'Payment received',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();
  await page.getByText('Nothing to review.',{exact:true}).waitFor();
  const done=(await db`SELECT payment_state,status FROM commerce_orders WHERE id=${order}`)[0];assert.deepEqual({...done},{payment_state:'verified',status:'confirmed'});
  assert.equal((await db`SELECT string_agg(kind,',' ORDER BY kind) k FROM commerce_ai_notices WHERE order_id=${order}`)[0].k,'paid,review','owner notices for the reviewed then approved order');
  assert.equal((await db`SELECT count(*)::int n FROM commerce_events WHERE entity_id=${order} AND action='ai-payment-review' AND actor_id=${owner}`)[0].n,1,'decision not audited');

  // Both languages, both themes, phone to desktop widths: no horizontal scroll.
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'briofold-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'briofold-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});
   for(const width of [320,412,1440]){await page.setViewportSize({width,height:900});
    for(const [path,en,bn] of [['/settings/ai-selling','AI selling','AI দিয়ে বিক্রি'],['/orders/payment-review','Payment review','পেমেন্ট যাচাই']]){
     await page.goto(origin+path);await page.getByRole('heading',{name:lang==='bn'?bn:en,exact:true}).waitFor();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} overflows at ${width}px`);cases++;}}}}
  await context.addCookies([{name:'briofold-locale',value:'en',url:origin},{name:'briofold-theme',value:'light',url:origin}]);
  if(process.env.BRIOFOLD_SCREENSHOT_DIR){
   const shown=randomUUID();await db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,status,recipient,subtotal_minor,shipping_minor,total_minor,payment_state) VALUES(${shown},${store},'live','AI-7Q2K9X','ai','draft','{"name":"Fictional Buyer"}',125000,7000,132000,'claimed')`;
   await db`INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,state,reason,claimed_amount_minor) VALUES(${store},'live',${shown},'nagad',${hex()},'4H8P',${hex()},'207','review','short_payment',120000)`;for(const [path,name,heading] of [['/settings/ai-selling','ai-selling','AI selling'],['/orders/payment-review','payment-review','Payment review']])for(const width of [412,1440]){
   await page.setViewportSize({width,height:1100});await page.goto(origin+path);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   await page.locator('#dashboard-content [role=status]').filter({hasText:'Loading…'}).waitFor({state:'detached'});await page.waitForTimeout(300);await page.screenshot({path:`${process.env.BRIOFOLD_SCREENSHOT_DIR}/${name}-${width}.png`,fullPage:true});}}
  assert.deepEqual(errors,[]);
  console.log('AI SELLING SETTINGS/REVIEW SQL/Go/Next/browser PASS: save+reload, stale revision refused, viewer/origin/unknown-field denial, owner approval confirms once with audit, responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
