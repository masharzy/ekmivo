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
 let state={step:"services",role:"owner",products:{ai:false,payments:false},mode:"off",audit:[],claims:[],...options};
 const workspace={id:"business-a",mode:"both",...options.workspace};
 const db={begin:async callback=>{
  const draft=structuredClone(state);
  const tx=async (parts,...values)=>{
   const query=parts.join("?").replace(/\s+/g," ").trim();
   if(query.startsWith("SELECT role FROM workspace_members"))return draft.role?[{role:draft.role}]:[];
   if(query.startsWith("SELECT step FROM briofold_business_onboarding"))return draft.step?[{step:draft.step}]:[];
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
  const result=await callback(tx);
  state=draft;
  return result;
 }};
 const exports={};
 const redirect=path=>{throw Object.assign(Error("redirect"),{location:path});};
 const modules={
  "next/navigation":{redirect},"next/cache":{revalidatePath:()=>{}},
  "../lib/server/auth":{requireUser:async()=>({id:"owner-a"}),preferredWorkspaceFor:async()=>workspace},
  "../lib/server/db":{database:()=>db},
 };
 runInNewContext(compiled,{exports,require:name=>modules[name]??realRequire(name),console:{error:()=>{}}});
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
 const f=fixture({step:"billing",products:{payments:true}});assert.equal((await f.submit({plan:"paid"})).location,"/settings/billing?tab=plans&plan=paid");assert.deepEqual(f.state().claims,[]);
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
