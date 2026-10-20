"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {publicPaymentPlans} from "../lib/server/payment-plans";

export type SetupResult={status:"idle"|"error";message:string};
const fail=(message:string):SetupResult=>({status:"error",message});
export async function submitBriofoldSetup(_previous:SetupResult,form:FormData):Promise<SetupResult>{
 const actor=await requireUser("bn");
 const workspace=await preferredWorkspaceFor(actor.id);
 if(!workspace)return fail("Business unavailable.");
 const step=String(form.get("step")??"");
 if(!["business","services","billing"].includes(step))return fail("Invalid setup step.");
 const name=String(form.get("name")??"").trim();
 const category=String(form.get("business_type")??"");
 const mode=String(form.get("mode")??"");
 const plan=String(form.get("plan")??"");
 if(step==="business"&&(name.length<2||name.length>40||!["online","physical","service","other"].includes(category)))return fail("Check your business name and type.");
 if(step==="services"&&!["ai","commerce","both"].includes(mode))return fail("Choose AI, Payments, or Both.");
 if(step==="billing"&&plan.length>40)return fail("Invalid plan selection.");
 // Plan choices are authoritative catalog values, never a client-declared entitlement.
 let paidGatewaySelection=false;
 let freeGatewaySelection=false;
 if(step==="billing"&&workspace.mode!=="ai"){
  const published=await publicPaymentPlans();
  if(published.unavailable)return fail("Plan catalog is unavailable. Retry.");
  const selected=published.plans.find(p=>p.id===plan);
  if(!selected||selected.terms.kind==="custom")return fail("Choose an available plan.");
  freeGatewaySelection=selected.terms.kind==="free";
  paidGatewaySelection=!freeGatewaySelection;
 }
 try{
  const outcome=await database().begin(async tx=>{
   const [owner]=await tx`SELECT role FROM workspace_members WHERE workspace_id=${workspace.id}::uuid
      AND user_id=${actor.id}::uuid FOR UPDATE`;
   if(!owner||owner.role!=="owner")return "forbidden";
   const [record]=await tx`SELECT step FROM briofold_business_onboarding WHERE workspace_id=${workspace.id}::uuid
      AND owner_id=${actor.id}::uuid FOR UPDATE`;
   if(!record)return "missing";
   if(record.step==="complete")return "already";
   if(record.step!==step)return "conflict";
   if(step==="business"){
    const [data]=await tx`SELECT dashboard_store_read(${workspace.id}::uuid,${actor.id}::uuid) AS profile`;
    if(!data?.profile?.body)return "missing";
    const body={...data.profile.body,name,business_type:category,
     description:String(form.get("description")??"").trim().slice(0,60),
     address:String(form.get("address")??"").trim().slice(0,250)};
    await tx`SELECT dashboard_store_write(${workspace.id}::uuid,${actor.id}::uuid,${tx.json(body)},${Number(data.profile.version)})`;
    await tx`UPDATE workspaces SET name=${name} WHERE id=${workspace.id}::uuid`;
    await tx`UPDATE briofold_business_onboarding SET step='services',updated_at=now() WHERE workspace_id=${workspace.id}::uuid`;
   }
   if(step==="services"){
    for(const product of ["ai","payments"] as const){
     const enabled=product==="ai"?mode!=="commerce":mode!=="ai";
     const [current]=await tx`SELECT enabled FROM workspace_product_access
      WHERE workspace_id=${workspace.id}::uuid AND product=${product} FOR UPDATE`;
     if(!current)return "missing";
     if(Boolean(current.enabled)!==enabled){
      await tx`UPDATE workspace_product_access SET enabled=${enabled},updated_at=now()
       WHERE workspace_id=${workspace.id}::uuid AND product=${product}`;
      await tx`INSERT INTO workspace_product_access_audit(workspace_id,actor_id,product,previous_enabled,new_enabled)
       VALUES(${workspace.id}::uuid,${actor.id}::uuid,${product},${!enabled},${enabled})`;
     }
    }
    await tx`UPDATE workspaces SET service_mode=${mode} WHERE id=${workspace.id}::uuid`;
    await tx`UPDATE briofold_business_onboarding SET step='billing',updated_at=now()
      WHERE workspace_id=${workspace.id}::uuid`;
   }
   if(step==="billing"){
    // Free is a real subscription claim; a paid plan is NEVER activated
    // until the existing verified billing purchase completes.
    if(freeGatewaySelection)await tx`SELECT payment_plan_claim_free(${workspace.id}::uuid,${actor.id}::uuid,${plan})`;
    await tx`UPDATE briofold_business_onboarding SET step='complete',
     selected_gateway_plan_id=${workspace.mode==="ai"?null:plan||null},
     completed_at=now(),updated_at=now()
     WHERE workspace_id=${workspace.id}::uuid`;
   }
   return "ok";
  });
  if(outcome!=="ok"&&outcome!=="already")return fail(outcome==="forbidden"?"Owner access required.":"This setup changed. Refresh and try again.");
 }catch(error){
  console.error("[briofold setup]",error instanceof Error?error.name:"unknown");
  return fail("Could not save setup. Check the details and retry.");
 }
 revalidatePath("/dashboard");
 revalidatePath("/setup");
 if(step==="billing")redirect(paidGatewaySelection?"/settings/billing?tab=plans&plan="+encodeURIComponent(plan):"/dashboard");
 redirect("/setup");
}
