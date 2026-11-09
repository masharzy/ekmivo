import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

export async function runCatalogPhase1({origin,browser,control,sessions}){
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
  await db`INSERT INTO commerce_warehouses(workspace_id,environment,name) VALUES(${workspace},'live','Fixture warehouse')`;
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
  await catalog.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(photos);
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
  console.log("Catalog Phase 1 PASS: styled Bangla dashboard, photo upload/reorder, Go/PostgreSQL manual save, CSV row validation and replay");
 }finally{
  await context?.close();
  await db.end({timeout:3});
 }
}
