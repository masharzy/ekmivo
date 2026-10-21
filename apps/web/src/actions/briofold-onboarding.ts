"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {cookies} from "next/headers";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {database} from "../lib/server/db";
import type {PaymentPlan} from "../lib/payment-plans";
import {dashboardHref} from "../lib/dashboard-navigation";

export type SetupResult={status:"idle"|"error";message:string};
const fail=(message:string):SetupResult=>({status:"error",message});
class SetupConflict extends Error {}
export async function submitBriofoldSetup(_previous:SetupResult,form:FormData):Promise<SetupResult>{
 const actor=await requireUser("bn");
 const workspace=await preferredWorkspaceFor(actor.id);
 if(!workspace)return fail("Business unavailable.");
 // This is a stale-tab guard, never authorization: current membership is locked below.
 if(form.get("business_id")!==workspace.id)return fail("Your selected business changed. Refresh setup and try again.");
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
 let outcome:string;
 try{
  outcome=await database().begin(async tx=>{
   const [owner]=await tx`SELECT role FROM workspace_members WHERE workspace_id=${workspace.id}::uuid
      AND user_id=${actor.id}::uuid FOR UPDATE`;
   if(!owner||owner.role!=="owner")return "forbidden";
   // Onboarding belongs to the business, not the historical creator.
   // The actor's CURRENT owner membership was already locked above.
   const [record]=await tx`SELECT step FROM briofold_business_onboarding WHERE workspace_id=${workspace.id}::uuid FOR UPDATE`;
   if(!record)return "missing";
   if(record.step==="complete")return "already";
   if(record.step!==step)return "conflict";
   if(step==="business"){
    const [data]=await tx`SELECT dashboard_store_read(${workspace.id}::uuid,${actor.id}::uuid) AS profile`;
    if(!data?.profile?.body)throw new SetupConflict("Store profile unavailable.");
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
     if(!current)throw new SetupConflict("Service configuration unavailable.");
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
    // Re-read and lock entitlements inside this transaction. The page's business
    // mode may be stale after an administrator changes service access.
    const access=await tx`SELECT product,enabled FROM workspace_product_access
     WHERE workspace_id=${workspace.id}::uuid ORDER BY product FOR UPDATE`;
    const paymentsEnabled=access.some(x=>x.product==="payments"&&x.enabled);
    const aiEnabled=access.some(x=>x.product==="ai"&&x.enabled);
    if(!paymentsEnabled&&!aiEnabled)throw new SetupConflict("Business services changed. Refresh setup.");
    let freeGatewaySelection=false;
    if(paymentsEnabled){
     const [catalogue]=await tx`SELECT payment_plan_public() AS plans`;
     const selected=(catalogue?.plans as PaymentPlan[]|undefined)?.find(p=>p.id===plan);
     if(!selected||selected.terms.kind==="custom")throw new SetupConflict("Choose an available plan.");
     freeGatewaySelection=selected.terms.kind==="free";
     paidGatewaySelection=!freeGatewaySelection;
    }else if(plan)throw new SetupConflict("Business services changed. Refresh setup.");
    // Free is a real subscription claim; a paid plan is NEVER activated
    // until the existing verified billing purchase completes.
    if(freeGatewaySelection)await tx`SELECT payment_plan_claim_free(${workspace.id}::uuid,${actor.id}::uuid,${plan})`;
    await tx`UPDATE briofold_business_onboarding SET step='complete',
     selected_gateway_plan_id=${paymentsEnabled?plan:null},
     completed_at=now(),updated_at=now()
     WHERE workspace_id=${workspace.id}::uuid`;
   }
   return "ok";
  });
 }catch(error){
  if(error instanceof SetupConflict)return fail(error.message);
  console.error("[briofold setup]",error instanceof Error?error.name:"unknown");
  return fail("Could not save setup. Check the details and retry.");
 }
 if(outcome==="already")redirect("/dashboard");
 if(outcome!=="ok")return fail(outcome==="forbidden"?"Owner access required.":"This setup changed. Refresh and try again.");
 revalidatePath("/dashboard");
 revalidatePath("/setup");
 if(step==="billing"){
  if(paidGatewaySelection){
   // The setup action is already authenticated and has locked the selected
   // store. Preserve that context rather than performing a second auth check
   // in a route handler during the server-action redirect handoff.
   if(process.env.EKMIVO_SUBSCRIPTION_ORDER_PREVIEW==="1")redirect("/checkout/order/"+encodeURIComponent(plan));
   redirect(dashboardHref("bn",workspace.id,"payments","billing")+"?tab=plans&plan="+encodeURIComponent(plan));
  }
  (await cookies()).delete("ekmivo-selected-plan");
  redirect("/dashboard");
 }
 redirect("/setup");
}
