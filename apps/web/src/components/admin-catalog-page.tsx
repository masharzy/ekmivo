import Link from "next/link";
import {database} from "../lib/server/db";
import {AdminAiCreditsManager,AdminProviderManager} from "./admin-catalog-management";
import {AdminTableView} from "./platform-admin-inventory";
import type {AdminLocale} from "./platform-admin-shell";
type Provider={code:string;display_name:string;logo_url:string;provider_type:string;status:string;visible_in_add_account:boolean;checkout_enabled:boolean;live_enabled:boolean;verification_supported:boolean;sort_order:number};
function DbMissing({name}:{name:string}){return <section className="pa-surface pa-not-connected"><p>{name} database setup required</p><span>Migration 0084_admin_provider_credit_catalog.sql must be applied to the control database before these actions are available. No demo records are shown.</span></section>}
export async function AdminProvidersPage({isSuper}:{isSuper:boolean}){
 let providers:Provider[]|null=null;
 try{
 const rows=await database()`SELECT code,display_name,logo_url,provider_type,status,visible_in_add_account,
 checkout_enabled,live_enabled,verification_supported,sort_order FROM platform_payment_providers ORDER BY sort_order,display_name`;
 providers=rows.map(x=>({code:String(x.code),display_name:String(x.display_name),logo_url:String(x.logo_url||""),
 provider_type:String(x.provider_type),status:String(x.status),visible_in_add_account:x.visible_in_add_account===true,
 checkout_enabled:x.checkout_enabled===true,live_enabled:x.live_enabled===true,verification_supported:x.verification_supported===true,sort_order:Number(x.sort_order)}));
 }catch(error){console.error("[admin/providers]",error instanceof Error?error.name:"unknown");}
 return providers?<AdminProviderManager providers={providers} canEdit={isSuper}/>:<><div className="pa-page-head"><h1>Payment Providers</h1></div><DbMissing name="Provider catalog"/></>;
}
export async function AdminCreditsPage({isSuper}:{isSuper:boolean}){
 let workspaces:Array<{id:string;name:string;balance:number}>|null=null;
 let history:Array<{id:string;workspace:string;delta:number;balance_after:number;reason:string;actor:string;created_at:string}>=[];
 try{
 const [all,entries]=await Promise.all([
 database()`SELECT w.id,w.name,coalesce(c.balance,0) AS balance FROM workspaces w
  LEFT JOIN platform_ai_credit_balances c ON c.workspace_id=w.id ORDER BY w.name LIMIT 500`,
 database()`SELECT l.id,w.name AS workspace,l.delta,l.balance_after,l.reason,l.created_at,u.display_name AS actor
  FROM platform_ai_credit_ledger l JOIN workspaces w ON w.id=l.workspace_id JOIN app_users u ON u.id=l.actor_id
  ORDER BY l.created_at DESC LIMIT 100`
 ]);
 workspaces=all.map(x=>({id:String(x.id),name:String(x.name),balance:Number(x.balance)}));
 history=entries.map(x=>({id:String(x.id),workspace:String(x.workspace),delta:Number(x.delta),
 balance_after:Number(x.balance_after),reason:String(x.reason),actor:String(x.actor),created_at:new Date(String(x.created_at)).toISOString()}));
 }catch(error){console.error("[admin/credits]",error instanceof Error?error.name:"unknown");}
 return workspaces?<AdminAiCreditsManager canEdit={isSuper} workspaces={workspaces} entries={history}/>:<><div className="pa-page-head"><h1>AI Credits</h1></div><DbMissing name="Credit ledger"/></>;
}
export async function AdminSubscriptionsPage({locale,query}:{locale:AdminLocale;query:string}){
 const base="/"+locale+"/admin",q=query.slice(0,80),term="%"+q+"%";
 const rows=await database()`SELECT s.workspace_id,w.name,s.plan_id,s.paid_until::text AS paid_until,
 s.grace_until::text AS grace_until,s.started_at,s.plan_version_id,pv.version, pv.terms->>'name' AS plan_name,
 CASE WHEN s.paid_until>now() THEN 'Active' WHEN s.grace_until>now() THEN 'Grace' ELSE 'Expired' END AS current_state
 FROM pg13_subscriptions s JOIN workspaces w ON w.id=s.workspace_id
 LEFT JOIN payment_plan_versions pv ON pv.id=s.plan_version_id
 WHERE (${q}='' OR w.name ILIKE ${term} OR s.plan_id ILIKE ${term})
 ORDER BY s.paid_until DESC LIMIT 150`;
 const date=(s:unknown)=>s==="infinity"?"No expiry":s?new Date(String(s)).toLocaleDateString("en-GB"):"—";
 const table={headers:["Workspace","Plan","Version","Paid until","Grace until","Status","Manage"],rows:rows.map(s=>{
 const status=String(s.current_state);
 return [<Link key={String(s.workspace_id)} href={base+"/workspaces/"+s.workspace_id+"/billing"} className="pa-action-link">{String(s.name)}</Link>,
 String(s.plan_name||s.plan_id),s.version?"v"+s.version:"—",date(s.paid_until),date(s.grace_until),status,
 <Link key={"manage"+s.workspace_id} href={base+"/workspaces/"+s.workspace_id+"/products-plan"} className="pa-button">Manage</Link>
 ]})};
 return <><div className="pa-page-head"><div><h1>Subscriptions</h1><p>Real plan assignments and renewal dates from the control database.</p></div>
 <div className="pa-page-actions"><a className="pa-button" href={base+"/exports?"+new URLSearchParams({kind:"subscriptions",q}).toString()}>Export CSV</a><Link href={base+"/plans"} className="pa-button pa-button-primary">Manage plans & assignments</Link></div></div>
 <form className="pa-filter-bar" method="get"><input type="search" name="q" defaultValue={q} placeholder="Search workspaces or plans" maxLength={80}/><button type="submit" className="pa-button">Search</button></form>
 <AdminTableView table={table} empty="No subscriptions match your search."/></>;
}
