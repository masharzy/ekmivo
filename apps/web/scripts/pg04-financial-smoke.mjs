import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import postgres from "postgres";

const control=process.env.PG00_TEST_DATABASE_URL;
if(!control)throw Error("PG04 isolated CI requires PG00_TEST_DATABASE_URL");
const source=new URL(control);
if(!["127.0.0.1","localhost","[::1]"].includes(source.hostname)||!source.pathname||/prod/i.test(source.pathname))
 throw Error("PG04 tests refuse remote/shared databases");
const admin=postgres(control,{max:1,prepare:false});
const ds=(db,user,password)=>{
 const u=new URL(control);u.pathname="/"+db;
 if(user){u.username=user;u.password=password}
 return u.toString();
};
const names=["sandbox","live"];
let count=0;
const ok=(v,msg)=>{assert.ok(v,msg);count++};
const same=(a,b,msg)=>{assert.deepEqual(a,b,msg);count++};
async function reject(tx,fn,code){
 try{if(typeof tx.savepoint==='function')await tx.savepoint(async()=>await fn());else await fn();assert.fail("unexpected successful SQL mutation")}
 catch(err){if(err.code===code){count++;return}throw err}
}
const hmac=()=>randomBytes(32).toString("hex");
const rollback=Symbol("PG04_ROLLBACK");
const controls=[];
const dbs={};
try{
 // The already-migrated control database must remain untouched; finance owns
 // neither app_users nor merchant secrets nor control memberships.
 const check=await admin`SELECT to_regclass('public.merchant_api_keys') IS NOT NULL AS exists`;
 ok(check[0].exists,"PG03 control source missing");
 const adminSQL=`DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_finance_reader') THEN
   CREATE ROLE ekmivo_finance_reader NOLOGIN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_worker') THEN
   CREATE ROLE ekmivo_financial_worker NOLOGIN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_provisioner') THEN
   CREATE ROLE ekmivo_financial_provisioner NOLOGIN;
  END IF;
 END $$;`;
 await admin.unsafe(adminSQL).simple();
 for(const realm of names){
  const roles=[
   ["migrate",`pg04-${realm}-migration-only`,null],
   ["worker",`pg04-${realm}-worker-only`,"ekmivo_financial_worker"],
   ["reader",`pg04-${realm}-reader-only`,"ekmivo_finance_reader"],
   ["provisioner",`pg04-${realm}-provision-only`,"ekmivo_financial_provisioner"]
  ];
  for(const [suffix,password,group] of roles){
   const role=suffix==="migrate"?`ekmivo_pg04_migrate_${realm}`:suffix==="worker"?`ekmivo_financial_worker_${realm}`:suffix==="reader"?`ekmivo_finance_reader_${realm}`:`ekmivo_financial_provisioner_${realm}`;
   await admin.unsafe(`CREATE ROLE "${role}" LOGIN INHERIT PASSWORD '${password}'`);
   if(group)await admin.unsafe(`GRANT "${group}" TO "${role}"`);
  }
  const name=`ekmivo_pg04_${realm}`;
  await admin.unsafe(`CREATE DATABASE "${name}" OWNER "ekmivo_pg04_migrate_${realm}"`);
  await admin.unsafe(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`);
  for(const prefix of ["ekmivo_financial_worker","ekmivo_finance_reader","ekmivo_financial_provisioner"]){
   await admin.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO "${prefix}_${realm}"`);
  }
 }
 const env={
  ...process.env,
  PG04_ALLOW_MIGRATION:"true",
  PG04_SANDBOX_MIGRATION_DATABASE_URL:ds("ekmivo_pg04_sandbox","ekmivo_pg04_migrate_sandbox","pg04-sandbox-migration-only"),
  PG04_LIVE_MIGRATION_DATABASE_URL:ds("ekmivo_pg04_live","ekmivo_pg04_migrate_live","pg04-live-migration-only"),
  PG04_FINANCIAL_MIGRATION_FILE:new URL("../../../infra/migrations/0008_pg04_financial_core.sql",import.meta.url).pathname,
 };
 console.log("PG04 creating independent physical finance DBs with realm-only roles");
 execFileSync("go",["run","./cmd/financial-migrate"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env,timeout:100000
 });
 // Repeat migration must be idempotent and never reassign the installed realm.
 execFileSync("go",["run","./cmd/financial-migrate"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env,timeout:100000
 });
 for(const realm of names){
  dbs[realm]=postgres(ds(`ekmivo_pg04_${realm}`),{max:1,prepare:false});
  const x=await dbs[realm]`SELECT
   (SELECT environment FROM financial_realm WHERE singleton=true) AS realm,
   to_regclass('public.auth_sessions') IS NULL AS no_sessions,
   to_regclass('public.merchant_api_keys') IS NULL AS no_keys,
   to_regclass('public.river_job') IS NOT NULL AS river,
   to_regclass('public.financial_outbox') IS NOT NULL AS outbox`;
  same(x[0].realm,realm,"physical realm mismatch");
  ok(x[0].no_sessions&&x[0].no_keys,"control-plane data leaked into finance");
  ok(x[0].river&&x[0].outbox,"River/domain migration missing");
 }
 for(const realm of names){
  const db=dbs[realm];
  const w=randomUUID();
  controls.push([realm,w]);
  same((await db`SELECT financial_sync_workspace(${w}::uuid,${realm},1,true) AS applied`)[0].applied,true);
  await reject(db,()=>db`SELECT financial_sync_workspace(${w}::uuid,${realm==="sandbox"?"live":"sandbox"},2,true)`,"22023");
  const tables=["financial_workspace_registry","financial_receiving_accounts","payment_intents","payment_attempts",
   "financial_inbound_events","financial_receipt_observations","financial_payments",
   "financial_allocations","financial_idempotency","financial_outbox","financial_audit_processed"];
  const rls=await db`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY(${tables})`;
  same(rls.length,tables.length,"missing domain table");
  ok(rls.every(x=>x.relrowsecurity&&x.relforcerowsecurity),"FORCE RLS missing");
  const roles=await db`SELECT rolname FROM pg_roles WHERE rolname IN
   (${"ekmivo_finance_reader_"+realm},${"ekmivo_financial_worker_"+realm})`;
  same(roles.length,2,"dedicated role missing");
  const grant=await db`SELECT has_table_privilege(${"ekmivo_finance_reader_"+realm},'financial_payments','INSERT') AS can_paid,
    has_table_privilege(${"ekmivo_financial_worker_"+realm},'financial_payments','INSERT') AS worker_paid,
    has_table_privilege(${"ekmivo_financial_worker_"+realm},'financial_inbound_events','SELECT') AS worker_raw,
    has_table_privilege(${"ekmivo_financial_worker_"+realm},'river_job','UPDATE') AS worker_queue`;
  ok(!grant[0].can_paid&&!grant[0].worker_paid&&!grant[0].worker_raw&&grant[0].worker_queue,
   "untrusted role can forge financial evidence or cannot operate River");
  const testReader=postgres(ds("ekmivo_pg04_"+realm,"ekmivo_finance_reader_"+realm,"pg04-"+realm+"-reader-only"),{max:1,prepare:false});
  try{
   same((await testReader`SELECT count(*)::int n FROM payment_intents`)[0].n,0,"unscoped reader leaked rows");
   const perms=await testReader`SELECT has_table_privilege(current_user,'financial_receipt_observations','SELECT') AS can_raw`;
   ok(!perms[0].can_raw,"reader could inspect private receipt evidence");
  }finally{await testReader.end({timeout:3})}
 }
 // Owner-only fixture exercises trigger-level invariants; entirely rolled back.
 const db=dbs.sandbox,workspace=controls[0][1];
 try{
  await db.begin(async tx=>{
   const receiving=(await tx`INSERT INTO financial_receiving_accounts
    (workspace_id,environment,method,identity_hmac,display_suffix)
    VALUES(${workspace}::uuid,'sandbox','bkash',${hmac()},'1234') RETURNING id`)[0].id;
   const intent=(await tx`INSERT INTO payment_intents
    (workspace_id,environment,merchant_reference,amount_minor,expires_at)
    VALUES(${workspace}::uuid,'sandbox','PG04-unique-fixture',7500,now()+interval '1 hour') RETURNING id`)[0].id;
   await reject(tx,()=>tx`INSERT INTO payment_intents
    (workspace_id,environment,merchant_reference,amount_minor,expires_at)
    VALUES(${workspace}::uuid,'sandbox','PG04-invalid',-1,now()+interval '1 hour')`,"23514");
   await reject(tx,()=>tx`INSERT INTO payment_intents
    (workspace_id,environment,merchant_reference,amount_minor,expires_at)
    VALUES(${workspace}::uuid,'live','PG04-foreign-realm',7500,now()+interval '1 hour')`,"23503");
   const payer=hmac();
   const attempt=(await tx`INSERT INTO payment_attempts
    (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,
     amount_minor,method,window_start,window_end,policy_version)
    VALUES(${workspace}::uuid,'sandbox',${intent}::uuid,${receiving}::uuid,${payer},'5678',
      7500,'bkash',now(),now()+interval '15 minutes',1) RETURNING id`)[0].id;
   await reject(tx,()=>tx`UPDATE payment_attempts SET payer_suffix='0000' WHERE id=${attempt}::uuid`,"55000");
   await reject(tx,()=>tx`INSERT INTO payment_attempts
    (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,
     amount_minor,method,window_start,window_end,policy_version)
    VALUES(${workspace}::uuid,'sandbox',${intent}::uuid,${receiving}::uuid,${payer},'5678',
      7500,'bkash',now(),now()+interval '15 minutes',1)`,"23505");
   const event=(await tx`INSERT INTO financial_inbound_events
    (workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
    VALUES(${workspace}::uuid,'sandbox','sandbox_fixture','PG04-event',${hmac()},${randomBytes(40)})
    RETURNING id`)[0].id;
   await reject(tx,()=>tx`INSERT INTO financial_inbound_events
    (workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
    VALUES(${workspace}::uuid,'sandbox','sandbox_fixture','PG04-event',${hmac()},${randomBytes(40)})`,"23505");
   const obs=(await tx`INSERT INTO financial_receipt_observations
    (workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,amount_minor,method,
     direction,original_transaction_at,time_precision,parser_version)
    VALUES(${workspace}::uuid,'sandbox',${event}::uuid,${receiving}::uuid,${payer},7500,'bkash',
      'incoming',now(),'second',1) RETURNING id`)[0].id;
   const payment=(await tx`INSERT INTO financial_payments
    (workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
    VALUES(${workspace}::uuid,'sandbox',${attempt}::uuid,${obs}::uuid,7500,'sandbox_fixture',1)
    RETURNING id`)[0].id;
   await reject(tx,()=>tx`UPDATE financial_payments SET verified_amount_minor=1 WHERE id=${payment}::uuid`,"55000");
   await tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${workspace}::uuid,'sandbox',${payment}::uuid,${intent}::uuid,5000)`;
   await reject(tx,()=>tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${workspace}::uuid,'sandbox',${payment}::uuid,${intent}::uuid,4000)`,"23505");
   throw rollback;
  });
 }catch(e){if(e!==rollback)throw e}
 same((await db`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${workspace}::uuid`)[0].n,0,
  "rolled-back financial fixture leaked");
 execFileSync("go",["test","./internal/financial","./cmd/financial-migrate","./cmd/worker","-count=1","-v"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env,timeout:100000
 });
 const controlEmpty=await admin`SELECT to_regclass('public.payment_intents') IS NULL AS no_payments`;
 ok(controlEmpty[0].no_payments,"financial tables leaked into control DB");
 console.log(`PG04 isolated finance+River PASS: ${count} assertions; 2 DBs, no shared auth, registry, realm/cross-role isolation, PGX River rollback/idempotency`);
} catch(err){
 console.error("PG04 independent finance FAIL:",err instanceof Error?err.message:"unknown");
 process.exitCode=1;
}finally{
 for(const d of Object.values(dbs||{})){await d.end({timeout:3})}
 await admin.end({timeout:3});
}
