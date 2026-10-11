import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import postgres from "postgres";
import {execFileSync} from "node:child_process";

// PG04 never runs against a real Neon/shared/prod database.
const raw=process.env.PG00_TEST_DATABASE_URL;
if(!raw)throw Error("PG04 requires PG00_TEST_DATABASE_URL");
const url=new URL(raw);
if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||
 !url.pathname||url.pathname==="/"||/prod/i.test(url.pathname))
 throw Error("PG04 test refuses non-ephemeral PostgreSQL targets");
const db=postgres(raw,{max:1,prepare:false});
const migration=await readFile(new URL("../../../infra/migrations/0008_pg04_financial_core.sql",import.meta.url),"utf8");
let assertions=0;
let rolledBackTenant=null;
const ok=(v,msg)=>{assert.ok(v,msg);assertions++};
const same=(x,y,msg)=>{assert.deepEqual(x,y,msg);assertions++};
async function expectSQLReject(tx,fn,code){
 try{await tx.savepoint(async()=>await fn());assert.fail("expected PostgreSQL rejection");}
 catch(err){if(err.code===code){assertions++;return;}throw err;}
}
const digest=()=>randomBytes(32).toString("hex");
const roll=Symbol("rollback");
try{
 // CI has already applied migrations 0001–0007 using the same disposable DB.
 const existing=await db`SELECT to_regclass('public.merchant_api_keys') IS NOT NULL AS exists`;
 ok(existing[0].exists,"PG03 prerequisite missing");
 await db.unsafe(migration).simple();
 const names=["financial_receiving_accounts","payment_intents","payment_attempts",
  "financial_inbound_events","financial_receipt_observations","financial_payments",
  "financial_allocations","financial_idempotency","financial_outbox","financial_jobs"];
 const rls=await db`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
  WHERE relname = ANY(${names})`;
 same(rls.length,10,"missing financial schema");
 ok(rls.every(t=>t.relrowsecurity&&t.relforcerowsecurity),"all tenant tables must force RLS");
 try{
  await db.begin(async tx=>{
   const [userA,userB,spaceA,spaceB]=Array.from({length:4},randomUUID);
   rolledBackTenant=spaceA;
   for(const [u,w] of [[userA,spaceA],[userB,spaceB]]){
    await tx`INSERT INTO app_users(id,email,display_name,password_hash)
     VALUES(${u}::uuid,${"pg04-"+u+"@example.invalid"},'PG04 test','invalid-only-fixture')`;
    await tx`INSERT INTO workspaces(id,name,service_mode,created_by)
     VALUES(${w}::uuid,'PG04 isolated workspace','commerce',${u}::uuid)`;
    await tx`INSERT INTO workspace_members(workspace_id,user_id,role)
     VALUES(${w}::uuid,${u}::uuid,'owner')`;
   }
   const a=(await tx`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix)
    VALUES(${spaceA}::uuid,'sandbox','bkash',${digest()},'1234') RETURNING id`)[0].id;
   const b=(await tx`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix)
    VALUES(${spaceB}::uuid,'live','bkash',${digest()},'1234') RETURNING id`)[0].id;
   const [intentA,intentB]=[randomUUID(),randomUUID()];
   for(const [w,env,i] of [[spaceA,"sandbox",intentA],[spaceB,"live",intentB]]){
    await tx`INSERT INTO payment_intents(id,workspace_id,environment,merchant_reference,amount_minor,expires_at)
     VALUES(${i}::uuid,${w}::uuid,${env},${"ref-"+i},7500,now()+interval '1 hour')`;
   }
   const payerA=digest();
   const attemptA=(await tx`INSERT INTO payment_attempts
    (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
    VALUES(${spaceA}::uuid,'sandbox',${intentA}::uuid,${a}::uuid,${payerA},'5678',7500,'bkash',now(),now()+interval '15 minutes',1)
    RETURNING id`)[0].id;
   await expectSQLReject(tx,()=>tx`INSERT INTO payment_attempts
    (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
    VALUES(${spaceA}::uuid,'sandbox',${intentB}::uuid,${a}::uuid,${digest()},'5678',7500,'bkash',now(),now()+interval '15 minutes',1)`,"23514");
   await expectSQLReject(tx,()=>tx`INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at)
    VALUES(${spaceA}::uuid,'sandbox','bad amount',-1,now()+interval '1 minute')`,"23514");
   await expectSQLReject(tx,()=>tx`UPDATE payment_attempts SET payer_suffix='0000' WHERE id=${attemptA}::uuid`,"55000");

   const event=(await tx`INSERT INTO financial_inbound_events
    (workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
    VALUES(${spaceA}::uuid,'sandbox','sandbox_fixture','evt-01',${digest()},now(),${randomBytes(48)})
    RETURNING id`)[0].id;
   await expectSQLReject(tx,()=>tx`INSERT INTO financial_inbound_events
    (workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
    VALUES(${spaceA}::uuid,'sandbox','sandbox_fixture','evt-01',${digest()},${randomBytes(48)})`,"23505");
   const observation=(await tx`INSERT INTO financial_receipt_observations
    (workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,
     method,direction,original_transaction_at,time_precision,parser_version)
    VALUES(${spaceA}::uuid,'sandbox',${event}::uuid,${a}::uuid,${digest()},${payerA},7500,'bkash','incoming',now(),'second',1)
    RETURNING id`)[0].id;
   const payment=(await tx`INSERT INTO financial_payments
    (workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
    VALUES(${spaceA}::uuid,'sandbox',${attemptA}::uuid,${observation}::uuid,7500,'sandbox_fixture',1)
    RETURNING id`)[0].id;
   await tx`INSERT INTO financial_allocations
    (workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${spaceA}::uuid,'sandbox',${payment}::uuid,${intentA}::uuid,3500)`;
   await expectSQLReject(tx,()=>tx`INSERT INTO financial_allocations
    (workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${spaceA}::uuid,'sandbox',${payment}::uuid,${intentA}::uuid,1000)`,"23505");
   // New distinct payment: amount cap is enforced even without uniqueness conflict.
   const intentC=randomUUID(),attemptC=randomUUID(),evtC=randomUUID(),obsC=randomUUID(),payerC=digest();
   await tx`INSERT INTO payment_intents(id,workspace_id,environment,merchant_reference,amount_minor,expires_at)
    VALUES(${intentC}::uuid,${spaceA}::uuid,'sandbox','another payment',7500,now()+interval '1 hour')`;
   await tx`INSERT INTO payment_attempts(id,workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
    VALUES(${attemptC}::uuid,${spaceA}::uuid,'sandbox',${intentC}::uuid,${a}::uuid,${payerC},'5678',7500,'bkash',now(),now()+interval '15 minutes',1)`;
   await tx`INSERT INTO financial_inbound_events(id,workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
    VALUES(${evtC}::uuid,${spaceA}::uuid,'sandbox','sandbox_fixture','evt-02',${digest()},${randomBytes(48)})`;
   await tx`INSERT INTO financial_receipt_observations(id,workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
    VALUES(${obsC}::uuid,${spaceA}::uuid,'sandbox',${evtC}::uuid,${a}::uuid,${payerC},7500,'bkash','incoming',now(),'second',1)`;
   const payC=(await tx`INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
    VALUES(${spaceA}::uuid,'sandbox',${attemptC}::uuid,${obsC}::uuid,7500,'sandbox_fixture',1) RETURNING id`)[0].id;
   await expectSQLReject(tx,()=>tx`INSERT INTO financial_allocations
    (workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${spaceA}::uuid,'sandbox',${payC}::uuid,${intentA}::uuid,5000)`,"23514");
   // RLS requires validated actor+workspace+realm: none means no rows.
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   same((await tx`SELECT count(*)::int n FROM payment_intents`)[0].n,0,"missing RLS context leaked");
   const grants=await tx`SELECT has_table_privilege(current_user,'financial_payments','INSERT') AS paid_write,
     has_table_privilege(current_user,'financial_inbound_events','SELECT') AS raw_read`;
   ok(!grants[0].paid_write&&!grants[0].raw_read,"restricted API role could fake a payment/read raw evidence");
   await tx`SELECT set_config('ekmivo.user_id',${userA},true),
    set_config('ekmivo.workspace_id',${spaceA},true),
    set_config('ekmivo.environment','sandbox',true)`;
   same((await tx`SELECT count(*)::int n FROM payment_intents`)[0].n,2,"sandbox tenant projection");
   await tx`SELECT set_config('ekmivo.environment','live',true)`;
   same((await tx`SELECT count(*)::int n FROM payment_intents`)[0].n,0,"wrong realm leaked");
   await tx`SELECT set_config('ekmivo.workspace_id',${spaceB},true)`;
   same((await tx`SELECT count(*)::int n FROM payment_intents`)[0].n,0,"cross-workspace leaked");
   await tx`RESET ROLE`;
   // Atomic event/job pair, claim ownership, stale-token rejection and ack.
   const outbox=(await tx`INSERT INTO financial_outbox
    (workspace_id,environment,event_key,event_kind,payload)
    VALUES(${spaceA}::uuid,'sandbox','pg04-test-a','pg04.audit',${tx.json({schema_version:1,action:"durability_probe"})}) RETURNING id`)[0].id;
   await tx`INSERT INTO financial_jobs(workspace_id,environment,outbox_id,queue)
    VALUES(${spaceA}::uuid,'sandbox',${outbox}::uuid,'financial:sandbox')`;
   const tokenA=randomUUID(),tokenB=randomUUID();
   const claimed=await tx`SELECT * FROM financial_claim_audit_job('sandbox',${tokenA}::uuid,30)`;
   same(claimed.length,1,"job not durably claimed");
   same((await tx`SELECT * FROM financial_claim_audit_job('sandbox',${tokenB}::uuid,30)`).length,0,"double claim allowed");
   same((await tx`SELECT financial_ack_audit_job(${claimed[0].job_id}::uuid,${tokenB}::uuid) ok`)[0].ok,false,"stale token acknowledged job");
   same((await tx`SELECT financial_ack_audit_job(${claimed[0].job_id}::uuid,${tokenA}::uuid) ok`)[0].ok,true,"valid ACK failed");
   same((await tx`SELECT * FROM financial_claim_audit_job('sandbox',${tokenB}::uuid,30)`).length,0,"acked job requeued");

   // Verify no accidental fixture data survives the transaction rollback.
   throw roll;
  });
 }catch(error){if(error!==roll)throw error}
 // A separate process can operate on newly committed ephemeral schema and fixtures.
 execFileSync("go",["test","./internal/financial","-count=1","-v"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env:process.env
 });
 const rows=await db`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${rolledBackTenant}::uuid`;
 same(rows[0].n,0,"financial fixture transaction leaked");
 console.log("PG04 PASS:",assertions,"assertions; local migrations, FORCE RLS, tenant/env, monetary caps, immutability, job leases, Go integration");
}catch(err){
 console.error("PG04 FAIL:",err instanceof Error?err.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[redacted]"):"unknown","code:",err?.code,"position:",err?.position,"where:",err?.where);
 process.exitCode=1;
}finally{await db.end({timeout:3})}
