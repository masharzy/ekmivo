import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

// Independent source-to-UI acceptance. Synthetic Store/order, disposable loopback PostgreSQL only.
export async function runBriofoldOrderAssignment({origin,browser,control,sessions}){
 const url=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||/prod/i.test(url.pathname))
  throw Error("Order assignment acceptance refuses remote/production database");
 const db=postgres(control,{max:2,prepare:false});
 let ownerContext,viewerContext;
 try{
  const actor=async token=>(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash("sha256").update(token).digest("hex")}`)[0].user_id;
  const owner=await actor(sessions.owner),viewer=await actor(sessions.viewer),store=randomUUID(),foreign=randomUUID();
  const order=randomUUID(),otherOrder=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional assignment Store','both',${owner}),(${foreign},'Unrelated assignment Store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const insertOrder=async(id,workspace)=>db`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,recipient,subtotal_minor,total_minor,created_by)
   VALUES(${id},${workspace},'live',${"ASSIGN-CI-"+id.slice(0,8)},'manual',${db.json({name:"Fictional recipient",phone:"01700000000",address:"Fictional route, test only"})},0,0,${owner})`;
  await insertOrder(order,store);
  await insertOrder(otherOrder,foreign);
  await db`INSERT INTO pg13_control_audit(workspace_id,actor_id,action)
   VALUES(${store},${owner},'ci-settings-updated'),(${foreign},${owner},'foreign-settings-updated')`;
  const [product]=await db`INSERT INTO commerce_products(workspace_id,environment,name)
   VALUES(${store},'live','Fictional packing item') RETURNING id`;
  const barcode="BRIOFOLD-CI-"+randomUUID().slice(0,8);
  const [variant]=await db`INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,barcode,price_minor)
   VALUES(${store},'live',${product.id},${'CI-SKU-'+barcode},${barcode},0) RETURNING id`;
  await db`INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
   VALUES(${store},'live',${order},${variant.id},'Fictional packing item',${'CI-SKU-'+barcode},${db.json({})},0,1)`;
  const scan=async(code,who=owner,realm="live",scope=store)=>(await db`SELECT commerce_order_scan(${scope},${realm},${who},${code},0,'','') data`)[0].data;
  assert.equal((await scan(barcode)).items[0].id,order,'exact barcode did not locate customer order');
  assert.equal((await scan('CI-SKU-'+barcode)).items[0].id,order,'exact SKU did not locate order');
  assert.equal((await scan(barcode,viewer)).items[0].id,order,'viewer cannot read authorized non-PII order summary');
  assert.deepEqual((await scan('UNKNOWN-BARCODE')).items,[],'unknown code must not enumerate orders');
  assert.deepEqual((await scan(barcode,owner,'sandbox')).items,[],'barcode search leaked across realms');
  await assert.rejects(()=>scan(barcode,viewer,'live',foreign),e=>e.code==='42501');
  await assert.rejects(()=>scan(''),e=>e.code==='22023');
  const report=async(who=owner,realm='live',scope=store,status='',source='',agent=null)=>(await db`
   SELECT commerce_order_report(${scope},${realm},${who},NULL::date,NULL::date,${status},${source},${agent}::uuid) data`)[0].data;
  assert.equal((await report()).total,1,'Store report must include its order');
  assert.equal((await report(owner,'sandbox')).total,0,'sandbox report included live order');
  assert.equal((await report(owner,'live',store,'cancelled')).total,0,'report filter ignored status');
  assert.equal((await report(owner,'live',store,'draft','manual')).total,1,'report source/status filters failed');
  assert.equal((await report(owner,'live',store,'','api')).total,0,'report source filter failed');
  assert.equal((await report(viewer)).can_export,false,'viewer must not export team names');
  assert.equal((await report(viewer)).rows[0].assignee_name,null,'viewer team name was exposed');
  await assert.rejects(()=>report(viewer,'live',store,'','',owner),e=>e.code==='22023');
  await assert.rejects(()=>report(owner,'live',foreign),e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT commerce_order_report(${store},'live',${owner},current_date, current_date-1,'','',NULL::uuid)`,
   e=>e.code==='22023','report accepted a reversed date window');
  await assert.rejects(()=>db`SELECT commerce_order_report(${store},'live',${owner},current_date-500,current_date,'','',NULL::uuid)`,
   e=>e.code==='22023','report accepted an unbounded date window');
  const read=async(who=owner,realm="live",scope=store,id=order)=>(await db`SELECT commerce_assignment_read(${scope},${realm},${who},${id}) data`)[0].data;
  const write=async(body,key=randomUUID(),who=owner,realm="live",scope=store)=>(await db`SELECT commerce_assignment_write(${scope},${realm},${who},${key},${db.json(body)}) data`)[0].data;
  assert.equal((await read()).revision,0);
  assert.equal((await read()).agents.some(a=>a.id===owner),true);
  assert.equal((await read(viewer)).can_assign,false);
  assert.equal((await read(viewer)).assignee_id,null,'viewer assignment exposed a staff UUID');
  assert.deepEqual((await read(viewer)).agents,[],"viewer must not enumerate team identities");
  await assert.rejects(()=>read(viewer,"live",foreign,otherOrder),e=>e.code==="42501");
  await assert.rejects(()=>read(owner,"sandbox"),e=>e.code==="42501");
  await assert.rejects(()=>write({id:otherOrder,revision:0,assignee_id:owner}),e=>e.code==="42501");
  await assert.rejects(()=>write({id:order,revision:0,assignee_id:randomUUID()}),e=>e.code==="42501");
  await assert.rejects(()=>write({id:order,revision:0,assignee_id:owner},randomUUID(),viewer),e=>e.code==="42501");
  const firstKey=randomUUID(),assigned=await write({id:order,revision:0,assignee_id:owner},firstKey);
  assert.equal(assigned.revision,1);
  assert.deepEqual(await write({id:order,revision:0,assignee_id:owner},firstKey),assigned,"replay duplicates assignment");
  await assert.rejects(()=>write({id:order,revision:0,assignee_id:null},firstKey),e=>e.code==="23505");
  await assert.rejects(()=>write({id:order,revision:0,assignee_id:null}),e=>e.code==="40001");
  assert.equal((await read()).assignee_id,owner);
  assert.equal((await read()).history.length,1);
  assert.equal((await read(viewer)).assigned,true,'viewer did not receive a safe assigned indicator');
  assert.equal((await read(viewer)).assignee_id,null,'viewer saw an assigned staff UUID');
  assert.equal((await read(viewer)).history[0].assignee_id,null,'viewer assignment history leaked team identity');
  assert.equal((await read(viewer)).history[0].assigned,true,'viewer audit state was masked incorrectly');
  const activity=async(who=owner,realm='live',scope=store,category='',query='')=>(await db`
   SELECT briofold_unified_activity(${scope},${realm},${who},${category},${query},0) data`)[0].data;
  const orderEvents=await activity(owner,'live',store,'orders');
  assert.equal(orderEvents.items[0].action,'assign-order','unified activity ignored durable commerce audit');
  assert.equal((await activity(owner,'sandbox',store,'orders')).items.length,0,'activity ignored realm');
  assert.ok((await activity(owner,'live',store,'settings')).items.some(x=>x.action==='ci-settings-updated'),
   'Store-wide settings audit missing');
  assert.ok(!(await activity(owner,'live',store,'settings')).items.some(x=>x.action==='foreign-settings-updated'),
   'Store activity leaked foreign settings');
  const viewEvents=await activity(viewer,'live',store,'orders');
  assert.equal(viewEvents.can_export,false,'viewer could export operational event history');
  assert.equal(viewEvents.items[0].actor_name,'Team member','viewer saw actor identity');
  assert.equal((await activity(viewer,'live',store,'settings')).items.length,0,'viewer saw restricted settings audit');
  await assert.rejects(()=>activity(owner,'live',foreign),e=>e.code==='42501');
  await assert.rejects(()=>activity(owner,'live',store,'unsupported'),e=>e.code==='22023');
  for(const role of ["ekmivo_financial_projection","ekmivo_financial_runtime"]){
   assert.equal((await db`SELECT has_table_privilege(${role},'commerce_order_assignments','UPDATE') ok`)[0].ok,false);
   assert.equal((await db`SELECT has_function_privilege(${role},'commerce_assignment_write(uuid,text,uuid,uuid,jsonb)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'commerce_order_scan(uuid,text,uuid,text,integer,text,text)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'commerce_order_report(uuid,text,uuid,date,date,text,text,uuid)','EXECUTE') ok`)[0].ok,true);
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_unified_activity(uuid,text,uuid,text,text,integer)','EXECUTE') ok`)[0].ok,true);
  }
  const makeContext=async(token)=>{const ctx=await browser.newContext();await ctx.addCookies([
   {name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},
   {name:"ekmivo-default-workspace",value:owner+":"+store,url:origin,httpOnly:true,sameSite:"Lax"},
   {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
  ]);return ctx;};
  ownerContext=await makeContext(sessions.owner);
  viewerContext=await makeContext(sessions.viewer);
  const endpoint=origin+`/api/go/workspaces/${store}/commerce?environment=live`;
  const serverRead=await ownerContext.request.get(endpoint+`&resource=assignments&item=${order}`);
  assert.equal(serverRead.status(),200,`Go assignment read failed: ${await serverRead.text()}`);
  assert.equal((await serverRead.json()).assignee_id,owner);
  const scanned=await ownerContext.request.get(endpoint+`&resource=scan&q=${encodeURIComponent(barcode)}`);
  assert.equal(scanned.status(),200,`Go barcode search failed: ${await scanned.text()}`);
  assert.equal((await scanned.json()).items[0].reference,"ASSIGN-CI-"+order.slice(0,8));
  const viewerWrite=await viewerContext.request.post(endpoint,{headers:{Origin:origin},data:{action:"assign-order",operation_key:randomUUID(),body:{id:order,revision:1,assignee_id:null}}});
  assert.equal(viewerWrite.status(),403,"viewer assignment must fail at source");
  const clear=await ownerContext.request.post(endpoint,{headers:{Origin:origin},data:{action:"assign-order",operation_key:randomUUID(),body:{id:order,revision:1,assignee_id:null}}});
  assert.equal(clear.status(),200,`Go assignment update failed: ${await clear.text()}`);
  assert.equal((await clear.json()).revision,2);
  assert.equal((await read()).history.length,2);
  const page=await ownerContext.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const reference="ASSIGN-CI-"+order.slice(0,8);
  let responsive=0;
  for(const locale of ["en","bn"]){
   await ownerContext.addCookies([{name:"ekmivo-locale",value:locale,url:origin,sameSite:"Lax"}]);
   for(const theme of ["light","dark"]){
    await ownerContext.addCookies([{name:"ekmivo-theme",value:theme,url:origin,sameSite:"Lax"}]);
    for(const width of [320,360,768,1440]){
     await page.setViewportSize({width,height:900});
     const response=await page.goto(origin+"/orders");
     assert.equal(response.status(),200);
     await page.getByText(reference,{exact:true}).first().waitFor();
     const row=page.locator("table tbody tr").filter({hasText:reference});
     await row.getByRole("button",{name:locale==="bn"?"খুলুন":"Open"}).click();
     await page.getByRole("region",{name:locale==="bn"?"অর্ডারের টিম অ্যাসাইনমেন্ট":"Order team assignment"}).waitFor();
     assert.equal(await page.locator("html").getAttribute("data-theme"),theme);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"order assignment horizontal overflow");
     responsive++;
     const reportResponse=await page.goto(origin+'/reports/orders');
     assert.equal(reportResponse.status(),200);
     await page.getByRole('heading',{name:locale==='bn'?'অর্ডার রিপোর্ট':'Order reports'}).waitFor();
     assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'order reporting horizontal overflow');
     responsive++;
     const activityResponse=await page.goto(origin+'/settings/activity');
     assert.equal(activityResponse.status(),200);
     await page.getByRole('region',{name:locale==='bn'?'স্টোরের পরিচালনাগত ইতিহাস':'Store operational activity'})
      .getByRole('heading',{name:locale==='bn'?'কার্যক্রমের ইতিহাস':'Activity log',exact:true}).waitFor();
     assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'unified activity horizontal overflow');
     responsive++;
    }
   }
  }
  assert.deepEqual(errors,[],"assignment UI hydration errors");
  await ownerContext.addCookies([{name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}]);
  await page.goto(origin+"/orders");
  await page.getByText(reference,{exact:true}).first().waitFor();
  await page.locator("table tbody tr").filter({hasText:reference}).getByRole("button",{name:"Open"}).click();
  const team=page.getByRole("region",{name:"Order team assignment"});
  await team.getByLabel("Responsible team member").selectOption(owner);
  await team.getByRole("button",{name:"Save assignment"}).click();
  await page.getByText("Saved.",{exact:true}).waitFor();
  assert.equal((await read()).assignee_id,owner,"browser click did not persist assignment");
  assert.equal((await read()).revision,3);
  assert.equal((await read()).history.length,3);
  assert.equal((await report()).rows[0].assignee_id,owner,'reports must reflect durable order assignment');
  assert.equal((await report(owner,'live',store,'','',owner)).total,1,'agent report filter failed');
  assert.equal((await report(owner,'live',store,'','',viewer)).total,0,'agent filter leaked rows');
  await page.goto(origin+"/orders/scan");
  await page.getByRole('heading',{name:'Scan & pack'}).waitFor();
  await page.getByRole('textbox',{name:'Search / scan barcode'}).fill(barcode);
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText(reference,{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Scan with camera'}).count(),1,'camera action missing');
  assert.equal((await page.goto(origin+'/orders/products/sync')).status(),200);
  const importView=page.locator('details').filter({has:page.getByText('Import / sync catalog',{exact:true})});
  await importView.waitFor();
  assert.equal(await importView.getAttribute('open'),'','catalog import deep link must open a real preview workflow');
  assert.equal((await page.goto(origin+'/orders/courier')).status(),200);
  await page.getByRole('heading',{name:'Delivery'}).waitFor();
  assert.equal((await page.goto(origin+'/reports/orders')).status(),200);
  await page.getByRole('heading',{name:'Order reports'}).waitFor();
  await page.getByRole('button',{name:'Download CSV'}).waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download CSV'}).click()]);
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/"Date","Order status","Source","Assigned team member","Orders"/,'operational report CSV header missing');
  assert.match(csv,/"manual"/,'operational report CSV did not export authorized source summary');
  assert.doesNotMatch(csv,/01700000000|payment_amount|recipient|secret_cipher/,'operational report export leaked customer or finance source');
  await page.getByRole('combobox',{name:'Status'}).selectOption('cancelled');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await page.getByText('No orders match these filters.').waitFor();
  assert.equal((await page.goto(origin+'/settings/activity')).status(),200);
  await page.getByRole('region',{name:'Store operational activity'})
   .getByRole('heading',{name:'Activity log',exact:true}).waitFor();
  await page.getByText('assign-order',{exact:true}).first().waitFor();
  const [eventDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download this page CSV'}).click()]);
  const eventCsv=await readFile(await eventDownload.path(),'utf8');
  assert.match(eventCsv,/"orders","assign-order"/,'redacted activity CSV did not include persisted event action');
  assert.doesNotMatch(eventCsv,/01700000000|secret_cipher|recipient/,'activity export disclosed sensitive event fields');
  await db`UPDATE commerce_orders SET status='cancelled' WHERE id=${order}`;
  await assert.rejects(()=>write({id:order,revision:3,assignee_id:null}),e=>e.code==="42501","closed order changed assignment");
  // Scan & pack is also a real bulk state workflow, not merely a barcode
  // search. Exercise the UI's selected-order action through Next/Go/CONTROL
  // using a second disposable draft so earlier report assertions are intact.
  const bulkOrder=randomUUID(),bulkReference="ASSIGN-CI-"+bulkOrder.slice(0,8);
  await insertOrder(bulkOrder,store);
  await db`INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
   VALUES(${store},'live',${bulkOrder},${variant.id},'Fictional packing item',${'CI-SKU-'+barcode},${db.json({})},0,1)`;
  await page.goto(origin+"/orders/scan");
  await page.getByRole('textbox',{name:'Search / scan barcode'}).fill(barcode);
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select '+bulkReference}).check();
  await page.getByRole('button',{name:'cancelled',exact:true}).click();
  await page.getByText(bulkReference+': saved',{exact:true}).waitFor();
  assert.equal((await db`SELECT status FROM commerce_orders WHERE id=${bulkOrder}`)[0].status,'cancelled',
   'browser barcode bulk action did not persist an authorized order state');
  assert.equal(responsive,48);
  console.log(`BRIOFOLD ORDER ASSIGNMENT + SCAN + REPORT + ACTIVITY PASS: Store/realm/RBAC, serial optimistic revision, idempotent replay, immutable audit, exact barcode/SKU, selected-row bulk transition, order aggregates and redacted activity/export permissions; ${responsive} EN/BN theme/viewport cases`);
 }finally{
  if(ownerContext)await ownerContext.close();
  if(viewerContext)await viewerContext.close();
  await db.end({timeout:3});
 }
}
