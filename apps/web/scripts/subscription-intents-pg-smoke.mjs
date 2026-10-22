// Only the disposable PostgreSQL service from CI, never production or a shared Neon branch.
import {readFileSync} from "node:fs";
import postgres from "postgres";
const urlText=process.env.PG00_TEST_DATABASE_URL;
if(!urlText)throw Error("Missing isolated CI PostgreSQL URL");
const u=new URL(urlText);
if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||u.pathname!=="/ekmivo_pg00")
 throw Error("Refusing non-ephemeral or remote database");
const opts={ssl:false,max:1,prepare:false,connect_timeout:8};
const admin=postgres(urlText,opts);
const test=postgres(new URL("/ekmivo",u).toString(),opts);
const file=readFileSync(new URL("../../../infra/migrations/0151_phase4_durable_purchase_intents.sql",import.meta.url),"utf8");
const assert=(v,m)=>{if(!v)throw Error(m)};
async function rejects(query,label){let denied=false;try{await query()}catch{denied=true}assert(denied,"Invalid accepted: "+label)}
try{
 await admin.unsafe("CREATE DATABASE ekmivo");
 await test.unsafe("CREATE TABLE platform_subscription_purchase_intents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, status text NOT NULL DEFAULT 'selected' CHECK(status IN ('selected','quoted','confirmed','paid','cancelled','expired')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT (now()+interval '1 hour'))");
 const before=await test.unsafe("INSERT INTO platform_subscription_purchase_intents DEFAULT VALUES RETURNING id");
 await test.unsafe(file);
 const old=await test.unsafe("SELECT public_token_sha256,guest_session_sha256,requested_quantity FROM platform_subscription_purchase_intents WHERE id=$1",[before[0].id]);
 assert(old.length===1&&old[0].public_token_sha256===null&&Number(old[0].requested_quantity)===1,"Existing intent changed");
 const token="a".repeat(64),second="b".repeat(64),guest="c".repeat(64);
 await test.unsafe("INSERT INTO platform_subscription_purchase_intents(status,public_token_sha256,guest_session_sha256,requested_quantity,legacy_plan_id,expires_at) VALUES('selected',$1,$2,1,'starter',now()+interval '6 days')",[token,guest]);
 await test.unsafe("INSERT INTO platform_subscription_purchase_intents(status,public_token_sha256,guest_session_sha256,requested_quantity,expires_at) VALUES('claimed_free',$1,$2,1,now()+interval '6 days')",[second,guest]);
 const c=await test.unsafe("SELECT conname FROM pg_constraint WHERE conrelid='platform_subscription_purchase_intents'::regclass");
 for(const name of ["platform_purchase_token_digest_ck","platform_purchase_guest_session_digest_ck","platform_purchase_quantity_ck","platform_purchase_legacy_plan_ck","platform_purchase_expiration_bound_ck"])
  assert(c.some(row=>row.conname===name),"Missing "+name);
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(public_token_sha256) VALUES($1)",[token]),"duplicate public digest");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(public_token_sha256) VALUES('wrong')"),"invalid public digest");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(guest_session_sha256) VALUES('wrong')"),"invalid session digest");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(requested_quantity) VALUES(0)"),"invalid quantity");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(legacy_plan_id) VALUES('https://evil.example')"),"malicious plan");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(expires_at) VALUES(now()+interval '8 days')"),"unbounded expiry");
 await rejects(()=>test.unsafe("INSERT INTO platform_subscription_purchase_intents(status) VALUES('paid_by_redirect')"),"invalid status");
 const ix=await test.unsafe("SELECT indexname FROM pg_indexes WHERE tablename='platform_subscription_purchase_intents'");
 assert(ix.some(row=>row.indexname==="platform_purchase_public_token_idx"),"Missing public digest index");
 assert(ix.some(row=>row.indexname==="platform_purchase_guest_session_idx"),"Missing guest index");

 // Execute the actual SECURITY DEFINER lifecycle against typed independent
 // service fixtures. This database is newly created for this one CI run.
 await test.unsafe("ALTER TABLE platform_subscription_purchase_intents ADD COLUMN offer_version_id uuid, ADD COLUMN coupon_id uuid, ADD COLUMN creation_key text UNIQUE, ADD COLUMN workspace_id uuid, ADD COLUMN revision bigint NOT NULL DEFAULT 1, ADD COLUMN confirmed_invoice_id uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()");
 await test.unsafe("CREATE TABLE app_users(id uuid PRIMARY KEY, disabled_at timestamptz)");
 await test.unsafe("CREATE TABLE platform_subscription_offers(offer_key text PRIMARY KEY,product text,status text,current_version_id uuid)");
 await test.unsafe("CREATE TABLE platform_subscription_offer_versions(id uuid PRIMARY KEY,offer_key text,term text,amount_minor bigint,payment_plan_version_id uuid,currency text)");
 await test.unsafe("CREATE TABLE payment_plan_catalog(plan_id text,current_version uuid,status text,visibility text)");
 await test.unsafe("CREATE TABLE payment_plan_versions(id uuid,terms jsonb)");
 await test.unsafe("CREATE TABLE platform_subscription_coupons(id uuid PRIMARY KEY,code_normalized text,status text,starts_at timestamptz,expires_at timestamptz,eligible_offer_keys text[],eligible_products text[],eligible_terms text[])");
 await test.unsafe("CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text)");
 await test.unsafe("CREATE TABLE platform_primary_stores(user_id uuid,workspace_id uuid)");
 await test.unsafe("CREATE TABLE platform_subscription_coupon_reservations(intent_id uuid,status text)");
 await test.unsafe("CREATE TABLE platform_subscription_purchase_audit(intent_id uuid,actor_id uuid,action text)");
 await test.unsafe("CREATE FUNCTION pg13_capability_override(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT NULL::boolean'");
 const user1="00000000-0000-4000-8000-000000000101",user2="00000000-0000-4000-8000-000000000102";
 const store1="00000000-0000-4000-8000-000000000201",store2="00000000-0000-4000-8000-000000000202";
 const version="00000000-0000-4000-8000-000000000301",gateway="00000000-0000-4000-8000-000000000302";
 const product="payments_tiny";
 await test.unsafe("INSERT INTO app_users(id) VALUES($1::uuid),($2::uuid)",[user1,user2]);
 await test.unsafe("INSERT INTO platform_subscription_offers(offer_key,product,status,current_version_id) VALUES($1,'payments','published',$2::uuid)",[product,version]);
 await test.unsafe("INSERT INTO platform_subscription_offer_versions(id,offer_key,term,amount_minor,payment_plan_version_id,currency) VALUES($1::uuid,$2,'monthly',15000,$3::uuid,'BDT')",[version,product,gateway]);
 await test.unsafe("INSERT INTO payment_plan_catalog(plan_id,current_version,status,visibility) VALUES('tiny',$1::uuid,'published','public')",[gateway]);
 await test.unsafe("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner'),($3::uuid,$4::uuid,'owner')",[store1,user1,store2,user2]);
 await test.unsafe("INSERT INTO platform_primary_stores(user_id,workspace_id) VALUES($1::uuid,$2::uuid)",[user1,store1]);
 const capability="d".repeat(64),session="e".repeat(64),creation="f".repeat(64);
 const selection={offer_key:product,term:"monthly",version_id:version,quantity:1,creation_key:creation,coupon_code:""};
 const rpc=async(op,actor,sessionHash= session,cap=capability,payload={})=>{
  const rows=await test.unsafe("SELECT platform_subscription_intent_command($1::text,$2::uuid,$3::text,$4::text,$5::jsonb) AS result",[op,actor||null,sessionHash,cap,JSON.stringify(payload)]);
  return rows[0].result;
 };
 const flags=await test.unsafe("SELECT ($1::text IN ('create','read','bind_identity','bind_store','cancel','claim_free','revalidate')) AS operation_ok,length($2::text) AS cap_length,length($3::text) AS guest_length,jsonb_typeof($4::jsonb) AS payload_type,pg_column_size($4::jsonb) AS payload_bytes",["create",capability,session,JSON.stringify(selection)]);
 console.log("PHASE4 synthetic RPC argument checks:",JSON.stringify(flags[0]));
 let created;
 try{created=await rpc("create",null,session,capability,selection);}catch(e){throw Error("Phase4 initial create: "+(e instanceof Error?e.message:"unknown"));}
 assert(created.ok===true,"Guest selection RPC failed");
 assert((await rpc("create",null,session,capability,selection)).ok===true,"Idempotent create retry failed");
 const initially=await rpc("read",null);
 assert(initially.offer_key===product&&initially.term==="monthly"&&initially.actor_id===null,"Guest read cannot recover selection");
 await rejects(()=>rpc("read",null,"0".repeat(64)), "cross-browser stolen token without guest session");
 await rejects(()=>rpc("create",null,session,capability,{...selection,quantity:2}),"replayed key changed quantity");
 assert((await rpc("bind_identity",user1)).ok===true,"Guest owner bind failed");
 await rejects(()=>rpc("bind_identity",user2),"other user claimed bound purchase");
 assert((await rpc("bind_store",user1,session,capability,{store_id:store1})).ok===true,"Owned Store bind denied");
 const bound=await rpc("read",user1);
 assert(bound.workspace_id===store1&&bound.actor_id===user1,"Store and actor not persisted");
 await rejects(()=>rpc("read",user2),"Cross-account read exposed intent");
 await rejects(()=>rpc("bind_store",user1,session,capability,{store_id:store2}),"Primary Store isolation bypassed");
 assert((await rpc("revalidate",user1)).ok===true,"Published pinned offer not revalidated");
 await rejects(()=>rpc("claim_free",user1),"Paid offer converted to free claim");
 await rejects(()=>rpc("cancel",user1,session,capability,{revision:bound.revision+1}),"Stale revision cancelled");
 assert((await rpc("cancel",user1,session,capability,{revision:bound.revision})).status==="cancelled","Authorized cancellation failed");
 await rejects(()=>rpc("revalidate",user1),"Cancelled offer revalidated");
 await rejects(()=>rpc("cancel",user1,session,capability,{revision:bound.revision}),"Cancelled intent reused");
 const audits=await test.unsafe("SELECT action FROM platform_subscription_purchase_audit ORDER BY action");
 assert(audits.some(x=>x.action==="selection_cancelled"),"Cancellation audit missing");
 console.log("PHASE4 LIFECYCLE PASS: guest, idempotency, actor bind, primary Store, cross-identity denial, paid-free exclusion, stale revision and cancellation");
 console.log("PHASE4 SQL PASS: migration 0151, no legacy rewrite, digest uniqueness, expiry, quantity, free state and negative constraints");
}finally{
 await test.end({timeout:3}).catch(()=>{});
 await admin.end({timeout:3}).catch(()=>{});
}
