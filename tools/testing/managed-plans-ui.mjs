// Authenticated UI checks use synthetic sessions on an isolated Neon branch.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {randomBytes,randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
const require=createRequire(path.resolve('apps/web/package.json')),postgres=require('postgres');
const url=new URL(fs.readFileSync(path.join(os.tmpdir(),'briofold-plans-neon-url.txt'),'utf8'));
if(!process.env.PLAN_TEST_BRANCH_HOST||url.hostname!==process.env.PLAN_TEST_BRANCH_HOST)throw Error('Isolated Neon branch host required');
const sql=postgres(url.href,{ssl:'require',prepare:false,max:4,onnotice:()=>{}}),fixtureFile=path.join(os.tmpdir(),'briofold-plans-ui-fixture.json');
if(process.argv.includes('--seed')){
 try{
 const id=randomUUID(),token=randomBytes(32).toString('base64url'),suffix=id.slice(0,8);
 await sql`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${id},${'plan-ui-'+suffix+'@example.invalid'},'Managed plan UI operator','invalid-test-only',now())`;
 await sql`INSERT INTO platform_administrators(user_id,role) VALUES(${id},'super_admin')`;
 await sql`INSERT INTO platform_admin_mfa(user_id,secret_ciphertext,confirmed_at) VALUES(${id},'synthetic-session-fixture-only',now()-interval '1 minute')`;
 await sql`INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES(${id},${createHash('sha256').update(token).digest('hex')},now()+interval '2 hours',now())`;
 // Hide this test suite's earlier synthetic catalog rows, not real copied plans.
 await sql`UPDATE payment_plan_catalog SET status='archived' WHERE plan_id IN(SELECT v.plan_id FROM payment_plan_versions v JOIN app_users u ON u.id=v.created_by WHERE u.display_name='Plan test operator')`;
 fs.writeFileSync(fixtureFile,JSON.stringify({id,token,suffix}));console.log('Synthetic UI session ready (no credentials printed)');
 }finally{await sql.end()}
}else{
 await sql.end();const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
 if(process.argv.includes('--trace')){let target='http://127.0.0.1:3046/admin/plans';for(let i=0;i<8;i++){const r=await fetch(target,{redirect:'manual',headers:{Cookie:`briofold-session=${fixture.token}; briofold-locale=en`}});console.log(r.status,new URL(target).pathname,r.headers.get('location'));if(!r.headers.get('location'))break;target=new URL(r.headers.get('location'),target).href}process.exit(0)}
 const {chromium}=require('@playwright/test');const browser=await chromium.launch({channel:"chrome",headless:true});
 const base='http://localhost:3046',output='docs/evidence/MANAGED-PLANS-20261016';fs.mkdirSync(output,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'briofold-session',value:fixture.token,url:base,httpOnly:true,sameSite:'Lax'},{name:'briofold-locale',value:'en',url:base}]);const page=await context.newPage();
 const problems=[];page.on('pageerror',e=>problems.push(e.message));
 try{
 await page.goto(base+'/en/admin/plans',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Create plan',exact:true}).click();
 const id='ui-'+fixture.suffix,name='Launch plan '+fixture.suffix;
 await page.getByLabel('Stable plan ID',{exact:true}).fill(id);await page.getByLabel('Name · English',{exact:true}).fill(name);await page.getByLabel('Name · বাংলা',{exact:true}).fill('শুরুর প্ল্যান');
 await page.getByLabel('Description · English',{exact:true}).fill('A workspace allowance for every website, app and bot.');
 await page.getByLabel(/^Pricing mode/).selectOption('paid');await page.getByLabel('Price · BDT (blank = free)',{exact:true}).fill('100');await page.getByLabel('Successful payments',{exact:true}).fill('500');
 await page.getByLabel('Reason for this change',{exact:true}).fill('Automated authenticated UI creation');
 await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('status').filter({hasText:'Changes saved'}).waitFor();
 let row=page.getByRole('row').filter({hasText:name});await row.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel(/^Publication/).selectOption('published');await page.getByLabel('Reason for this change',{exact:true}).fill('Publish synthetic UI test plan');await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('status').filter({hasText:'Changes saved'}).waitFor();
 const pub=await context.newPage();await pub.goto(base+'/en/pricing',{waitUntil:'networkidle'});await pub.getByRole('heading',{name,exact:true}).waitFor();await pub.getByRole('link',{name:/^Choose plan/}).first().waitFor();assert((await pub.content()).includes('500'));
 const matrix=[];
 for(const locale of ['en','bn'])for(const theme of ['light','dark'])for(const width of [320,768,1440]){
  await context.addCookies([{name:'briofold-theme',value:theme,url:base},{name:'briofold-locale',value:locale,url:base}]);await pub.setViewportSize({width,height:1000});await pub.goto(`${base}/${locale}/pricing`,{waitUntil:'networkidle'});
  const overflow=await pub.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,`public overflow ${locale}/${theme}/${width}`);matrix.push({surface:'public',locale,theme,width,overflow});
  if(width===1440)await pub.screenshot({path:`${output}/pricing-${locale}-${theme}.png`,fullPage:true});
  await page.setViewportSize({width,height:1000});await page.goto(`${base}/${locale}/admin/plans`,{waitUntil:'networkidle'});await page.getByRole('heading',{name:locale==='en'?'Payment plans':'পেমেন্ট প্ল্যান',exact:true}).waitFor();
  const adminOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!adminOverflow,`admin overflow ${locale}/${theme}/${width}`);matrix.push({surface:'admin',locale,theme,width,overflow:adminOverflow});
  if(width===1440)await page.screenshot({path:`${output}/admin-${locale}-${theme}.png`,fullPage:true});
 }
 assert.deepEqual(problems,[]);fs.writeFileSync(`${output}/ui-results.json`,JSON.stringify({synthetic:true,realProviderPayment:false,createDraft:true,publish:true,publicCatalog:true,matrix,pageErrors:problems},null,2));console.log('PASS: real server-action draft creation/publication and 24 locale/theme/viewport checks');
 }catch(e){console.log('UI failure at',page.url(),(await page.locator('body').innerText()).slice(0,500));console.log('overflow',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))));await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw e}finally{await browser.close()}
}
