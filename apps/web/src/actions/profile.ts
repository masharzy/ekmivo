"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, hashToken } from "../lib/server/auth";
import { database } from "../lib/server/db";
import { asText, validatedName, safeLocale } from "../lib/server/validation";

export type ProfileActionState={status:"idle"|"error"|"success";message:string;savedName?:string};

export async function revokeAccountSession(localeRaw:string,id:string):Promise<ProfileActionState>{
 const locale=safeLocale(localeRaw),actor=await requireUser(locale);
 const token=(await cookies()).get("briofold-session")?.value;
 if(!token||!/^[0-9a-f-]{36}$/i.test(id))return {status:"error",message:locale==="bn"?"সেশন পাওয়া যায়নি।":"Session unavailable."};
 try{
  const rows=await database()`UPDATE auth_sessions SET revoked_at=now() WHERE id=${id}::uuid AND user_id=${actor.id}::uuid AND token_hash<>${hashToken(token)} AND revoked_at IS NULL AND expires_at>now() RETURNING id`;
  if(!rows.length)return {status:"error",message:locale==="bn"?"সেশনটি ইতিমধ্যে বন্ধ অথবা এটি বর্তমান সেশন।":"Session is already closed or is your current session."};
  revalidatePath(`/${locale}/account`);
  return {status:"success",message:locale==="bn"?"সেশন বন্ধ হয়েছে।":"Session revoked."};
 }catch{return {status:"error",message:locale==="bn"?"সেশন বন্ধ করা যায়নি।":"Could not revoke session."}}
}

export async function saveDisplayName(localeRaw:string,_previous:ProfileActionState,form:FormData):Promise<ProfileActionState>{
 const locale=safeLocale(localeRaw),actor=await requireUser(locale);
 const name=asText(form.get("name"));
 if(!validatedName(name)||/[\u0000-\u001F\u007F]/.test(name))
  return {status:"error",message:locale==="bn"?"নাম ২–১০০ অক্ষরের হতে হবে।":"Name must be 2–100 characters without control characters."};
 try{
  const rows=await database()`UPDATE app_users SET display_name=${name},updated_at=now()
   WHERE id=${actor.id}::uuid AND disabled_at IS NULL RETURNING id`;
  if(!rows.length)return {status:"error",message:locale==="bn"?"সেশন আর সক্রিয় নেই।":"Session no longer active."};
  revalidatePath(`/${locale}/account`);
  return {status:"success",savedName:name,message:locale==="bn"?"নাম সংরক্ষণ হয়েছে।":"Display name saved."};
 }catch(error){
  console.error("[profile update]",error instanceof Error?error.name:"unknown");
  return {status:"error",message:locale==="bn"?"সংরক্ষণ ব্যর্থ। আবার চেষ্টা করো।":"Save failed. Please retry."};
 }
}

export async function revokeOtherSessions(localeRaw:string,_previous:ProfileActionState,_form:FormData):Promise<ProfileActionState>{
 const locale=safeLocale(localeRaw),actor=await requireUser(locale);
 const token=(await cookies()).get("briofold-session")?.value;
 if(!token||token.length>256)return {status:"error",message:locale==="bn"?"আবার লগ ইন করো।":"Sign in again."};
 try{
  const rows=await database()`UPDATE auth_sessions SET revoked_at=now()
   WHERE user_id=${actor.id}::uuid AND token_hash<>${hashToken(token)}
   AND revoked_at IS NULL AND expires_at>now() RETURNING id`;
  revalidatePath(`/${locale}/account`);
  return {status:"success",message:locale==="bn"
   ?`অন্য ${rows.length}টি সেশন বন্ধ হয়েছে।`:`Revoked ${rows.length} other active sessions.`};
 }catch(error){
  console.error("[revoke sessions]",error instanceof Error?error.name:"unknown");
  return {status:"error",message:locale==="bn"?"সেশন বন্ধ করা যায়নি।":"Could not revoke sessions."};
 }
}
