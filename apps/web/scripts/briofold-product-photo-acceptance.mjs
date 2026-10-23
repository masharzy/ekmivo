import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
export async function runProductPhotos({origin,browser,control,sessions,privateStorage}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Photo acceptance refuses shared DB');
 const db=postgres(control,{max:3,prepare:false});let context,viewerContext;
 try{
  const fixtures=JSON.parse(await readFile(new URL('./fixtures/phase10-photo-search.json',import.meta.url),'utf8'));
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(token).digest('hex')}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional photo catalog business','both',${owner}),(${foreign},'Foreign photo catalog','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const hash='0'.repeat(64),media=[];
  for(const [name,colors] of [['red',[255,0,0]],['blue',[0,0,255]],['red',[255,0,0]]]){
   const id=randomUUID(),sha=createHash('sha256').update(Buffer.from(fixtures[name],'base64')).digest('hex');
   await db`INSERT INTO commerce_media(id,workspace_id,environment,object_key,mime,name,sha256) VALUES(${id},${store},'live',${'commerce/live/'+store+'/'+id+'/'+sha},'image/png',${'Fictional '+name},${sha})`;
   await db`SELECT commerce_photo_index(${store},'live',${owner},${id},${sha},${hash},${db.json(colors)})`;privateStorage.put('commerce/live/'+store+'/'+id+'/'+sha,Buffer.from(fixtures[name],'base64'));media.push({id,sha,colors});
  }
  const product=async(name,images,realm='live',scope=store)=>(await db`INSERT INTO commerce_products(workspace_id,environment,name,images,description) VALUES(${scope},${realm},${name},${images}::uuid[],'Fictional catalog text') RETURNING id`)[0].id;
  const red=await product('Red Orchid shirt',[media[0].id,media[2].id]),blue=await product('Blue Orchid shirt',[media[1].id]);await product('Sandbox red',[],'sandbox');await product('Foreign red',[],'live',foreign);
  const search=async(h=hash,c=[255,0,0],q='',who=owner,realm='live',scope=store)=>(await db`SELECT commerce_photo_search(${scope},${realm},${who},${h},${c===null?null:db.json(c)},${q}) data`)[0].data;
  let data=await search();assert.deepEqual(data.items.map(x=>x.product_id),[red],'same product photos duplicated results or unrelated colors passed threshold');assert.equal(data.items[0].similarity,100);assert.equal(data.indexed_photos,3);
  assert.equal((await search(hash,[0,255,0])).items.length,0,'unknown color did not abstain');assert.equal((await search(hash,[0,0,255],'Red')).items.length,0,'photo lookup ignored catalog text');
  assert.deepEqual((await search(null,null,'Blue')).items.map(x=>x.product_id),[blue]);assert.equal((await search(hash,[255,0,0],'',viewer)).can_evaluate,false);
  await assert.rejects(()=>search(hash,[255,0,0],'',viewer,'live',foreign),e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT commerce_photo_index_source(${store},'live',${viewer},${media[0].id})`,e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT commerce_photo_index(${store},'live',${owner},${media[0].id},${'f'.repeat(64)},${hash},'[255,0,0]')`,e=>e.code==='40001');
  await assert.rejects(()=>search(hash,[256,0,0]),e=>e.code==='22023');await assert.rejects(()=>search('1',[0,0,0]),e=>e.code==='22023');
  for(const table of ['commerce_photo_features','commerce_photo_evaluations'])assert.equal((await db`SELECT has_table_privilege('ekmivo_financial_runtime',${table},'SELECT') ok`)[0].ok,false);
  const authenticated=async(token,user)=>{const c=await browser.newContext();await c.addCookies([{name:'ekmivo-session',value:token,url:origin,httpOnly:true},{name:'ekmivo-default-workspace',value:user+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);return c;};
  context=await authenticated(sessions.owner,owner);viewerContext=await authenticated(sessions.viewer,viewer);
  const endpoint=origin+`/api/go/workspaces/${store}/commerce?environment=live`;
  const post=(body,action='photo-search',key=randomUUID(),ctx=context)=>ctx.request.post(endpoint,{headers:{Origin:origin},data:{action,operation_key:key,body}});
  await db`UPDATE commerce_photo_features SET colors='[0,255,0]' WHERE media_id=${media[0].id}`;
  const indexed=await post({id:media[0].id},'photo-index');assert.equal(indexed.status(),200,await indexed.text());
  assert.deepEqual((await db`SELECT colors FROM commerce_photo_features WHERE media_id=${media[0].id}`)[0].colors,[255,0,0],'signed TLS source was not decoded and indexed by Go');
  const objectKey='commerce/live/'+store+'/'+media[0].id+'/'+media[0].sha;assert.ok(privateStorage.requests.some(x=>x.method==='GET'&&x.key===objectKey));
  privateStorage.put(objectKey,Buffer.from(fixtures.blue,'base64'));assert.equal((await post({id:media[0].id},'photo-index')).status(),409,'changed private object bypassed its source hash');privateStorage.put(objectKey,Buffer.from(fixtures.red,'base64'));
  for(const name of ['red','small_red','red_jpeg','blue']){const response=await post({data:fixtures[name],query:''});assert.equal(response.status(),200,await response.text());assert.equal((await response.json()).items[0]?.product_id,name==='blue'?blue:red,'held-out resize/JPEG/color retrieval failed');}
  let response=await post({data:Buffer.from('<svg onload="x"/>').toString('base64')});assert.equal(response.status(),422);
  response=await post({data:fixtures.green,query:''});assert.equal((await response.json()).items.length,0);
  const operation=randomUUID(),labelled={data:fixtures.red,query:'',expected_product_id:red};
  response=await post(labelled,'photo-evaluate',operation);assert.equal(response.status(),200);assert.equal((await response.json()).top5_hit,true);
  assert.equal((await post(labelled,'photo-evaluate',operation)).status(),200);
  assert.equal((await post({...labelled,expected_product_id:blue},'photo-evaluate',operation)).status(),409);
  response=await post({data:fixtures.red,query:'',expected_product_id:blue},'photo-evaluate');assert.equal((await response.json()).top5_hit,false);
  response=await context.request.get(endpoint+'&resource=photo-metrics');assert.equal(response.status(),200);assert.deepEqual(await response.json(),{tested:2,top5_hits:1,period_days:30});
  assert.equal((await viewerContext.request.get(endpoint+'&resource=photo-metrics')).status(),403);assert.equal((await post(labelled,'photo-evaluate',randomUUID(),viewerContext)).status(),403);
  const privateReads=privateStorage.requests.length;assert.equal((await post({id:media[0].id},'photo-index',randomUUID(),viewerContext)).status(),403);assert.equal(privateStorage.requests.length,privateReads,'viewer fetched private source before authorization');
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/orders/products/photos');
  await page.getByLabel('Query photo (optional)',{exact:true}).setInputFiles({name:'fictional-red.png',mimeType:'image/png',buffer:Buffer.from(fixtures.red,'base64')});
  await page.getByText('fictional-red.png',{exact:false}).waitFor();await page.getByRole('button',{name:'Find matches',exact:true}).click();await page.getByRole('region',{name:'Product matches',exact:true}).getByRole('heading',{name:'Red Orchid shirt',exact:true}).waitFor();
  await page.getByRole('button',{name:'View indexed photo',exact:true}).click();await page.getByRole('img',{name:'Red Orchid shirt',exact:true}).waitFor();
  assert.equal(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),fixtures.red),false,'query photo persisted in browser storage');
  await page.getByLabel('Expected catalog product',{exact:true}).selectOption(red);await page.getByRole('button',{name:'Run labelled test',exact:true}).click();await page.getByText('Expected product found in the first five results.',{exact:true}).waitFor();
  assert.equal((await db`SELECT count(*)::integer n FROM commerce_photo_evaluations WHERE workspace_id=${store}`)[0].n,3,'browser labelled test was not recorded once');
  const privatePage=await viewerContext.newPage();await privatePage.goto(origin+'/orders/products/photos');await privatePage.getByLabel('Catalog search text',{exact:true}).fill('Blue');await privatePage.getByRole('button',{name:'Find matches',exact:true}).click();await privatePage.getByRole('heading',{name:'Blue Orchid shirt',exact:true}).waitFor();assert.equal(await privatePage.getByRole('region',{name:'Private photo evaluation',exact:true}).count(),0);assert.equal(await privatePage.getByText('Index existing stored photos',{exact:true}).count(),0);
  await db`UPDATE workspace_members SET role='admin' WHERE workspace_id=${store} AND user_id=${viewer}`;
  response=await viewerContext.request.get(endpoint+'&resource=photo-metrics');assert.equal(response.status(),200);assert.equal((await response.json()).tested,0,'one account read another account labelled evaluations');
  await db`UPDATE workspace_members SET role='viewer' WHERE workspace_id=${store} AND user_id=${viewer}`;
  let cases=0;for(const lang of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:lang,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);await page.emulateMedia({colorScheme:theme});for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/orders/products/photos');await page.getByRole('heading',{name:lang==='bn'?'ছবি দিয়ে পণ্য খুঁজুন':'Find products by photo',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));cases++;}}}
  assert.deepEqual(errors,[]);console.log('PRODUCT PHOTO SQL/Go/Next/browser PASS: transient PNG/JPEG/resize/color and text retrieval, unknown abstention, one-product dedup, source-SHA/realm/role isolation, private labelled hit/miss/retry metrics and responsive cases:',cases);
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
