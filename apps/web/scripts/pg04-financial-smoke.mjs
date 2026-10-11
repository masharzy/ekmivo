import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,randomBytes,createHmac,createHash} from "node:crypto";
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

 // PG05: run only on the two disposable finance DBs used for PG04 CI.
 const pg05Env={...env,PG05_ALLOW_MIGRATION:"true",
  PG05_CONTROL_MIGRATION_FILE:new URL("../../../infra/migrations/0013_pg05_public_business.sql",import.meta.url).pathname,
  PG05_FINANCIAL_MIGRATION_FILE:new URL("../../../infra/migrations/0010_pg05_checkout.sql",import.meta.url).pathname,
   PG05_INTEGRITY_MIGRATION_FILE:new URL("../../../infra/migrations/0012_pg05_source_integrity.sql",import.meta.url).pathname,
   PG05_LINKED_MIGRATION_FILE:new URL("../../../infra/migrations/0011_pg05_linked_sources.sql",import.meta.url).pathname};
 for(let i=0;i<2;i++)execFileSync("go",["run","./cmd/financial-migrate"],{
  cwd:new URL("../../../backend/",import.meta.url),stdio:"inherit",env:pg05Env,timeout:100000
 });
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
   const racing=await Promise.all(Array.from({length:5},()=>fetch(intentUrl,{method:"POST",headers:{...head("editor"),"Idempotency-Key":randomUUID()},body:JSON.stringify(racePayload)})));
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
