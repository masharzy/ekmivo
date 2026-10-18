"use server";
import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {verifiedAdmin,requireSuperAdmin} from "../lib/server/platform-admin";
import {safeLocale,asText} from "../lib/server/validation";

export type AdminOperationState={status:"idle"|"success"|"error";message:string};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const denied=(locale:"bn"|"en"):AdminOperationState=>({status:"error",message:locale==="bn"?"এই কাজের অনুমতি নেই বা সাইন ইনের মেয়াদ শেষ।":"Permission denied or your sign-in has expired."});
const invalid=(locale:"bn"|"en"):AdminOperationState=>({status:"error",message:locale==="bn"?"অনুরোধের তথ্য সঠিক নয়।":"Invalid request or confirmation."});
async function freshActor(){return requireSuperAdmin();}
function reasonFrom(form:FormData){
 const reason=asText(form.get("reason")).trim();
 return reason.length>=10&&reason.length<=500?reason:null;
}
function refresh(locale:string,workspace?:string){
 revalidatePath("/"+locale+"/admin");
 if(workspace)revalidatePath("/"+locale+"/admin/workspaces/"+workspace);
 revalidatePath("/"+locale+"/admin/workspaces");
 revalidatePath("/"+locale+"/admin/users");
}
export async function changeAdminProductAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await freshActor();if(!admin)return denied(locale);
 const workspace=asText(form.get("workspaceId")),product=asText(form.get("product")),enabled=asText(form.get("enabled")),confirm=asText(form.get("confirm"));
 const reason=reasonFrom(form);
 if(!UUID.test(workspace)||!["payments","ai"].includes(product)||!["on","off"].includes(enabled)||confirm!=="CHANGE"||!reason)return invalid(locale);
 try{
  const result=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!actor.length)return "denied";
   const w=await tx`SELECT id,name FROM workspaces WHERE id=${workspace}::uuid FOR UPDATE`;if(!w.length)return "missing";
   const before=await tx`SELECT enabled FROM workspace_product_access WHERE workspace_id=${workspace}::uuid AND product=${product} FOR UPDATE`;
   if(!before.length)return "missing";
   const original=before[0].enabled===true,next=enabled==="on";
   if(original===next)return "unchanged";
   await tx`UPDATE workspace_product_access SET enabled=${next},updated_at=now() WHERE workspace_id=${workspace}::uuid AND product=${product}`;
   await tx`INSERT INTO workspace_product_access_audit(workspace_id,actor_id,product,previous_enabled,new_enabled)
   VALUES(${workspace}::uuid,${admin.user.id}::uuid,${product},${original},${next})`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description)
   VALUES(${admin.user.id}::uuid,'workspace.product_access',${"Workspace "+workspace+" | "+product+" | "+original+" -> "+next+" | "+reason})`;
   return "changed";
  });
  if(result==="denied")return denied(locale);
  if(result==="missing")return invalid(locale);
  refresh(locale,workspace);
  return {status:"success",message:result==="unchanged"?"No changes needed.":locale==="bn"?"প্রোডাক্ট অনুমতি আপডেট ও অডিট হয়েছে।":"Product access updated and audited."};
 }catch(e){console.error("[platform product access]",e instanceof Error?e.name:"unknown");return {status:"error",message:"Product access update failed; no success recorded."};}
}
export async function changeAdminEnvironmentAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await freshActor();if(!admin)return denied(locale);
 const workspace=asText(form.get("workspaceId")),environment=asText(form.get("environment")),status=asText(form.get("status")),confirm=asText(form.get("confirm"));
 const reason=reasonFrom(form);
 if(!UUID.test(workspace)||!["sandbox","live"].includes(environment)||!["active","suspended"].includes(status)||confirm!=="CHANGE"||!reason)return invalid(locale);
 try{
  const result=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!actor.length)return "denied";
   const rows=await tx`SELECT status FROM workspace_environments WHERE workspace_id=${workspace}::uuid AND environment=${environment} FOR UPDATE`;
   if(!rows.length)return "missing";
   const previous=String(rows[0].status);if(previous===status)return "unchanged";
   await tx`UPDATE workspace_environments SET status=${status} WHERE workspace_id=${workspace}::uuid AND environment=${environment}`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description)
    VALUES(${admin.user.id}::uuid,'workspace.environment',${"Workspace "+workspace+" | "+environment+" | "+previous+" -> "+status+" | "+reason})`;
   return "changed";
  });
  if(result==="denied")return denied(locale);
  if(result==="missing")return invalid(locale);
  refresh(locale,workspace);
  return {status:"success",message:result==="unchanged"?"No changes needed.":"Environment updated and audited."};
 }catch(e){console.error("[platform environment]",e instanceof Error?e.name:"unknown");return {status:"error",message:"Environment update failed; no success recorded."};}
}
export async function revokeAdminUserSessionsAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await freshActor();if(!admin)return denied(locale);
 const target=asText(form.get("userId")),confirm=asText(form.get("confirm")),reason=reasonFrom(form);
 if(!UUID.test(target)||target===admin.user.id||confirm!=="REVOKE"||!reason)return invalid(locale);
 try{
  const affected=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!actor.length)return -1;
   const user=await tx`SELECT id FROM app_users WHERE id=${target}::uuid FOR UPDATE`;
   if(!user.length)return -1;
   const result=await tx`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=${target}::uuid AND revoked_at IS NULL AND expires_at>now() RETURNING id`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)
    VALUES(${admin.user.id}::uuid,'user.sessions_revoked',${target}::uuid,${"Revoked "+result.length+" active sessions | "+reason})`;
   return result.length;
  });
  if(affected<0)return denied(locale);
  refresh(locale);
  return {status:"success",message:affected+" active sessions revoked."};
 }catch(e){console.error("[platform sessions]",e instanceof Error?e.name:"unknown");return {status:"error",message:"Unable to revoke sessions."};}
}


export async function changeAdminUserStatusAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await freshActor();if(!admin)return denied(locale);
 const target=asText(form.get("userId")),next=asText(form.get("status")),confirm=asText(form.get("confirm")),reason=reasonFrom(form);
 if(!UUID.test(target)||target===admin.user.id||!["enabled","disabled"].includes(next)||confirm!=="CHANGE"||!reason)return invalid(locale);
 try{
  const result=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!actor.length)return "denied";
   const users=await tx`SELECT disabled_at FROM app_users WHERE id=${target}::uuid FOR UPDATE`;
   if(!users.length)return "missing";
   const targetAdmin=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${target}::uuid LIMIT 1`;
   if(targetAdmin.length)return "protected";
   const wasDisabled=!!users[0].disabled_at,wantDisabled=next==="disabled";
   if(wasDisabled===wantDisabled)return "unchanged";
   await tx`UPDATE app_users SET disabled_at=CASE WHEN ${wantDisabled} THEN now() ELSE NULL END,updated_at=now() WHERE id=${target}::uuid`;
   if(wantDisabled)await tx`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=${target}::uuid AND revoked_at IS NULL`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description) VALUES(${admin.user.id}::uuid,'user.access',${target}::uuid,${"User "+target+" | "+(wasDisabled?"disabled":"enabled")+" -> "+next+" | "+reason})`;
   return "changed";
  });
  if(result==="denied")return denied(locale);
  if(result==="protected")return {status:"error",message:"Staff accounts must be demoted through Staff roles before changing access."};
  if(result==="missing")return invalid(locale);
  refresh(locale);
  return {status:"success",message:result==="unchanged"?"No change needed.":"User status updated and audited."};
 }catch(e){console.error("[platform user status]",e instanceof Error?e.name:"unknown");return {status:"error",message:"User status update failed."};}
}
export async function revokeAdminApiKeyAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await freshActor();if(!admin)return denied(locale);
 const key=asText(form.get("keyId")),confirm=asText(form.get("confirm")),reason=reasonFrom(form);
 if(!UUID.test(key)||confirm!=="REVOKE"||!reason)return invalid(locale);
 try{
  const result=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!actor.length)return "denied";
   const rows=await tx`SELECT id,workspace_id,environment,revoked_at FROM merchant_api_keys WHERE id=${key}::uuid FOR UPDATE`;
   if(!rows.length)return "missing";
   const k=rows[0];if(k.revoked_at)return "unchanged";
   await tx`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${key}::uuid`;
   await tx`INSERT INTO merchant_api_key_audit(workspace_id,environment,key_id,actor_id,action) VALUES(${k.workspace_id}::uuid,${k.environment},${key}::uuid,${admin.user.id}::uuid,'revoked')`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${admin.user.id}::uuid,'api_key.revoked',${"Key "+key+" workspace "+k.workspace_id+" | "+reason})`;
   return "changed";
  });
  if(result==="denied")return denied(locale);
  if(result==="missing")return invalid(locale);
  refresh(locale);
  return {status:"success",message:result==="unchanged"?"Key was already revoked.":"API key revoked and audited."};
 }catch(e){console.error("[platform key revoke]",e instanceof Error?e.name:"unknown");return {status:"error",message:"API key revocation failed."};}
}


export async function replyAdminSupportAction(localeInput:string,_previous:AdminOperationState,form:FormData):Promise<AdminOperationState>{
 const locale=safeLocale(localeInput),admin=await verifiedAdmin();if(!admin||!["super_admin","admin","support"].includes(admin.role))return denied(locale);
 const ticket=asText(form.get("ticketId")),message=asText(form.get("message")).trim(),status=asText(form.get("status")),confirm=asText(form.get("confirm"));
 if(!UUID.test(ticket)||message.length<10||message.length>4000||!["reviewing","resolved"].includes(status)||confirm!=="SEND")return invalid(locale);
 try{
  const response=await database().begin(async tx=>{
   const actor=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role IN ('super_admin','admin','support') FOR UPDATE`;
   if(!actor.length)return false;
   const rows=await tx`SELECT pg13_support_reply(${admin.user.id}::uuid,${ticket}::uuid,${message},${status}) AS value`;
   if(!rows.length)return false;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${admin.user.id}::uuid,'support.reply',${"Ticket "+ticket+" status -> "+status+" | Reply recorded"})`;
   return true;
  });
  if(!response)return denied(locale);
  revalidatePath("/"+locale+"/admin/support");revalidatePath("/"+locale+"/admin/support/"+ticket);
  return {status:"success",message:"Support reply saved and ticket updated."};
 }catch(e){console.error("[platform support]",e instanceof Error?e.name:"unknown");return {status:"error",message:"Support reply failed."};}
}
