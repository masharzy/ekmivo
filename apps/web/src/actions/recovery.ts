"use server";
import { redirect } from "next/navigation";
import { database } from "../lib/server/db";
import { currentUser, passwordHash } from "../lib/server/auth";
import { consumeCode, mailReady, sendCode, verificationEnabled } from "../lib/server/email";
import { asText, safeLocale, strongPassword, validEmail } from "../lib/server/validation";

export type RecoveryState={status:"idle"|"error"|"sent"|"success";message:string};
const copy={
 en:{generic:"Unable to complete the request. Please try again.",missing:"Email delivery is not configured yet.",invalid:"Enter a valid email address.",sent:"If an account exists, a six-digit code has been sent. Check your inbox.",cooldown:"Please wait before requesting another code.",badCode:"Invalid or expired code. Check the code or request a new one.",changed:"Password updated. Sign in with your new password.",password:"Choose a password with at least 12 characters.",mismatch:"Passwords don't match.",verified:"Your email has been verified."},
 bn:{generic:"অনুরোধ সম্পন্ন হয়নি। আবার চেষ্টা করুন।",missing:"ইমেইল পাঠানোর ব্যবস্থা এখনো সেটআপ হয়নি।",invalid:"সঠিক ইমেইল দিন।",sent:"এই ইমেইলে অ্যাকাউন্ট থাকলে ছয় সংখ্যার কোড পাঠানো হয়েছে। ইনবক্স দেখুন।",cooldown:"আরেকটি কোড চাইতে কিছুক্ষণ অপেক্ষা করুন।",badCode:"কোড ভুল বা মেয়াদোত্তীর্ণ। নতুন কোড নিন।",changed:"পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগ ইন করুন।",password:"অন্তত ১২ অক্ষরের পাসওয়ার্ড দিন।",mismatch:"পাসওয়ার্ড দুটি মিলছে না।",verified:"ইমেইল সফলভাবে যাচাই হয়েছে।"}
} as const;

export async function resendEmailCodeAction(localeParam:string,_prev:RecoveryState):Promise<RecoveryState>{
 const locale=safeLocale(localeParam),t=copy[locale];
 const user=await currentUser();
 if(!user)return {status:"error",message:t.generic};
 if(user.verified || !await verificationEnabled())return {status:"success",message:t.verified};
 if(!mailReady())return {status:"error",message:t.missing};
 try{
  const result=await sendCode(user.id,user.email,"verify_email");
  return result.ok?{status:"sent",message:t.sent}:{status:"error",message:t.cooldown};
 }catch(e){console.error("[email verification resend]",e instanceof Error?e.name:"error");return {status:"error",message:t.generic};}
}

export async function verifyEmailCodeAction(localeParam:string,_prev:RecoveryState,form:FormData):Promise<RecoveryState>{
 const locale=safeLocale(localeParam),t=copy[locale],user=await currentUser();
 if(!user)return {status:"error",message:t.generic};
 if(user.verified || !await verificationEnabled())redirect(`/${locale}/workspaces/open`);
 const code=asText(form.get("code"));
 let verified=false;
 try{
  verified=await consumeCode(user.id,"verify_email",code);
  if(verified)await database()`UPDATE app_users SET email_verified_at=now(),updated_at=now()
    WHERE id=${user.id}::uuid AND email_verified_at IS NULL`;
 }catch(e){console.error("[verify email]",e instanceof Error?e.name:"error");return {status:"error",message:t.generic};}
 if(!verified)return {status:"error",message:t.badCode};
 redirect(`/${locale}/workspaces/open`);
}

export async function requestPasswordResetAction(localeParam:string,_prev:RecoveryState,form:FormData):Promise<RecoveryState>{
 const locale=safeLocale(localeParam),t=copy[locale],email=asText(form.get("email")).toLowerCase();
 if(!validEmail(email))return {status:"error",message:t.invalid};
 if(!mailReady())return {status:"error",message:t.missing};
 try{
  const users=await database()`SELECT id,email FROM app_users
   WHERE email=${email} AND disabled_at IS NULL LIMIT 1`;
  if(users.length)await sendCode(String(users[0].id),String(users[0].email),"reset_password");
  // Same response for unknown accounts and rate-limited requests.
  return {status:"sent",message:t.sent};
 }catch(e){console.error("[request reset]",e instanceof Error?e.name:"error");return {status:"error",message:t.generic};}
}

export async function completePasswordResetAction(localeParam:string,_prev:RecoveryState,form:FormData):Promise<RecoveryState>{
 const locale=safeLocale(localeParam),t=copy[locale];
 const email=asText(form.get("email")).toLowerCase(),code=asText(form.get("code"));
 const password=form.get("password"),confirm=form.get("confirm");
 if(!validEmail(email)||!/^\d{6}$/.test(code))return {status:"error",message:t.badCode};
 if(typeof password!=="string"||!strongPassword(password))return {status:"error",message:t.password};
 if(password!==confirm)return {status:"error",message:t.mismatch};
 if(!mailReady())return {status:"error",message:t.missing};
 try{
  const rows=await database()`SELECT id FROM app_users WHERE email=${email} AND disabled_at IS NULL LIMIT 1`;
  const id=rows.length?String(rows[0].id):null;
  if(!id||!await consumeCode(id,"reset_password",code))return {status:"error",message:t.badCode};
  const newHash=await passwordHash(password);
  await database().begin(async tx=>{
   await tx`UPDATE app_users SET password_hash=${newHash},updated_at=now() WHERE id=${id}::uuid`;
   await tx`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=${id}::uuid AND revoked_at IS NULL`;
  });
  return {status:"success",message:t.changed};
 }catch(e){console.error("[complete reset]",e instanceof Error?e.name:"error");return {status:"error",message:t.generic};}
}
