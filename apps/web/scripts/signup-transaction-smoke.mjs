// Unit simulation of the real server action: no real account/database writes.
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),ts=require("typescript");
const source=await readFile(new URL("../src/actions/account.ts",import.meta.url),"utf8");
const validationCode=ts.transpileModule(await readFile(new URL("../src/lib/password-policy.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const policy={exports:{}};runInNewContext(validationCode,{module:policy,exports:policy.exports});
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
for(const scenario of ["success","legacy-success","duplicate","workspace-failure","onboarding-failure","invalid-password"]){
 const writes=[],authEvents=[];
 const db={begin:async callback=>{
  const staged=[];
  const sql=async parts=>{const query=parts.join("?");
   if(query.includes("INSERT INTO app_users")){if(scenario==="duplicate")return [];staged.push("user");return [{id:"user-id"}]}
   if(query.includes("INSERT INTO workspaces")){if(scenario==="workspace-failure")throw Error("simulated workspace failure");staged.push("workspace");return [{id:"workspace-id"}]}
   if(query.includes("to_regclass"))return [{ready:scenario!=="legacy-success"?"briofold_business_onboarding":null,primary_ready:scenario!=="legacy-success"?"platform_primary_stores":null}];
   if(query.includes("INSERT INTO platform_primary_stores")){staged.push("primary-store");return []}
   if(query.includes("INSERT INTO briofold_business_onboarding")){if(scenario==="onboarding-failure")throw Error("simulated onboarding failure");staged.push("onboarding");return []}
   if(query.includes("INSERT INTO workspace_members")){staged.push("owner-membership");return []}
   throw Error("Unexpected SQL operation");
  };
  const result=await callback(sql);writes.push(...staged);return result;
 }};
 const mocks={
  "next/cache":{revalidatePath:()=>{}},
  "next/navigation":{redirect:path=>{throw Object.assign(Error("redirect"),{digest:"NEXT_REDIRECT",path})}},
  "next/headers":{cookies:async()=>({})},
  "../lib/server/email":{verificationEnabled:async()=>false,mailReady:()=>true},
  "../lib/server/db":{database:()=>db},
  "../lib/server/auth":{passwordHash:async()=>"simulated-hash",createSession:async()=>authEvents.push("session"),selectDefaultWorkspace:async()=>authEvents.push("default-workspace")},
  "../lib/server/validation":{safeLocale:v=>v==="bn"?"bn":"en",asText:v=>typeof v==="string"?v.trim():"",validatedName:v=>v.length>=2&&v.length<=100,validEmail:v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),strongPassword:policy.exports.validNewPassword}
 };
 const actionModule={exports:{}};
 runInNewContext(code,{module:actionModule,exports:actionModule.exports,require:name=>{assert.ok(mocks[name],"Unexpected import "+name);return mocks[name]},console:{error:()=>{}}});
 const form=new FormData();for(const [k,v] of Object.entries({email:"unit@example.invalid",password:scenario==="invalid-password"?"12345678":"hello123",confirm:scenario==="invalid-password"?"12345678":"hello123",name:"Unit Test",workspace_name:"Test Business"}))form.set(k,v);
 let result;try{result=await actionModule.exports.registerAction("en",{status:"idle",message:""},form)}catch(e){assert.ok(["success","legacy-success"].includes(scenario));assert.equal(e.path,"/workspaces/open")}
 if(["success","legacy-success"].includes(scenario)){assert.deepEqual(writes,["user","workspace","owner-membership",...(scenario==="success"?["primary-store","onboarding"]:[])]);assert.deepEqual(authEvents,["session","default-workspace"])}
 else{assert.deepEqual(writes,[]);assert.deepEqual(authEvents,[]);assert.equal(result.status,"error")}
 console.log("PASS (simulation): signup "+scenario);
}
