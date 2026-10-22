// Phase 3: actual PostgreSQL multi-connection last-slot race on a disposable
// localhost-only CI database. It must never connect to Neon or production.
import postgres from "postgres";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";

const source=process.env.PG00_TEST_DATABASE_URL;
if(!source)throw Error("PG00_TEST_DATABASE_URL required");
const url=new URL(source);
if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.pathname!=="/ekmivo_pg00")
 throw Error("Coupon concurrency test permits only the ephemeral CI PostgreSQL database");

const admin=postgres(source,{max:1,prepare:false,connect_timeout:8,ssl:false});
const target=new URL(source);target.pathname="/ekmivo";
const sql=postgres(target.toString(),{max:4,prepare:false,connect_timeout:8,ssl:false});
const quote="SELECT platform_subscription_coupon_quote($1::uuid,$2::uuid,$3::uuid,$4,$5) AS result";
const ids={a:randomUUID(),b:randomUUID(),one:randomUUID(),two:randomUUID(),version:randomUUID(),
 intent1:randomUUID(),intent2:randomUUID(),coupon:randomUUID(),q1:randomUUID(),q2:randomUUID()};
const migrations=["0133_platform_subscription_checkout_foundation.sql","0134_platform_subscription_coupon_admin.sql",
 "0135_subscription_coupon_admin_audit_subject_fix.sql","0145_platform_subscription_coupon_versions.sql",
 "0146_platform_subscription_coupon_lifecycle.sql","0147_platform_subscription_coupon_restrictions.sql",
 "0148_platform_subscription_coupon_tax_requote.sql","0149_platform_subscription_coupon_quote_read.sql"];

try{
 // The PostgreSQL service is private to this one CI job and disposed afterward.
 await admin.unsafe("CREATE DATABASE ekmivo");
 await sql.unsafe(`
  CREATE ROLE ekmivo_runtime NOLOGIN;
  CREATE ROLE ekmivo_financial_runtime NOLOGIN;
  CREATE TABLE app_users(id uuid PRIMARY KEY,disabled_at timestamptz);
  CREATE TABLE workspaces(id uuid PRIMARY KEY,name text,created_by uuid REFERENCES app_users(id));
  CREATE TABLE workspace_members(workspace_id uuid REFERENCES workspaces(id),user_id uuid REFERENCES app_users(id),role text);
  CREATE TABLE auth_sessions(id uuid PRIMARY KEY);
  CREATE TABLE platform_administrators(user_id uuid REFERENCES app_users(id),role text);
  CREATE TABLE platform_admin_audit(actor_id uuid REFERENCES app_users(id),action text,description text);
  CREATE TABLE payment_plan_versions(id uuid PRIMARY KEY);
  CREATE TABLE pg13_platform_invoices(id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),
   status text NOT NULL DEFAULT 'pending',source_payment_id uuid,paid_at timestamptz,amount_minor bigint NOT NULL);
  CREATE FUNCTION pg13_actor(w uuid,a uuid,must_check boolean) RETURNS void
   LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a AND m.role='owner')
    THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   END $$;
  CREATE FUNCTION pg13_capability_override(w uuid,a uuid,cap text) RETURNS boolean
   LANGUAGE sql AS $$ SELECT true $$;
 `);
 for(const name of migrations){
  const body=await readFile(new URL(`../../../infra/migrations/${name}`,import.meta.url),"utf8");
  await sql.unsafe(body);
 }
 await sql`INSERT INTO app_users(id) VALUES(${ids.a}::uuid),(${ids.b}::uuid)`;
 await sql`INSERT INTO workspaces(id,name,created_by) VALUES
  (${ids.one}::uuid,'Fictional CI store A',${ids.a}::uuid),
  (${ids.two}::uuid,'Fictional CI store B',${ids.b}::uuid)`;
 await sql`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
  (${ids.one}::uuid,${ids.a}::uuid,'owner'),(${ids.two}::uuid,${ids.b}::uuid,'owner')`;
 await sql`INSERT INTO platform_subscription_offers(offer_key,product,status,created_by)
  VALUES('phase3_ci_race','ai_credit','draft',${ids.a}::uuid)`;
 await sql`INSERT INTO platform_subscription_offer_versions(id,offer_key,revision,term,amount_minor,terms,created_by)
  VALUES(${ids.version}::uuid,'phase3_ci_race',1,'one_time',10000,'{"included_ai_credits":1}',${ids.a}::uuid)`;
 await sql`UPDATE platform_subscription_offers SET status='published',current_version_id=${ids.version}::uuid
  WHERE offer_key='phase3_ci_race'`;
 await sql`INSERT INTO platform_subscription_tax_policies(product,term,rate_bps,approved_by,reason)
  VALUES('ai_credit','one_time',0,${ids.a}::uuid,'Fictional CI policy only, no tax assumption')`;
 await sql`INSERT INTO platform_subscription_coupons(id,code_normalized,status,discount_kind,percent_bps,max_redemptions,created_by,updated_by)
  VALUES(${ids.coupon}::uuid,'RACE_ONE_SLOT','active','percent',1000,1,${ids.a}::uuid,${ids.a}::uuid)`;
 await sql`INSERT INTO platform_subscription_purchase_intents(id,actor_id,workspace_id,offer_version_id)
  VALUES(${ids.intent1}::uuid,${ids.a}::uuid,${ids.one}::uuid,${ids.version}::uuid),
        (${ids.intent2}::uuid,${ids.b}::uuid,${ids.two}::uuid,${ids.version}::uuid)`;
 await sql`INSERT INTO platform_subscription_purchase_quotes(id,intent_id,revision,offer_version_id,subtotal_minor,total_minor)
  VALUES(${ids.q1}::uuid,${ids.intent1}::uuid,1,${ids.version}::uuid,10000,10000),
        (${ids.q2}::uuid,${ids.intent2}::uuid,1,${ids.version}::uuid,10000,10000)`;
 await sql`INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor)
  VALUES(${ids.q1}::uuid,1,'Fictional',${ids.version}::uuid,1,10000,10000),
        (${ids.q2}::uuid,1,'Fictional',${ids.version}::uuid,1,10000,10000)`;

 const start=Date.now();
 const attempts=await Promise.allSettled([
  sql.unsafe(quote,[ids.a,ids.intent1,randomUUID(),1,"RACE_ONE_SLOT"]),
  sql.unsafe(quote,[ids.b,ids.intent2,randomUUID(),1,"RACE_ONE_SLOT"]),
 ]);
 const successes=attempts.filter(x=>x.status==="fulfilled");
 const failures=attempts.filter(x=>x.status==="rejected");
 if(successes.length!==1||failures.length!==1||failures[0].reason?.message!=="COUPON_INELIGIBLE")
  throw Error(`Last-slot race mismatch: successes=${successes.length}, denied=${failures.length}, deniedCode=${failures[0]?.reason?.code||"none"}`);
 const capacity=await sql`SELECT count(*)::int AS n FROM platform_subscription_coupon_reservations WHERE coupon_id=${ids.coupon}::uuid AND status='reserved'`;
 const redeemed=await sql`SELECT count(*)::int AS n FROM platform_subscription_coupon_redemptions WHERE coupon_id=${ids.coupon}::uuid`;
 if(capacity[0].n!==1||redeemed[0].n!==0)throw Error("Concurrent last-slot claim overbooked or redeemed before payment");
 console.log(`Phase3 PostgreSQL multi-connection exhaustion PASS: exactly 1/2 reserved; 1 rejected; 0 redeemed; ${Date.now()-start}ms`);
}catch(error){
 console.error("Phase3 PostgreSQL race FAILED:",error instanceof Error?error.message.replaceAll(/postgres(?:ql)?:\/\/\S+/g,"[redacted]"):"unknown");
 process.exitCode=1;
}finally{
 await sql.end({timeout:5});await admin.end({timeout:5});
}
