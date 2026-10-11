import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import postgres from "postgres";
const raw=process.env.PG00_TEST_DATABASE_URL;
if(!raw)throw Error("PG03 requires PG00_TEST_DATABASE_URL");
const url=new URL(raw);
if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||/prod/i.test(url.pathname))throw Error("Never run PG03 credentials test against production");
const sql=postgres(raw,{max:1,prepare:false});
const migration=await readFile(new URL("../../../infra/migrations/0007_pg03_merchant_keys.sql",import.meta.url),"utf8");
try{
 await sql.unsafe(migration);
 const rls=await sql`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
  WHERE relname IN ('merchant_api_keys','merchant_api_key_audit')`;
 assert.equal(rls.length,2);
 assert.ok(rls.every(row=>row.relrowsecurity&&row.relforcerowsecurity),"Both key/audit tables must FORCE RLS");
 const [u1,u2]=[randomUUID(),randomUUID()],[w1,w2]=[randomUUID(),randomUUID()];
 const publicId=randomBytes(8).toString("hex");
 const secret=`ek_test_${publicId}_${randomBytes(32).toString("base64url")}`;
 const digest=createHash("sha256").update(secret).digest("hex");
 try{
  await sql.begin(async tx=>{
   for(const [i,uid] of [u1,u2].entries()){
    await tx`INSERT INTO app_users(id,email,display_name,password_hash)
     VALUES(${uid}::uuid,${"pg03-"+uid+"@example.invalid"},'PG03 Isolated','not-a-password')`;
    await tx`INSERT INTO workspaces(id,name,service_mode,created_by)
     VALUES(${[w1,w2][i]}::uuid,'PG03 Tenant','commerce',${uid}::uuid)`;
    await tx`INSERT INTO workspace_members(workspace_id,user_id,role)
     VALUES(${[w1,w2][i]}::uuid,${uid}::uuid,'owner')`;
   }
   const rows=await tx`INSERT INTO merchant_api_keys
    (workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at)
    VALUES(${w1}::uuid,'sandbox',${publicId},${digest},
      'CI test client',${["payments:read"]},${u1}::uuid,now()+interval '7 days') RETURNING id`;
   const keyId=String(rows[0].id);
   await tx`INSERT INTO merchant_api_key_audit(workspace_id,environment,key_id,actor_id,action)
    VALUES(${w1}::uuid,'sandbox',${keyId}::uuid,${u1}::uuid,'created')`;
   assert.equal((await tx`SELECT secret_digest FROM merchant_api_keys WHERE id=${keyId}::uuid`)[0].secret_digest.trim(),digest);
   assert.equal((await tx`SELECT position(${secret} IN secret_digest) AS p FROM merchant_api_keys WHERE id=${keyId}::uuid`)[0].p,0,"Raw credential persisted");
   const lookup=async(id,hash)=>await tx`SELECT key_id::text,tenant_id::text,realm,allowed_scopes FROM resolve_merchant_api_key(${id},${hash})`;
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   const ok=await lookup(publicId,digest);
   assert.equal(ok.length,1);assert.equal(ok[0].tenant_id,w1);assert.equal(ok[0].realm,"sandbox");
   assert.equal((await lookup(publicId,createHash("sha256").update(secret+"wrong").digest("hex"))).length,0,"Invalid secret accepted");
   assert.equal((await lookup("f".repeat(16),digest)).length,0,"Public ID mismatch accepted");
   const prohibited=await tx`SELECT has_table_privilege(current_user,'merchant_api_keys','SELECT') AS readable,
    has_table_privilege(current_user,'merchant_api_keys','UPDATE') AS mutable`;
   assert.equal(prohibited[0].readable,false);assert.equal(prohibited[0].mutable,false);
   await tx`RESET ROLE`;
   await tx`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${keyId}::uuid`;
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   assert.equal((await lookup(publicId,digest)).length,0,"Revoked secret accepted");
   await tx`RESET ROLE`;
   await tx`UPDATE merchant_api_keys SET revoked_at=NULL,created_at=now()-interval '9 days',expires_at=now()-interval '1 day' WHERE id=${keyId}::uuid`;
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   assert.equal((await lookup(publicId,digest)).length,0,"Expired secret accepted");
   await tx`RESET ROLE`;
   await tx`UPDATE merchant_api_keys SET expires_at=now()+interval '7 days' WHERE id=${keyId}::uuid`;
   await tx`UPDATE workspace_product_access SET enabled=false WHERE workspace_id=${w1}::uuid AND product='payments'`;
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   assert.equal((await lookup(publicId,digest)).length,0,"Disabled product accepted");
   await tx`RESET ROLE`;
   await tx`UPDATE workspace_product_access SET enabled=true WHERE workspace_id=${w1}::uuid AND product='payments'`;
   await tx`UPDATE workspace_environments SET status='suspended' WHERE workspace_id=${w1}::uuid AND environment='sandbox'`;
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   assert.equal((await lookup(publicId,digest)).length,0,"Suspended environment accepted");
   await tx`RESET ROLE`;
   const wrong=await tx`SELECT count(*)::int AS total FROM merchant_api_keys WHERE workspace_id=${w2}::uuid`;
   assert.equal(wrong[0].total,0,"Key leaked to other tenant");
   throw Error("INTENTIONAL_PG03_ROLLBACK");
  });
 }catch(e){if(e.message!=="INTENTIONAL_PG03_ROLLBACK")throw e;}
 assert.equal((await sql`SELECT count(*)::int AS total FROM app_users WHERE id=${u1}::uuid`)[0].total,0);
 console.log("PG03 PASS: 256-bit secret hash-only, scoped resolver, invalid/revoked/expired/disabled/suspended deny, runtime privilege isolation, rollback");
}catch(e){console.error("PG03 FAIL:",e instanceof Error?e.message:"unknown");process.exitCode=1;}
finally{await sql.end({timeout:3});}
