import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { database } from "./db";
import { cache } from "react";
import {securityEmail} from "../security-email";

export type CodePurpose = "verify_email" | "reset_password";
export function mailReady() {
 return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.OTP_PEPPER && process.env.OTP_PEPPER.length >= 32);
}
export const verificationEnabled=cache(async function verificationEnabled():Promise<boolean> {
 const rows=await database()`SELECT email_verification_enabled FROM platform_auth_settings WHERE singleton=true`;
 return rows.length > 0 && rows[0].email_verification_enabled === true;
});
function signature(userId:string,purpose:CodePurpose,code:string) {
 const pepper=process.env.OTP_PEPPER;
 if(!pepper || pepper.length<32) throw Error("EMAIL_CONFIG_MISSING");
 return createHmac("sha256",pepper).update(userId+":"+purpose+":"+code).digest("hex");
}
async function deliver(email:string,code:string,purpose:CodePurpose,id:string,locale:"en"|"bn") {
 if(!mailReady()) throw Error("EMAIL_CONFIG_MISSING");
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",cache:"no-store",signal:AbortSignal.timeout(10000),
  headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"auth-code-"+id},
  body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],
   ...securityEmail(code,purpose,locale)})
 });
 if(!response.ok){
  console.error("[security email] provider rejected",{status:response.status,purpose});
  throw Error("EMAIL_DELIVERY_FAILED");
 }
 // Provider acceptance is distinct from inbox delivery. Never log recipient/code.
 const receipt:unknown=await response.json().catch(()=>null);
 const providerId=receipt&&typeof receipt==="object"&&"id" in receipt&&typeof receipt.id==="string"&&/^[a-f0-9-]{36}$/i.test(receipt.id)?receipt.id:undefined;
 console.info("[security email] provider accepted",{purpose,providerId});
}
export async function sendCode(userId:string,email:string,purpose:CodePurpose,locale:"en"|"bn"="en"){
 if(!mailReady()) throw Error("EMAIL_CONFIG_MISSING");
 const sql=database();
 const code=String(randomInt(0,1_000_000)).padStart(6,"0");
 const digest=signature(userId,purpose,code);
 const result=await sql.begin(async tx=>{
 // Serialize issuance/cooldown across serverless instances for this user/purpose.
 await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'auth-code:'+userId+':'+purpose},0))`;
 const recent=await tx`SELECT created_at FROM auth_one_time_codes
  WHERE user_id=${userId}::uuid AND purpose=${purpose}
  ORDER BY created_at DESC LIMIT 6`;
 const now=Date.now();
 if(recent.length && now-new Date(recent[0].created_at).getTime()<60_000)
  return {ok:false,reason:"cooldown"} as const;
 if(recent.filter(r=>now-new Date(r.created_at).getTime()<3600_000).length>=5)
  return {ok:false,reason:"hourly_limit"} as const;
 await tx`UPDATE auth_one_time_codes SET consumed_at=now() WHERE user_id=${userId}::uuid AND purpose=${purpose} AND consumed_at IS NULL`;
 const rows=await tx`INSERT INTO auth_one_time_codes(user_id,purpose,code_hash,expires_at)
 VALUES (${userId}::uuid,${purpose},${digest},now()+interval '10 minutes') RETURNING id`;
 return {ok:true,id:String(rows[0].id)} as const;
 });
 if(!result.ok)return result;
 try{await deliver(email,code,purpose,result.id,locale);}
 catch(error){
  await sql`UPDATE auth_one_time_codes SET consumed_at=now() WHERE id=${result.id}::uuid`;
  throw error;
 }
 return {ok:true} as const;
}
export async function consumeCode(userId:string,purpose:CodePurpose,code:string):Promise<boolean>{
 if(!/^\d{6}$/.test(code) || !mailReady()) return false;
 const sql=database();
 // Claim an attempt atomically and lock the matching challenge.
 return sql.begin(async tx=>{
  const rows=await tx`SELECT id,code_hash FROM auth_one_time_codes
    WHERE user_id=${userId}::uuid AND purpose=${purpose}
      AND consumed_at IS NULL AND expires_at>now() AND attempts<5
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
  if(!rows.length)return false;
  const expected=Buffer.from(String(rows[0].code_hash),"hex");
  const supplied=Buffer.from(signature(userId,purpose,code),"hex");
  const valid=expected.length===supplied.length && timingSafeEqual(expected,supplied);
  await tx`UPDATE auth_one_time_codes SET attempts=attempts+1,
    consumed_at=CASE WHEN ${valid} OR attempts>=4 THEN now() ELSE consumed_at END
    WHERE id=${rows[0].id}::uuid`;
  return valid;
 });
}
