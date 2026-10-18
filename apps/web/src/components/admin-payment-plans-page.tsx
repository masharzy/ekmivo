import {database} from "../lib/server/db";
import {AdminPaymentPlans} from "./admin-payment-plans";
import {AdminWorkspacePlanPanel} from "./admin-workspace-plan";
import type {AdminPaymentPlan} from "../lib/payment-plans";
export async function AdminPaymentPlansPage({locale,actor,workspace=""}:{locale:"en"|"bn";actor:string;workspace?:string}){
 let plans:AdminPaymentPlan[]=[],spaces:Array<{id:string;name:string}>=[],unavailable=false;
 try{
  const [r,w]=await Promise.all([database()`SELECT payment_plan_admin(${actor}::uuid,'read','{}'::jsonb) AS data`,database()`SELECT id,name FROM workspaces WHERE (${workspace}='' OR id::text=${workspace}) ORDER BY name LIMIT 200`]);
  plans=r[0].data.plans as AdminPaymentPlan[];spaces=w.map(x=>({id:String(x.id),name:String(x.name)}));
 }catch{unavailable=true}
 if(workspace){
  return unavailable?<section className="pa-surface pa-description" role="alert">{locale==="bn"?"সাবস্ক্রিপশন সেবা পাওয়া যাচ্ছে না।":"Subscription service is unavailable."}</section>:
   <AdminWorkspacePlanPanel locale={locale} workspaceId={workspace} workspaceName={spaces[0]?.name||workspace} plans={plans}/>;
 }
 return <AdminPaymentPlans locale={locale} initial={plans} workspaces={spaces} unavailable={unavailable}/>;
}
