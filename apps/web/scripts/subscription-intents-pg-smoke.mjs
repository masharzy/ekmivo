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
 console.log("PHASE4 SQL PASS: migration 0151, no legacy rewrite, digest uniqueness, expiry, quantity, free state and negative constraints");
}finally{
 await test.end({timeout:3}).catch(()=>{});
 await admin.end({timeout:3}).catch(()=>{});
}
