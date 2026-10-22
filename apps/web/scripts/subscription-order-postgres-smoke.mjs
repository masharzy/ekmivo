// Phase 5 real transaction tests on a disposable localhost-only CI database.
import postgres from "postgres";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";

const source=process.env.PG00_TEST_DATABASE_URL;
if(!source)throw Error("PG00_TEST_DATABASE_URL required");
const url=new URL(source);
if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.pathname!=="/ekmivo_pg00")
 throw Error("Refusing to run against shared or production PostgreSQL");
const opts={ssl:false,prepare:false,connect_timeout:8,max:1};
const admin=postgres(source,opts);
const target=new URL(source);target.pathname="/ekmivo";
const setup=postgres(target.toString(),opts);
const sql=postgres(target.toString(),{...opts,max:5});
const restricted=postgres(target.toString(),opts);
const ids={a:randomUUID(),b:randomUUID(),store:randomUUID(),other:randomUUID(),
 offer:randomUUID(),plan:randomUUID(),intent:randomUUID(),intent2:randomUUID(),coupon:randomUUID()};
const run=(statement,args=[])=>sql.unsafe(statement,args);
const check=(value,label)=>{if(!value)throw Error("FAILED "+label)};
async function denied(fn,label){
 let caught;try{await fn()}catch(e){caught=e}
 check(caught?.message===label,"expected denial "+label+", got "+(caught?.message||"success"));
}
async function request(actor,store,intent,operation,payload={}){
 const rows=await run("SELECT platform_subscription_order_request($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb) AS result",
  [store,actor,intent,operation,payload]);
 return rows[0].result;
}
function setConsent(policy,changes={}){
 return Object.fromEntries(["terms","privacy","refund"].map(kind=>
  [kind,{accepted:true,id:policy[kind].id,sha256:policy[kind].sha256,...changes[kind]}]));
}
try{
 await admin.unsafe("CREATE DATABASE ekmivo");
 await setup.unsafe("CREATE ROLE ekmivo_runtime NOLOGIN; CREATE ROLE ekmivo_financial_runtime NOLOGIN;");
 await setup.unsafe("CREATE TABLE app_users(id uuid PRIMARY KEY,email text,disabled_at timestamptz,email_verified_at timestamptz);"+
  "CREATE TABLE workspaces(id uuid PRIMARY KEY,name text,created_by uuid REFERENCES app_users(id));"+
  "CREATE TABLE workspace_members(workspace_id uuid REFERENCES workspaces(id),user_id uuid REFERENCES app_users(id),role text);"+
  "CREATE TABLE auth_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES app_users(id),token_hash text UNIQUE,expires_at timestamptz,revoked_at timestamptz,mfa_verified_at timestamptz);"+
  "CREATE TABLE platform_auth_settings(singleton boolean PRIMARY KEY,email_verification_enabled boolean);"+
  "CREATE TABLE platform_admin_mfa(user_id uuid REFERENCES app_users(id),confirmed_at timestamptz);"+
  "CREATE TABLE platform_administrators(user_id uuid REFERENCES app_users(id),role text);"+
  "CREATE TABLE platform_admin_audit(actor_id uuid REFERENCES app_users(id),action text,description text,subject_id uuid);"+
  "CREATE TABLE payment_plan_versions(id uuid PRIMARY KEY,plan_id text,terms jsonb);"+
  "CREATE TABLE payment_plan_catalog(plan_id text PRIMARY KEY,status text,visibility text,current_version uuid);"+
  "CREATE TABLE pg13_platform_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid REFERENCES workspaces(id),status text NOT NULL DEFAULT 'pending',source_payment_id uuid,paid_at timestamptz,plan_id text,plan_version_id uuid,amount_minor bigint NOT NULL,period_days integer,grace_days integer,creation_key text UNIQUE,cycle_count integer,billing_operation text,tax_minor bigint);"+
  "CREATE FUNCTION pg13_actor(w uuid,a uuid,must_check boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a AND m.role='owner') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; END $$;"+
  "CREATE FUNCTION pg13_capability_override(w uuid,a uuid,cap text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;"+
  "CREATE FUNCTION payment_plan_claim_free(w uuid,a uuid,p text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'No free purchase in Phase 5 test'; END $$;");
 const migrations=[
  "0133_platform_subscription_checkout_foundation.sql","0134_platform_subscription_coupon_admin.sql",
  "0135_subscription_coupon_admin_audit_subject_fix.sql","0140_platform_subscription_policy_catalog.sql",
  "0145_platform_subscription_coupon_versions.sql","0146_platform_subscription_coupon_lifecycle.sql",
  "0147_platform_subscription_coupon_restrictions.sql","0148_platform_subscription_coupon_tax_requote.sql",
  "0149_platform_subscription_coupon_quote_read.sql","0151_phase4_durable_purchase_intents.sql",
  "0152_platform_subscription_order_summary.sql"
 ];
 for(const name of migrations){
  try{await setup.unsafe(await readFile(new URL("../../../infra/migrations/"+name,import.meta.url),"utf8"))}
  catch(e){throw Error("MIGRATION "+name+": "+e.message)}
 }
 console.log("PHASE5 SQL MIGRATIONS PASS: all Phase 3, Phase 4 and Phase 5 prerequisites applied");
 await run("INSERT INTO app_users(id,email,email_verified_at) VALUES($1,'a@example.invalid',now()),($2,'b@example.invalid',now())",[ids.a,ids.b]);
 await run("INSERT INTO workspaces(id,name,created_by) VALUES($1,'CI primary',$2),($3,'CI other',$4)",
  [ids.store,ids.a,ids.other,ids.b]);
 await run("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')",
  [ids.store,ids.a,ids.other,ids.b]);
 await run("INSERT INTO platform_primary_stores(user_id,workspace_id,bound_by) VALUES($1,$2,$1),($3,$4,$3)",
  [ids.a,ids.store,ids.b,ids.other]);
 await run("INSERT INTO payment_plan_versions(id,plan_id,terms) VALUES($1,'ci-pro',$2::jsonb)",
  [ids.plan,{kind:"paid",period_days:30,grace_days:3}]);
 await run("INSERT INTO payment_plan_catalog(plan_id,status,visibility,current_version) VALUES('ci-pro','published','public',$1)",[ids.plan]);
 await run("INSERT INTO platform_subscription_offers(offer_key,product,status,created_by) VALUES('phase5_ci_plan','payments','draft',$1)",[ids.a]);
 await run("INSERT INTO platform_subscription_offer_versions(id,offer_key,revision,term,amount_minor,payment_plan_version_id,terms,created_by) VALUES($1,'phase5_ci_plan',1,'monthly',10000,$2,$3::jsonb,$4)",
  [ids.offer,ids.plan,{name:"CI Payments"},ids.a]);
 await run("UPDATE platform_subscription_offers SET status='published',current_version_id=$1 WHERE offer_key='phase5_ci_plan'",[ids.offer]);
 await run("INSERT INTO platform_subscription_tax_policies(product,term,rate_bps,approved_by,reason) VALUES('payments','monthly',500,$1,'Fictional CI approved tax rule')",[ids.a]);
 await run("INSERT INTO platform_subscription_purchase_intents(id,actor_id,workspace_id,offer_version_id,public_token_sha256) VALUES($1,$2,$3,$4,$5),($6,$2,$3,$4,$7)",
  [ids.intent,ids.a,ids.store,ids.offer,"a".repeat(64),ids.intent2,"b".repeat(64)]);
 await denied(()=>request(ids.a,ids.store,ids.intent,"quote"),"POLICY_UNAVAILABLE");
 for(const kind of ["terms","privacy","refund"])
  await run("INSERT INTO platform_subscription_policy_versions(kind,version_label,url,content_sha256,status,created_by) VALUES($1,'v1',$2,$3,'published',$4)",
   [kind,"https://example.invalid/ci-"+kind,kind[0].repeat(64),ids.a]);
 const policies=(await run("SELECT platform_subscription_policy_public() AS docs"))[0].docs;
 check(Object.keys(policies).length===3,"three published documents");
 await denied(()=>request(ids.b,ids.store,ids.intent,"read"),"FORBIDDEN");
 await denied(()=>request(ids.a,ids.other,ids.intent,"read"),"FORBIDDEN");
 await restricted.unsafe("SET ROLE ekmivo_runtime");
 await denied(()=>restricted.unsafe("SELECT * FROM platform_subscription_order_confirmations"),
  "permission denied for table platform_subscription_order_confirmations");
 await restricted.unsafe("RESET ROLE");
 const q1=await request(ids.a,ids.store,ids.intent,"quote");
 const r1=await request(ids.a,ids.store,ids.intent,"read");
 check(q1.quote_id===r1.quote.id && r1.quote.total_minor==="10500","base and 5% approved tax");
 const key="phase5_ci_confirm_00000001";
 await denied(()=>request(ids.a,ids.store,ids.intent,"confirm",{quote_id:q1.quote_id,idempotency_key:key}),
  "POLICY_ACCEPTANCE_REQUIRED");
 await denied(()=>request(ids.a,ids.store,ids.intent,"confirm",
  {quote_id:q1.quote_id,idempotency_key:key,consents:setConsent(policies,{privacy:{accepted:false}})}),
  "POLICY_ACCEPTANCE_REQUIRED");
 await denied(()=>request(ids.a,ids.store,ids.intent,"confirm",
  {quote_id:q1.quote_id,idempotency_key:key,consents:setConsent(policies,{refund:{sha256:"f".repeat(64)}})}),
  "POLICY_CHANGED");
 await run("UPDATE platform_subscription_purchase_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",[q1.quote_id]);
 await denied(()=>request(ids.a,ids.store,ids.intent,"confirm",
  {quote_id:q1.quote_id,idempotency_key:key,consents:setConsent(policies)}),"QUOTE_STALE");
 const q2=await request(ids.a,ids.store,ids.intent,"quote");
 check(q1.quote_id!==q2.quote_id,"expired quote replacement");
 const confirmation={quote_id:q2.quote_id,idempotency_key:key,consents:setConsent(policies)};
 const [first,again]=await Promise.all([
  request(ids.a,ids.store,ids.intent,"confirm",confirmation),
  request(ids.a,ids.store,ids.intent,"confirm",confirmation)]);
 check(first.invoice_id===again.invoice_id&&first.quote_id===again.quote_id,"concurrent idempotency");
 const recovered=await request(ids.a,ids.store,ids.intent,"read");
 check(recovered.status==="confirmed"&&recovered.invoice_id===first.invoice_id,"unknown response recovery");
 const count=await run("SELECT count(*)::int AS n FROM pg13_platform_invoices WHERE creation_key=$1",
  ["saas-order:"+ids.intent]);
 check(count[0].n===1,"one invoice for concurrent confirm");
 const consents=await run("SELECT policy_kind FROM platform_subscription_policy_acceptances WHERE intent_id=$1",[ids.intent]);
 check(consents.length===3&&new Set(consents.map(x=>x.policy_kind)).size===3,"three distinct consent receipts");
 const otherQuote=await request(ids.a,ids.store,ids.intent2,"quote");
 await denied(()=>request(ids.a,ids.store,ids.intent2,"confirm",
  {...confirmation,quote_id:otherQuote.quote_id}),"IDEMPOTENCY_CONFLICT");
 await run("INSERT INTO platform_subscription_coupons(id,code_normalized,status,discount_kind,percent_bps,created_by,updated_by) VALUES($1,'PHASE5_CI_10','active','percent',1000,$2,$2)",
  [ids.coupon,ids.a]);
 const quoteBefore=await request(ids.a,ids.store,ids.intent2,"read");
 await run("SELECT platform_subscription_coupon_quote($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5)",
  [ids.a,ids.intent2,randomUUID(),quoteBefore.intent_revision,"PHASE5_CI_10"]);
 const afterApply=await request(ids.a,ids.store,ids.intent2,"read");
 check(afterApply.quote.coupon_discount_minor==="1000"&&afterApply.quote.tax_minor==="450"
   &&afterApply.quote.total_minor==="9450","coupon Apply with correct tax rounding");
 await run("SELECT platform_subscription_coupon_quote($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5)",
  [ids.a,ids.intent2,randomUUID(),afterApply.intent_revision,""]);
 const afterRemove=await request(ids.a,ids.store,ids.intent2,"read");
 check(afterRemove.quote.total_minor==="10500"&&afterRemove.selected_coupon_code===null,"coupon Remove");
 console.log("PHASE5 POSTGRES PASS: roles, tenants, 3 consents, quote expiry, invoice race, recovery, coupon/tax");
}catch(e){
 console.error("PHASE5 POSTGRES FAILED:",String(e.message||e).replaceAll(/postgres(?:ql)?:\/\/\S+/g,"[redacted]"));
 process.exitCode=1;
}finally{
 await restricted.end({timeout:4}).catch(()=>{});
 await sql.end({timeout:4}).catch(()=>{});
 await setup.end({timeout:4}).catch(()=>{});
 await admin.end({timeout:4}).catch(()=>{});
}
