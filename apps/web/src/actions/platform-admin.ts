"use server";
import { revalidatePath } from "next/cache";
import { database } from "../lib/server/db";
import { mailReady } from "../lib/server/email";
import { requireFreshSuperAdmin } from "../lib/server/platform-admin";
import { asText, safeLocale } from "../lib/server/validation";

export type AdminActionState={status:"idle"|"error"|"success";message:string};
const emailLabels={
 en:{denied:"Super Admin permission required.",bad:"Invalid settings.",provider:"Connect Resend, a verified sender and an OTP secret before turning verification on.",saved:"Verification settings saved.",user:"Select a valid verified user.",self:"You cannot change your own platform role.",changed:"Platform role updated.",failed:"The operation failed. Try again."},
 bn:{denied:"শুধু Super Admin এই কাজ করতে পারবেন।",bad:"সেটিংস সঠিক নয়।",provider:"Verification চালুর আগে Resend, verified sender এবং OTP secret সেট করুন।",saved:"Verification সেটিংস সংরক্ষিত হয়েছে।",user:"যাচাইকৃত user নির্বাচন করুন।",self:"নিজের platform role পরিবর্তন করা যাবে না।",changed:"Platform role আপডেট হয়েছে।",failed:"কাজটি ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"}
} as const;

export async function setEmailVerificationAction(localeParam:string,_previous:AdminActionState,form:FormData):Promise<AdminActionState>{
 const locale=safeLocale(localeParam),t=emailLabels[locale];
 const admin=await requireFreshSuperAdmin();
 if(!admin)return {status:"error",message:t.denied};
 const value=asText(form.get("enabled")),reason=asText(form.get("reason")).trim(),confirm=asText(form.get("confirm"));
 if(confirm!=="CHANGE"||reason.length<10||reason.length>500||value!=="on"&&value!=="off")return {status:"error",message:t.bad};
 if(value==="on"&&!mailReady())return {status:"error",message:t.provider};
 try{
  const changed=await database().begin(async tx=>{
   const freshRole=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!freshRole.length)return false;
   const previous=await tx`SELECT email_verification_enabled FROM platform_auth_settings WHERE singleton=true FOR UPDATE`;
   if(!previous.length)return false;
   await tx`UPDATE platform_auth_settings SET email_verification_enabled=${value==="on"},
   updated_at=now(),updated_by=${admin.user.id}::uuid WHERE singleton=true`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description)
   VALUES (${admin.user.id}::uuid,'auth.verification_config',${"Email verification "+String(previous[0].email_verification_enabled===true)+" -> "+String(value==="on")+" | "+reason})`;
   return true;
  });
  if(!changed)return {status:"error",message:t.denied};
  revalidatePath(`/${locale}/admin`);
  return {status:"success",message:t.saved};
 }catch(e){console.error("[admin settings]",e instanceof Error?e.name:"unknown");return {status:"error",message:t.failed};}
}

export async function setPlatformRoleAction(localeParam:string,_previous:AdminActionState,form:FormData):Promise<AdminActionState>{
 const locale=safeLocale(localeParam),t=emailLabels[locale];
 const admin=await requireFreshSuperAdmin();
 if(!admin)return {status:"error",message:t.denied};
 const id=asText(form.get("userId")),role=asText(form.get("role")),reason=asText(form.get("reason")).trim(),confirm=asText(form.get("confirm"));
 const validRoles=["super_admin","admin","support","analyst","remove"];
 if(confirm!=="CHANGE"||reason.length<10||reason.length>500||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!validRoles.includes(role))
  return {status:"error",message:t.user};
 if(id===admin.user.id)return {status:"error",message:t.self};
 try{
  const result=await database().begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(5101482)`;
   const actor=await tx`SELECT role FROM platform_administrators WHERE user_id=${admin.user.id}::uuid FOR UPDATE`;
   if(!actor.length||actor[0].role!=="super_admin")return false;
   const previous=await tx`SELECT role FROM platform_administrators WHERE user_id=${id}::uuid FOR UPDATE`;
   const before=previous.length?String(previous[0].role):"none";
   const target=await tx`SELECT id,email_verified_at,disabled_at FROM app_users WHERE id=${id}::uuid FOR UPDATE`;
   if(!target.length||!target[0].email_verified_at||target[0].disabled_at)return false;
   if(role==="remove"){
    await tx`DELETE FROM platform_administrators WHERE user_id=${id}::uuid`;
   }else{
    await tx`INSERT INTO platform_administrators (user_id,role,granted_by)
     VALUES (${id}::uuid,${role},${admin.user.id}::uuid)
     ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by`;
   }
   await tx`UPDATE auth_sessions SET mfa_verified_at=NULL,revoked_at=now() WHERE user_id=${id}::uuid AND revoked_at IS NULL`;
   await tx`UPDATE platform_admin_trusted_devices SET revoked_at=now() WHERE user_id=${id}::uuid AND revoked_at IS NULL`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)
    VALUES (${admin.user.id}::uuid,'admin.role_changed',${id}::uuid,${"Role "+before+" -> "+role+" | "+reason})`;
   return true;
  });
  if(!result)return {status:"error",message:t.user};
  revalidatePath(`/${locale}/admin`);
  return {status:"success",message:t.changed};
 }catch(e){console.error("[admin role]",e instanceof Error?e.name:"unknown");return {status:"error",message:t.failed};}
}

export async function setPlatformReceivingAction(localeParam:string,_previous:AdminActionState,form:FormData):Promise<AdminActionState>{
 const locale=safeLocale(localeParam),bn=locale==='bn',admin=await requireFreshSuperAdmin();
 if(!admin)return {status:'error',message:emailLabels[locale].denied};
 const workspace=asText(form.get('workspaceId')),reason=asText(form.get('reason')).trim();
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspace)||reason.length<10||reason.length>500||asText(form.get('confirm'))!=='CHANGE')return {status:'error',message:emailLabels[locale].bad};
 try{
  await database()`SELECT platform_billing_set(${admin.user.id}::uuid,${workspace}::uuid,${reason})`;
  revalidatePath(`/${locale}/admin`);
  return {status:'success',message:bn?'System receiving workspace সংরক্ষিত হয়েছে। নম্বর ও SMS device প্রস্তুত করুন।':'System receiving workspace saved. Configure its receiving numbers and SMS device.'};
 }catch{return {status:'error',message:bn?'Workspace সংরক্ষণ হয়নি। আপনি owner/admin এবং সব সদস্য সক্রিয় super admin হতে হবে; Payment gateway চালু থাকতে হবে।':'Could not save. You must manage this workspace; all members must be active super admins and Payment gateway must be enabled.'};}
}
