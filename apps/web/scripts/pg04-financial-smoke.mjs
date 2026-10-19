import {runPaymentExtensions} from "./pg10-extension-smoke.mjs";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes,createHmac,createHash,generateKeyPairSync,sign} from "node:crypto";
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
 try{if(typeof tx.savepoint==='function')await tx.savepoint(async()=>await fn());else await fn();assert.fail("unexpected successful SQL mutation at "+new Error().stack?.split("\n").slice(2,5).join(" | "))}
 catch(err){if(err.code===code){count++;return}throw err}
}
const hmac=()=>randomBytes(32).toString("hex");
const rollback=Symbol("PG04_ROLLBACK");
const controls=[];
const dbs={};
let pg09Auth=null;
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

 // PG05: run only on the two disposable finance DBs used for PG04 CI.
 const pg05Env={...env,PG05_ALLOW_MIGRATION:"true",
  PG05_CONTROL_MIGRATION_FILE:new URL("../../../infra/migrations/0013_pg05_public_business.sql",import.meta.url).pathname,
  PG05_FINANCIAL_MIGRATION_FILE:new URL("../../../infra/migrations/0010_pg05_checkout.sql",import.meta.url).pathname,
   PG05_INTEGRITY_MIGRATION_FILE:new URL("../../../infra/migrations/0012_pg05_source_integrity.sql",import.meta.url).pathname,
   PG05_LINKED_MIGRATION_FILE:new URL("../../../infra/migrations/0011_pg05_linked_sources.sql",import.meta.url).pathname};
 for(let i=0;i<2;i++)execFileSync("go",["run","./cmd/financial-migrate"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env:pg05Env,timeout:100000
 });
 const pg06Env={...pg05Env,PG06_ALLOW_MIGRATION:"true",
  PG08_NOTICE_ALLOW_MIGRATION:"true",
  PG08_NOTICE_MIGRATION_FILE:new URL("../../../infra/migrations/0015_pg08_customer_notice.sql",import.meta.url).pathname,
  PG06_PIPELINE_MIGRATION_FILE:new URL("../../../infra/migrations/0014_pg06_pg09_receipt_pipeline.sql",import.meta.url).pathname};
 // Current API requires the scoped readiness contract even for PG05 HTTP reads.
 // Install the real dependent schema on both disposable realms; never bypass readiness.
 execFileSync("go",["run","./cmd/financial-migrate"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env:pg06Env,timeout:100000
 });
 for(const realm of names){
  const readiness=await readFile(new URL("../../../infra/migrations/0107_workspace_projection_readiness.sql",import.meta.url),"utf8");
  await dbs[realm].unsafe(readiness).simple();
 }
 const tenant=controls[0][1];
 const reader=postgres(ds("ekmivo_pg04_sandbox","ekmivo_finance_reader_sandbox",
   "pg04-sandbox-reader-only"),{max:1,prepare:false});
 try{
  const key=randomUUID(),digest=hmac(),request=hmac(),payer=hmac();
  const create=(id,hash,requestHash)=>reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",
    [tenant,"sandbox"]);
   return (await tx.unsafe("SELECT pg05_create_intent($1::uuid,$2,$3,$4,$5,$6,$7,$8) AS value",
    [tenant,"sandbox","pg05-"+id,50000,15,id,hash,requestHash]))[0].value;
  });
  const first=await create(key,digest,request);
  same(first.state,"requires_payer","PG05 issued request pretended funds verified");
  same((await create(key,digest,request)).id,first.id,"PG05 request replay duplicated intent");
  const checkout=(await reader.unsafe("SELECT pg05_checkout_view($1) AS value",[digest]))[0].value;
  same(checkout.amount_minor,50000,"PG05 public checkout amount drift");
  ok(Number.isFinite(Date.parse(checkout.server_time)),"PG05 checkout missing authoritative server time");
  same((await reader.unsafe("SELECT pg05_checkout_view($1) AS value",[hmac()]))[0].value,
   null,"PG05 random checkout capability disclosed private data");
  const locked=(await reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4) AS value",
   [digest,payer,"6789","bkash"]))[0].value;
  same(locked.state,"awaiting_payment","PG05 payer lock did not create pending attempt");
  same(locked.payer_suffix,"6789","PG05 wrong payer suffix");
  same((await reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4) AS value",
   [digest,payer,"6789","bkash"]))[0].value.state,"awaiting_payment","PG05 duplicate payer lock");
  await reject(reader,()=>reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4)",
   [digest,hmac(),"8765","nagad"]),"23505");
  const other=randomUUID(),otherHash=hmac();
  await create(other,otherHash,hmac());
  await reject(reader,()=>reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4)",
   [otherHash,payer,"6789","bkash"]),"23505");
  await reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",
    [tenant,"sandbox"]);
   const result=(await tx.unsafe("SELECT pg05_cancel_intent($1::uuid,$2,$3::uuid) AS value",
    [tenant,"sandbox",first.id]))[0].value;
   same(result.state,"cancelled","PG05 cancellation did not take effect");
  });
  same((await reader.unsafe("SELECT pg05_checkout_view($1) AS value",[digest]))[0].value.state,
   "cancelled","PG05 cancelled link still payable");
  same((await reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4) AS value",
   [otherHash,payer,"6789","bkash"]))[0].value.state,
   "awaiting_payment","PG05 cancelled attempt permanently blocked retry");
  same((await dbs.sandbox.unsafe("SELECT count(*)::int n FROM payment_attempts WHERE intent_id=$1::uuid",
   [first.id]))[0].n,1,"PG05 cancellation erased immutable attempt");
  same((await reader.unsafe("SELECT pg05_merchant_list($1::uuid,$2) AS value",
   [tenant,"sandbox"]))[0].value,null,"PG05 unscoped reader leaked merchant history");
  same((await dbs.sandbox.unsafe("SELECT financial_sync_workspace($1::uuid,'sandbox',2,false) AS active",
   [tenant]))[0].active,true,"PG05 sandbox suspension was not applied");
  same((await reader.unsafe("SELECT pg05_checkout_view($1) AS value",[otherHash]))[0].value,
   null,"PG05 suspended workspace kept exposing public checkout");
  same((await reader.unsafe("SELECT pg05_lock_payer($1,$2,$3,$4) AS value",
   [otherHash,payer,"6789","bkash"]))[0].value,null,
   "PG05 suspended workspace allowed payer lock");
  same((await dbs.sandbox.unsafe("SELECT financial_sync_workspace($1::uuid,'sandbox',3,true) AS active",
   [tenant]))[0].active,true,"PG05 sandbox resume failed");
  // PG05 authoritative linked invoice/order: server computes quantity x price.
  const invoiceLines=[{title:"Engineering course",quantity:2,unit_amount_minor:12750},
   {title:"Workbook",quantity:1,unit_amount_minor:4500}];
  const doc=await reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   const preflight=(await tx.unsafe(`SELECT current_setting('ekmivo.workspace_id',true) AS workspace,
    current_setting('ekmivo.environment',true) AS realm,
    (SELECT status FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox') AS status,
    jsonb_typeof($2::jsonb) AS input_type,jsonb_array_length($2::jsonb) AS line_count`,
    [tenant,reader.json(invoiceLines)]))[0];
   same(preflight.workspace,tenant,"PG05 scoped source transaction workspace");
   same(preflight.realm,"sandbox","PG05 scoped source transaction realm");
   same(preflight.status,"active","PG05 billing source workspace not active");
   same(preflight.input_type,"array","PG05 linked source JSON not an array");
   same(preflight.line_count,2,"PG05 linked source line length");
   return (await tx.unsafe("SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb) AS value",
    [tenant,"sandbox","invoice","INV-"+randomUUID(),reader.json(invoiceLines)]))[0].value;
  });
  same(doc.amount_minor,30000,"PG05 server-calculated source total incorrect");
  const replayedDoc=await reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   return (await tx.unsafe("SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb) AS value",
    [tenant,"sandbox","invoice",doc.source_reference,reader.json(invoiceLines)]))[0].value;
  });
  same(replayedDoc.id,doc.id,"PG05 repeated issued document duplicated source");
  await reject(reader,()=>reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   await tx.unsafe("SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb)",
    [tenant,"sandbox","invoice",doc.source_reference,reader.json([{title:"Tampered",quantity:1,unit_amount_minor:1}])]);
  }),"23505");
  same((await reader.unsafe("SELECT pg05_list_billing_sources($1::uuid,$2) AS value",[tenant,"sandbox"]))[0].value,null,
   "PG05 reader listed sources without tenant binding");
  await reject(reader,()=>reader.unsafe("SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb)",
   [tenant,"sandbox","invoice","INVALID-"+randomUUID(),reader.json([{title:"Fake",quantity:1,unit_amount_minor:-1}])]),"22023");
  const refLinked="LINK-"+randomUUID(),lk=randomUUID(),lh=hmac(),rq=hmac();
  const issueLinked=()=>reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   return (await tx.unsafe("SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9) AS value",
    [tenant,"sandbox",refLinked,"invoice",doc.id,15,lk,lh,rq]))[0].value;
  });
  const linked=await issueLinked();
  same(linked.amount_minor,30000,"PG05 linked intent ignored server source total");
  same((await issueLinked()).id,linked.id,"PG05 linked replay duplicated request");
  await reject(reader,()=>reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   await tx.unsafe("SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)",
    [tenant,"sandbox","competing-"+randomUUID(),"invoice",doc.id,15,randomUUID(),hmac(),hmac()]);
  }),"23505");
  same((await reader.unsafe("SELECT pg05_checkout_view($1) AS value",[lh]))[0].value.amount_minor,
   30000,"PG05 public linked checkout amount drift");
  await reject(reader,()=>reader.unsafe("UPDATE pg05_billing_sources SET amount_minor=1 WHERE id=$1::uuid",[doc.id]),"42501");
  await reject(reader,()=>reader.unsafe("SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)",
   [tenant,"sandbox","INVALID","order",randomUUID(),15,randomUUID(),hmac(),hmac()]),"42501");
  const listed=await reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   return (await tx.unsafe("SELECT pg05_merchant_list($1::uuid,$2) AS value",[tenant,"sandbox"]))[0].value;
  });
  same(listed.find(x=>x.id===linked.id)?.source_id,doc.id,"PG05 missing link provenance in merchant list");
  // Real Go HTTP API smoke using the actually restricted control+finance roles.
  // This is no substitute for owner browser/devices; no real money is involved.
  const tokenSecret=randomBytes(40).toString("hex"),payerSecret=randomBytes(40).toString("hex");
  const httpKey=randomUUID(),httpToken=createHmac("sha256",tokenSecret)
   .update(tenant+"|sandbox|"+httpKey).digest("base64url");
  const httpDigest=createHash("sha256").update(httpToken).digest("hex");
  const httpIssued=await reader.begin(async tx=>{
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
   return (await tx.unsafe("SELECT pg05_create_intent($1::uuid,$2,$3,$4,$5,$6,$7,$8) AS value",
    [tenant,"sandbox","PG05-HTTP-"+httpKey,12345,15,httpKey,httpDigest,hmac()]))[0].value;
  });
  const goCwd=new URL("../../../backend/",import.meta.url);
  const apiBin="/tmp/ekmivo-pg05-ci-api-"+process.pid;
  execFileSync("go",["build","-o",apiBin,"./cmd/api"],{cwd:goCwd,timeout:120000});
  const port=17885,origin="http://127.0.0.1:"+port;
  // The finance test tenant is also made into an actual control-plane workspace
  // for HTTP role+session checks. Each session is valid but never contains a key
  // to the financial database or a forged workspace_id claim.
  const sessions={},sessionUsers={};
  for(const role of ["owner","editor","viewer"]){
   const userId=randomUUID();sessionUsers[role]=userId;
   await admin`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at)
    VALUES(${userId}::uuid,${"pg05-"+role+"-"+userId+"@example.invalid"},${"PG05 "+role},'invalid-ci-hash',now())`;
   if(role==="owner")await admin`INSERT INTO workspaces(id,name,service_mode,created_by)
    VALUES(${tenant}::uuid,'PG05 HTTP tenant','commerce',${userId}::uuid)`;
   await admin`INSERT INTO workspace_members(workspace_id,user_id,role)
    VALUES(${tenant}::uuid,${userId}::uuid,${role})`;
   const opaque=randomBytes(32).toString("base64url");
   const sessionHash=createHash("sha256").update(opaque).digest("hex");
   await admin`INSERT INTO auth_sessions(user_id,token_hash,expires_at)
    VALUES(${userId}::uuid,${sessionHash},now()+interval '1 hour')`;
   sessions[role]=opaque;
  }
  pg09Auth={sessions:{...sessions},tokenSecret,payerSecret};
  const child=spawn(apiBin,[],{cwd:goCwd,env:{
    ...process.env,PORT:String(port),GO_WEB_ORIGIN:origin,
    EKMIVO_REQUIRE_AUTHZ:"true",
    AUTHZ_DATABASE_URL:ds(source.pathname.slice(1),"ekmivo_financial_runtime","pg01-ci-only-password"),
    PG05_SANDBOX_DATABASE_URL:ds("ekmivo_pg04_sandbox","ekmivo_finance_reader_sandbox","pg04-sandbox-reader-only"),
    PG05_TOKEN_SECRET:tokenSecret,PG05_PAYER_SECRET:payerSecret
  },stdio:["ignore","pipe","pipe"]});
  let apiLogs="";
  child.stdout.on("data",d=>{apiLogs=(apiLogs+String(d)).slice(-1200)});
  child.stderr.on("data",d=>{apiLogs=(apiLogs+String(d)).slice(-1200)});
  try{
   let ready=false;
   for(let tries=0;tries<85;tries++){
    if(child.exitCode!==null)throw Error("PG05 Go API stopped during preflight: "+apiLogs);
    try{const status=await fetch(origin+"/healthz",{signal:AbortSignal.timeout(700)});
     if(status.status===200){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,160));
   }
   ok(ready,"PG05 real Go HTTP process did not start: "+apiLogs);
   const url=origin+"/v1/public/checkout/"+httpToken;
   const initial=await fetch(url),initialData=await initial.json();
   same(initial.status,200,"PG05 public checkout HTTP GET failed");
   same(initialData.id,httpIssued.id,"PG05 Go HTTP token cannot resolve immutable intent");
   const malformed=await fetch(origin+"/v1/public/checkout/"+randomBytes(32).toString("base64url"));
   same(malformed.status,404,"PG05 invalid public token HTTP access");
   const forbiddenOrigin=await fetch(url+"/lock",{method:"POST",headers:{"Origin":"https://attacker.invalid",
    "Content-Type":"application/json"},body:JSON.stringify({payer_number:"01712345678",method:"bkash"})});
   same(forbiddenOrigin.status,403,"PG05 public payer lock accepted forged browser origin");
   const lockResponse=await fetch(url+"/lock",{method:"POST",headers:{"Origin":origin,
    "Content-Type":"application/json"},body:JSON.stringify({payer_number:"০১৭১২৩৪৫৬৭৮",method:"bkash"})});
   same(lockResponse.status,200,"PG05 actual payer lock over Go HTTP failed");
   const lockedHttp=await lockResponse.json();
   same(lockedHttp.state,"awaiting_payment","PG05 HTTP lock fabricated a paid result");
   same(lockedHttp.payer_suffix,"5678","PG05 HTTP payer suffix mismatch");
   const replay=await fetch(url+"/lock",{method:"POST",headers:{"Origin":origin,
    "Content-Type":"application/json"},body:JSON.stringify({payer_number:"01812345678",method:"bkash"})});
   same(replay.status,409,"PG05 HTTP allowed a different payer after lock");
   const merchantDenied=await fetch(origin+"/v1/workspaces/"+tenant+"/payment-intents?environment=sandbox");
   same(merchantDenied.status,401,"PG05 HTTP financial list was available without merchant auth");
   const sourceDenied=await fetch(origin+"/v1/workspaces/"+tenant+"/linked-sources?environment=sandbox");
   same(sourceDenied.status,401,"PG05 HTTP linked documents were exposed without authorization");
   const liveDenied=await fetch(origin+"/v1/workspaces/"+tenant+"/payment-intents?environment=live");
   same(liveDenied.status,503,"PG05 HTTP live intent incorrectly enabled");
   const merchantRoot=origin+"/v1/workspaces/"+tenant;
   const endpoint=merchantRoot+"/linked-sources?environment=sandbox";
   const head=role=>({Cookie:"ekmivo-session="+sessions[role],"Content-Type":"application/json",Origin:origin});
   const ownerList=await fetch(merchantRoot+"/payment-intents?environment=sandbox",{headers:head("owner")});
   same(ownerList.status,200,"PG05 owner failed actual scoped HTTP list");
   const editorList=await fetch(endpoint,{headers:head("editor")});
   same(editorList.status,200,"PG05 editor failed authorized source HTTP read");
   const viewerList=await fetch(endpoint,{headers:head("viewer")});
   same(viewerList.status,200,"PG05 viewer failed permitted read");
   const docReq={source_kind:"order",source_reference:"ORDER-HTTP-"+randomUUID(),
    items:[{title:"Native receipt test class",quantity:2,unit_amount_minor:3400}]};
   const blockedViewer=await fetch(endpoint,{method:"POST",headers:head("viewer"),body:JSON.stringify(docReq)});
   same(blockedViewer.status,403,"PG05 viewer created source by direct HTTP");
   const editorCreate=await fetch(endpoint,{method:"POST",headers:head("editor"),body:JSON.stringify(docReq)});
   same(editorCreate.status,201,"PG05 editor could not issue source");
   const editorDoc=await editorCreate.json();
   same(editorDoc.amount_minor,6800,"PG05 merchant posted line amount but database did not calculate");
   const documentReplay=await fetch(endpoint,{method:"POST",headers:head("editor"),body:JSON.stringify(docReq)});
   same(documentReplay.status,201,"PG05 identical HTTP source replay unavailable");
   same((await documentReplay.json()).id,editorDoc.id,"PG05 HTTP source replay duplicated document");
   const alteredDoc=await fetch(endpoint,{method:"POST",headers:head("owner"),body:JSON.stringify({...docReq,
    items:[{title:"Altered line",quantity:1,unit_amount_minor:1}]})});
   same(alteredDoc.status,409,"PG05 source identity accepted tampered reissue");
   const intentUrl=merchantRoot+"/payment-intents?environment=sandbox";
   const linkedPayload={merchant_reference:"HTTP-LINK-"+randomUUID(),order_id:editorDoc.id,
    currency:"BDT",expires_in_minutes:15};
   const forgedTotal=await fetch(intentUrl,{method:"POST",headers:{...head("editor"),"Idempotency-Key":randomUUID()},
    body:JSON.stringify({...linkedPayload,amount_minor:1})});
   same(forgedTotal.status,422,"PG05 accepted browser-forged linked order amount");
   const viewerIssue=await fetch(intentUrl,{method:"POST",headers:{...head("viewer"),"Idempotency-Key":randomUUID()},
    body:JSON.stringify(linkedPayload)});
   same(viewerIssue.status,403,"PG05 viewer created linked payment");
   const linkedKey=randomUUID();
   const editorIssue=await fetch(intentUrl,{method:"POST",headers:{...head("editor"),"Idempotency-Key":linkedKey},
    body:JSON.stringify(linkedPayload)});
   same(editorIssue.status,201,"PG05 editor linked issuance denied or crashed");
   const linkedBody=await editorIssue.json();
   same(linkedBody.amount_minor,6800,"PG05 linked amount was not server-priced over HTTP");
   same(linkedBody.source_id,editorDoc.id,"PG05 linked HTTP response lost immutable provenance");
   const replayIssue=await fetch(intentUrl,{method:"POST",headers:{...head("editor"),"Idempotency-Key":linkedKey},
    body:JSON.stringify(linkedPayload)});
   same(replayIssue.status,201,"PG05 HTTP idempotent linked retry status changed");
   same((await replayIssue.json()).id,linkedBody.id,"PG05 HTTP duplicate linked issue created another intent");
   const foreignList=await fetch(origin+"/v1/workspaces/"+randomUUID()+"/linked-sources?environment=sandbox",
    {headers:head("owner")});
   same(foreignList.status,403,"PG05 owner read foreign workspace over HTTP");
   same(initialData.merchant_name,"PG05 HTTP tenant","PG05 checkout omitted real business identity");
   same(initialData.workspace_id,undefined,"PG05 public response leaked internal workspace field");
   const longDoc=await fetch(endpoint,{method:"POST",headers:head("editor"),body:JSON.stringify({source_kind:"invoice",source_reference:"UTF8-20-"+randomUUID(),items:Array.from({length:20},()=>({title:"দ".repeat(160),quantity:1,unit_amount_minor:1}))})});
   same(longDoc.status,201,"PG05 full 20-line Bengali source incorrectly exceeded HTTP body cap");
   same((await longDoc.json()).amount_minor,20,"PG05 20-line source total corrupted");
   const bearer={};
   for(const access of ["read","write"]){
    const publicId=randomBytes(8).toString("hex");
    const secret="ek_test_"+publicId+"_"+randomBytes(32).toString("base64url");
    await admin`INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at)
      VALUES(${tenant}::uuid,'sandbox',${publicId},${createHash("sha256").update(secret).digest("hex")},'PG05 ephemeral API client',${access==="read"?["payments:read"]:["payments:read","payments:write"]},${sessionUsers.owner}::uuid,now()+interval '1 hour')`;
    bearer[access]={Authorization:"Bearer "+secret,"Content-Type":"application/json"};
   }
   same((await fetch(endpoint,{headers:bearer.read})).status,200,"PG05 scoped bearer source read failed");
   same((await fetch(endpoint,{method:"POST",headers:bearer.read,body:JSON.stringify({...docReq,source_reference:"BEARER-DENIED"})})).status,403,"PG05 read-only key issued source");
   const bearerDocResponse=await fetch(endpoint,{method:"POST",headers:bearer.write,body:JSON.stringify({...docReq,source_reference:"BEARER-"+randomUUID()})});
   same(bearerDocResponse.status,201,"PG05 write-scoped bearer source issue failed");
   same((await fetch(origin+"/v1/workspaces/"+randomUUID()+"/linked-sources?environment=sandbox",{headers:bearer.write})).status,403,"PG05 bearer escaped own workspace");
   const staleKey=randomUUID(),staleToken=createHmac("sha256",tokenSecret).update(tenant+"|sandbox|"+staleKey).digest("base64url");
   await reader.begin(async tx=>{
    await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[tenant,"sandbox"]);
    await tx.unsafe("SELECT pg05_create_intent($1::uuid,$2,$3,$4,$5,$6,$7,$8)",[tenant,"sandbox","STALE-"+staleKey,789,15,staleKey,createHash("sha256").update(staleToken).digest("hex"),hmac()]);
   });
   await admin`UPDATE workspace_product_access SET enabled=false WHERE workspace_id=${tenant}::uuid AND product='payments'`;
   const staleUrl=origin+"/v1/public/checkout/"+staleToken;
   same((await fetch(staleUrl)).status,503,"PG05 stale active finance projection exposed disabled business");
   same((await fetch(staleUrl+"/lock",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({payer_number:"01912345678",method:"rocket"})})).status,503,"PG05 disabled control business allowed payer lock");
   await admin`UPDATE workspace_product_access SET enabled=true WHERE workspace_id=${tenant}::uuid AND product='payments'`;
   same((await (await fetch(staleUrl)).json()).state,"requires_payer","PG05 control-disabled checkout wrote a payer attempt");
   const detailResponse=await fetch(merchantRoot+"/payment-intents/"+linkedBody.id+"?environment=sandbox",{headers:head("viewer")});
   same(detailResponse.status,200,"PG05 viewer failed immutable detail read");
   const details=(await detailResponse.json()).data;
   same(details.amount_minor,6800,"PG05 detail amount differs from linked source");
   same(details.items,docReq.items,"PG05 detail lost immutable line items");
   same(details.events[0].event_type,"created","PG05 detail missing issuance history");
   const duplicateEnv=await fetch(intentUrl+"&environment=live",{headers:head("owner")});
   same(duplicateEnv.status,400,"PG05 duplicate environments accepted");
   const wrongSourcePayload={...docReq,source_reference:"BAD-TITLE-"+randomUUID(),items:[{title:123,quantity:1,unit_amount_minor:1}]};
   same((await fetch(endpoint,{method:"POST",headers:head("owner"),body:JSON.stringify(wrongSourcePayload)})).status,422,"PG05 accepted nontext line description");
   const raceDocResponse=await fetch(endpoint,{method:"POST",headers:head("editor"),body:JSON.stringify({...docReq,source_reference:"RACE-"+randomUUID()})});
   const raceDoc=await raceDocResponse.json();
   const racePayload={...linkedPayload,merchant_reference:"RACE-PAY-"+randomUUID(),order_id:raceDoc.id};
   const racing=await Promise.all(Array.from({length:5},()=>fetch(intentUrl,{method:"POST",headers:{...head("editor"),"Idempotency-Key":randomUUID()},body:JSON.stringify({...racePayload,merchant_reference:"RACE-PAY-"+randomUUID()})})));
   same(racing.filter(r=>r.status===201).length,1,"PG05 parallel source issuance created competing checkouts");
   same(racing.filter(r=>r.status===409).length,4,"PG05 competing source issuance did not return conflicts");
   await reject(reader,()=>reader.unsafe("SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)",
    [tenant,"sandbox","UNSCOPED","order",editorDoc.id,15,randomUUID(),hmac(),hmac()]),"42501");
   await reject(reader,()=>reader.unsafe("SELECT pg05_create_linked_intent_v1($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)",
    [tenant,"sandbox","BYPASS","order",editorDoc.id,15,randomUUID(),hmac(),hmac()]),"42501");
   const limited=await Promise.all(Array.from({length:25},()=>fetch(url+"/lock",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({payer_number:"01712345678",method:"bkash"})})));
   ok(limited.some(r=>r.status===429),"PG05 public lock has no effective rate budget");
   same(limited.find(r=>r.status===429).headers.get("Retry-After"),"60","PG05 rate limit missing retry hint");
   const expiredKey=randomUUID(),expiredToken=createHmac("sha256",tokenSecret).update(tenant+"|sandbox|"+expiredKey).digest("base64url");
   const expiredIntent=(await dbs.sandbox`INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,created_at,expires_at)
    VALUES(${tenant}::uuid,'sandbox',${"EXPIRED-"+expiredKey},987,now()-interval '20 minutes',now()-interval '5 minutes') RETURNING id`)[0].id;
   await dbs.sandbox`INSERT INTO pg05_checkout_tokens(workspace_id,environment,intent_id,token_digest,creation_key)
    VALUES(${tenant}::uuid,'sandbox',${expiredIntent}::uuid,${createHash("sha256").update(expiredToken).digest("hex")},${expiredKey})`;
   const expiredView=await fetch(origin+"/v1/public/checkout/"+expiredToken);
   same(expiredView.status,200,"PG05 expired checkout unavailable instead of truthful expired state");
   same((await expiredView.json()).state,"expired","PG05 expired checkout offered payment");
   same((await fetch(origin+"/v1/public/checkout/"+expiredToken+"/lock",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({payer_number:"01912345678",method:"rocket"})})).status,409,"PG05 expired checkout created payer attempt");
   if(process.env.PG05_BROWSER_TESTS==="true"){
    const {runPG05Browser}=await import("./pg05-browser-evidence.mjs");
    await runPG05Browser({control,goOrigin:origin,tenant,sessions,token:httpToken,expiredToken});
   }
   console.log("PG05 Go HTTP PASS: owner/editor/viewer, scoped linked source amount+idempotency, token/payer/origin, live fail-closed");
  }finally{child.kill("SIGTERM")}
  console.log("PG05 PASS: standalone and immutable linked snapshots, tenant scope, payer locking, cancellation, idempotency");
 }finally{await reader.end({timeout:3})}
 // Owner-only fixture exercises trigger-level invariants; entirely rolled back.
 const db=dbs.sandbox,workspace=controls[0][1];
 const intentsBeforeFixture=(await db`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${workspace}::uuid`)[0].n;
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
 same((await db`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${workspace}::uuid`)[0].n,intentsBeforeFixture,
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

 // PG06-PG09: source-matched 0014 migration, both disposable realms only.
 // Repeated operator pass verifies already-installed pipeline idempotency.
 for(let pass=0;pass<2;pass++){
  execFileSync("go",["run","./cmd/financial-migrate"],{
   cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env:pg06Env,timeout:100000
  });
 }
 for(const realm of names){
  const row=(await dbs[realm].unsafe(
   "SELECT to_regprocedure('pg07_match(uuid,bigint)') IS NOT NULL AS matching, "+
   "to_regprocedure('pg08_claim(uuid,bigint)') IS NOT NULL AS delivery, "+
   "to_regprocedure('pg09_read(uuid,text,text,uuid,uuid,text,uuid,text,timestamptz,timestamptz)') IS NOT NULL AS dashboard"))[0];
  ok(row.matching&&row.delivery&&row.dashboard,"PG06-09 missing functions in "+realm);
  const policies=await dbs[realm].unsafe(
   "SELECT count(*)::int n FROM pg_class WHERE relname IN ('pg06_devices','pg06_transport','pg07_receipt_results','pg08_endpoints','pg07_events','pg08_deliveries','pg09_audit','pg06_account_configuration') "+
   "AND relrowsecurity AND relforcerowsecurity");
  same(policies[0].n,8,"PG06-09 FORCE RLS missing in "+realm);
  const restricted=postgres(ds("ekmivo_pg04_"+realm,"ekmivo_finance_reader_"+realm,"pg04-"+realm+"-reader-only"),{max:1,prepare:false});
  try{
   await reject(restricted,()=>restricted.unsafe("SELECT * FROM pg06_transport"),"42501");
   await reject(restricted,()=>restricted.unsafe(
    "SELECT pg09_read('00000000-0000-0000-0000-000000000000'::uuid,$1,'payments',NULL,NULL)",
    [realm]),"42501");
  }finally{await restricted.end({timeout:3})}
 }

 // PG06 additive physical identity migration: disposable financial realms only.
 for(const realm of names){
  const sql=await readFile(new URL("../../../infra/migrations/0045_pg06_physical_phone_multi_account.sql",import.meta.url),"utf8");
  await dbs[realm].unsafe(sql).simple();
  ok((await dbs[realm].unsafe("SELECT to_regclass('public.pg06_phones') IS NOT NULL AS installed"))[0].installed,
    "Missing physical-device schema in "+realm);
  const forwardSQL=await readFile(new URL("../../../infra/migrations/0047_pg06_phone_forwarder.sql",import.meta.url),"utf8");
  await dbs[realm].unsafe(forwardSQL).simple();
  // Replay the same additive 0088 repair against both disposable finance realms.
  const forwardRepair=await readFile(new URL("../../../infra/migrations/0088_financial_phone_forward_column.sql",import.meta.url),"utf8");
  await dbs[realm].unsafe(forwardRepair).simple();
  ok((await dbs[realm].unsafe("SELECT to_regclass('public.pg06_phone_forwarded') IS NOT NULL AS installed"))[0].installed,
    "Missing phone forwarder schema in "+realm);
 }
 // Reference phases 2–4: actual additive control schema and functional assertions,
 // isolated CI databases only. Entire transaction intentionally rolls back.
 try {
  await admin.begin(async tx=>{
   for(const filename of ["0114_mobile_workspace_preview_control.sql","0116_mobile_devices_control.sql","0118_workspace_inbox.sql","0119_channel_oauth.sql","0120_inbox_push.sql"]){
    const sql=await readFile(new URL("../../../infra/migrations/"+filename,import.meta.url),"utf8");
    await tx.unsafe(sql.replace(/^(BEGIN|COMMIT);\s*$/gm,"")).simple();
   }
   const checks=await readFile(new URL("../../../tools/testing/sql/mobile-foundation-control.sql",import.meta.url),"utf8");
   await tx.unsafe(checks).simple();
   throw rollback;
  });
 }catch(err){if(err!==rollback)throw err}
 for(const realm of names){
  try {await dbs[realm].begin(async tx=>{
   const sql=await readFile(new URL("../../../infra/migrations/0117_mobile_device_financial_adoption.sql",import.meta.url),"utf8");
   await tx.unsafe(sql.replace(/^(BEGIN|COMMIT);\s*$/gm,"")).simple();
   const device=randomUUID(),ws=randomUUID(),key=randomBytes(91);
   await tx.unsafe("INSERT INTO financial_workspace_registry(workspace_id,environment,status,entitlement_version) VALUES($1::uuid,$2,'active',1)",[ws,realm]);
   for(let attempt=0;attempt<2;attempt++){
    const row=(await tx.unsafe("SELECT pg06_mobile_adopt($1::uuid,$2::uuid,$3,$4::bytea) AS ready",[device,ws,realm,key]))[0];
    ok(row.ready,"AI-first same-ID financial adoption failed");
   }
   same((await tx.unsafe("SELECT count(*)::int AS n FROM pg06_phones WHERE id=$1::uuid",[device]))[0].n,1,"financial adoption duplicated phone");
   throw rollback;
  })}catch(err){if(err!==rollback)throw err}
 }
 console.log("Android phases 2–4 control/dual-finance pairing, products, inbox, OAuth, push and status replay PASS (rolled back)");
 try{
  await dbs.sandbox.begin(async tx=>{
   const ws=controls[0][1];
   await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[ws]);
   const account=async(method,suffix)=>(await tx.unsafe(
    "INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES($1::uuid,'sandbox',$2,$3,$4) RETURNING id",
    [ws,method,hmac(),suffix]))[0].id;
   const bkash=await account("bkash","1212"),nagad=await account("nagad","3434"),token=hmac();
   const phone=(await tx.unsafe("SELECT pg06_phone_begin($1::uuid,'sandbox','One physical handset',$2) AS result",[ws,token]))[0].result;
   ok(Boolean(phone.id),"physical phone missing");
   const key=randomBytes(91);
   same((await tx.unsafe("SELECT pg06_phone_claim($1,$2) AS result",[token,key]))[0].result.id,phone.id,"initial pairing failed");
   same((await tx.unsafe("SELECT pg06_phone_claim($1,$2) AS result",[token,key]))[0].result.id,phone.id,"pairing retry failed");
   await reject(tx,()=>tx.unsafe("SELECT pg06_phone_claim($1,$2)",[token,randomBytes(91)]),"42501");
   const fEvent=randomUUID(),fDigest=hmac(),fCipher=randomBytes(41);
   const forward=async(digest)=>(await tx.unsafe(
    "SELECT pg06_phone_forward($1::uuid,$2,$3,$4,$5,$6,now(),1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL) AS receipt",
    [phone.id,fEvent,digest,fCipher,"bKash","sms:unknown"]))[0].receipt;
   same((await forward(fDigest)).ack,"durable","Physical phone forward without parser/account must be durably stored");
   same((await forward(fDigest)).reason,"verification_pending","Source without trusted parser/recipient must not verify funds");
   same((await forward(fDigest)).replayed,true,"Retry must be idempotent");
   await reject(tx,()=>forward(hmac()),"23505");
   same((await tx.unsafe("SELECT count(*)::int AS total FROM pg06_phone_forwarded WHERE phone_id=$1::uuid",[phone.id]))[0].total,1,
    "One signed event must not produce duplicate evidence");
   const b=(await tx.unsafe("SELECT pg06_phone_attach($1::uuid,'sandbox',$2::uuid,$3::uuid,'bKash','BKASH','fixture-v1','sms:1') AS result",
    [ws,phone.id,bkash]))[0].result;
   const n=(await tx.unsafe("SELECT pg06_phone_attach($1::uuid,'sandbox',$2::uuid,$3::uuid,'Nagad','NAGAD','fixture-v1','sms:2') AS result",
    [ws,phone.id,nagad]))[0].result;
   const configuration=(await tx.unsafe("SELECT pg06_phone_configuration($1::uuid) AS value",[phone.id]))[0].value;
   same(configuration.bindings.length,2,"one phone failed to bind both accounts");
   same(new Set(configuration.bindings.map(b=>b.account_id)).size,2,"accounts not distinct");
   await reject(tx,()=>tx.unsafe("SELECT pg06_phone_attach($1::uuid,'sandbox',$2::uuid,$3::uuid,'Ambiguous','BKASH','fixture-v1','sms:1')",
    [ws,phone.id,nagad]),"23505");
   await reject(tx,()=>tx.unsafe("SELECT pg06_phone_list($1::uuid,'live')",[ws]),"42501");
   await reject(tx,()=>tx.unsafe("SELECT pg06_phone_list($1::uuid,'sandbox')",[randomUUID()]),"42501");
   same((await tx.unsafe("SELECT pg06_phone_detach($1::uuid,'sandbox',$2::uuid,$3::uuid) AS ok",[ws,phone.id,b.id]))[0].ok,true,
    "detach failed");
   same((await tx.unsafe("SELECT pg06_phone_configuration($1::uuid) AS value",[phone.id]))[0].value.bindings[0].id,n.id,
    "removed association was rerouted");
   await tx.unsafe("SELECT pg06_phone_action($1::uuid,'sandbox',$2::uuid,'revoke',NULL)",[ws,phone.id]);
   await reject(tx,()=>tx.unsafe(
    "SELECT pg06_phone_forward($1::uuid,$2,$3,$4,'bKash','sms:unknown',now(),2,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
    [phone.id,randomUUID(),hmac(),randomBytes(41)]),"42501");
   same((await tx.unsafe("SELECT count(*)::int AS n FROM pg06_phone_key($1::uuid)",[phone.id]))[0].n,0,"revoked phone still valid");
   same((await tx.unsafe("SELECT count(*)::int AS n FROM pg06_device_context($1::uuid)",[n.id]))[0].n,0,
    "revoked account binding still valid");
   throw rollback;
  });
 }catch(error){if(error!==rollback)throw error}
 console.log("PG06 isolated synthetic SQL: one phone + two accounts, scope denial, ambiguous binding, detach, revoke, rollback");
 const controlPipeline=(await admin.unsafe(
  "SELECT to_regclass('public.pg06_transport') IS NULL AS no_receipt_tables, "+
  "to_regprocedure('pg07_match(uuid,bigint)') IS NULL AS no_matcher"))[0];
 ok(controlPipeline.no_receipt_tables&&controlPipeline.no_matcher,"PG06-09 leaked finance schema into control");
 console.log("PG06-09 0014 migration: disposable dual-realm replay, grants, FORCE RLS and control isolation PASS");


 // PG06 contract: simulated device/receipt against the already-isolated
 // disposable PostgreSQL 17 sandbox. No actual provider or handset involved.
 const pg06DB=dbs.sandbox,pg06WS=controls[0][1];
 const beforeDevices=(await pg06DB.unsafe(
  "SELECT count(*)::int n FROM pg06_devices WHERE workspace_id=$1::uuid",[pg06WS]))[0].n;
 try {
  await pg06DB.begin(async tx=>{
   await tx.unsafe(
    "SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",
    [pg06WS]);
   const account=(await tx.unsafe(
    "INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) "+
    "VALUES($1::uuid,'sandbox','bkash',$2,'8844') RETURNING id",
    [pg06WS,hmac()]))[0].id;
   const tokenDigest=hmac();
   const pairing=(await tx.unsafe(
    "SELECT pg06_pair($1::uuid,'sandbox',$2::uuid,'CI simulated phone','fixture','fixture-v1','sms:101',$3) AS value",
    [pg06WS,account,tokenDigest]))[0].value;
   ok(Boolean(pairing.id),"PG06 test pairing did not generate enrollment ID");
   const key=randomBytes(91),otherKey=randomBytes(91);
   const first=(await tx.unsafe("SELECT pg06_claim($1,$2) AS value",[tokenDigest,key]))[0].value;
   same(first.id,pairing.id,"PG06 initial pairing lost enrollment ID");
   const replay=(await tx.unsafe("SELECT pg06_claim($1,$2) AS value",[tokenDigest,key]))[0].value;
   same(replay.id,pairing.id,"PG06 lost-response same-key recovery failed");
   await reject(tx,()=>tx.unsafe("SELECT pg06_claim($1,$2)",[tokenDigest,otherKey]),"42501");
   const pre=(await tx.unsafe("SELECT count(*)::int n FROM pg06_device_context($1::uuid)",[pairing.id]))[0].n;
   same(pre,1,"PG06 enrolled device did not resolve");
   const health=(await tx.unsafe(
    "SELECT pg06_heartbeat($1::uuid,true,3,'isolated CI','0.0.0',2,'INGEST_REJECTED_422') AS ok",
    [pairing.id]))[0];
   ok(health.ok,"PG06 opaque health not stored");
   const healthRow=(await tx.unsafe(
    "SELECT overflow_count,last_queue_error FROM pg06_devices WHERE id=$1::uuid",[pairing.id]))[0];
   same(Number(healthRow.overflow_count),2,"PG06 dropped receipt count invisible");
   same(healthRow.last_queue_error,"INGEST_REJECTED_422","PG06 poison queue error missing");
   await reject(tx,()=>tx.unsafe(
    "SELECT pg06_heartbeat($1::uuid,true,1,'isolated CI','0.0.0',-1,'')",
    [pairing.id]),"22023");
   const eventID=randomUUID(),eventHash=hmac();
   const ingress=[pairing.id,eventID,eventHash,Buffer.from("ci-nonprovider-fixture"),
    null,null,null,null,null,null,null,"device_sms","unrecognized_or_incomplete_receipt",new Date(),1];
   const incoming=(await tx.unsafe(
    "SELECT pg06_ingest($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) AS value",
    ingress))[0].value;
   same(incoming.ack,"durable","PG06 simulated invalid evidence lacked durable storage ACK");
   const duplicate=(await tx.unsafe(
    "SELECT pg06_ingest($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) AS value",
    ingress))[0].value;
   same(duplicate.replayed,true,"PG06 duplicate same-event not idempotent");
   const changed=[...ingress];changed[2]=hmac();
   await reject(tx,()=>tx.unsafe(
    "SELECT pg06_ingest($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    changed),"23505");
   const hist=(await tx.unsafe("SELECT pg06_history($1::uuid) AS value",[pairing.id]))[0].value;
   ok(hist.length===1,"PG06 duplicate ingress created extra transport history");
   await tx.unsafe("UPDATE pg06_devices SET revoked_at=now() WHERE id=$1::uuid",[pairing.id]);
   await reject(tx,()=>tx.unsafe("SELECT pg06_claim($1,$2)",[tokenDigest,key]),"42501");
   const removed=(await tx.unsafe("SELECT count(*)::int n FROM pg06_device_context($1::uuid)",[pairing.id]))[0].n;
   same(removed,0,"PG06 revoked device still resolved");
   throw rollback; // retain NO synthetic enrollment/account/event.
  });
 } catch(error){if(error!==rollback)throw error}
 same((await pg06DB.unsafe(
  "SELECT count(*)::int n FROM pg06_devices WHERE workspace_id=$1::uuid",[pg06WS]))[0].n,
  beforeDevices,"PG06 transaction fixture leaked into financial realm");
 console.log("PG06 isolated PostgreSQL signed-ingress function smoke PASS: same-key claim recovery, different-key deny, overflow health, durable replay, changed digest deny, revoke and rollback (SIMULATED only)");


 // PG07: real PostgreSQL matcher regression, fictional sandbox-only evidence.
 // Owner's disposable finance DB only; no provider/device, customer, or money.
 const pg07DB=dbs.sandbox,pg07WS=controls[0][1];
 const pg07Version=Number((await pg07DB.unsafe(
  "SELECT entitlement_version AS version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox'",
  [pg07WS]))[0].version);
 const pg07Now=Date.now();
 const pg07Account=(await pg07DB.unsafe(
  "INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) "+
  "VALUES($1::uuid,'sandbox','bkash',$2,'7744') RETURNING id",
  [pg07WS,hmac()]))[0].id;
 const pg07SecondAccount=(await pg07DB.unsafe(
  "INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) "+
  "VALUES($1::uuid,'sandbox','bkash',$2,'7755') RETURNING id",
  [pg07WS,hmac()]))[0].id;
 const pg07Endpoint=(await pg07DB.unsafe(
  "INSERT INTO pg08_endpoints(workspace_id,environment,url,secret) VALUES($1::uuid,'sandbox','https://example.invalid/ci-receiver',$2) RETURNING id",
  [pg07WS,Buffer.alloc(32,7)]))[0].id;
 async function pg07Attempt(opts={}){
  const amount=opts.amount??5500;
  const t0=new Date(pg07Now-3600000);
  const start=opts.start??new Date(pg07Now-120000);
  const end=opts.end??new Date(pg07Now+1800000);
  const created=opts.created??t0;
  const expires=opts.expires??new Date(pg07Now+3600000);
  const payer=opts.payer??hmac();
  const account=opts.account??pg07Account;
  const method=opts.method??"bkash";
  const intent=(await pg07DB.unsafe(
   "INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,created_at,expires_at) "+
   "VALUES($1::uuid,'sandbox',$2,$3,$4,$5) RETURNING id",
   [pg07WS,"PG07-CI-"+randomUUID(),amount,created,expires]))[0].id;
  const attempt=(await pg07DB.unsafe(
   "INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version,issued_at) "+
   "VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,$4,'1234',$5,$6,$7,$8,1,$9) RETURNING id",
   [pg07WS,intent,account,payer,amount,method,start,end,opts.issued??start]))[0].id;
  return {intent,attempt,payer,account,amount,method,start,end};
 }
 async function pg07Receipt(a,opts={}){
  const sourceKind=opts.sourceKind??"sandbox_fixture";
  const stamp=opts.at===undefined?new Date(pg07Now+60000):opts.at;
  const inbound=(await pg07DB.unsafe(
   "INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence) "+
   "VALUES($1::uuid,'sandbox',$2,$3,$4,$5,$6) RETURNING id",
   [pg07WS,sourceKind,"ci-"+randomUUID(),hmac(),stamp,Buffer.alloc(48,13)]))[0].id;
  const observation=(await pg07DB.unsafe(
   "INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version) "+
   "VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,1) RETURNING id",
   [pg07WS,inbound,opts.account??a.account,hmac(),opts.payer===undefined?a.payer:opts.payer,
    opts.amount===undefined?a.amount:opts.amount,opts.method??a.method,
    opts.direction??"incoming",stamp,opts.precision??"second"]))[0].id;
  await pg07DB.unsafe(
   "INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id) VALUES($1::uuid,'sandbox',$2::uuid)",
   [pg07WS,observation]);
  return observation;
 }
 async function pg07Match(id,version=pg07Version,db=pg07DB){
  return (await db.unsafe("SELECT pg07_match($1::uuid,$2) AS status",[id,version]))[0].status;
 }
 const pg07Base=await pg07Attempt();
 const pg07ReceiptID=await pg07Receipt(pg07Base);
 same(await pg07Match(pg07ReceiptID),"matched","PG07 complete exact match did not auto-verify");
 same(await pg07Match(pg07ReceiptID),"matched","PG07 duplicate matcher invocation was not stable");
 const complete=await pg07DB.unsafe(
  "SELECT p.id,p.verification_method,p.verified_amount_minor,a.intent_id,e.id AS event_id,e.payload->'data'->>'verification_method' AS payload_method,d.id AS delivery_id "+
  "FROM financial_payments p JOIN financial_allocations a ON a.payment_id=p.id "+
  "JOIN pg07_events e ON e.payment_id=p.id "+
  "JOIN pg08_deliveries d ON d.event_id=e.id AND d.endpoint_id=$3::uuid "+
  "WHERE p.observation_id=$1::uuid AND a.intent_id=$2::uuid",
  [pg07ReceiptID,pg07Base.intent,pg07Endpoint]);
 same(complete.length,1,"PG07 atomic payment/allocation/event/delivery missing or duplicated");
 same(complete[0].verification_method,"sandbox_fixture","PG07 attributed synthetic source as real provider");
 same(complete[0].payload_method,"sandbox_fixture","PG07 event source attribution mismatch");
 same(Number(complete[0].verified_amount_minor),pg07Base.amount,"PG07 verified funds changed amount");
 same((await pg07DB.unsafe(
  "SELECT pg05_intent_state($1::uuid,'sandbox',$2::uuid) AS state",[pg07WS,pg07Base.intent]))[0].state,
  "completed","PG07 didn't automatically complete fully allocated intent");
 // A second otherwise-identical receipt for one funded attempt must be
 // classified duplicate and never issue a second payment, event or webhook.
 const pg07Duplicate=await pg07Receipt(pg07Base);
 same(await pg07Match(pg07Duplicate),"duplicate","PG07 second provider ref double-funded attempt");
 const pg07Negative=[
  ["payer",{payer:hmac()}],["account",{account:pg07SecondAccount}],
  ["amount_under",{amount:5499}],["amount_over",{amount:5501}],
  ["method",{method:"nagad"}],["outgoing",{direction:"outgoing"}],
  ["masked_payer",{payer:null}],["unknown_time",{at:null,precision:"unknown"}],
  ["late_outside",{at:new Date(pg07Now+3600001)}]
 ];
 for(const [scenario,change] of pg07Negative){
  const attempt=await pg07Attempt();
  const evidence=await pg07Receipt(attempt,change);
  same(await pg07Match(evidence),"unmatched","PG07 "+scenario+" unexpectedly verified");
  const resolution=(await pg07DB.unsafe(
   "SELECT reason FROM pg07_receipt_results WHERE observation_id=$1::uuid",[evidence]))[0].reason;
  if(scenario==="amount_under")same(resolution,"partial_amount_requires_reconciliation",
   "PG07 partial funds were misclassified as paid or routine no-match");
  if(scenario==="amount_over")same(resolution,"excess_amount_requires_reconciliation",
   "PG07 excess funds were misclassified as paid or routine no-match");
  same((await pg07DB.unsafe(
   "SELECT count(*)::int n FROM financial_payments WHERE observation_id=$1::uuid",[evidence]))[0].n,
   0,"PG07 "+scenario+" mutated funds");
 }
 // A full minute interval must fit within the immutable payment window.
 const pg07Minute=await pg07Attempt({
  start:new Date(pg07Now+120000),end:new Date(pg07Now+180000),
  issued:new Date(pg07Now+120000),expires:new Date(pg07Now+3600000)
 });
 const pg07Overhang=await pg07Receipt(pg07Minute,{
  at:new Date(pg07Now+120001),precision:"minute"
 });
 same(await pg07Match(pg07Overhang),"unmatched","PG07 partial minute overhang verified");
 const pg07Boundary=await pg07Receipt(pg07Minute,{
  at:new Date(pg07Now+120000),precision:"minute"
 });
 same(await pg07Match(pg07Boundary),"matched","PG07 exact whole minute boundary rejected");
 // A cancellation wins if committed before matcher; no manual mark-paid escape.
 const pg07Cancelled=await pg07Attempt();
 await pg07DB.unsafe(
  "INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,'cancelled')",[pg07WS,pg07Cancelled.intent]);
 const pg07CancelledReceipt=await pg07Receipt(pg07Cancelled);
 same(await pg07Match(pg07CancelledReceipt),"cancelled","PG07 cancelled intent auto-verified");
 // Provider's original time, not late device upload time, determines status.
 const pg07Late=await pg07Attempt({
  created:new Date(pg07Now-7200000),
  start:new Date(pg07Now-5400000),
  issued:new Date(pg07Now-5400000),
  end:new Date(pg07Now-3600000),
  expires:new Date(pg07Now-3600000)
 });
 const pg07LateReceipt=await pg07Receipt(pg07Late,{at:new Date(pg07Now-4500000)});
 same(await pg07Match(pg07LateReceipt),"matched","PG07 valid original timestamp rejected after expiry");
 const lateEvent=(await pg07DB.unsafe(
  "SELECT e.payload->'data'->>'late_sync' AS late FROM pg07_events e "+
  "JOIN financial_payments p ON p.id=e.payment_id WHERE p.observation_id=$1::uuid",
  [pg07LateReceipt]))[0];
 same(lateEvent.late,"true","PG07 late arrival not attributed");
 // Authority cannot be guessed from body or a stale workspace projection.
 const pg07Stale=await pg07Attempt(),pg07StaleReceipt=await pg07Receipt(pg07Stale);
 await reject(pg07DB,()=>pg07Match(pg07StaleReceipt,pg07Version+1),"42501");
 same(await pg07Match(pg07StaleReceipt),"matched","PG07 stale worker corrupted pending receipt");
 // Simulated second realm with the same UUID must not be queryable by worker.
 const pg07Wrong=await pg07DB.unsafe(
  "SELECT count(*)::int n FROM pg07_receipt_results WHERE observation_id=$1::uuid AND environment='live'",
  [pg07ReceiptID]);
 same(pg07Wrong[0].n,0,"PG07 sandbox observation appeared in live");
 const paidCount=(await pg07DB.unsafe(
  "SELECT count(*)::int n FROM financial_payments WHERE observation_id=$1::uuid",[pg07ReceiptID]))[0].n;
 same(paidCount,1,"PG07 replay issued multiple verified payments");

 // Deterministic lock inversion case: PG05 holds the intent BEFORE its
 // attempt-issuance bucket lock. Matcher must not wait holding the bucket.
 const pg07Lock=postgres(ds("ekmivo_pg04_sandbox"),{max:1,prepare:false});
 const pg07Racer=postgres(ds("ekmivo_pg04_sandbox"),{max:2,prepare:false});
 try {
  const locked=await pg07Attempt();
  const blockedObservation=await pg07Receipt(locked);
  await pg07Lock.begin(async tx=>{
   await tx.unsafe("SELECT id FROM payment_intents WHERE id=$1::uuid FOR UPDATE",[locked.intent]);
   same(await pg07Match(blockedObservation,pg07Version,pg07Racer),
    "pending","PG07 did not defer when checkout held intent lock");
  });
  same(await pg07Match(blockedObservation),"matched","PG07 did not retry after checkout released lock");
  // Actual least-privileged River worker login may call only the signed
  // matcher function; it can never forge a payment by direct table INSERT.
  const pg07Worker=postgres(ds("ekmivo_pg04_sandbox",
   "ekmivo_financial_worker_sandbox","pg04-sandbox-worker-only"),{max:1,prepare:false});
  try {
   const workerFixture=await pg07Attempt();
   const workerObservation=await pg07Receipt(workerFixture);
   same(await pg07Match(workerObservation,pg07Version,pg07Worker),
    "matched","PG07 restricted worker could not process authorized receipt");
   await reject(pg07Worker,()=>pg07Worker.unsafe(
    "INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version) "+
    "VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,5500,'sandbox_fixture',1)",
    [pg07WS,workerFixture.attempt,workerObservation]),"42501");
  } finally {await pg07Worker.end({timeout:3})}
  const competing=await pg07Attempt();
  const candidate=await pg07Receipt(competing);
  const outcomes=await Promise.all([
   pg07Match(candidate,pg07Version,pg07DB),
   pg07Match(candidate,pg07Version,pg07Racer)
  ]);
  same(outcomes,["matched","matched"],"PG07 two workers diverged under same receipt");
  const cardinality=(await pg07DB.unsafe(
   "SELECT (SELECT count(*)::int FROM financial_payments WHERE observation_id=$1::uuid) AS payments, "+
   "(SELECT count(*)::int FROM pg07_events e JOIN financial_payments p ON e.payment_id=p.id WHERE p.observation_id=$1::uuid) AS events, "+
   "(SELECT count(*)::int FROM pg08_deliveries d JOIN pg07_events e ON d.event_id=e.id JOIN financial_payments p ON e.payment_id=p.id WHERE p.observation_id=$1::uuid) AS deliveries",
   [candidate]))[0];
  same(cardinality.payments,1,"PG07 parallel workers duplicated payment");
  same(cardinality.events,1,"PG07 parallel workers duplicated event");
  same(cardinality.deliveries,1,"PG07 parallel workers duplicated queued webhook");
 } finally {
  await pg07Lock.end({timeout:3});
  await pg07Racer.end({timeout:3});
 }

 console.log("PG07 isolated matching PASS: atomic verified payment/allocation/event/queued delivery, idempotency, five fields, minute boundary, late, cancellation, stale projection (FICTIONAL SANDBOX only)");


 // PG08: isolated real PostgreSQL durable webhook lease, retry and replay.
 // ALL events are fictional sandbox receipts; no external HTTP or customer.
 const pg08DB=pg07DB;
 const pg08Delivery=complete[0].delivery_id;
 const pg08Event=complete[0].event_id;
 const pg08Claim=async id=>(await pg08DB.unsafe(
  "SELECT pg08_claim($1::uuid,$2) AS claim",[id,pg07Version]))[0].claim;
 const pg08Finish=async(id,lease,status,reason)=>(await pg08DB.unsafe(
  "SELECT pg08_finish($1::uuid,$2::uuid,$3,$4) AS saved",[id,lease,status,reason]))[0].saved;
 const claim=await pg08Claim(pg08Delivery);
 ok(claim&&claim.lease_id&&claim.event_id===pg08Event,"PG08 delivery not claimed with immutable event");
 same(claim.body.id,pg08Event,"PG08 event ID did not bind signed body");
 same(claim.attempt,1,"PG08 first claim attempt incorrect");
 same(await pg08Claim(pg08Delivery),null,"PG08 active lease was claimed twice");
 same(await pg08Finish(pg08Delivery,randomUUID(),204,""),false,"PG08 stale/wrong lease finished delivery");
 same(await pg08Finish(pg08Delivery,claim.lease_id,204,""),true,"PG08 2xx delivery not committed");
 same(await pg08Finish(pg08Delivery,claim.lease_id,204,""),false,"PG08 ACK replay double-completed");
 const state=(await pg08DB.unsafe(
  "SELECT status,attempts,completed_at FROM pg08_deliveries WHERE id=$1::uuid",[pg08Delivery]))[0];
 same(state.status,"delivered","PG08 persisted wrong successful delivery state");
 same(state.attempts,1,"PG08 success attempts wrong");
 ok(!!state.completed_at,"PG08 delivered_at missing");
 const pg08Insert=async()=>(
  await pg08DB.unsafe("INSERT INTO pg08_deliveries(workspace_id,environment,endpoint_id,event_id) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid) RETURNING id",
  [pg07WS,pg07Endpoint,pg08Event]))[0].id;
 const retryID=await pg08Insert();
 const firstClaim=await pg08Claim(retryID);
 same(await pg08Finish(retryID,firstClaim.lease_id,500,"non_success_response"),true,
  "PG08 500 did not record retry");
 let retry=(await pg08DB.unsafe(
  "SELECT status,attempts,next_at,reason FROM pg08_deliveries WHERE id=$1::uuid",[retryID]))[0];
 same(retry.status,"pending","PG08 retryable 500 terminally failed");
 ok(new Date(retry.next_at).getTime()-Date.now()>50000,"PG08 500 retry delay was not >=1 minute");
 await pg08DB.unsafe("UPDATE pg08_deliveries SET next_at=now()-interval '1 second' WHERE id=$1::uuid",[retryID]);
 const secondClaim=await pg08Claim(retryID);
 same(secondClaim.attempt,2,"PG08 retry did not increment attempt");
 same(await pg08Finish(retryID,secondClaim.lease_id,429,"rate_limited"),true,"PG08 retryable 429 denied");
 retry=(await pg08DB.unsafe(
  "SELECT status,attempts,next_at FROM pg08_deliveries WHERE id=$1::uuid",[retryID]))[0];
 same(retry.status,"pending","PG08 retryable 429 became permanent failure");
 ok(new Date(retry.next_at).getTime()-Date.now()>280000,"PG08 second retry was not near 5 minutes");
 // Terminal HTTP does NOT exhaust eight pointless attempts.
 const denied=await pg08Insert();
 const deniedClaim=await pg08Claim(denied);
 same(await pg08Finish(denied,deniedClaim.lease_id,403,"client_rejected"),true,"PG08 terminal 403 could not finalize");
 same((await pg08DB.unsafe("SELECT status FROM pg08_deliveries WHERE id=$1::uuid",[denied]))[0].status,
  "failed","PG08 terminal 4xx kept retrying");
 const transportFailure=await pg08Insert();
 const failedClaim=await pg08Claim(transportFailure);
 same(await pg08Finish(transportFailure,failedClaim.lease_id,0,"transport_unknown"),true,
  "PG08 unknown network outcome not queued for retry");
 same((await pg08DB.unsafe("SELECT status FROM pg08_deliveries WHERE id=$1::uuid",[transportFailure]))[0].status,
  "pending","PG08 unknown HTTP outcome lost");
 const crash=await pg08Insert();
 const deadClaim=await pg08Claim(crash);
 await pg08DB.unsafe("UPDATE pg08_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1::uuid",[crash]);
 const reclaimed=await pg08Claim(crash);
 ok(reclaimed&&reclaimed.lease_id!==deadClaim.lease_id&&reclaimed.attempt===2,
  "PG08 killed/incomplete HTTP claim not recovered with new lease");
 same(await pg08Finish(crash,deadClaim.lease_id,204,""),false,
  "PG08 stale worker ACK could overwrite reclaimed lease");
 same(await pg08Finish(crash,reclaimed.lease_id,204,""),true,
  "PG08 reclaimed second delivery failed");
 const exhausted=await pg08Insert();
 await pg08DB.unsafe("UPDATE pg08_deliveries SET status='sending',attempts=8,lease_id=$2::uuid,"+
  "lease_until=now()-interval '1 second' WHERE id=$1::uuid",[exhausted,randomUUID()]);
 same(await pg08Claim(exhausted),null,"PG08 process crash after max attempts retried forever");
 same((await pg08DB.unsafe(
  "SELECT status,reason FROM pg08_deliveries WHERE id=$1::uuid",[exhausted]))[0].status,
  "failed","PG08 exhausted crash did not finalize");
 const disabled=await pg08Insert();
 await pg08DB.unsafe("UPDATE pg08_endpoints SET active=false WHERE id=$1::uuid",[pg07Endpoint]);
 same(await pg08Claim(disabled),null,"PG08 disabled endpoint still issued secret and delivery");
 same((await pg08DB.unsafe(
  "SELECT status FROM pg08_deliveries WHERE id=$1::uuid",[disabled]))[0].status,
  "disabled","PG08 disabled endpoint did not get terminal status");
 await pg08DB.unsafe("UPDATE pg08_endpoints SET active=true WHERE id=$1::uuid",[pg07Endpoint]);
 const staleAuthority=await pg08Insert();
 await reject(pg08DB,()=>pg08DB.unsafe("SELECT pg08_claim($1::uuid,$2)",
  [staleAuthority,pg07Version+1]),"42501");
 // Two simultaneous initial dispatches for one endpoint/event must be
 // rejected, but explicit manual replay after terminal outcome is permitted.
 await reject(pg08DB,()=>pg08Insert(),"23505");
 await pg08DB.unsafe(
  "UPDATE pg08_deliveries SET status='failed',reason='ci_projection_rejection' WHERE id=$1::uuid",
  [staleAuthority]);
 const replayID=await pg08Insert();
 ok(replayID!==pg08Delivery,"PG08 manual replay reused delivery row ID");
 same((await pg08DB.unsafe(
  "SELECT event_id FROM pg08_deliveries WHERE id=$1::uuid",[replayID]))[0].event_id,
  pg08Event,"PG08 replay illegally created a new domain event");
 same((await pg08DB.unsafe(
  "SELECT count(*)::int n FROM financial_payments WHERE id=$1::uuid",[complete[0].id]))[0].n,
  1,"PG08 delivery failure changed verified financial payment");

 // Merchant rotation must be staged/explicit; a newly shown secret must not
 // start signing while the receiver still uses the old key.
 const rotationEndpoint=(await pg08DB.unsafe(
  "INSERT INTO pg08_endpoints(workspace_id,environment,url,secret) VALUES($1::uuid,'sandbox','https://example.invalid/rotation',$2) RETURNING id",
  [pg07WS,Buffer.alloc(32,41)]))[0].id;
 const nextKey=Buffer.alloc(32,42);
 await pg08DB.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[pg07WS]);
  const result=(await tx.unsafe(
   "SELECT pg09_action($1::uuid,'sandbox','webhooks',$2::uuid,'rotate','{}'::jsonb,$3) AS result",
   [pg07WS,rotationEndpoint,nextKey]))[0].result;
  same(result.updated,true,"PG08 staged key was not audited");
 });
 let secrets=(await pg08DB.unsafe(
  "SELECT secret,pending_secret,previous_secret FROM pg08_endpoints WHERE id=$1::uuid",
  [rotationEndpoint]))[0];
 same(Buffer.compare(secrets.secret,Buffer.alloc(32,41)),0,"PG08 stage prematurely replaced active key");
 same(Buffer.compare(secrets.pending_secret,nextKey),0,"PG08 next key not staged");
 same(secrets.previous_secret,null,"PG08 staged key illegally activated overlap");
 await pg08DB.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[pg07WS]);
  same((await tx.unsafe(
   "SELECT pg09_action($1::uuid,'sandbox','webhooks',$2::uuid,'activate_rotation','{}'::jsonb,NULL) AS result",
   [pg07WS,rotationEndpoint]))[0].result.updated,true,"PG08 explicit activation failed");
 });
 secrets=(await pg08DB.unsafe(
  "SELECT secret,pending_secret,previous_secret,previous_until FROM pg08_endpoints WHERE id=$1::uuid",
  [rotationEndpoint]))[0];
 same(Buffer.compare(secrets.secret,nextKey),0,"PG08 activation did not switch signing key");
 same(secrets.pending_secret,null,"PG08 activated pending key persisted");
 same(Buffer.compare(secrets.previous_secret,Buffer.alloc(32,41)),0,"PG08 overlap old key unavailable");
 ok(secrets.previous_until&&new Date(secrets.previous_until).getTime()>Date.now()+23*3600000,
  "PG08 previous-key overlap missing");
 await pg08DB.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[pg07WS]);
  same((await tx.unsafe(
   "SELECT pg09_action($1::uuid,'sandbox','webhooks',$2::uuid,'revoke_previous','{}'::jsonb,NULL) AS result",
   [pg07WS,rotationEndpoint]))[0].result.updated,true,"PG08 emergency revoke failed");
 });
 same((await pg08DB.unsafe(
  "SELECT previous_secret FROM pg08_endpoints WHERE id=$1::uuid",[rotationEndpoint]))[0].previous_secret,
  null,"PG08 emergency revoke left old secret in database");

 console.log("PG08 isolated webhook state machine PASS: 2xx, terminal 403, 500/429/unknown retry, 1m/5m delay, expired/stale lease, max retries, disabled endpoint, event-stable replay and independent verified funds (SYNTHETIC)");


 // PG08 MERCHANT SIDE, physically separate disposable database and real
 // in-process TLS authoritative payment-query server. No actual customer.
 await admin.unsafe('CREATE DATABASE "ekmivo_pg08_merchant"');
 const merchantDSN=ds("ekmivo_pg08_merchant");
 const merchantDB=postgres(merchantDSN,{max:1,prepare:false});
 try{
  const schema=await readFile(new URL("../../../examples/webhook-receiver/schema.sql",import.meta.url),"utf8");
  await merchantDB.unsafe(schema).simple();
 }finally{await merchantDB.end({timeout:3})}
 execFileSync("go",["test","./cmd/webhook-receiver-example","-run","TestReceiverScopedTLSQueryAndTransactionalDedup","-count=1","-v"],{
  cwd:new URL("../../../backend/",import.meta.url),
  stdio:"inherit",
  env:{...process.env,PG08_TEST_MERCHANT_DSN:merchantDSN},
  timeout:100000
 });
 console.log("PG08 merchant receiver PASS: independent consumer DB, local TLS authoritative payment check, signature/schema/realm/amount verification, event-ID dedup, fulfillment once and old-key overlap (SIMULATED)");


 // PG09: REAL RLS-scoped list/detail SQL on synthetic isolated sandbox rows.
 // Cursor chronology cannot be replaced with UUID-desc (random IDs).
 const pg09Read=async(resource,id=null,cursor=null,status=null,account=null,method=null,from=null,to=null,db=pg07DB,workspace=pg07WS,realm="sandbox",search=null)=>db.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)",[workspace,realm]);
  return (await tx.unsafe(
   "SELECT pg09_read($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::uuid,$8,$9::timestamptz,$10::timestamptz,$11::text) AS data",
   [workspace,realm,resource,id,cursor,status,account,method,from,to,search]))[0].data;
 });
 const paymentDetail=await pg09Read("payments",complete[0].id);
 same(paymentDetail.items.length,1,"PG09 verified payment detail unavailable");
 same(paymentDetail.items[0].status,"verified","PG09 verified status not authoritative");
 same(paymentDetail.items[0].source_kind,"sandbox_fixture","PG09 receipt source provenance missing");
 same(paymentDetail.items[0].event_id,pg08Event,"PG09 domain event correlation absent");
 const byReference=await pg09Read("payments",null,null,null,null,null,null,null,pg07DB,pg07WS,"sandbox",paymentDetail.items[0].merchant_reference);
 ok(byReference.items.some(x=>x.id===complete[0].id),"PG09 tenant-scoped merchant-reference search failed");
 ok(["delivered","pending","sending","failed","disabled"].includes(paymentDetail.items[0].webhook_status),"PG09 latest webhook delivery outcome missing");
 const filteredPayments=await pg09Read("payments",null,null,"verified",pg07Account,"bkash");
 ok(filteredPayments.items.some(x=>x.id===complete[0].id),"PG09 account/method/status filtered payments excluded actual verified fixture");
 same((await pg09Read("payments",null,null,"verified",pg07SecondAccount,"bkash")).items.some(x=>x.id===complete[0].id),
  false,"PG09 account filter leaked another account's payment");
 const moment=new Date();
 const endpoints=[];
 for(let n=0;n<61;n++){
  const created=new Date(moment.getTime()-(n+1)*60000);
  const result=(await pg07DB.unsafe("INSERT INTO pg08_endpoints(workspace_id,environment,url,secret,created_at) VALUES($1::uuid,'sandbox',$2,$3,$4) RETURNING id,created_at",[pg07WS,'https://example.invalid/pg09-'+n,Buffer.alloc(32,73),created]))[0];
  endpoints.push(result);
 }
 const targeted=await pg09Read("webhooks",null,null,null,null,null,null,null,pg07DB,pg07WS,"sandbox","pg09-60");
 same(targeted.items.length,1,"PG09 server search ignored later-than-first-page endpoint");
 same(targeted.items[0].id,endpoints[60].id,"PG09 server search did not search full tenant scope");
 const literalCase=await pg09Read("webhooks",null,null,null,null,null,null,null,pg07DB,pg07WS,"sandbox","PG09-31");
 same(literalCase.items[0]?.id,endpoints[31].id,"PG09 server search failed case folding");
 await reject(pg07DB,()=>pg09Read("webhooks",null,null,null,null,null,null,null,pg07DB,pg07WS,"sandbox","x".repeat(97)),"22023");
 const firstPage=await pg09Read("webhooks");
 same(firstPage.items.length,50,"PG09 first keyset page not 50 rows");
 ok(!!firstPage.next_cursor,"PG09 list omitted next cursor");
 for(let i=1;i<firstPage.items.length;i++){
  const current=firstPage.items[i],previous=firstPage.items[i-1];
  ok(new Date(previous.created_at).getTime()>=new Date(current.created_at).getTime(),
   "PG09 first page unsorted by real creation time");
 }
 const lastPage=await pg09Read("webhooks",null,firstPage.next_cursor);
 ok(lastPage.items.length>=11,"PG09 keyset cursor skipped old rows");
 const ids=new Set([...firstPage.items,...lastPage.items].map(x=>x.id));
 for(const row of endpoints)ok(ids.has(row.id),"PG09 cursor lost endpoint due to random UUID ordering");
 const latest=(await pg07DB.unsafe("INSERT INTO pg08_endpoints(workspace_id,environment,url,secret,created_at) "+
  "VALUES($1::uuid,'sandbox','https://example.invalid/new-post-cursor',$2,now()) RETURNING id",
  [pg07WS,Buffer.alloc(32,72)]))[0].id;
 const postInsert=await pg09Read("webhooks",null,firstPage.next_cursor);
 same(postInsert.items.some(x=>x.id===latest),false,"PG09 back-page polluted by later insertion");
 // A foreign or unknown ID is never a silently valid empty cursor.
 await reject(pg07DB,()=>pg09Read("webhooks",null,randomUUID()),"22023");
 const chosen=endpoints[0];
 const selected=await pg09Read("webhooks",chosen.id);
 same(selected.items.length,1,"PG09 named webhook detail could not load");
 same(selected.items[0].id,chosen.id,"PG09 named webhook detail drifted to another endpoint");
 const overview=(await pg09Read("overview")).items[0];
 ok(Number(overview.verified_minor)>=pg07Base.amount,"PG09 overview verified volume not derived from allocations");
 ok(Number(overview.failed_deliveries)>=1,"PG09 overview ignored failed callback without altering payment");
 const device=(await pg07DB.unsafe(
  "INSERT INTO pg06_devices(workspace_id,environment,account_id,name,source,parser_id,binding) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,'PG09 fictional device','device_sms','fictional-v1','sms:1') RETURNING id",
  [pg07WS,pg07Account]))[0].id;
 const ingressID=randomUUID();
 const transport=(await pg07DB.unsafe(
  "INSERT INTO pg06_transport(workspace_id,environment,device_id,event_id,digest,observation_id,parse_reason,observed_at,sequence) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,$3,$4,$5::uuid,'',now(),1) RETURNING id",
  [pg07WS,device,ingressID,hmac(),pg07ReceiptID]))[0].id;
 const incoming=await pg09Read("incoming",transport);
 same(incoming.items.length,1,"PG09 incoming detail not queryable");
 same(incoming.items[0].device_source,"device_sms","PG09 source identity missing");
 ok((incoming.items[0].evidence_digest_prefix||"").length===12,"PG09 redacted transport digest not displayed");
 ok(Array.isArray(incoming.items[0].candidates)&&incoming.items[0].candidates.length>0,
  "PG09 detail five-field candidate comparisons missing");
 const listIncoming=await pg09Read("incoming");
 const listRow=listIncoming.items.find(x=>x.id===transport);
 same(listRow.candidates,null,"PG09 list unnecessarily exposed detail-level candidates");

 const allocations=await pg09Read("payments",complete[0].id);
 same(allocations.items[0].allocations.length,1,"PG09 payment detail omitted verified financial allocations");
 ok(allocations.items[0].webhook_delivery_history.length>=1,"PG09 payment detail omitted real delivery attempts");
 const healthDetail=await pg09Read("devices",device);
 same(healthDetail.items.length,1,"PG09 device detail unavailable");
 same(healthDetail.items[0].recent_receipts[0].event_id,ingressID,"PG09 device receipt timeline not shown");
 const receiving=await pg09Read("gateways",pg07Account);
 ok(receiving.items[0].last_receipt_at,"PG09 receiving-account last receipt/health absent");
 const pg09Action=async (resource,id,action,payload={},secret=null)=>pg07DB.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[pg07WS]);
  return (await tx.unsafe(
   "SELECT pg09_action($1::uuid,'sandbox',$2,$3::uuid,$4,$5::jsonb,$6) AS data",
   [pg07WS,resource,id,action,pg07DB.json(payload),secret]))[0].data;
 });
 const pg09RenamePayload=pg07DB.json({name:"PG09 renamed fictional handset"});
 same((await pg07DB.unsafe("SELECT $1::jsonb->>'name' AS value",[pg09RenamePayload]))[0].value,"PG09 renamed fictional handset","PG09 name JSON parameter was not encoded correctly");
 same((await pg09Action("devices",device,"rename",{name:"PG09 renamed fictional handset"})).updated,true,
  "PG09 device rename operation unavailable");
 same((await pg09Read("devices",device)).items[0].name,"PG09 renamed fictional handset",
  "PG09 rename did not persist to read view");
 await pg07DB.unsafe("INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,$3)",[pg07WS,pg07Account,Buffer.alloc(48,60)]);
 same((await pg09Action("gateways",pg07Account,"disable")).updated,true,"PG09 disable receiving account failed");
 same((await pg09Read("gateways",pg07Account)).items[0].source_status,"disabled",
  "PG09 account disable was not reflected in source-status");
 same((await pg09Action("gateways",pg07Account,"enable")).updated,true,"PG09 re-enable receiving account failed");
 same((await pg09Action("webhooks",pg07Endpoint,"disable")).updated,true,
  "PG09 webhook disable unavailable");
 same((await pg09Read("webhooks",pg07Endpoint)).items[0].active,false,"PG09 disabled endpoint still active");
 same((await pg09Action("webhooks",pg07Endpoint,"enable")).updated,true,
  "PG09 webhook re-enable unavailable");
 const needsReprocess=await pg07Attempt(),needsReprocessReceipt=await pg07Receipt(needsReprocess,{amount:5401});
 same(await pg07Match(needsReprocessReceipt),"unmatched","PG09 reprocess fixture unexpectedly verified");
 const transportReprocess=(await pg07DB.unsafe(
  "INSERT INTO pg06_transport(workspace_id,environment,device_id,event_id,digest,observation_id,parse_reason,observed_at,sequence) "+
  "VALUES($1::uuid,'sandbox',$2::uuid,$3,$4,$5::uuid,'',now(),2) RETURNING id",
  [pg07WS,device,randomUUID(),hmac(),needsReprocessReceipt]))[0].id;
 same((await pg09Action("incoming",transportReprocess,"reprocess")).updated,true,
  "PG09 safe unmatched reprocess unavailable");
 same((await pg07DB.unsafe(
  "SELECT status FROM pg07_receipt_results WHERE observation_id=$1::uuid",
  [needsReprocessReceipt]))[0].status,"pending",
  "PG09 reprocess incorrectly marked funds as verified");
 same((await pg09Action("devices",device,"revoke")).updated,true,"PG09 device revoke not persisted");
 ok((await pg09Read("devices",device)).items[0].revoked_at,"PG09 revoked device still shows active");
 ok((await pg09Read("devices",device)).items[0].recent_receipts.length>=2,
  "PG09 revoked-device history was silently destroyed in dashboard");
 const audits=(await pg07DB.unsafe(
  "SELECT count(*)::int n FROM pg09_audit WHERE workspace_id=$1::uuid AND environment='sandbox' "+
  "AND resource IN ('devices','gateways','webhooks','incoming')",[pg07WS]))[0].n;
 ok(audits>=7,"PG09 authorized operations lost immutable audit history");
 const restrictedPG09=postgres(ds("ekmivo_pg04_sandbox",
  "ekmivo_finance_reader_sandbox","pg04-sandbox-reader-only"),{max:1,prepare:false});
 try{
  const readerResult=await pg09Read("payments",complete[0].id,null,null,null,null,null,null,restrictedPG09);
  same(readerResult.items[0].id,complete[0].id,"PG09 restricted reader cannot view own payment");
  await reject(restrictedPG09,()=>restrictedPG09.unsafe("UPDATE pg06_devices SET name='forged-reader-edit' WHERE id=$1::uuid",[device]),"42501");
 }finally{await restrictedPG09.end({timeout:3})}

 const wrongRealm=pg07DB;
 await reject(wrongRealm,()=>pg09Read("payments",null,null,null,null,null,null,null,wrongRealm,pg07WS,"live"),"42501");
 const dRows=await pg09Read("deliveries",pg07Endpoint);
 ok(dRows.items.length>=1&&dRows.items.every(x=>x.endpoint_id===pg07Endpoint),
  "PG09 webhook detail deliveries are not scoped by endpoint");
 console.log("PG09 isolated source-backed UI contracts PASS: chronological UUID-tie keyset pages, filters, scoped list/detail, audit-safe incoming comparison, overview and webhook correlation (FICTIONAL SANDBOX ONLY)");


 // PG09 HTTP: genuine Go API + restricted authz/finance/control DB roles
 // against the disposable PG06-PG09 finance migration. NOT a provider test.
 ok(pg09Auth&&pg09Auth.sessions.owner&&pg09Auth.sessions.viewer,
  "PG09 genuine session precondition absent");
 const apiTestBin="/tmp/ekmivo-pg09-ci-api-"+process.pid;
 execFileSync("go",["build","-o",apiTestBin,"./cmd/api"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",timeout:120000
 });
 const apiTestPort=17888,apiTestOrigin="http://127.0.0.1:"+apiTestPort;
 const apiProcess=spawn(apiTestBin,[],{cwd:new URL("../../../backend/",import.meta.url),env:{
  ...process.env,PORT:String(apiTestPort),GO_WEB_ORIGIN:apiTestOrigin,EKMIVO_REQUIRE_AUTHZ:"true",
  AUTHZ_DATABASE_URL:ds(source.pathname.slice(1),"ekmivo_financial_runtime","pg01-ci-only-password"),
  PG05_SANDBOX_DATABASE_URL:ds("ekmivo_pg04_sandbox","ekmivo_finance_reader_sandbox","pg04-sandbox-reader-only"),
  PG05_TOKEN_SECRET:pg09Auth.tokenSecret,PG05_PAYER_SECRET:pg09Auth.payerSecret,
  PG06_PIPELINE_ENABLED:"true",PG06_PARSER_RULES_JSON:await readFile(new URL("../../../examples/receipt-parser/sandbox-fixture.json",import.meta.url),"utf8"),
  PG06_ENCRYPTION_KEY_HEX:Buffer.alloc(32,88).toString("hex"),
  PG06_CONTROL_PROJECTION_URL:ds(source.pathname.slice(1),"ekmivo_financial_projection_operator","pg04-control-projection-only")
 },stdio:["ignore","pipe","pipe"]});
 let apiOutput="";
 for(const stream of [apiProcess.stdout,apiProcess.stderr])stream.on("data",chunk=>{apiOutput=(apiOutput+String(chunk)).slice(-4000)});
 try{
  let ready=false;
  for(let i=0;i<115;i++){
   if(apiProcess.exitCode!==null)throw Error("PG09 Go process exited: "+apiOutput);
   try{const res=await fetch(apiTestOrigin+"/healthz",{signal:AbortSignal.timeout(600)});
    if(res.status===200){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,170));
  }
  ok(ready,"PG09 actual Go with pipeline failed startup: "+apiOutput);
  const route=apiTestOrigin+"/v1/workspaces/"+pg07WS+"/operations/";
  const head=role=>({Cookie:"ekmivo-session="+pg09Auth.sessions[role],Origin:apiTestOrigin,"Content-Type":"application/json"});
  const none=await fetch(route+"payments?environment=sandbox");
  same(none.status,401,"PG09 real HTTP exposes finance without authentication");
  const owner=await fetch(route+"payments?environment=sandbox",{headers:head("owner")});
  same(owner.status,200,"PG09 genuine owner HTTP payment list denied");
  const ownerItems=(await owner.json()).items;
  ok(ownerItems.some(x=>x.id===complete[0].id),"PG09 actual HTTP did not return fixture payment");
  const viewer=await fetch(route+"payments?environment=sandbox",{headers:head("viewer")});
  same(viewer.status,200,"PG09 genuine read-only viewer cannot read scoped finance");
  const editor=await fetch(route+"payments?environment=sandbox",{headers:head("editor")});
  same(editor.status,200,"PG09 editor cannot read scoped finance");
  const routeSearch=await fetch(route+"payments?environment=sandbox&q="+encodeURIComponent(paymentDetail.items[0].merchant_reference),{headers:head("owner")});
  same(routeSearch.status,200,"PG09 bounded real HTTP server search unavailable");
  ok((await routeSearch.json()).items.some(x=>x.id===complete[0].id),
   "PG09 API search failed to filter source financial DB");
  const deniedWorkspace=await fetch(apiTestOrigin+"/v1/workspaces/"+randomUUID()+"/operations/payments?environment=sandbox",
   {headers:head("owner")});
  ok([403,404].includes(deniedWorkspace.status),"PG09 different workspace was readable through session");
  const deniedLive=await fetch(route+"payments?environment=live",{headers:head("owner")});
  same(deniedLive.status,503,"PG09 unconfigured live realm silently read sandbox data");
  const forbiddenViewer=await fetch(route+"webhooks/"+pg07Endpoint+"/disable?environment=sandbox",{
   method:"POST",headers:head("viewer"),body:"{}"});
  same(forbiddenViewer.status,403,"PG09 viewer could disable webhook over real Go API");
  const forbiddenEditor=await fetch(route+"webhooks/"+pg07Endpoint+"/disable?environment=sandbox",{
   method:"POST",headers:head("editor"),body:"{}"});
  same(forbiddenEditor.status,403,"PG09 editor could mutate protected webhook");
  const ownerEndpoint=await fetch(route+"webhooks?environment=sandbox",{
   method:"POST",headers:head("owner"),body:JSON.stringify({url:"https://example.invalid/pg09-ci-http"})});
  same(ownerEndpoint.status,200,"PG09 owner cannot create HTTPS endpoint over real API");
  const created=await ownerEndpoint.json();
  ok(created.id&&typeof created.signing_secret==="string"&&created.signing_secret.length>=32,
   "PG09 creation did not return once-visible signing secret");
  const ownerRead=await fetch(route+"webhooks/"+created.id+"?environment=sandbox",{headers:head("owner")});
  same(ownerRead.status,200,"PG09 created webhook not queryable");
  const readBody=await ownerRead.json();
  same(readBody.items[0].id,created.id,"PG09 created webhook detail was not persisted");
  same("signing_secret" in readBody,false,"PG09 GET re-exposed once-visible signing secret");
  const changed=await fetch(route+"webhooks/"+created.id+"/disable?environment=sandbox",{
   method:"POST",headers:head("owner"),body:"{}"});
  same(changed.status,200,"PG09 authenticated owner cannot disable endpoint");
  const disabledState=await fetch(route+"webhooks/"+created.id+"?environment=sandbox",{headers:head("owner")});
  same((await disabledState.json()).items[0].active,false,
   "PG09 successful mutation did not reflect in real database detail");
  console.log("PG09 REAL GO HTTP PASS: owner/viewer/editor sessions, restricted finance, query and create/disable endpoint, server search, once-visible signing secret, no live fallback (SYNTHETIC DB ONLY)");
  // Genuine signed HTTP -> restricted Go -> PostgreSQL matcher, fictional
  // receipt and software key only. This is NOT Android Keystore/provider proof.
  // Earlier PG05 negative tests changed control entitlements. Bring the
  // disposable finance projection current through the real provisioner;
  // signed ingress must reject stale authority rather than bypass it.
  execFileSync("go",["run","./cmd/financial-sync"],{cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",timeout:60000,env:{...env,
   PG04_PROJECTION_CONTROL_URL:ds(source.pathname.slice(1),"ekmivo_financial_projection_operator","pg04-control-projection-only"),
   PG04_PROVISIONER_SANDBOX_URL:ds("ekmivo_pg04_sandbox","ekmivo_financial_provisioner_sandbox","pg04-sandbox-provision-only"),
   PG04_PROVISIONER_LIVE_URL:ds("ekmivo_pg04_live","ekmivo_financial_provisioner_live","pg04-live-provision-only"),
   PG04_WORKSPACE_ID:pg07WS,PG04_ENVIRONMENT:"sandbox"}});
  // Current Go gateway creation uses the post-0095 consent-aware function.
  // Apply it to both disposable realms before the signed HTTP fixture.
  for(const realm of names){
   const consentSQL=await readFile(new URL("../../../infra/migrations/0095_receiving_account_consent_delete.sql",import.meta.url),"utf8");
   await dbs[realm].unsafe(consentSQL).simple();
  }
  const fixtureVersion=Number((await pg07DB.unsafe("SELECT entitlement_version version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox'",[pg07WS]))[0].version);
  const fixturePayer="+8801700000001",fixtureReceiving="+8801700000002";
  const newAccount=await fetch(route+"gateways?environment=sandbox",{method:"POST",headers:head("owner"),body:JSON.stringify({method:"bkash",account_number:fixtureReceiving})});
  same(newAccount.status,200,"signed HTTP fixture account creation failed");
  const fixtureAccount=(await newAccount.json()).id;
  const newPair=await fetch(route+"devices?environment=sandbox",{method:"POST",headers:head("owner"),body:JSON.stringify({account_id:fixtureAccount,name:"Fictional signed ingress",source:"EKMIVO_SANDBOX",binding:"sms:1",parser_id:"sandbox-incoming-v1"})});
  same(newPair.status,200,"signed HTTP fixture enrollment failed");
  const pair=(await newPair.json());
  const fixtureKeys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  let fixtureDevice="";
  async function signedPost(action,body,event=randomUUID(),stamp=String(Math.floor(Date.now()/1000)),tamper=false){
   const path="/v1/device/"+action;const raw=JSON.stringify(body);
   const canonical=["POST",path,stamp,event,createHash("sha256").update(raw).digest("hex")].join("\n");
   const signature=sign("sha256",Buffer.from(canonical),fixtureKeys.privateKey).toString("base64");
   return fetch(apiTestOrigin+path,{method:"POST",headers:{"Content-Type":"application/json","X-Ekmivo-Device-ID":fixtureDevice,"X-Ekmivo-Event-ID":event,"X-Ekmivo-Timestamp":stamp,"X-Ekmivo-Signature":signature},body:tamper?raw+" ":raw});
  }
  const claim=await signedPost("claim",{pairing_token:pair.pairing_token,public_key:fixtureKeys.publicKey.export({type:"spki",format:"der"}).toString("base64")});
  same(claim.status,200,"signed HTTP enrollment proof rejected");
  fixtureDevice=(await claim.json()).id;
  // Isolate route selection from older synthetic healthy device fixtures.
  await pg07DB.unsafe("UPDATE pg06_devices SET permission_ok=false WHERE workspace_id=$1::uuid AND environment='sandbox' AND id<>$2::uuid",[pg07WS,fixtureDevice]);
  const scoped={enrollment_id:fixtureDevice,environment:"sandbox"};
  same((await signedPost("heartbeat",{...scoped,permission_ok:true,backlog:0,model:"CI software signer",app_version:"fixture"})).status,200,"signed HTTP heartbeat failed");
  const create=await fetch(apiTestOrigin+"/v1/workspaces/"+pg07WS+"/payment-intents?environment=sandbox",{method:"POST",headers:{...head("owner"),"Idempotency-Key":"signed-ingress-"+randomUUID()},body:JSON.stringify({merchant_reference:"SIGNED-CI-"+randomUUID(),amount_minor:5500,currency:"BDT",expires_in_minutes:30})});
  same(create.status,201,"signed HTTP checkout creation failed");
  const createdIntent=await create.json();
  const lock=await fetch(apiTestOrigin+"/v1/public/checkout/"+createdIntent.checkout_token+"/lock",{method:"POST",headers:{Origin:apiTestOrigin,"Content-Type":"application/json"},body:JSON.stringify({payer_number:fixturePayer,method:"bkash"})});
  same(lock.status,200,"signed HTTP real customer payer lock failed");
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(Date.now()+2000)).map(p=>[p.type,p.value]));
  const stampText=`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  const packet={...scoped,source:"EKMIVO_SANDBOX",binding:"sms:1",kind:"device_sms",evidence:`Received 55.00 from ${fixturePayer} at ${stampText} ref CI${randomUUID().replaceAll("-","").toUpperCase()}`,observed_at:new Date().toISOString(),sequence:1};
  same((await signedPost("events",packet,randomUUID(),undefined,true)).status,403,"tampered signed HTTP packet accepted");
  same((await signedPost("events",{...packet,environment:"live"})).status,403,"signed HTTP packet crossed physical realm");
  same((await signedPost("events",{...packet,source:"WRONG_SOURCE"})).status,422,"signed wrong-source HTTP packet accepted");
  same((await signedPost("events",{...packet,evidence:"Your OTP is 123456"})).status,422,"unrelated signed OTP text persisted");
  const eventID=randomUUID();const ingest=await signedPost("events",packet,eventID);
  same(ingest.status,202,"signed HTTP receipt did not obtain durable ACK");
  const ack=await ingest.json();ok(ack.observation_id,"signed receipt was not parsed into an observation");
  const replay=await signedPost("events",packet,eventID);same(replay.status,202,"signed HTTP replay not ACKed");
  same((await replay.json()).observation_id,ack.observation_id,"signed HTTP replay duplicated receipt");
  const fixtureWorker=postgres(ds("ekmivo_pg04_sandbox","ekmivo_financial_worker_sandbox","pg04-sandbox-worker-only"),{max:1,prepare:false});
  try{same(await pg07Match(ack.observation_id,fixtureVersion,fixtureWorker),"matched","signed HTTP receipt did not automatically match");}finally{await fixtureWorker.end({timeout:3})}
  same(Number((await pg07DB.unsafe("SELECT count(*) n FROM financial_payments WHERE observation_id=$1::uuid",[ack.observation_id]))[0].n),1,"signed HTTP duplicate funded twice");
  same((await fetch(route+"devices/"+fixtureDevice+"/revoke?environment=sandbox",{method:"POST",headers:head("owner"),body:"{}"})).status,200,"signed HTTP device revocation failed");
  same((await signedPost("history",scoped)).status,403,"revoked device can still query HTTP history");
  console.log("PG06 signed HTTP -> PG07 financial matching PASS: software P256 claim, heartbeat, immutable checkout, tamper/realm/source/replay/revoke, one payment (FICTIONAL receipt; no Android/provider proof)");
 }finally{
  apiProcess.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>apiProcess.once("close",resolve)),new Promise(resolve=>setTimeout(resolve,4000))]);
  if(apiProcess.exitCode===null)apiProcess.kill("SIGKILL");
 }

 // PG08 consented customer notice: actual isolated SQL, fictional email only.
 const noticeVerify=hmac(),noticeWithdraw=hmac();
 async function noticeScope(fn){return pg07DB.begin(async tx=>{
  await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[pg07WS]);
  return fn(tx);
 });}
 const noticeContact=await noticeScope(async tx=>(await tx.unsafe(
  "SELECT pg08_notice_register($1::uuid,'sandbox',$2::uuid,$3,$4,$5,$6) AS id",
  [pg07WS,pg07Base.intent,Buffer.alloc(48,99),hmac(),noticeVerify,noticeWithdraw]))[0].id);
 same(Number((await pg07DB.unsafe("SELECT count(*) n FROM pg08_customer_notices WHERE contact_id=$1::uuid",[noticeContact]))[0].n),0,"unverified contact enqueued receipt");
 same(await noticeScope(async tx=>(await tx.unsafe("SELECT pg08_notice_verify($1::uuid,'sandbox',$2::uuid,$3) accepted",[pg07WS,randomUUID(),noticeVerify]))[0].accepted),false,"notice verification crossed checkout intent");
 same(await noticeScope(async tx=>(await tx.unsafe("SELECT pg08_notice_verify($1::uuid,'sandbox',$2::uuid,$3) accepted",[pg07WS,pg07Base.intent,noticeVerify]))[0].accepted),true,"notice contact verification failed");
 same(await noticeScope(async tx=>(await tx.unsafe("SELECT pg08_notice_verify($1::uuid,'sandbox',$2::uuid,$3) accepted",[pg07WS,pg07Base.intent,noticeVerify]))[0].accepted),false,"notice verification capability reused");
 const noticeRow=(await pg07DB.unsafe("SELECT * FROM pg08_customer_notices WHERE contact_id=$1::uuid",[noticeContact]))[0];
 ok(noticeRow?.id,"verified contact did not enqueue existing verified payment receipt");
 const noticeVersion=Number((await pg07DB.unsafe("SELECT entitlement_version n FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox'",[pg07WS]))[0].n);
 const noticeClaim=(await pg07DB.unsafe("SELECT pg08_notice_claim($1::uuid,$2) data",[noticeRow.id,noticeVersion]))[0].data;
 ok(noticeClaim?.lease_id,"notice lease unavailable");
 same((await pg07DB.unsafe("SELECT pg08_notice_claim($1::uuid,$2) data",[noticeRow.id,noticeVersion]))[0].data,null,"duplicate notice lease acquired");
 same((await pg07DB.unsafe("SELECT pg08_notice_finish($1::uuid,$2::uuid,'accepted') accepted",[noticeRow.id,randomUUID()]))[0].accepted,false,"wrong notice lease ACK accepted");
 same((await pg07DB.unsafe("SELECT pg08_notice_finish($1::uuid,$2::uuid,'unknown') accepted",[noticeRow.id,noticeClaim.lease_id]))[0].accepted,true,"notice unknown outcome not recorded");
 same((await pg07DB.unsafe("SELECT status FROM pg08_customer_notices WHERE id=$1::uuid",[noticeRow.id]))[0].status,"unknown","notice unknown outcome blindly retried");
 const noticePayment=(await pg07DB.unsafe("SELECT id FROM financial_payments WHERE attempt_id=$1::uuid",[pg07Base.attempt]))[0].id;
 const noticeHistory=await noticeScope(async tx=>(await tx.unsafe("SELECT pg08_notice_read($1::uuid,'sandbox',$2::uuid) data",[pg07WS,noticePayment]))[0].data);
 ok(Array.isArray(noticeHistory.items)&&noticeHistory.items.some(n=>n.id===noticeRow.id),"notice history missing");
 ok(!JSON.stringify(noticeHistory).includes("email_cipher"),"notice history exposed contact ciphertext");
 await reject(pg07DB,()=>noticeScope(async tx=>tx.unsafe("SELECT pg08_notice_retry($1::uuid,'sandbox',$2::uuid,'short')",[pg07WS,noticeRow.id])),"22023");
 await noticeScope(async tx=>{await tx.unsafe("SELECT pg08_notice_retry($1::uuid,'sandbox',$2::uuid,'Checked provider logs; authorize resend')",[pg07WS,noticeRow.id])});
 same((await pg07DB.unsafe("SELECT status FROM pg08_customer_notices WHERE id=$1::uuid",[noticeRow.id]))[0].status,"pending","explicit notice recovery failed");
 same(await noticeScope(async tx=>(await tx.unsafe("SELECT pg08_notice_withdraw($1::uuid,'sandbox',$2::uuid,$3) accepted",[pg07WS,pg07Base.intent,noticeWithdraw]))[0].accepted),true,"notice withdrawal failed");
 same((await pg07DB.unsafe("SELECT status FROM pg08_customer_notices WHERE id=$1::uuid",[noticeRow.id]))[0].status,"withdrawn","notice withdrawal did not suppress delivery");
 const minimized=(await pg07DB.unsafe("SELECT email_cipher IS NULL AND email_digest IS NULL AS minimized FROM pg08_notice_contacts WHERE id=$1::uuid",[noticeContact]))[0];
 ok(minimized.minimized,"withdrawn contact address was not minimized");
 await reject(pg07DB,()=>noticeScope(async tx=>tx.unsafe("SELECT pg08_notice_retry($1::uuid,'sandbox',$2::uuid,'Do not resend withdrawn consent')",[pg07WS,noticeRow.id])),"23514");
 const noticeReader=postgres(ds("ekmivo_pg04_sandbox","ekmivo_finance_reader_sandbox","pg04-sandbox-reader-only"),{max:1,prepare:false});
 try{await reject(noticeReader,()=>noticeReader.unsafe("SELECT email_cipher FROM pg08_notice_contacts"),"42501");}finally{await noticeReader.end({timeout:3})}
 const noticeControl=(await admin.unsafe("SELECT to_regclass('public.pg08_customer_notices') IS NULL absent"))[0];
 ok(noticeControl.absent,"customer notices leaked to control DB");
 console.log("PG08 customer notice SQL PASS: verified consent, same-intent capabilities, atomic receipt enqueue, lease, unknown outcome, withdrawal, secret isolation (FICTIONAL)");
 const extensionEnv={...process.env,...pg06Env,PG10_ALLOW_MIGRATION:"true",PG10_MIGRATION_DIRECTORY:new URL("../../../infra/migrations/",import.meta.url).pathname};
 execFileSync("go",["run","./cmd/financial-migrate"],{cwd:new URL("../../../backend/",import.meta.url),env:extensionEnv,stdio:"pipe",timeout:90000});
 // Both financial realms must expose the account-specific route; no SIM/phone account assignment.
 for(const realm of names){
  const accountSQL=await readFile(new URL("../../../infra/migrations/0098_checkout_account_tiles.sql",import.meta.url),"utf8");
  await dbs[realm].unsafe(accountSQL).simple();
  const capability=(await dbs[realm].unsafe("SELECT to_regprocedure('pg98_lock_account(text,text,text,text,uuid)') IS NOT NULL AS installed"))[0].installed;
  ok(capability,"Account-specific checkout migration missing in "+realm);
 }

 // Disposable finance test databases: install the new additive invoice contracts
 // after the PG10 base migration, without touching shared/prod data.
 for(const realm of ["sandbox","live"]){
  for(const filename of ["0078_invoice_numbers.sql","0079_public_invoice_details.sql","0080_invoice_public_draft.sql","0081_public_invoice_receipts.sql"]){
   const sql=await readFile(new URL("../../../infra/migrations/"+filename,import.meta.url),"utf8");
   await dbs[realm].unsafe(sql).simple();
  }
 }
 count+=await runPaymentExtensions({db:dbs.sandbox,live:dbs.live,control:admin,workspace:pg07WS,otherWorkspace:randomUUID()});
 console.log("PG10-PG17 extension source SQL cases executed against disposable realms; fictional evidence only");
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
