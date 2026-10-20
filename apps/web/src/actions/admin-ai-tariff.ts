"use server";
import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {requireFreshSuperAdmin} from "../lib/server/platform-admin";
import {aiTariffTerms} from "../lib/ai-credit-tariff";
export type AdminAiTariffState={status:"idle"|"success"|"error";message:string};
export async function waiveAdminAiRequest(_previous:AdminAiTariffState,form:FormData):Promise<AdminAiTariffState>{
 const actor=await requireFreshSuperAdmin();
 if(!actor)return {status:"error",message:"Verified Super Admin access is required."};
 const workspace=String(form.get("workspace_id")??""),key=String(form.get("request_key")??""),operation=String(form.get("operation_key")??"");
 const reason=String(form.get("reason")??"").trim(),uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(!uuid.test(workspace)||!uuid.test(operation)||!/^[A-Za-z0-9_.:-]{16,128}$/.test(key)||reason.length<20||reason.length>500)
  return {status:"error",message:"Select an unresolved request and give a reason (20–500 characters)."};
 try{
  await database()`SELECT briofold_ai_admin_waive(${actor.user.id}::uuid,${workspace}::uuid,${key},${operation}::uuid,${reason})`;
  revalidatePath("/admin/credits");revalidatePath("/settings/billing");
  for(const locale of ["en","bn"])revalidatePath("/"+locale+"/admin/credits");
  return {status:"success",message:"Reserved credits released. Provider usage remains unverified."};
 }catch(error){
  console.error("[admin/AI exception]",error instanceof Error?error.name:"unknown");
  return {status:"error",message:"Credits could not be released. The request may have settled already; refresh and check."};
 }
}
export async function publishAdminAiTariff(_previous:AdminAiTariffState,form:FormData):Promise<AdminAiTariffState>{
 const actor=await requireFreshSuperAdmin();
 if(!actor)return {status:"error",message:"Verified Super Admin access is required."};
 const model=String(form.get("model")??"").trim(),key=String(form.get("operation_key")??"");
 const expected=String(form.get("expected_version")??"");
 const reason=String(form.get("reason")??"").trim(),terms=aiTariffTerms(form);
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)||!uuid.test(key)||(expected!==""&&!uuid.test(expected))||!terms||reason.length<10||reason.length>500)
  return {status:"error",message:"Check the model, rates and request limits, and provide an audit reason."};
 try{
  await database()`SELECT briofold_ai_tariff_publish(${actor.user.id}::uuid,${key}::uuid,${model},${expected||null}::uuid,${database().json(terms)},${reason})`;
  revalidatePath("/admin/credits");
  for(const locale of ["en","bn"])revalidatePath("/"+locale+"/admin/credits");
  return {status:"success",message:"New rate version published. Previous usage keeps its original rate."};
 }catch(error){
  console.error("[admin/AI tariff]",error instanceof Error?error.name:"unknown");
  return {status:"error",message:"Rates could not be published. Refresh the current version and retry."};
 }
}
