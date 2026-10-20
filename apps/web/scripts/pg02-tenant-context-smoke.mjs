// Isolated PostgreSQL check for the PG02 workspace-context selector query.
// Refuses remote databases and rolls back every synthetic identity.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import postgres from "postgres";

const raw=process.env.PG00_TEST_DATABASE_URL;
if(!raw)throw Error("PG02 missing PG00_TEST_DATABASE_URL");
const uri=new URL(raw);
if(!["localhost","127.0.0.1","[::1]"].includes(uri.hostname)||/prod/i.test(uri.pathname))throw Error("PG02 isolated DB only");
const sql=postgres(raw,{max:1,prepare:false});
const a={user:randomUUID(),workspace:randomUUID()},b={user:randomUUID(),workspace:randomUUID()};
const actorRows=async(tx,user,workspace)=>tx`
 SELECT env.environment,env.status
 FROM workspace_environments env
 JOIN workspace_members member ON member.workspace_id=env.workspace_id
 JOIN app_users actor ON actor.id=member.user_id
 WHERE env.workspace_id=${workspace}::uuid
 AND member.user_id=${user}::uuid
 AND actor.disabled_at IS NULL
 AND env.environment IN ('sandbox','live')
 ORDER BY env.environment`;
try{
 try{
  await sql.begin(async tx=>{
   for(const fixture of [a,b]){
    await tx`INSERT INTO app_users(id,email,display_name,password_hash)
     VALUES(${fixture.user}::uuid,${"pg02-"+fixture.user+"@example.invalid"},'PG02 Tester','never-a-password')`;
    await tx`INSERT INTO workspaces(id,name,service_mode,created_by)
     VALUES(${fixture.workspace}::uuid,'PG02 Isolated Workspace','both',${fixture.user}::uuid)`;
    await tx`INSERT INTO workspace_members(workspace_id,user_id,role)
     VALUES(${fixture.workspace}::uuid,${fixture.user}::uuid,'owner')`;
   }
   assert.deepEqual((await actorRows(tx,a.user,a.workspace)).map(x=>x.environment),["live","sandbox"]);
   assert.equal((await actorRows(tx,a.user,b.workspace)).length,0,"Cross-business access leaked");
   assert.equal((await actorRows(tx,b.user,a.workspace)).length,0,"Reverse cross-business access leaked");
   await tx`UPDATE workspace_environments SET status='suspended'
    WHERE workspace_id=${a.workspace}::uuid AND environment='live'`;
   const allowed=(await actorRows(tx,a.user,a.workspace)).filter(x=>x.status==="active");
   assert.deepEqual(allowed.map(x=>x.environment),["sandbox"],"Suspended live context was selectable");
   await tx`UPDATE app_users SET disabled_at=now() WHERE id=${a.user}::uuid`;
   assert.equal((await actorRows(tx,a.user,a.workspace)).length,0,"Disabled user retained selector access");
   await tx`DELETE FROM workspace_members WHERE workspace_id=${b.workspace}::uuid AND user_id=${b.user}::uuid`;
   assert.equal((await actorRows(tx,b.user,b.workspace)).length,0,"Revoked membership retained selector access");
   throw Error("INTENTIONAL_PG02_ROLLBACK");
  });
 }catch(e){if(e.message!=="INTENTIONAL_PG02_ROLLBACK")throw e;}
 const row=await sql`SELECT count(*)::int AS n FROM app_users WHERE id=${a.user}::uuid`;
 assert.equal(row[0].n,0,"Synthetic data was not rolled back");
 console.log("PG02 PASS: real membership-scoped business context, live suspension, disabled/removed actor and rollback");
}catch(e){
 console.error("PG02 context FAIL:",e instanceof Error?e.message:"unknown");
 process.exitCode=1;
}finally{await sql.end({timeout:3});}

if(!process.exitCode)await import("./briofold-business-context-smoke.mjs");
