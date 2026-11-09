import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";
import {createServer} from "node:net";


export async function startCatalogScanner(){
 const fixtures=JSON.parse(await readFile(new URL("./fixtures/phase10-photo-search.json",import.meta.url),"utf8"));
 const allowed=new Set(["red","blue"].map(name=>createHash("sha256").update(Buffer.from(fixtures[name],"base64")).digest("hex")));
 const server=createServer(socket=>{
  let pending=Buffer.alloc(0),started=false,total=0;
  const digest=createHash("sha256");
  socket.setTimeout(3000,()=>socket.destroy());
  socket.on("error",()=>socket.destroy());
  socket.on("data",chunk=>{
   pending=Buffer.concat([pending,chunk]);
   if(!started){
    if(pending.length<10)return;
    if(pending.subarray(0,10).toString()!=="zINSTREAM\0"){socket.destroy();return;}
    pending=pending.subarray(10);
    started=true;
   }
   while(pending.length>=4){
    const size=pending.readUInt32BE(0);
    if(size>32768||total+size>5*1024*1024){socket.destroy();return;}
    if(pending.length<4+size)return;
    if(size===0){
     socket.end(allowed.has(digest.digest("hex"))?"stream: OK\0":"stream: FixtureMismatch FOUND\0");
     return;
    }
    digest.update(pending.subarray(4,4+size));
    total+=size;
    pending=pending.subarray(4+size);
   }
  });
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 return {address:"127.0.0.1:"+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

export async function runCatalogPhase1({origin,apiOrigin,browser,control,sessions,privateStorage}){
 const target=new URL(control);
 assert.ok(["localhost","127.0.0.1","[::1]"].includes(target.hostname)&&target.pathname==="/ekmivo_pg00","Catalog acceptance requires the disposable CI database");
 const db=postgres(control,{max:1,prepare:false});
 let context;
 try{
  const tokenHash=createHash("sha256").update(sessions.owner).digest("hex");
  const [{user_id:actor}]=await db`SELECT user_id FROM auth_sessions WHERE token_hash=${tokenHash}`;
  const workspace=randomUUID();
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspace},'Fictional catalog acceptance','both',${actor})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  await db`INSERT INTO commerce_warehouses(workspace_id,environment,name) VALUES(${workspace},'live','Fixture warehouse'),(${workspace},'sandbox','Fixture warehouse')`;
  context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([
   {name:"briofold-session",value:sessions.owner,url:origin,httpOnly:true},
   {name:"briofold-default-workspace",value:actor+":"+workspace,url:origin,httpOnly:true},
   {name:"briofold-locale",value:"bn",url:origin}
  ]);
  const page=await context.newPage();
  await page.goto(origin+"/catalog/products/sync");
  const catalog=page.getByRole("region",{name:"পণ্যের ক্যাটালগ",exact:true});
  await catalog.waitFor();
  await catalog.getByLabel("নাম",{exact:true}).fill("পরীক্ষামূলক পাঞ্জাবি");
  await catalog.getByLabel("SKU",{exact:true}).fill("MANUAL-BN-M");
  await catalog.getByLabel("দাম (টাকা)",{exact:true}).fill("1200.05");
  await catalog.getByLabel("মজুত",{exact:true}).fill("4");
  const fixtures=JSON.parse(await readFile(new URL("./fixtures/phase10-photo-search.json",import.meta.url),"utf8"));
  const photos=["red","blue"].map(name=>({name:name+".png",mimeType:"image/png",buffer:Buffer.from(fixtures[name],"base64")}));
  for(const photo of photos){
   const upload=page.waitForResponse(response=>{
    try{return response.request().postDataJSON()?.action==="media-upload";}catch{return false;}
   });
   const [response]=await Promise.all([upload,catalog.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(photo)]);
   const body=await response.json();
   assert.equal(response.status(),200,body.error?.code??body.code??"upload failed");
  }
  await catalog.getByRole("img",{name:"ছবি 2",exact:true}).waitFor();
  await catalog.getByRole("button",{name:"আগে আনুন",exact:true}).last().click();
  await catalog.getByRole("button",{name:"পণ্য সংরক্ষণ",exact:true}).click();
  await catalog.getByRole("status").filter({hasText:"পণ্য সংরক্ষিত হয়েছে।"}).waitFor();
  const [manual]=await db`SELECT p.source,v.price_minor,s.on_hand,m.sha256 FROM commerce_products p
   JOIN commerce_variants v ON v.product_id=p.id
   JOIN commerce_stock s ON s.variant_id=v.id
   JOIN commerce_media m ON m.id=p.images[1]
   WHERE p.workspace_id=${workspace} AND v.sku='MANUAL-BN-M'`;
  assert.equal(manual.source,"manual");
  assert.equal(Number(manual.price_minor),120005);
  assert.equal(Number(manual.on_hand),4);
  assert.equal(manual.sha256,createHash("sha256").update(photos[1].buffer).digest("hex"));
  await catalog.getByText("CSV / Excel থেকে আমদানি",{exact:true}).click();
  const csv=Buffer.from("name,sku,options,price,min_price,stock\nপাঞ্জাবি,CSV-BN-M,size=M;color=Red,1250.25,900,5\nBad,BAD-PRICE,,invalid,,\n");
  for(let attempt=0;attempt<2;attempt++){
   await catalog.getByLabel("পণ্যের ফাইল (সর্বোচ্চ ৫০০ সারি)",{exact:true}).setInputFiles({name:"catalog.csv",mimeType:"text/csv",buffer:csv});
   await catalog.getByText("PRICE_INVALID",{exact:true}).waitFor();
   const completed=page.waitForResponse(response=>{
    try{return response.request().postDataJSON()?.action==="catalog-import";}catch{return false;}
   });
   const [response]=await Promise.all([completed,catalog.getByRole("button",{name:"1টি পণ্য আমদানি করুন",exact:true}).click()]);
   assert.equal(response.status(),200);
   assert.equal((await response.json()).saved,1);
  }
  const products=await db`SELECT p.source,p.min_price_minor,v.price_minor FROM commerce_products p
   JOIN commerce_variants v ON v.product_id=p.id WHERE p.workspace_id=${workspace} AND v.sku='CSV-BN-M'`;
  assert.equal(products.length,1);
  assert.equal(products[0].source,"csv");
  assert.equal(Number(products[0].price_minor),125025);
  assert.equal(Number(products[0].min_price_minor),90000);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Bangla catalog overflows at 390 px");
  const uploads=privateStorage.requests.filter(r=>r.method==="PUT"&&r.key.startsWith("commerce/live/"+workspace+"/"));
  assert.equal(uploads.length,2,"both images must reach signed storage");
  const publicId=randomBytes(8).toString("hex");
  const secret="bf_test_"+publicId+"_"+randomBytes(32).toString("base64url");
  const digest=createHash("sha256").update(secret).digest("hex");
  await db`INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at)
   VALUES(${workspace},'sandbox',${publicId},${digest},'Fictional catalog client',${["products:read","products:write"]},${actor},now()+interval '1 hour')`;
  const call=(method,path,body,key)=>context.request.fetch(apiOrigin+"/v1/products"+path+"?environment=sandbox",{
   method,headers:{Authorization:"Bearer "+secret,...(key?{"Idempotency-Key":key}:{})},data:body
  });
  const input={external_id:"api-fixture",name:"API fixture",variants:[{sku:"API-BN-M",price_minor:125025,stock:5}]};
  const idempotency=randomUUID();
  let apiResponse=await call("POST","",input,idempotency);
  assert.equal(apiResponse.status(),201);
  const created=await apiResponse.json();
  apiResponse=await call("POST","",input,idempotency);
  assert.equal(apiResponse.status(),201);
  assert.deepEqual(await apiResponse.json(),created);
  assert.equal((await call("POST","",{...input,name:"Different"},idempotency)).status(),409);
  const idPath="/"+created.id;
  assert.equal((await call("GET",idPath)).status(),200);
  assert.equal((await call("PUT",idPath+"/stock",{items:[{sku:"API-BN-M",quantity:8}]},randomUUID())).status(),200);
  const [apiStock]=await db`SELECT s.on_hand FROM commerce_stock s JOIN commerce_variants v ON v.id=s.variant_id
   WHERE s.workspace_id=${workspace} AND s.environment='sandbox' AND v.sku='API-BN-M'`;
  assert.equal(Number(apiStock.on_hand),8);
  assert.equal((await call("DELETE",idPath)).status(),200);
  const [retired]=await db`SELECT active FROM commerce_products WHERE id=${created.id}`;
  assert.equal(retired.active,false);
  console.log("Catalog Phase 1 PASS: styled Bangla dashboard, photo upload/reorder, Go/PostgreSQL manual save, CSV replay, signed storage and public Product API lifecycle");
 }finally{
  await context?.close();
  await db.end({timeout:3});
 }
}
