import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
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
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_projection') THEN
   CREATE ROLE ekmivo_financial_projection NOLOGIN;
  END IF;
 END $$;`;
 await admin.unsafe(adminSQL).simple();
 await admin.unsafe("CREATE ROLE ekmivo_financial_projection_operator LOGIN PASSWORD 'pg04-control-projection-only'");
 await admin.unsafe("GRANT ekmivo_financial_projection TO ekmivo_financial_projection_operator");

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
  PG04_CONTROL_MIGRATION_DATABASE_URL:control,
  PG04_CONTROL_MIGRATION_FILE:new URL("../../../infra/migrations/0009_pg04_control_projection.sql",import.meta.url).pathname,
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
 // Real control-to-finance projected entitlement, not copied identity data.
 const userId=randomUUID(),workspaceId=randomUUID();
 await admin`INSERT INTO app_users(id,email,display_name,password_hash)
 VALUES(${userId}::uuid,${"pg04-projection-"+userId+"@example.invalid"},'PG04 projection','test-invalid-no-login')`;
 await admin`INSERT INTO workspaces(id,name,service_mode,created_by)
 VALUES(${workspaceId}::uuid,'PG04 controlled provisioning','commerce',${userId}::uuid)`;
 await admin`INSERT INTO workspace_members(workspace_id,user_id,role)
 VALUES(${workspaceId}::uuid,${userId}::uuid,'owner')`;
 const machine=postgres(ds(source.pathname.slice(1),"ekmivo_financial_projection_operator","pg04-control-projection-only"),{max:1,prepare:false});
 let originalVersion=0;
 try{
  const sourceRows=await machine`SELECT * FROM resolve_financial_projection(${workspaceId}::uuid,'sandbox')`;
  same(sourceRows.length,1,"authenticated projection missing");
  ok(sourceRows[0].active,"enabled payments should be projected active");
  originalVersion=Number(sourceRows[0].source_version);
  const pEnv={...env,
   PG04_PROJECTION_CONTROL_URL:ds(source.pathname.slice(1),"ekmivo_financial_projection_operator","pg04-control-projection-only"),
   PG04_PROVISIONER_SANDBOX_URL:ds("ekmivo_pg04_sandbox","ekmivo_financial_provisioner_sandbox","pg04-sandbox-provision-only"),
   PG04_PROVISIONER_LIVE_URL:ds("ekmivo_pg04_live","ekmivo_financial_provisioner_live","pg04-live-provision-only"),
   PG04_WORKSPACE_ID:workspaceId};
  for(const realm of names){
   execFileSync("go",["run","./cmd/financial-sync"],{
    cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",
    env:{...pEnv,PG04_ENVIRONMENT:realm},timeout:60000
   });
  }
  for(const realm of names){
   const state=await dbs[realm]`SELECT status,entitlement_version FROM financial_workspace_registry
    WHERE workspace_id=${workspaceId}::uuid`;
   same(state[0].status,"active","control product did not provision finance realm");
  }
  await admin`UPDATE workspace_product_access SET enabled=false,updated_at=now()
   WHERE workspace_id=${workspaceId}::uuid AND product='payments'`;
  const updated=await machine`SELECT source_version,active FROM
    resolve_financial_projection(${workspaceId}::uuid,'sandbox')`;
  ok(!updated[0].active&&Number(updated[0].source_version)>originalVersion,
   "payment disable not versioned or still active");
  for(const realm of names){
   execFileSync("go",["run","./cmd/financial-sync"],{
    cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",
    env:{...pEnv,PG04_ENVIRONMENT:realm},timeout:60000
   });
   const state=await dbs[realm]`SELECT status FROM financial_workspace_registry
    WHERE workspace_id=${workspaceId}::uuid`;
   same(state[0].status,"suspended","payment disable did not suspend financial realm");
  }
  const prov=postgres(pEnv.PG04_PROVISIONER_SANDBOX_URL,{max:1,prepare:false});
  try{
   const stale=await prov`SELECT financial_sync_workspace(${workspaceId}::uuid,'sandbox',${originalVersion},true) AS applied`;
   same(stale[0].applied,false,"stale activation overwrote newer suspension");
  }finally{await prov.end({timeout:3})}
  // Deleting a workspace creates a versioned non-PII tombstone, not an
  // orphaned active financial registry. Sync remains possible after cascade.
  await admin`DELETE FROM workspaces WHERE id=${workspaceId}::uuid`;
  const tomb=await machine`SELECT source_version,active FROM
    resolve_financial_projection(${workspaceId}::uuid,'sandbox')`;
  same(tomb.length,1,"deleted workspace lost its source tombstone");
  ok(!tomb[0].active&&Number(tomb[0].source_version)>Number(updated[0].source_version),
   "deleted workspace did not invalidate the prior projection");
  for(const realm of names){
   execFileSync("go",["run","./cmd/financial-sync"],{
    cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",
    env:{...pEnv,PG04_ENVIRONMENT:realm},timeout:60000
   });
   const state=await dbs[realm]`SELECT status,entitlement_version FROM financial_workspace_registry
    WHERE workspace_id=${workspaceId}::uuid`;
   same(state[0].status,"suspended","deleted business still active in finance");
  }
  const attemptCross=postgres(ds("ekmivo_pg04_live","ekmivo_financial_worker_sandbox","pg04-sandbox-worker-only"),
   {max:1,prepare:false,connect_timeout:3});
  try{
   let denied=false;
   try{await attemptCross`SELECT 1`}catch(e){denied=true}
   ok(denied,"sandbox worker credential accessed live financial DB");
  }finally{await attemptCross.end({timeout:1})}
 }finally{await machine.end({timeout:3})}
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
   // Issuance and verification share [start,end): the end belongs only to
   // an adjacent attempt. Roll back every case so receipt/payment uniqueness
   // cannot mask the time guard being exercised.
   async function checkBoundary(attemptId, offsetSeconds, precision, eligible) {
    const boundaryRollback=Symbol("boundary rollback");
    try {
     await tx.savepoint(async b=>{
      const inbound=(await b`INSERT INTO financial_inbound_events
       (workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
       VALUES(${workspace}::uuid,'sandbox','sandbox_fixture',${randomUUID()},${hmac()},${randomBytes(40)}) RETURNING id`)[0].id;
      const observation=(await b`INSERT INTO financial_receipt_observations
       (workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,amount_minor,method,
        direction,original_transaction_at,time_precision,parser_version)
       SELECT ${workspace}::uuid,'sandbox',${inbound}::uuid,${receiving}::uuid,${payer},7500,'bkash',
        'incoming',window_end + ${offsetSeconds} * interval '1 second',${precision},1
       FROM payment_attempts WHERE id=${attempt}::uuid RETURNING id`)[0].id;
      const insert=()=>b`INSERT INTO financial_payments
       (workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
       VALUES(${workspace}::uuid,'sandbox',${attemptId}::uuid,${observation}::uuid,7500,'sandbox_fixture',1) RETURNING id`;
      if(eligible)ok((await insert()).length===1,"valid boundary interval rejected");
      else await reject(b,insert,"23514");
      throw boundaryRollback;
     });
    } catch(e) { if(e!==boundaryRollback)throw e; }
   }
   await checkBoundary(attempt,-1,"second",true);
   await checkBoundary(attempt,0,"second",false);
   await checkBoundary(attempt,1,"second",false);
   await checkBoundary(attempt,-60,"minute",true);
   await checkBoundary(attempt,-59,"minute",false);
   const adjacent=(await tx`INSERT INTO payment_attempts
    (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,
     amount_minor,method,window_start,window_end,policy_version)
    SELECT workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,
     amount_minor,method,window_end,window_end+interval '15 minutes',policy_version
    FROM payment_attempts WHERE id=${attempt}::uuid RETURNING id`)[0].id;
   await checkBoundary(adjacent,0,"second",true);
   const payment=(await tx`INSERT INTO financial_payments
    (workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
    VALUES(${workspace}::uuid,'sandbox',${attempt}::uuid,${obs}::uuid,7500,'sandbox_fixture',1)
    RETURNING id`)[0].id;
   await reject(tx,()=>tx`UPDATE financial_payments SET verified_amount_minor=1 WHERE id=${payment}::uuid`,"55000");
   await tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${workspace}::uuid,'sandbox',${payment}::uuid,${intent}::uuid,5000)`;
   await reject(tx,()=>tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${workspace}::uuid,'sandbox',${payment}::uuid,${intent}::uuid,4000)`,"23514");
   await reject(tx,()=>tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${workspace}::uuid,'sandbox',${payment}::uuid,${intent}::uuid,1000)`,"23505");
   throw rollback;
  });
 }catch(e){if(e!==rollback)throw e}
 same((await db`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${workspace}::uuid`)[0].n,0,
  "rolled-back financial fixture leaked");
 const {verifyPG04Guards}=await import("./pg04-guard-matrix.mjs");
 count+=await verifyPG04Guards({ds,dbs,controls});
 execFileSync("go",["test","./internal/financial","./cmd/financial-migrate","./cmd/worker","-count=1","-v"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env,timeout:100000
 });
 // The worker REALLY dies after River transitions a durable job to running.
 // A fresh process must subsequently recover the unacknowledged job itself.
 const queued=(await db`SELECT j.id FROM river_job j JOIN financial_outbox o ON o.river_job_id=j.id
  WHERE o.event_kind='pg04_audit' AND o.workspace_id<>${workspace}::uuid ORDER BY j.id DESC LIMIT 1`);
 ok(queued.length===1,"Go River test did not durably commit an audit job");
 const target=queued[0].id;
 const runner="/tmp/ekmivo-pg04-worker";
 execFileSync("go",["build","-o",runner,"./cmd/worker"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env,timeout:100000
 });
 const workerBase={...env,
  EKMIVO_WORKER_ENVIRONMENT:"sandbox",
  FINANCIAL_WORKER_DATABASE_URL:ds("ekmivo_pg04_sandbox","ekmivo_financial_worker_sandbox","pg04-sandbox-worker-only"),
  PG04_WORKER_CONTROL_PROJECTION_URL:ds(source.pathname.slice(1),"ekmivo_financial_projection_operator","pg04-control-projection-only")};
 const sleep=ms=>new Promise(res=>setTimeout(res,ms));
 async function startWorker(extras={}){
  const child=spawn(runner,[],{env:{...workerBase,...extras},stdio:["ignore","pipe","pipe"]});
  let output="";
  for(const stream of [child.stdout,child.stderr])stream.on("data",x=>{
   output+=(String(x)).slice(-3000);
   if(output.length>12000)output=output.slice(-12000);
  });
  return {child,logs:()=>output};
 }
 async function poll(check,timeout=120000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return true;await sleep(400)}
  return false;
 }
 const first=await startWorker({PG04_CI_FAULT_INJECTION:"true",PG04_TEST_PAUSE_AFTER_CLAIM_MS:"30000"});
 try{
  const running=await poll(async()=>{
   const j=await db`SELECT state FROM river_job WHERE id=${target}`;
   return j.length>0&&j[0].state==="running";
  },25000);
  ok(running,"River worker did not acquire the job before crash: "+first.logs().slice(-500));
  first.child.kill("SIGKILL");
  await Promise.race([new Promise(resolve=>first.child.once("close",resolve)),sleep(5000)]);
  const before=await db`SELECT state FROM river_job WHERE id=${target}`;
  same(before[0]?.state,"running","job was not in flight when the process died");
  const auditBefore=await db`SELECT count(*)::int AS n FROM financial_audit_processed o
    JOIN financial_outbox e ON e.id=o.outbox_id WHERE e.river_job_id=${target}`;
  same(auditBefore[0]?.n,0,"crashed job already completed side effect");
 }finally{
  if(first.child.exitCode===null)first.child.kill("SIGKILL");
 }
 const second=await startWorker();
 try{
  const recovered=await poll(async()=>{
   const result=await db`SELECT j.state,
     EXISTS(SELECT 1 FROM financial_audit_processed x
      JOIN financial_outbox o ON o.id=x.outbox_id WHERE o.river_job_id=j.id) AS applied
     FROM river_job j WHERE j.id=${target}`;
   return result.length===1&&result[0].state==="completed"&&result[0].applied;
  },240000);
  ok(recovered,"River did not automatically rescue/complete the killed in-flight job: "+second.logs().slice(-600));
  const row=await db`SELECT count(*)::int AS n FROM financial_audit_processed p
    JOIN financial_outbox o ON o.id=p.outbox_id WHERE o.river_job_id=${target}`;
  same(row[0].n,1,"crash/recovery duplicated audit side effect");
 }finally{
  second.child.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>second.child.once("close",resolve)),sleep(5000)]);
  if(second.child.exitCode===null)second.child.kill("SIGKILL");
 }
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
