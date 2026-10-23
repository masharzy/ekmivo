import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runSetupChecklist({origin,browser,control,sessions}){
 const url=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||/prod/i.test(url.pathname))throw Error('Setup checks refuse shared databases');
 const db=postgres(control,{max:2,prepare:false}),contexts=[];
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer);
  let cases=0;
  for(const mode of ['ai','commerce','both']){
   const store=randomUUID(),foreign=randomUUID();
   await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},${'Fictional checklist '+mode},${mode},${owner}),(${foreign},'Foreign checklist store',${mode},${owner})`;
   await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner')`;
   const c=await browser.newContext();contexts.push(c);await c.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
   const p=await c.newPage();p.setDefaultNavigationTimeout(90000);
   await db`SELECT inbox_connection(${foreign},'live','ms',${'foreign-checklist-'+store},decode('abcd','hex'))`;
   await db`INSERT INTO commerce_products(workspace_id,environment,name) VALUES(${foreign},'live','Foreign product')`;
   assert.equal((await p.goto(origin+'/setup/checklist')).status(),200);
   await p.getByRole('heading',{name:'Store setup guide',exact:true}).waitFor();
   const step=id=>p.locator('[data-setup-step="'+id+'"]');
   await step('products').getByText('Review setup',{exact:true}).waitFor();
   await step('team').getByText('Optional for a solo Store',{exact:true}).waitFor();
   if(mode!=='commerce')await step('channels').getByText('Review setup',{exact:true}).waitFor();else assert.equal(await step('channels').count(),0);
   assert.equal(await step('payments').count(),mode==='ai'?0:1);
   await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${viewer},'viewer')`;
   const product=(await db`INSERT INTO commerce_products(workspace_id,environment,name) VALUES(${store},'sandbox','Sandbox checklist product') RETURNING id`)[0].id;
   await db`INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,price_minor) VALUES(${store},'sandbox',${product},'SANDBOX',100)`;
   await p.reload();await step('products').getByText('Review setup',{exact:true}).waitFor();
   const active=(await db`INSERT INTO commerce_products(workspace_id,environment,name) VALUES(${store},'live','Fictional checklist product') RETURNING id`)[0].id;
   await db`INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,price_minor) VALUES(${store},'live',${active},'CHECKLIST',100)`;
   await db`INSERT INTO commerce_integrations(workspace_id,environment,provider,secret_cipher) VALUES(${store},'live','steadfast',decode('abcd','hex'))`;
   if(mode!=='commerce')await db`SELECT inbox_connection(${store},'live','ms',${'checklist-'+store},decode('abcd','hex'))`;
   await p.reload();for(const id of ['products','courier','team'])await step(id).getByText('Configuration saved',{exact:true}).waitFor();
   if(mode!=='commerce')await step('channels').getByText('Configuration saved',{exact:true}).waitFor();
   assert.equal(await p.getByRole('heading',{level:1}).count(),1);
   await p.getByRole('link',{name:'Open dashboard',exact:true}).click();await p.waitForURL(origin+'/dashboard');
   await p.goto(origin+'/settings');await p.getByRole('link',{name:'Store setup guide',exact:true}).click();await p.waitForURL(origin+'/setup/checklist');
   await db`UPDATE workspace_members SET role='admin' WHERE workspace_id=${store} AND user_id=${owner}`;
   await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${store},${owner},'workspace:settings',false)`;
   await p.reload();await p.getByRole('alert').filter({hasText:'Only an owner or permitted administrator'}).waitFor();assert.equal(await p.locator('[data-setup-step]').count(),0);
   await db`DELETE FROM pg13_member_grants WHERE workspace_id=${store} AND user_id=${owner}`;
   await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${store} AND user_id=${owner}`;
   await p.reload();await p.getByRole('alert').filter({hasText:'Only an owner or permitted administrator'}).waitFor();
   await db`UPDATE workspace_members SET role='owner' WHERE workspace_id=${store} AND user_id=${owner}`;
   for(const language of ['en','bn']){await c.addCookies([{name:'ekmivo-locale',value:language,url:origin}]);for(const theme of ['light','dark']){await c.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await p.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await p.setViewportSize({width,height:900});await p.goto(origin+'/setup/checklist');await p.getByRole('heading',{name:language==='bn'?'স্টোর সেটআপ গাইড':'Store setup guide',exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
   await c.close();
  }
  console.log('STORE SETUP GUIDE SQL/Next/browser PASS: active source-backed configuration, foreign/sandbox isolation, current role/settings restrictions, product-mode sections, real settings/dashboard links and responsive cases:',cases);
 }finally{for(const context of contexts)await context.close();await db.end({timeout:3});}
}
