// Run the actual RSC auth/business resolver against disposable CI PostgreSQL.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import * as crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import postgres from "postgres";
const raw=process.env.PG00_TEST_DATABASE_URL;
if(!raw)throw Error("Phase2 context database missing");
const uri=new URL(raw);
if(!["localhost","127.0.0.1","[::1]"].includes(uri.hostname)||/prod/i.test(uri.pathname))throw Error("Phase2 context refuses shared databases");
const db=postgres(raw,{max:1,prepare:false});
const actor=randomUUID(),stranger=randomUUID(),first=randomUUID(),second=randomUUID(),outside=randomUUID();
const token=randomUUID(),hash=createHash("sha256").update(token).digest("hex");
const rollback="PHASE2_CONTEXT_FIXTURE_ROLLBACK";
let assertions=0;
const eq=(a,b)=>{assert.deepEqual(a,b);assertions++;};
try{
 try{
  await db.begin(async tx=>{
   for(const id of [actor,stranger])await tx.unsafe("INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES($1,$2,'Phase2 context fixture','not-a-password',now())",[id,id+"@example.invalid"]);
   for(const [id,owner,age] of [[first,actor,1],[second,actor,2],[outside,stranger,3]]){
    await tx.unsafe("INSERT INTO workspaces(id,name,service_mode,created_by,created_at) VALUES($1,'Phase2 context fixture','both',$2,now()-$3::int*interval '1 minute')",[id,owner,age]);
    await tx.unsafe("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[id,owner]);
   }
   await tx.unsafe("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[actor,hash]);
   const values=new Map([["ekmivo-session",token]]);
   const jar={get:key=>values.has(key)?{value:values.get(key)}:undefined,set:(key,value)=>values.set(key,value),delete:key=>values.delete(key)};
   const exports={};
   const redirect=href=>{const error=new Error("TEST_REDIRECT");error.href=href;throw error;};
   const dependencies={
    "server-only":{},"next/headers":{cookies:async()=>jar},"next/navigation":{redirect},
    "node:crypto":crypto,"./db":{database:()=>tx},"./email":{verificationEnabled:async()=>true},
    react:{cache:fn=>fn},"./admin-trusted-devices":{rememberedAdminDevice:async()=>null}
   };
   const source=await readFile(new URL("../src/lib/server/auth.ts",import.meta.url),"utf8");
   const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
   vm.runInNewContext(js,{exports,Buffer,process,require:id=>{
    if(!Object.hasOwn(dependencies,id))throw Error("Unexpected auth dependency "+id);return dependencies[id];
   }},{timeout:5000});
   const redirected=async(fn,href)=>{await assert.rejects(fn,e=>e.message==="TEST_REDIRECT"&&e.href===href);assertions++;};
   eq((await exports.preferredWorkspaceFor(actor)).id,first);
   values.set("ekmivo-default-workspace",actor+":"+second);
   eq((await exports.preferredWorkspaceFor(actor)).id,second);
   values.set("ekmivo-default-workspace",stranger+":"+second);
   eq((await exports.preferredWorkspaceFor(actor)).id,first);
   values.set("ekmivo-default-workspace",actor+":"+outside);
   eq((await exports.preferredWorkspaceFor(actor)).id,first);
   eq(await exports.selectDefaultWorkspace(actor,outside),false);
   eq(await exports.selectDefaultWorkspace(actor,second),true);
   eq(values.get("ekmivo-default-workspace"),actor+":"+second);
   await redirected(()=>exports.requireWorkspace("en",outside),"/workspaces");
   for(const role of ["owner","admin","editor","viewer"]){
    await tx.unsafe("UPDATE workspace_members SET role=$1 WHERE workspace_id=$2 AND user_id=$3",[role,second,actor]);
    eq((await exports.preferredWorkspaceFor(actor)).role,role);
    const permitted=await exports.requireWorkspace("en",second);
    eq(permitted.user.id,actor);eq(permitted.workspace.id,second);eq(permitted.workspace.role,role);
   }
   await tx.unsafe("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[second,actor]);
   eq((await exports.preferredWorkspaceFor(actor)).id,first);
   eq(await exports.selectDefaultWorkspace(actor,second),false);
   await redirected(()=>exports.requireWorkspace("en",second),"/workspaces");
   await tx.unsafe("UPDATE app_users SET email_verified_at=NULL WHERE id=$1",[actor]);
   eq((await exports.currentUser()).verified,false);
   await redirected(()=>exports.requireUser("en"),"/verify-email");
   await redirected(()=>exports.requireWorkspace("en",first),"/verify-email");
   await tx.unsafe("UPDATE app_users SET email_verified_at=now() WHERE id=$1",[actor]);
   await tx.unsafe("UPDATE app_users SET disabled_at=now() WHERE id=$1",[actor]);
   eq(await exports.currentUser(),null);
   await redirected(()=>exports.requireWorkspace("en",first),"/login");
   await tx.unsafe("UPDATE app_users SET disabled_at=NULL WHERE id=$1",[actor]);
   await tx.unsafe("UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",[hash]);
   eq(await exports.currentUser(),null);
   await tx.unsafe("UPDATE auth_sessions SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE token_hash=$1",[hash]);
   eq(await exports.currentUser(),null);
   await redirected(()=>exports.requireUser("en"),"/login");
   throw Error(rollback);
  });
 }catch(error){if(error.message!==rollback)throw error;}
 eq((await db.unsafe("SELECT count(*)::int AS n FROM app_users WHERE id IN ($1,$2)",[actor,stranger]))[0].n,0);
 console.log("Phase2 actual server resolver PostgreSQL PASS:",assertions,"assertions; fixture rollback confirmed");
}finally{await db.end({timeout:3});}
