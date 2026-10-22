import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";

// Execute the production Server Action with transactional dependency doubles.
// These are behavioral tests, not PostgreSQL/migration certification.
const source=readFileSync(new URL("../src/actions/briofold-onboarding.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realRequire=createRequire(import.meta.url);
function fixture(options={}){
 let state={step:"services",role:"owner",products:{ai:false,payments:false},mode:"off",audit:[],claims:[],profile:{body:{"name":"Existing store","logo":"","business_type":"online","description":"","brand_color":"#0b0c0f","phone":"","support_email":"","whatsapp":"","website":"","address":"","statement_name":"","refund_url":"","receipt_note":""},version:1},...options};
 const workspace={id:"business-a",mode:"both",...options.workspace};
 const db={begin:async callback=>{
  const draft=structuredClone(state);
  const tx=async (parts,...values)=>{
   const query=parts.join("?").replace(/\s+/g," ").trim();
   if(query.startsWith("SELECT role FROM workspace_members"))return draft.role?[{role:draft.role}]:[];
   if(query.startsWith("SELECT step FROM briofold_business_onboarding")){
    if(draft.originalOwnerTransferred&&query.includes("owner_id="))return [];
    return draft.step?[{step:draft.step}]:[];
   }
   if(query.startsWith("SELECT dashboard_store_read"))return [{profile:draft.profile}];
   if(query.startsWith("SELECT dashboard_store_write")){
    const body=values[2];assert.equal(Object.keys(body).length,13);
    draft.profile={body,version:draft.profile.version+1};return [];
   }
   if(query.startsWith("UPDATE workspaces SET name")){draft.businessName=values[0];return [];}
   if(query.startsWith("UPDATE briofold_business_onboarding SET step='services'")){
    if(draft.stageError)throw Error("stage failure");draft.step="services";return [];
   }
   if(query.startsWith("SELECT enabled FROM workspace_product_access"))return values[1] in draft.products?[{enabled:draft.products[values[1]]}]:[];
   if(query.startsWith("UPDATE workspace_product_access")){draft.products[values[2]]=values[0];return [];}
   if(query.startsWith("INSERT INTO workspace_product_access_audit")){draft.audit.push(values);return [];}
   if(query.startsWith("UPDATE workspaces SET service_mode")){draft.mode=values[0];return [];}
   if(query.startsWith("UPDATE briofold_business_onboarding SET step='billing'")){draft.step="billing";return [];}
   if(query.startsWith("SELECT product,enabled FROM workspace_product_access"))return Object.entries(draft.products).map(([product,enabled])=>({product,enabled}));
   if(query==="SELECT payment_plan_public() AS plans")return [{plans:[{id:"free",terms:{kind:"free"}},{id:"paid",terms:{kind:"paid"}},{id:"custom",terms:{kind:"custom"}}]}];
   if(query.startsWith("SELECT payment_plan_claim_free")){if(draft.claimError)throw Error("subscription conflict");draft.claims.push(values[2]);return [];}
   if(query.startsWith("UPDATE briofold_business_onboarding SET step='complete'")){draft.step="complete";draft.selected=values[0];return [];}
   throw Error("Unexpected query: "+query);
  };
  tx.json=value=>value;
  const result=await callback(tx);
  state=draft;
  return result;
 }};
 const exports={};
 const redirect=path=>{throw Object.assign(Error("redirect"),{location:path});};
 const modules={
  "next/navigation":{redirect},"next/cache":{revalidatePath:()=>{}},
  "next/headers":{cookies:async()=>({delete:()=>{}})},
  "../lib/server/auth":{requireUser:async()=>({id:"owner-a"}),preferredWorkspaceFor:async()=>workspace},
  "../lib/server/db":{database:()=>db},
  "../lib/server/purchase-intents":{activePurchase:async()=>options.purchaseToken||null},
  "../lib/dashboard-navigation":{dashboardHref:(_locale,id,service,section)=>`/w/${id}/${service}/${section}`},
 };
 runInNewContext(compiled,{exports,require:name=>modules[name]??realRequire(name),console:{error:()=>{}},process:{env:{EKMIVO_SUBSCRIPTION_ORDER_PREVIEW:options.preview?"1":"0"}}});
 return {state:()=>state,submit:async fields=>{
  const form=new FormData();
  for(const [key,value] of Object.entries({business_id:workspace.id,step:state.step,...fields}))form.set(key,value);
  try{return await exports.submitBriofoldSetup({status:"idle",message:""},form);}
  catch(error){if(error.location)return {location:error.location};throw error;}
 }};
}

for(const [mode,products] of [["ai",{ai:true,payments:false}],["commerce",{ai:false,payments:true}],["both",{ai:true,payments:true}]]){
 test(`${mode} onboarding changes services and audit atomically`,async()=>{
  const f=fixture();assert.equal((await f.submit({mode})).location,"/setup");
  assert.deepEqual(f.state().products,products);assert.equal(f.state().step,"billing");
  assert.equal(f.state().audit.length,Object.values(products).filter(Boolean).length);
 });
}
test("missing second product rolls back the first product and its audit",async()=>{
 const f=fixture({products:{ai:false}});const before=structuredClone(f.state());
 assert.equal((await f.submit({mode:"both"})).status,"error");assert.deepEqual(f.state(),before);
});
test("stale business tab cannot mutate the currently selected business",async()=>{
 const f=fixture();const before=structuredClone(f.state());
 assert.equal((await f.submit({business_id:"business-b",mode:"both"})).status,"error");assert.deepEqual(f.state(),before);
});
for(const role of ["admin","editor","viewer",null])test(`${role} cannot self-enable services`,async()=>{
 const f=fixture({role});assert.equal((await f.submit({mode:"both"})).status,"error");assert.equal(f.state().step,"services");assert.equal(f.state().audit.length,0);
});
test("stale submitted step does not skip onboarding",async()=>{
 const f=fixture();assert.equal((await f.submit({step:"billing",plan:"free"})).status,"error");assert.equal(f.state().step,"services");
});
test("AI-only billing uses locked current access, without a Gateway plan",async()=>{
 const f=fixture({step:"billing",products:{ai:true,payments:false},workspace:{mode:"both"}});
 assert.equal((await f.submit({})).location,"/dashboard");assert.equal(f.state().selected,null);assert.deepEqual(f.state().claims,[]);
});
test("completed Store setup resumes the original opaque selection after verified onboarding",async()=>{
 const token="Z".repeat(43);
 const f=fixture({step:"billing",products:{payments:true},purchaseToken:token});
 assert.equal((await f.submit({plan:"paid"})).location,"/subscribe/resume/"+token);
 assert.deepEqual(f.state().claims,[]);
 const already=fixture({step:"complete",products:{payments:true},purchaseToken:token});
 assert.equal((await already.submit({step:"billing",plan:"paid"})).location,"/subscribe/resume/"+token);
});
test("newly enabled Payments cannot bypass billing with stale AI-only mode",async()=>{
 const f=fixture({step:"billing",products:{ai:true,payments:true},workspace:{mode:"ai"}});
 assert.equal((await f.submit({})).status,"error");assert.equal(f.state().step,"billing");
});
for(const plan of ["custom","missing"]){
 test(`reject unavailable ${plan} plan without completing onboarding`,async()=>{
  const f=fixture({step:"billing",products:{payments:true}});assert.equal((await f.submit({plan})).status,"error");assert.equal(f.state().step,"billing");
 });
}
test("free plan claims the actual subscription; failure rolls back setup",async()=>{
 const f=fixture({step:"billing",products:{payments:true}});assert.equal((await f.submit({plan:"free"})).location,"/dashboard");assert.deepEqual(f.state().claims,["free"]);
 const failed=fixture({step:"billing",products:{payments:true},claimError:true});assert.equal((await failed.submit({plan:"free"})).status,"error");assert.equal(failed.state().step,"billing");
});
test("paid plan navigates to explicit confirmation without granting a subscription",async()=>{
 const f=fixture({step:"billing",products:{payments:true}});
 assert.equal((await f.submit({plan:"paid"})).location,"/w/business-a/payments/billing?tab=plans&plan=paid");
 assert.deepEqual(f.state().claims,[]);
 const preview=fixture({step:"billing",products:{payments:true},preview:true});
 assert.equal((await preview.submit({plan:"paid"})).location,"/checkout/order/paid");
 assert.deepEqual(preview.state().claims,[]);
});
test("replaying a completed billing step goes to dashboard without another purchase",async()=>{
 const f=fixture({step:"complete",products:{payments:true}});assert.equal((await f.submit({step:"billing",plan:"paid"})).location,"/dashboard");assert.deepEqual(f.state().claims,[]);
});
test("invited members are not redirected into owner-only setup",async()=>{
 const onboarding=readFileSync(new URL("../src/lib/server/briofold-onboarding.ts",import.meta.url),"utf8");
 const code=ts.transpileModule(onboarding,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const role of ["owner","admin","editor","viewer"]){
  const exports={};
  const sql=async (parts)=>{
   const query=parts.join("?");
   if(query.includes("to_regclass"))return [{table_name:"briofold_business_onboarding"}];
   // The double enforces the owner predicate only when production asks for it.
   return role!=="owner"&&query.includes("m.role='owner'")?[]:[{step:"business"}];
  };
  runInNewContext(code,{exports,require:name=>name==="server-only"?{}:{database:()=>sql}});
  assert.equal(await exports.onboardingState({id:"business-a"},"member"),role==="owner"?"business":null);
 }
});

test("transferred current owner can complete business setup without historical creator access",async()=>{
 const f=fixture({originalOwnerTransferred:true});
 assert.equal((await f.submit({mode:"ai"})).location,"/setup");
 assert.equal(f.state().step,"billing");
 const read=readFileSync(new URL("../src/lib/server/briofold-onboarding.ts",import.meta.url),"utf8");
 assert.match(read,/JOIN workspace_members m ON m\.workspace_id=o\.workspace_id AND m\.user_id=\$\{userId\}::uuid/);
 assert.match(read,/m\.role='owner'/);
 assert.doesNotMatch(read,/o\.owner_id=\$\{userId\}/);
});
test("former owner who is now admin cannot mutate unfinished onboarding",async()=>{
 const f=fixture({role:"admin",originalOwnerTransferred:true});
 assert.equal((await f.submit({mode:"ai"})).status,"error");
 assert.equal(f.state().step,"services");
});

test("business setup saves the current thirteen-field Store profile",async()=>{
 const f=fixture({step:"business"});const before=structuredClone(f.state().profile.body);
 assert.equal((await f.submit({name:"Fixture shop",business_type:"service",description:"Fixture summary",address:"Fixture address"})).location,"/setup");
 assert.equal(f.state().step,"services");assert.equal(f.state().businessName,"Fixture shop");
 assert.deepEqual(structuredClone(f.state().profile.body),{...before,name:"Fixture shop",business_type:"service",description:"Fixture summary",address:"Fixture address"});
});
test("stage update failure rolls back Store identity and workspace name",async()=>{
 const f=fixture({step:"business",stageError:true}),before=structuredClone(f.state());
 assert.equal((await f.submit({name:"Fixture shop",business_type:"online"})).status,"error");
 assert.deepEqual(f.state(),before);
});
