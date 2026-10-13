"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { mailReady, sendCode, verificationEnabled } from "../lib/server/email";
import { database } from "../lib/server/db";
import { createSession, currentUser, hashToken, passwordHash, passwordMatches, revokeSession, selectDefaultWorkspace, workspacesFor } from "../lib/server/auth";
import { asText, strongPassword, validEmail, validatedName, type FormErrorState, safeLocale } from "../lib/server/validation";

const strings = {
 en:{invalid:"Check the highlighted fields.",generic:"The server could not complete your request. Please try again.",invalidLogin:"Invalid email or password.",locked:"Too many attempts. Try again in 15 minutes.",duplicate:"This email is already registered.",unauthorized:"Please sign in again.",mode:"Choose a service mode.",name:"Enter a workspace name (2–100 characters)."},
 bn:{invalid:"চিহ্নিত তথ্যগুলো ঠিক করুন।",generic:"সার্ভারের সমস্যায় অনুরোধ সম্পন্ন হয়নি। আবার চেষ্টা করুন।",invalidLogin:"ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।",locked:"অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন।",duplicate:"এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে।",unauthorized:"আবার লগ ইন করুন।",mode:"সেবার ধরন বেছে নিন।",name:"ওয়ার্কস্পেসের নাম ২–১০০ অক্ষর হতে হবে।"}
} as const;
function fail(message:string,fields?:Record<string,string>):FormErrorState{return {status:"error",message,fields};}
function report(label:string,error:unknown){
 // Keep database/driver errors entirely in server logs, never in response or toast.
 console.error("[ekmivo/server]",label, error instanceof Error?error.message:"unknown failure");
}

export async function registerAction(localeParam:string,_previous:FormErrorState,form:FormData):Promise<FormErrorState>{
 const locale=safeLocale(localeParam),t=strings[locale];
 const name=asText(form.get("name")),email=asText(form.get("email")).toLowerCase();
 const password=form.get("password"),confirm=form.get("confirm");
 const fields:Record<string,string>={};
 if(!validatedName(name))fields.name=locale==="bn"?"নাম অন্তত ২ অক্ষরের হতে হবে।":"Enter 2–100 characters.";
 if(!validEmail(email))fields.email=locale==="bn"?"সঠিক ইমেইল দিন।":"Enter a valid email.";
 if(typeof password!=="string"||!strongPassword(password))fields.password=locale==="bn"?"অন্তত ১২ অক্ষরের পাসওয়ার্ড দিন।":"Use 12–256 characters.";
 if(password!==confirm)fields.confirm=locale==="bn"?"পাসওয়ার্ড দুটি মিলছে না।":"Passwords don't match.";
 if(Object.keys(fields).length)return fail(t.invalid,fields);
 let created=false;
 let verify=false;
 try {
  verify=await verificationEnabled();
  if(verify&&!mailReady())return fail(locale==="bn"?"ইমেইল সেবা কনফিগার করা হয়নি।":"Email verification is unavailable. Please try again later.");
  const hash=await passwordHash(password as string);
  const rows=await database()`INSERT INTO app_users (display_name,email,password_hash)
   VALUES (${name},${email},${hash}) ON CONFLICT (email) DO NOTHING RETURNING id`;
  if(!rows.length)return fail(t.duplicate,{email:t.duplicate});
  created=true;
  await createSession(String(rows[0].id));
  if(verify){
   try{await sendCode(String(rows[0].id),email,"verify_email");}
   catch(e){report("send initial verification email",e);}
  }
 } catch(e){report("register",e);return fail(t.generic);}
 redirect(verify?"/verify-email":"/workspaces/open");
}

export async function loginAction(localeParam:string,_previous:FormErrorState,form:FormData):Promise<FormErrorState>{
 const locale=safeLocale(localeParam),t=strings[locale];
 const email=asText(form.get("email")).toLowerCase();
 const password=form.get("password");
 if(!validEmail(email)||typeof password!=="string"||!password.length||password.length>256) return fail(t.invalidLogin);
 try {
  const key=hashToken("email:"+email);
  // Atomic database throttle shared across serverless instances (not a local memory counter).
  const attempts=await database()`SELECT attempts,blocked_until FROM auth_attempts WHERE key_hash=${key}`;
  if(attempts.length && attempts[0].blocked_until && new Date(attempts[0].blocked_until).getTime()>Date.now())return fail(t.locked);
  const users=await database()`SELECT id,password_hash FROM app_users WHERE email=${email} AND disabled_at IS NULL LIMIT 1`;
  const ok=await passwordMatches(password,users.length?String(users[0].password_hash):"invalid");
  if(!ok){
    await database()`INSERT INTO auth_attempts AS a (key_hash,attempts,first_attempt_at,blocked_until)
    VALUES (${key},1,now(),NULL)
    ON CONFLICT (key_hash) DO UPDATE SET
      attempts=CASE WHEN a.first_attempt_at<now()-interval '15 minutes' THEN 1 ELSE a.attempts+1 END,
      first_attempt_at=CASE WHEN a.first_attempt_at<now()-interval '15 minutes' THEN now() ELSE a.first_attempt_at END,
      blocked_until=CASE WHEN a.first_attempt_at>=now()-interval '15 minutes' AND a.attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END`;
    return fail(t.invalidLogin);
  }
  await database()`DELETE FROM auth_attempts WHERE key_hash=${key}`;
  await createSession(String(users[0].id));
  const verify=await verificationEnabled();
  if(verify){
   const status=await database()`SELECT email_verified_at FROM app_users WHERE id=${users[0].id}::uuid`;
   if(status.length&&!status[0].email_verified_at)redirect("/verify-email");
  }
 } catch(e){
  if(e && typeof e==="object" && "digest" in e && String(e.digest).startsWith("NEXT_REDIRECT"))throw e;
  report("login",e);return fail(t.generic);
 }
 redirect("/workspaces/open");
}

export async function createWorkspaceAction(localeParam:string,_previous:FormErrorState,form:FormData):Promise<FormErrorState>{
 const locale=safeLocale(localeParam),t=strings[locale];
 const user=await currentUser();
 if(!user)return fail(t.unauthorized);
 const name=asText(form.get("name")),mode=asText(form.get("mode"));
 if(!validatedName(name))return fail(t.name,{name:t.name});
 if(!["ai","commerce","both"].includes(mode))return fail(t.mode,{mode:t.mode});
 let workspaceId:string;
 try{
  const db=database();
  workspaceId=await db.begin(async sql=>{
   const w=await sql`INSERT INTO workspaces (name,service_mode,created_by)
   VALUES (${name},${mode},${user.id}::uuid) RETURNING id`;
   await sql`INSERT INTO workspace_members (workspace_id,user_id,role)
   VALUES (${w[0].id}::uuid,${user.id}::uuid,'owner')`;
   return String(w[0].id);
  });
 }catch(e){report("createWorkspace",e);return fail(t.generic);}
 // New users get their first workspace as their default automatically.
 try{if((await workspacesFor(user.id)).length===1)await selectDefaultWorkspace(user.id,workspaceId);}
 catch(e){report("set initial workspace default",e);}
 redirect(`/w/${workspaceId}/dashboard`);
}


export async function setDefaultWorkspaceAction(localeParam:string,workspaceId:string){
 const locale=safeLocale(localeParam);
 const user=await currentUser();
 if(!user)redirect(`/${locale}/login`);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))redirect(`/${locale}/workspaces`);
 const allowed=await selectDefaultWorkspace(user.id,workspaceId);
 if(!allowed)redirect(`/${locale}/workspaces`);
 redirect(`/${locale}/workspaces`);
}

export async function logoutAction(localeParam:string){
 const locale=safeLocale(localeParam);
 try{await revokeSession();}catch(e){report("logout",e);(await cookies()).delete("ekmivo-session");}
 redirect(`/${locale}/login`);
}
