// Phase 6 transaction/role regression against an explicitly disposable CI DB.
// Requires Phase 5 smoke to have applied Phase 3–5 fixtures in the same job.
// No credentials, production connection, external payments or fixture cleanup.
import postgres from "postgres";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";

const url=new URL(process.env.PG00_TEST_DATABASE_URL||"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.pathname!=="/ekmivo_pg00")
 throw Error("Phase 6 fixture only accepts the disposable CI Postgres database");
url.pathname="/ekmivo";
const db=postgres(url.toString(),{ssl:false,prepare:false,max:6,connect_timeout:8});
// Multi-statement migration files need one reserved connection, while the
// separate application pool below must remain concurrent for bind/race checks.
const migrationDb=postgres(url.toString(),{ssl:false,prepare:false,max:1,connect_timeout:8});
const runtimeDb=postgres(url.toString(),{ssl:false,prepare:false,max:1,connect_timeout:8});
const sql=(query,args=[])=>db.unsafe(query,args);
const assert=(condition,label)=>{if(!condition)throw Error("PHASE6 FAILED: "+label)};
const deny=async(callback,label)=>{
 let rejected=false;
 try{await callback()}catch{rejected=true}
 assert(rejected,label+" must be denied");
};
try{
 const confirmed=await sql("SELECT c.*,i.coupon_id,i.offer_version_id,i.expires_at AS intent_expires_at FROM platform_subscription_order_confirmations c JOIN platform_subscription_purchase_intents i ON i.id=c.intent_id ORDER BY c.accepted_at");
 assert(confirmed.length>=2,"Phase 5 confirmed invoices are prerequisites");
 const withCoupon=confirmed.find(c=>c.coupon_id),withoutCoupon=confirmed.find(c=>!c.coupon_id);
 assert(withCoupon&&withoutCoupon,"coupon/no-coupon confirmed snapshots");
 const systemReceiver=randomUUID(),systemActor=randomUUID();
 await sql("CREATE ROLE ekmivo_financial_projection NOLOGIN");
 await sql("INSERT INTO app_users(id,email,email_verified_at) VALUES($1,'system@phase6.invalid',now())",[systemActor]);
 await sql("INSERT INTO workspaces(id,name,created_by) VALUES($1,'CI protected receiver',$2)",[systemReceiver,systemActor]);
 // The Phase 5 source fixture uses a deliberately minimal PG13 schema; add
 // the actual 0096 receiver columns/functions needed by the Phase 6 boundary.
 await sql("ALTER TABLE pg13_platform_invoices ADD COLUMN receiving_workspace_id uuid REFERENCES workspaces(id)");
 await sql("CREATE TABLE platform_billing_settings(singleton boolean PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id))");
 await sql("INSERT INTO platform_billing_settings VALUES(true,$1)",[systemReceiver]);
 await sql("CREATE FUNCTION platform_billing_workspace() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT workspace_id FROM platform_billing_settings WHERE singleton $$");
 await sql("CREATE FUNCTION platform_billing_invoice_receiver(w uuid,i uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT receiving_workspace_id FROM pg13_platform_invoices WHERE workspace_id=w AND id=i $$");
 await sql("UPDATE pg13_platform_invoices SET receiving_workspace_id=$1,status='issued' WHERE id=ANY($2::uuid[])",[systemReceiver,confirmed.map(c=>c.invoice_id)]);
 // PG13 real billing verification is exercised by the full finance suite.
 // This tiny substitute exercises control-plane atomicity, not provider proof.
 await sql("CREATE FUNCTION pg13_billing_verified(w uuid,invoice uuid,payment uuid,amount bigint,verified_time timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE pg13_platform_invoices SET status='paid',source_payment_id=payment,paid_at=verified_time WHERE id=invoice AND workspace_id=w AND amount_minor=amount AND status='issued'; IF NOT FOUND THEN RAISE EXCEPTION 'not verified'; END IF; RETURN true; END $$");
 const migration=await readFile(new URL("../../../infra/migrations/0153_platform_subscription_payment_handoff.sql",import.meta.url),"utf8");
 await migrationDb.unsafe(migration);
 console.log("PHASE6 POSTGRES migration 0153 after Phase 3/4/5 PASS");
 const bind=(item,digest)=>sql(
  "SELECT platform_subscription_payment_bind($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7) AS result",
  [item.workspace_id,item.actor_id,item.intent_id,item.quote_id,item.invoice_id,systemReceiver,digest]);
 const firstDigest="d".repeat(64),couponDigest="e".repeat(64);
 await deny(()=>bind(withCoupon,"not-a-sha"),"invalid capability digest");
 await deny(()=>bind({...withCoupon,actor_id:systemActor},couponDigest),"cross-user bind");
 const [first,repeat]=await Promise.all([bind(withCoupon,couponDigest),bind(withCoupon,couponDigest)]);
 assert(first[0].result.invoice_id===repeat[0].result.invoice_id,"parallel bind issues one immutable payment");
 await deny(()=>bind(withCoupon,"f".repeat(64)),"same invoice with different capability digest");
 await deny(()=>bind({...withCoupon,workspace_id:systemReceiver},couponDigest),"cross-store bind");
 assert((await sql("SELECT count(*)::int AS n FROM platform_subscription_payment_handoffs WHERE intent_id=$1",[withCoupon.intent_id]))[0].n===1,"one binding");
 await bind(withoutCoupon,firstDigest);
 await runtimeDb.unsafe("SET ROLE ekmivo_runtime");
 await deny(()=>runtimeDb.unsafe("SELECT * FROM platform_subscription_payment_handoffs"),"runtime direct RLS table access");
 await deny(()=>runtimeDb.unsafe("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid)",[withCoupon.intent_id,randomUUID(),withCoupon.snapshot.total_minor,systemReceiver]),"runtime forged settlement");
 await runtimeDb.unsafe("RESET ROLE");
 await deny(()=>sql("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid)",[withCoupon.intent_id,randomUUID(),Number(withCoupon.snapshot.total_minor)+1,systemReceiver]),"wrong amount");
 await deny(()=>sql("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid)",[withCoupon.intent_id,randomUUID(),withCoupon.snapshot.total_minor,withCoupon.workspace_id]),"wrong receiver");
 const payment=randomUUID();
 const verified=await sql("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid) AS applied",[withCoupon.intent_id,payment,withCoupon.snapshot.total_minor,systemReceiver]);
 assert(verified[0].applied===true,"independent worker verified proof settles invoice");
 const double=await sql("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid) AS applied",[withCoupon.intent_id,payment,withCoupon.snapshot.total_minor,systemReceiver]);
 assert(double[0].applied===true,"exact replay is idempotent");
 const conflict=await sql("SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,now(),$4::uuid) AS applied",[withCoupon.intent_id,randomUUID(),withCoupon.snapshot.total_minor,systemReceiver]);
 assert(conflict[0].applied===false,"a different verified proof cannot re-activate");
 const redemption=await sql("SELECT count(*)::int AS n FROM platform_subscription_coupon_redemptions WHERE invoice_id=$1",[withCoupon.invoice_id]);
 assert(redemption[0].n===1,"coupon redeemed exactly once by verified invoice trigger");
 const terminal=await sql("SELECT platform_subscription_payment_terminal($1::uuid,'expired') AS changed",[withoutCoupon.intent_id]);
 assert(terminal[0].changed===true,"terminal invoice stops awaiting payment");
 const latePayment=randomUUID();
 const recovery=await sql("SELECT platform_subscription_payment_recover($1::uuid,$2::uuid,'expired_verified') AS recorded",[withoutCoupon.intent_id,latePayment]);
 assert(recovery[0].recorded===true,"late money creates manual recovery case");
 await sql("SELECT platform_subscription_payment_recover($1::uuid,$2::uuid,'expired_verified')",[withoutCoupon.intent_id,latePayment]);
 assert((await sql("SELECT count(*)::int AS n FROM platform_subscription_payment_recovery_cases WHERE intent_id=$1",[withoutCoupon.intent_id]))[0].n===1,"one recovery case, no automatic refund");
 const cursor=await sql("SELECT platform_subscription_payment_pending() AS rows");
 assert(cursor[0].rows.length>=1,"fair recovery cursor reports terminal cases");
 assert((await sql("SELECT count(*)::int AS n FROM platform_subscription_payment_handoffs WHERE state='paid'"))[0].n===1,"only verified entitlement activated");
 console.log("PHASE6 POSTGRES PASS: 0153, Store and role denial, old policy snapshot, concurrency, exact invoice/coupon replay, terminal release, late-money recovery");
}catch(error){
 console.error("PHASE6 POSTGRES ERROR:",String(error.message||error).replaceAll(/postgres(?:ql)?:\/\/\S+/g,"[redacted]"));
 process.exitCode=1;
}finally{
 await db.end({timeout:4}).catch(()=>{});
 await migrationDb.end({timeout:4}).catch(()=>{});
 await runtimeDb.end({timeout:4}).catch(()=>{});
}
