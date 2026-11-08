"use server";

import {revalidatePath} from "next/cache";
import {requireUser} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {asText,safeLocale} from "../lib/server/validation";

export type ServiceToggleState={status:"idle"|"error"|"success";message:string};

export async function setWorkspaceProduct(localeText:string,_old:ServiceToggleState,form:FormData):Promise<ServiceToggleState>{
 const locale=safeLocale(localeText),bn=locale==="bn";
 const actor=await requireUser(locale);
 const workspace=asText(form.get("workspaceId"));
 const product=asText(form.get("product"));
 const enabled=asText(form.get("enabled"));
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspace)
  ||(product!=="ai"&&product!=="payments")||(enabled!=="true"&&enabled!=="false"))
  return {status:"error",message:bn?"অনুরোধটি সঠিক নয়।":"Invalid product configuration request."};
 const next=enabled==="true";
 try{
  const result=await database().begin(async tx=>{
   // Lock the actor's current membership: removed/revoked roles cannot mutate.
   const member=await tx`SELECT role FROM workspace_members
    WHERE workspace_id=${workspace}::uuid AND user_id=${actor.id}::uuid
    FOR UPDATE`;
   if(member.length!==1||!["owner","admin"].includes(String(member[0].role)))return "forbidden";
   const current=await tx`SELECT enabled FROM workspace_product_access
    WHERE workspace_id=${workspace}::uuid AND product=${product} FOR UPDATE`;
   if(current.length!==1)return "unavailable";
   if(Boolean(current[0].enabled)===next)return "unchanged";
   const changes=await tx`UPDATE workspace_product_access SET enabled=${next},updated_at=now()
    WHERE workspace_id=${workspace}::uuid AND product=${product} RETURNING enabled`;
   if(changes.length!==1)return "unavailable";
   await tx`INSERT INTO workspace_product_access_audit(
    workspace_id,actor_id,product,previous_enabled,new_enabled)
    VALUES(${workspace}::uuid,${actor.id}::uuid,${product},${!next},${next})`;
   return "changed";
  });
  if(result==="forbidden")return {status:"error",message:bn?"এই পরিবর্তনের অনুমতি নেই।":"Only an owner or admin can change business products."};
  if(result==="unavailable")return {status:"error",message:bn?"এই ব্যবসার সেবা কনফিগার করা হয়নি।":"Product configuration is unavailable."};
  revalidatePath(`/${locale}/businesses`);
  revalidatePath(`/${locale}/dashboard`);
  return {status:"success",message:result==="unchanged"
   ?(bn?"আগের অবস্থাই আছে।":"No change was required.")
   :(next?(bn?"সেবাটি চালু করা হয়েছে।":"Product enabled."): (bn?"সেবাটি বন্ধ করা হয়েছে।":"Product disabled."))};
 }catch(error){
  console.error("[workspace product toggle]",error instanceof Error?error.name:"unknown");
  return {status:"error",message:bn?"সেবা পরিবর্তন সংরক্ষণ করা যায়নি।":"Could not save product access change."};
 }
}
