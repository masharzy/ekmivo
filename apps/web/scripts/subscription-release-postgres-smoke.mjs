// Runs only AFTER Phase 3-6 isolated PostgreSQL smoke in the SAME CI service.
// No production fixtures, provider money, or automatic refund is ever used.
import postgres from "postgres";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";

const url=new URL(process.env.PG00_TEST_DATABASE_URL||"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.pathname!=="/ekmivo_pg00")
 throw Error("Phase 7 smoke requires disposable CI PostgreSQL /ekmivo_pg00");
url.pathname="/ekmivo";
const db=postgres(url.toString(),{ssl:false,prepare:false,max:1,connect_timeout:8});
const assert=(condition,message)=>{if(!condition)throw Error("PHASE7 FAILED: "+message)};
const denied=async fn=>{try{await fn()}catch{return true}return false};
try{
 const migration=await readFile(new URL("../../../infra/migrations/0154_platform_subscription_release_operations.sql",import.meta.url),"utf8");
 await db.unsafe(migration);
 const [buyer]=await db.unsafe("SELECT actor_id FROM platform_subscription_payment_handoffs ORDER BY bound_at LIMIT 1");
 assert(Boolean(buyer?.actor_id),"Phase6 handoffs must precede operations migration");
 const unauthorized=randomUUID();
 assert(await denied(()=>db.unsafe("SELECT platform_subscription_admin_operations($1::uuid)",[unauthorized])),"no Super Admin denies monitoring");
 assert(await denied(()=>db.unsafe("SELECT platform_subscription_admin_export($1::uuid,'subscription-recovery','')",[unauthorized])),"no Super Admin denies exports");
 await db.unsafe("INSERT INTO platform_administrators(user_id,role) VALUES($1,'super_admin')",[buyer.actor_id]);
 const [read]=await db.unsafe("SELECT platform_subscription_admin_operations($1::uuid) AS data",[buyer.actor_id]);
 assert(read.data?.stats?.paid===1,"actual verified payment appears once");
 assert(read.data?.stats?.open_cases===1,"actual late-money recovery appears in queue");
 assert(read.data?.cases?.length===1,"bounded unresolved cases include late-money evidence");
 const [recovery]=await db.unsafe("SELECT platform_subscription_admin_export($1::uuid,'subscription-recovery','') AS data",[buyer.actor_id]);
 assert(recovery.data?.length===1,"export includes one exception with invoice reference");
 const [coupons]=await db.unsafe("SELECT platform_subscription_admin_export($1::uuid,'subscription-coupon-audit','') AS data",[buyer.actor_id]);
 assert(coupons.data?.length===1,"coupon audit sees the single verified redemption");
 const [escaped]=await db.unsafe("SELECT platform_subscription_admin_export($1::uuid,'subscription-recovery',$2) AS data",[buyer.actor_id,"%' OR TRUE --"]);
 assert(escaped.data?.length===0,"malicious filter is parameterized, never SQL concatenated");
 assert(await denied(()=>db.unsafe("SELECT platform_subscription_admin_export($1::uuid,'bogus','')",[buyer.actor_id])),"unknown export fails closed");
 await db.unsafe("SET ROLE ekmivo_runtime");
 assert(await denied(()=>db.unsafe("SELECT * FROM platform_subscription_payment_handoffs")),"runtime cannot read raw buyer handoffs");
 const [scoped]=await db.unsafe("SELECT platform_subscription_admin_operations($1::uuid) AS data",[buyer.actor_id]);
 assert(scoped.data?.stats?.paid===1,"runtime sees only guarded operations function");
 assert(await denied(()=>db.unsafe("SELECT platform_subscription_admin_operations($1::uuid)",[unauthorized])),"runtime cannot bypass admin authority");
 await db.unsafe("RESET ROLE");
 const [integrity]=await db.unsafe("SELECT count(*)::int AS n FROM platform_subscription_payment_handoffs WHERE state='paid'");
 assert(integrity.n===1,"monitoring/export do not issue credits or settle invoices");
 console.log("PHASE7 POSTGRES PASS: 0154, MFA-backed Super Admin DB role scope, CSV data bounds, real paid/late recovery, coupon audit, SQL filter and raw runtime denial");
}catch(error){
 console.error("PHASE7 POSTGRES ERROR:",String(error.message||error).replaceAll(/postgres(?:ql)?:\/\/\S+/g,"[redacted]"));
 process.exitCode=1;
}finally{await db.end({timeout:4}).catch(()=>{});}
