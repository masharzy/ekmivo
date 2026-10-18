"use server";
import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { currentUser, passwordMatches } from "../lib/server/auth";
import { database } from "../lib/server/db";
import { platformRole } from "../lib/server/platform-admin";
import { sessionIdForMfa } from "../lib/server/mfa";
import { verificationEnabled } from "../lib/server/email";
import { safeLocale } from "../lib/server/validation";

export type MfaSecurityState = { status: "idle"|"error"|"success"; message: string; codes?: string[] };
const copy = {
 en: { denied:"Administrator sign-in required.", invalid:"Password or recovery code is invalid or already used.", locked:"Too many attempts. Retry after 15 minutes.", fresh:"Sign out, sign in and verify your authenticator again before changing security settings.", codes:"Save these recovery codes privately. Each works once; previous codes are now invalid.", failed:"Security update unavailable. Try again." },
 bn: { denied:"অ্যাডমিন হিসেবে লগ ইন করুন।", invalid:"পাসওয়ার্ড বা recovery code ভুল অথবা আগেই ব্যবহার হয়েছে।", locked:"অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন।", fresh:"নিরাপত্তা পরিবর্তনের আগে লগ আউট করে আবার লগ ইন ও authenticator যাচাই করুন।", codes:"কোডগুলো ব্যক্তিগতভাবে সংরক্ষণ করুন। প্রতিটি একবার চলবে; আগের কোডগুলো বাতিল হয়েছে।", failed:"নিরাপত্তা আপডেট করা যাচ্ছে না। আবার চেষ্টা করুন।" },
};
async function change(localeParam:string, operation:"recover"|"rotate"|"reset", form:FormData):Promise<MfaSecurityState> {
 const locale=safeLocale(localeParam),t=copy[locale],user=await currentUser();
 if(!user||(!user.verified&&await verificationEnabled())||!await platformRole(user.id))return {status:"error",message:t.denied};
 const sessionId=await sessionIdForMfa(user.id);if(!sessionId)return {status:"error",message:t.denied};
 const password=form.get("password"),code=form.get("recoveryCode");
 const rows=await database()`SELECT password_hash FROM app_users WHERE id=${user.id}::uuid AND disabled_at IS NULL`;
 const correct=typeof password==="string"&&password.length<=256&&rows.length>0&&await passwordMatches(password,String(rows[0].password_hash));
 const generated=operation==="rotate"?Array.from({length:10},()=>randomBytes(24).toString("base64url")):[];
 const digest=(value:string)=>createHash("sha256").update(user.id+":"+value).digest("hex");
 try {
  const outcome=await database().begin(async tx=>{
   const actor=await tx`SELECT a.user_id FROM platform_administrators a JOIN app_users u ON u.id=a.user_id WHERE a.user_id=${user.id}::uuid AND u.disabled_at IS NULL FOR UPDATE OF a`;
   if(!actor.length)return "denied";
   await tx`INSERT INTO platform_admin_mfa_attempts(user_id) VALUES(${user.id}::uuid) ON CONFLICT DO NOTHING`;
   const attempts=await tx`SELECT blocked_until FROM platform_admin_mfa_attempts WHERE user_id=${user.id}::uuid FOR UPDATE`;
   if(attempts[0].blocked_until&&new Date(attempts[0].blocked_until).getTime()>Date.now())return "locked";
   const mfa=await tx`SELECT confirmed_at FROM platform_admin_mfa WHERE user_id=${user.id}::uuid FOR UPDATE`;
   const session=await tx`SELECT mfa_verified_at FROM auth_sessions WHERE id=${sessionId}::uuid AND user_id=${user.id}::uuid AND revoked_at IS NULL AND expires_at>now()`;
   if(!session.length||!mfa[0]?.confirmed_at)return "denied";
   const fail=async()=>{
    await tx`UPDATE platform_admin_mfa_attempts SET attempts=CASE WHEN updated_at<now()-interval '15 minutes' THEN 1 ELSE attempts+1 END,
     blocked_until=CASE WHEN updated_at>=now()-interval '15 minutes' AND attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now() WHERE user_id=${user.id}::uuid`;
    return "invalid";
   };
   if(!correct)return fail();
   if(operation==="recover"){
    if(typeof code!=="string"||! /^[A-Za-z0-9_-]{32}$/.test(code.trim()))return fail();
    const consumed=await tx`UPDATE platform_admin_recovery_codes SET consumed_at=now() WHERE user_id=${user.id}::uuid AND code_hash=${digest(code.trim())} AND consumed_at IS NULL RETURNING code_hash`;
    if(!consumed.length)return fail();
    await tx`UPDATE platform_admin_trusted_devices SET revoked_at=now() WHERE user_id=${user.id}::uuid AND revoked_at IS NULL`;
    await tx`UPDATE auth_sessions SET mfa_verified_at=NULL,revoked_at=CASE WHEN id=${sessionId}::uuid THEN revoked_at ELSE now() END WHERE user_id=${user.id}::uuid`;
    await tx`UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=${sessionId}::uuid`;
   } else {
    const verified=session[0].mfa_verified_at?new Date(session[0].mfa_verified_at).getTime():0;
    if(!verified||verified>Date.now()+60000||verified<new Date(mfa[0].confirmed_at).getTime())return "fresh";
    await tx`DELETE FROM platform_admin_recovery_codes WHERE user_id=${user.id}::uuid`;
    if(operation==="rotate")for(const value of generated)await tx`INSERT INTO platform_admin_recovery_codes(user_id,code_hash) VALUES(${user.id}::uuid,${digest(value)})`;
    else {
     await tx`UPDATE platform_admin_trusted_devices SET revoked_at=now() WHERE user_id=${user.id}::uuid AND revoked_at IS NULL`;
     await tx`DELETE FROM platform_admin_mfa WHERE user_id=${user.id}::uuid`;
     await tx`UPDATE auth_sessions SET mfa_verified_at=NULL,revoked_at=CASE WHEN id=${sessionId}::uuid THEN revoked_at ELSE now() END WHERE user_id=${user.id}::uuid`;
    }
   }
   await tx`UPDATE platform_admin_mfa_attempts SET attempts=0,blocked_until=NULL,updated_at=now() WHERE user_id=${user.id}::uuid`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${user.id}::uuid,${"admin.mfa_"+operation},'Administrator security lifecycle update; other sessions invalidated on recovery/reset')`;
   return "ok";
  });
  if(outcome!=="ok")return {status:"error",message:t[outcome as "denied"|"invalid"|"locked"|"fresh"]};
 } catch { return {status:"error",message:t.failed}; }
 if(operation==="recover")redirect(`/${locale}/admin/security`);
 if(operation==="reset")redirect(`/${locale}/admin/mfa`);
 return {status:"success",message:t.codes,codes:generated};
}
export async function recoverAdminMfaAction(locale:string,_previous:MfaSecurityState,form:FormData){return change(locale,"recover",form);}
export async function rotateAdminRecoveryAction(locale:string,_previous:MfaSecurityState,form:FormData){return change(locale,"rotate",form);}
export async function resetAdminMfaAction(locale:string,_previous:MfaSecurityState,form:FormData){return change(locale,"reset",form);}
