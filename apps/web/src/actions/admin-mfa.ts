"use server";
import {trustAdminDevice} from "../lib/server/admin-trusted-devices";
import { redirect } from "next/navigation";
import { database } from "../lib/server/db";
import { currentUser,passwordMatches } from "../lib/server/auth";
import { platformRole } from "../lib/server/platform-admin";
import { mfaConfigured,makeTotpSecret,sealSecret,unsealSecret,matchTotp,sessionIdForMfa } from "../lib/server/mfa";
import { asText,safeLocale } from "../lib/server/validation";

export type MfaActionState={status:"idle"|"error"|"success";message:string;setupKey?:string};
const messages={
 en:{denied:"You do not have platform administrator access.",badPassword:"Incorrect password.",missing:"Admin verification is not configured. Contact the operator.",already:"MFA is already enabled. Enter your authenticator code.",started:"Add this secret to your authenticator, then enter the current code. The key is shown only in this response.",badCode:"Invalid, expired or already-used code.",cooldown:"Too many attempts. Retry after 15 minutes.",failed:"Verification failed. Try again.",complete:"Administrator verification enabled."},
 bn:{denied:"তোমার প্ল্যাটফর্ম অ্যাডমিন অনুমতি নেই।",badPassword:"পাসওয়ার্ড ভুল।",missing:"অ্যাডমিন MFA এখনো কনফিগার করা হয়নি। অপারেটরের সাথে যোগাযোগ করো।",already:"MFA চালু আছে। Authenticator-এর কোড দাও।",started:"Authenticator অ্যাপে এই secret যোগ করে বর্তমান কোড দাও। Key শুধু এই response-এ দেখানো হচ্ছে।",badCode:"কোড ভুল, মেয়াদোত্তীর্ণ বা আগেই ব্যবহার হয়েছে।",cooldown:"অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করো।",failed:"যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করো।",complete:"অ্যাডমিন MFA সফলভাবে চালু হয়েছে।"}
} as const;
async function adminIdentity(){
 const user=await currentUser();
 if(!user)return null;
 const role=await platformRole(user.id);
 if(!role)return null;
 return user;
}
export async function beginAdminMfaAction(localeParam:string,_previous:MfaActionState,form:FormData):Promise<MfaActionState>{
 const locale=safeLocale(localeParam),t=messages[locale];
 const user=await adminIdentity();
 if(!user)return {status:"error",message:t.denied};
 if(!mfaConfigured())return {status:"error",message:t.missing};
 const password=form.get("password");
 if(typeof password!=="string"||password.length>256)return {status:"error",message:t.badPassword};
 const rows=await database()`SELECT password_hash FROM app_users WHERE id=${user.id}::uuid AND disabled_at IS NULL`;
 if(!rows.length||!await passwordMatches(password,String(rows[0].password_hash)))return {status:"error",message:t.badPassword};
 try{
  const secret=makeTotpSecret(),encrypted=sealSecret(secret);
  const result=await database().begin(async tx=>{
   const previous=await tx`SELECT confirmed_at FROM platform_admin_mfa WHERE user_id=${user.id}::uuid FOR UPDATE`;
   if(previous.length&&previous[0].confirmed_at)return false;
   await tx`INSERT INTO platform_admin_mfa(user_id,secret_ciphertext,confirmed_at,last_used_step)
     VALUES (${user.id}::uuid,${encrypted},NULL,-1)
     ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,
      confirmed_at=NULL,last_used_step=-1`;
   return true;
  });
  if(!result)return {status:"error",message:t.already};
  return {status:"success",message:t.started,setupKey:secret};
 }catch(e){
  console.error("[mfa begin]",e instanceof Error?e.name:"unknown");
  return {status:"error",message:t.failed};
 }
}
export async function confirmAdminMfaAction(localeParam:string,_previous:MfaActionState,form:FormData):Promise<MfaActionState>{
 const locale=safeLocale(localeParam),t=messages[locale],user=await adminIdentity();
 if(!user)return {status:"error",message:t.denied};
 if(!mfaConfigured())return {status:"error",message:t.missing};
 const code=asText(form.get("code"));
 if(!/^[0-9]{6}$/.test(code))return {status:"error",message:t.badCode};
 const sessionId=await sessionIdForMfa(user.id);
 if(!sessionId)return {status:"error",message:t.denied};
 let outcome:"ok"|"invalid"|"locked"="invalid";
 try{
  outcome=await database().begin(async tx=>{
   const actor=await tx`SELECT p.user_id FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
     WHERE p.user_id=${user.id}::uuid AND u.disabled_at IS NULL FOR UPDATE OF p`;
   if(!actor.length)return "invalid" as const;
   await tx`INSERT INTO platform_admin_mfa_attempts(user_id) VALUES (${user.id}::uuid) ON CONFLICT DO NOTHING`;
   const attempts=await tx`SELECT attempts,blocked_until FROM platform_admin_mfa_attempts
     WHERE user_id=${user.id}::uuid FOR UPDATE`;
   if(attempts.length&&attempts[0].blocked_until&&new Date(attempts[0].blocked_until).getTime()>Date.now())
    return "locked" as const;
   const rows=await tx`SELECT secret_ciphertext,last_used_step,confirmed_at FROM platform_admin_mfa
    WHERE user_id=${user.id}::uuid FOR UPDATE`;
   if(!rows.length)return "invalid" as const;
   const secret=unsealSecret(String(rows[0].secret_ciphertext));
   const step=matchTotp(secret,code,Number(rows[0].last_used_step));
   if(step===null){
    await tx`UPDATE platform_admin_mfa_attempts SET
     attempts=CASE WHEN updated_at<now()-interval '15 minutes' THEN 1 ELSE attempts+1 END,
     blocked_until=CASE WHEN updated_at>=now()-interval '15 minutes' AND attempts>=4
      THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()
     WHERE user_id=${user.id}::uuid`;
    return "invalid" as const;
   }
   await tx`UPDATE platform_admin_mfa SET confirmed_at=COALESCE(confirmed_at,now()),
     last_used_step=${step} WHERE user_id=${user.id}::uuid`;
   const session=await tx`UPDATE auth_sessions SET mfa_verified_at=now()
     WHERE id=${sessionId}::uuid AND user_id=${user.id}::uuid AND revoked_at IS NULL
     AND expires_at>now() RETURNING id`;
   if(!session.length)return "invalid" as const;
   await tx`UPDATE platform_admin_mfa_attempts SET attempts=0,blocked_until=NULL,updated_at=now()
    WHERE user_id=${user.id}::uuid`;
   if(!rows[0].confirmed_at){
    await tx`INSERT INTO platform_admin_audit(actor_id,action,description)
      VALUES (${user.id}::uuid,'admin.mfa_enrolled','Authenticator-based MFA enrolled')`;
   }
   return "ok" as const;
  });
 }catch(e){
  console.error("[mfa confirm]",e instanceof Error?e.name:"unknown");
  return {status:"error",message:t.failed};
 }
 if(outcome==="ok"){
  if(form.get("trustDevice")==="on")await trustAdminDevice(user.id,sessionId);
  redirect(`/${locale}/admin`);
 }
 return {status:"error",message:outcome==="locked"?t.cooldown:t.badCode};
}
