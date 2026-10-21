import {database} from "../lib/server/db";
import {AdminSubscriptionPolicies} from "./admin-subscription-policies";

export async function AdminSubscriptionPoliciesPage({locale,actor}:{locale:"bn"|"en";actor:string}){
 let policies:Parameters<typeof AdminSubscriptionPolicies>[0]["policies"]|null=null;
 try{
  const sql=database();
  const rows=await sql`SELECT platform_subscription_policy_admin(${actor}::uuid,'list','{}'::jsonb) AS data`;
  const items=rows[0]?.data?.policies;
  if(!Array.isArray(items))throw Error("NO_POLICY_LIST");
  policies=items.map(p=>({...p,acceptances:Number(p.acceptances)}));
 }catch{policies=null;}
 if(!policies)return <section role="alert" className="pa-surface pa-description">{locale==="bn"?"পলিসি ডেটা পাওয়া যাচ্ছে না। Control DB migration 0140 যাচাই করুন।":"Legal policy data unavailable. Check control DB migration 0140."}</section>;
 return <AdminSubscriptionPolicies locale={locale} policies={policies}/>;
}
