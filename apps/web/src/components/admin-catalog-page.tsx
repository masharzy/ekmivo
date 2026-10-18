import Link from "next/link";
import {database} from "../lib/server/db";
import {AdminAiCreditsManager,AdminProviderManager} from "./admin-catalog-management";
import {AdminTableView} from "./platform-admin-inventory";
import type {AdminLocale} from "./platform-admin-shell";
type Provider={code:string;display_name:string;logo_url:string;provider_type:string;status:string;visible_in_add_account:boolean;checkout_enabled:boolean;live_enabled:boolean;verification_supported:boolean;sort_order:number};
function DbMissing({name}:{name:string}){return <section className="pa-surface pa-not-connected"><p>{name} database setup required</p><span>Migration 0084_admin_provider_credit_catalog.sql must be applied to the control database before these actions are available. No demo records are shown.</span></section>}
export async function AdminProvidersPage({isSuper,locale}:{isSuper:boolean;locale:"bn"|"en"}){
 let providers:Provider[]|null=null;
 try{
 const rows=await database()`SELECT code,display_name,logo_url,provider_type,status,visible_in_add_account,
 checkout_enabled,live_enabled,verification_supported,sort_order FROM platform_payment_providers ORDER BY sort_order,display_name`;
 providers=rows.map(x=>({code:String(x.code),display_name:String(x.display_name),logo_url:String(x.logo_url||""),
 provider_type:String(x.provider_type),status:String(x.status),visible_in_add_account:x.visible_in_add_account===true,
 checkout_enabled:x.checkout_enabled===true,live_enabled:x.live_enabled===true,verification_supported:x.verification_supported===true,sort_order:Number(x.sort_order)}));
 }catch(error){console.error("[admin/providers]",error instanceof Error?error.name:"unknown");}
 return providers?<AdminProviderManager providers={providers} canEdit={isSuper} locale={locale}/>:<><div className="pa-page-head"><h1>Payment Providers</h1></div><DbMissing name="Provider catalog"/></>;
}
export async function AdminCreditsPage({isSuper,locale}:{isSuper:boolean;locale:"bn"|"en"}){
 let workspaces:Array<{id:string;name:string;balance:number}>|null=null;
 let history:Array<{id:string;workspace:string;delta:number;balance_after:number;reason:string;actor:string;created_at:string}>=[];
 try{
 const [all,entries]=await Promise.all([
 database()`SELECT w.id,w.name,coalesce(c.balance,0) AS balance FROM workspaces w
  LEFT JOIN platform_ai_credit_balances c ON c.workspace_id=w.id WHERE EXISTS (SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='ai' AND p.enabled=true) ORDER BY w.name LIMIT 500`,
 database()`SELECT l.id,w.name AS workspace,l.delta,l.balance_after,l.reason,l.created_at,u.display_name AS actor
  FROM platform_ai_credit_ledger l JOIN workspaces w ON w.id=l.workspace_id JOIN app_users u ON u.id=l.actor_id
  ORDER BY l.created_at DESC LIMIT 100`
 ]);
 workspaces=all.map(x=>({id:String(x.id),name:String(x.name),balance:Number(x.balance)}));
 history=entries.map(x=>({id:String(x.id),workspace:String(x.workspace),delta:Number(x.delta),
 balance_after:Number(x.balance_after),reason:String(x.reason),actor:String(x.actor),created_at:new Date(String(x.created_at)).toISOString()}));
 }catch(error){console.error("[admin/credits]",error instanceof Error?error.name:"unknown");}
 return workspaces?<AdminAiCreditsManager canEdit={isSuper} locale={locale} workspaces={workspaces} entries={history}/>:<><div className="pa-page-head"><h1>AI Credits</h1></div><DbMissing name="Credit ledger"/></>;
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

export async function AdminBillingPage({locale,query}:{locale:AdminLocale;query:string}){
 const base="/"+locale+"/admin",q=query.trim().slice(0,80),term="%"+q+"%";
 const [stats,invoices]=await Promise.all([
  database()`SELECT
    (SELECT coalesce(sum(amount_minor),0) FROM pg13_platform_invoices WHERE status='paid' AND paid_at>=now()-interval '30 days') AS collected_minor,
    (SELECT count(*)::int FROM pg13_subscriptions WHERE paid_until>now()) AS active_subscriptions,
    (SELECT coalesce(sum(amount_minor),0) FROM pg13_platform_invoices WHERE status='issued' AND created_at<now()-interval '7 days') AS overdue_minor`,
  database()`SELECT i.id,i.plan_id,i.amount_minor,i.status,i.created_at,i.paid_at,w.name AS workspace,w.id AS workspace_id
    FROM pg13_platform_invoices i JOIN workspaces w ON w.id=i.workspace_id
    WHERE (${q}='' OR w.name ILIKE ${term} OR i.id::text ILIKE ${term})
    ORDER BY i.created_at DESC LIMIT 100`
 ]);
 const s=stats[0],money=(minor:unknown)=>"৳"+(Number(minor)/100).toLocaleString("en-BD",{minimumFractionDigits:0,maximumFractionDigits:2});
 const timestamp=(v:unknown)=>v?new Date(String(v)).toLocaleDateString("en-GB"):"—";
 return <>
  <div className="pa-page-head"><div><h1>Billing & Revenue</h1><p>Ekmivo subscription invoices and collected revenue, not merchant payment volume.</p></div>
   <a className="pa-button" href={base+"/exports?"+new URLSearchParams({kind:"invoices",q}).toString()}>Export invoices CSV</a>
  </div>
  <section className="pa-surface pa-stats-strip" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
   <div className="pa-stat"><span>Collected (30 days)</span><strong>{money(s.collected_minor)}</strong><small>Paid platform invoices</small></div>
   <div className="pa-stat"><span>Active subscriptions</span><strong>{Number(s.active_subscriptions)}</strong><small>Payment Gateway product</small></div>
   <div className="pa-stat"><span>Overdue invoices</span><strong>{money(s.overdue_minor)}</strong><small>Issued more than 7 days ago</small></div>
  </section>
  <div className="pa-inline-actions" style={{paddingTop:0}}>
   <Link href={base+"/billing/revenue"} className="pa-button">Revenue by plan</Link>
   <Link href={base+"/subscriptions"} className="pa-button">Subscriptions</Link>
  </div>
  <form method="get" className="pa-filter-bar"><input type="search" name="q" defaultValue={q} placeholder="Find invoice, business or ID" maxLength={80}/><button className="pa-button" type="submit">Search</button></form>
  <AdminTableView empty="No platform invoices match." table={{headers:["Invoice","Workspace","Plan","Amount","Created","Status","Paid at"],rows:invoices.map(x=>[
    String(x.id),<Link key={String(x.workspace_id)} href={base+"/workspaces/"+x.workspace_id+"/billing"} className="pa-action-link">{String(x.workspace)}</Link>,
    String(x.plan_id),money(x.amount_minor),timestamp(x.created_at),String(x.status),timestamp(x.paid_at)
  ])}}/>
 </>;
}
