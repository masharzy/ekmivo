import Link from "next/link";
import type {ReactNode} from "react";
import {notFound} from "next/navigation";
import {database} from "../lib/server/db";
import {goOrigin} from "../lib/server/go-origin";
import {ProductAccessAction,EnvironmentAction,UserSessionsAction,UserStatusAction,ApiKeyRevokeAction,AdminSupportReply,AdminStepUpLink} from "./platform-admin-operations";
import type {AdminLocale} from "./platform-admin-shell";
import {AdminRefreshButton} from "./admin-refresh-button";

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Cell=ReactNode;
export type AdminTable={headers:string[];rows:Cell[][]};
const format=(v:unknown,locale:AdminLocale)=>v==="infinity"||v===Infinity?(locale==="bn"?"মেয়াদহীন":"No expiry"):!v||!Number.isFinite(new Date(String(v)).getTime())?"—":new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(new Date(String(v)));
const text=(v:unknown)=>v===null||v===undefined?"—":String(v);
const status=(v:boolean)=>v?"Enabled":"Disabled";
function Title({name,back}:{name:string;back?:string}){return <div className="pa-page-head"><h1>{name}</h1>{back&&<Link className="pa-button pa-button-secondary" href={back}>← Back</Link>}</div>;}
export function AdminTableView({table,empty="No records found"}:{table:AdminTable;empty?:string}){
 return <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr>{table.headers.map((v,i)=><th key={i} scope="col">{v}</th>)}</tr></thead><tbody>{table.rows.map((row,i)=><tr key={i}>{row.map((c,j)=><td className={j===0?"pa-primary-cell":""} key={j}>{c}</td>)}</tr>)}{!table.rows.length&&<tr><td colSpan={table.headers.length} className="pa-empty-row">{empty}</td></tr>}</tbody></table></div><div className="pa-table-footer"><span>{table.rows.length} records</span></div></section>;
}
function SubNav({base,items,active}:{base:string;items:Array<[string,string]>;active:string}){return <nav className="pa-tabs" aria-label="Detail sections">{items.map(([name,path])=><Link key={path} href={base+(path?"/"+path:"")} aria-current={active===path?"page":undefined}>{name}</Link>)}</nav>;}
const workspaceTabs:Array<[string,string]>=[["Overview",""],["Products","products"],["Payment plans","products-plan"],["Members","members"],["Environments","environments"],["API keys","api-keys"],["Payments","payments"],["Devices","devices"],["Usage & credits","usage-credits"],["Billing","billing"],["Activity","activity"]];
export async function AdminWorkspaceDetail({locale,id,sub=""}:{locale:AdminLocale;id:string;sub?:string}){
 if(!UUID.test(id)||!workspaceTabs.some(x=>x[1]===sub))notFound();
 const base="/"+locale+"/admin/workspaces/"+id;
 const r=await database()`SELECT id,name,service_mode,created_at,updated_at FROM workspaces WHERE id=${id}::uuid LIMIT 1`;
 if(!r.length)notFound();
 const w=r[0];
 const products=await database()`SELECT product,enabled,updated_at FROM workspace_product_access WHERE workspace_id=${id}::uuid ORDER BY product`;
 const environments=await database()`SELECT environment,status,created_at FROM workspace_environments WHERE workspace_id=${id}::uuid ORDER BY environment`;
 const on=(product:string)=>products.some(x=>x.product===product&&x.enabled===true);
 const productControls=<><AdminStepUpLink locale={locale}/><div className="pa-admin-controls">{(["payments","ai"] as const).map(p=><div className="pa-surface" key={p}><ProductAccessAction locale={locale} workspaceId={id} product={p} enabled={on(p)}/></div>)}</div></>;
 let content:ReactNode;
 if(sub===""||sub==="products"){
  content=<><div className="pa-description pa-surface"><dl>{[["Workspace ID",id],["Created",format(w.created_at,locale)],["Service mode",text(w.service_mode)],["Payment gateway",status(on("payments"))],["AI Bot",status(on("ai"))]].map(([k,v])=><div className="pa-description-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
  <h2 className="pa-subhead">Manage product access</h2>{productControls}</>;
 }else if(sub==="members"){
  const rows=await database()`SELECT m.user_id,u.display_name,u.email,m.role,m.joined_at FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=${id}::uuid ORDER BY m.joined_at ASC LIMIT 250`;
  content=<AdminTableView table={{headers:["Member","Email","Role","Joined","User ID"],rows:rows.map(x=>[text(x.display_name),text(x.email),text(x.role),format(x.joined_at,locale),text(x.user_id)])}}/>;
 }else if(sub==="environments"){
  content=<><AdminStepUpLink locale={locale}/><div className="pa-admin-controls">{environments.map(x=><div className="pa-surface" key={String(x.environment)}><EnvironmentAction locale={locale} workspaceId={id} environment={x.environment==="live"?"live":"sandbox"} status={text(x.status)}/></div>)}</div></>;
 }else if(sub==="api-keys"){
  const rows=await database()`SELECT id,public_id,name,environment,scopes,created_at,last_used_at,expires_at,revoked_at FROM merchant_api_keys WHERE workspace_id=${id}::uuid ORDER BY created_at DESC LIMIT 250`;
  content=<><AdminTableView table={{headers:["Name","Public ID (non-secret)","Environment","Scopes","Status","Last used"],rows:rows.map(x=>[text(x.name),text(x.public_id),text(x.environment),Array.isArray(x.scopes)?x.scopes.join(", "):"—",x.revoked_at?"Revoked":new Date(String(x.expires_at))<=new Date()?"Expired":"Active",format(x.last_used_at,locale)])}}/><AdminStepUpLink locale={locale}/><div className="pa-key-actions">{rows.filter(x=>!x.revoked_at).slice(0,25).map(x=><ApiKeyRevokeAction key={String(x.id)} locale={locale} keyId={String(x.id)} name={text(x.name)}/>)}</div></>;
 }else if(sub==="billing"){
  const [s,invoices]=await Promise.all([database()`SELECT s.plan_id,s.paid_until::text,s.grace_until::text,s.updated_at FROM pg13_subscriptions s WHERE s.workspace_id=${id}::uuid`,database()`SELECT id,plan_id,amount_minor,status,created_at,paid_at FROM pg13_platform_invoices WHERE workspace_id=${id}::uuid ORDER BY created_at DESC LIMIT 100`]);
  content=<><section className="pa-surface pa-description"><h2>Current subscription</h2>{s.length?<dl>{[["Plan",text(s[0].plan_id)],["Paid until",format(s[0].paid_until,locale)],["Grace until",format(s[0].grace_until,locale)]].map(([k,v])=><div className="pa-description-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>:<p className="pa-subtle">No active subscription record</p>}</section><AdminTableView table={{headers:["Invoice ID","Plan","Amount (BDT)","Status","Created","Paid at"],rows:invoices.map(x=>[text(x.id),text(x.plan_id),(Number(x.amount_minor)/100).toFixed(2),text(x.status),format(x.created_at,locale),format(x.paid_at,locale)])}}/></>;
 }else if(sub==="activity"){
  const rows=await database()`SELECT a.actor_id,u.display_name,a.product,a.previous_enabled,a.new_enabled,a.changed_at FROM workspace_product_access_audit a LEFT JOIN app_users u ON u.id=a.actor_id WHERE a.workspace_id=${id}::uuid ORDER BY a.changed_at DESC LIMIT 100`;
  content=<AdminTableView table={{headers:["Time","Actor","Product","Before","After"],rows:rows.map(x=>[format(x.changed_at,locale),text(x.display_name||x.actor_id),text(x.product),status(x.previous_enabled===true),status(x.new_enabled===true)])}}/>;
 }else if(sub==="payments"){
  content=<><section className="pa-surface pa-description"><h2>Payment gateway</h2><p>Access: <strong>{status(on("payments"))}</strong></p><p className="pa-subtle">Financial records are isolated in the payment runtime. This access indicator is not a payment transaction or provider status.</p><Link href={"/"+locale+"/admin/payments?q="+encodeURIComponent(id)} className="pa-button pa-button-secondary">View platform payment operations →</Link></section></>;
 }else if(sub==="devices"){
  content=<section className="pa-surface pa-description"><h2>Receipt devices</h2><p className="pa-subtle">Phone receipts and signed device evidence reside in the isolated financial database. The control database cannot safely enumerate those rows.</p><Link className="pa-button pa-button-secondary" href={"/"+locale+"/admin/gateway/devices?q="+id}>View device operations →</Link></section>;
 }else{
  const [credit,ledger]=await Promise.all([
    database()`SELECT balance,updated_at FROM platform_ai_credit_balances WHERE workspace_id=${id}::uuid LIMIT 1`,
    database()`SELECT l.id,l.delta,l.balance_after,l.reason,l.created_at,u.display_name
      FROM platform_ai_credit_ledger l JOIN app_users u ON u.id=l.actor_id WHERE l.workspace_id=${id}::uuid
      ORDER BY l.created_at DESC LIMIT 100`
   ]);
   content=<><section className="pa-surface pa-description"><h2>AI credit balance</h2><dl>
     <div className="pa-description-row"><dt>Current balance</dt><dd>{Number(credit[0]?.balance||0).toLocaleString()}</dd></div>
     <div className="pa-description-row"><dt>Last adjusted</dt><dd>{format(credit[0]?.updated_at,locale)}</dd></div>
     <div className="pa-description-row"><dt>AI product</dt><dd>{on("ai")?"Enabled":"Disabled"}</dd></div>
   </dl><div className="pa-inline-actions"><Link href={"/"+locale+"/admin/credits"} className="pa-button pa-button-primary">Manage AI credits</Link>
   <Link href={base+"/products-plan"} className="pa-button">Payment allowances</Link></div></section>
   <AdminTableView table={{headers:["When","Adjustment","Balance after","By","Reason"],
    rows:ledger.map(l=>[format(l.created_at,locale),Number(l.delta)>0?"+"+l.delta:text(l.delta),
    Number(l.balance_after).toLocaleString(),text(l.display_name),text(l.reason)])}} empty="No AI credit adjustments yet."/>;
   <p className="pa-subtle">This is the manual adjustment ledger, not metered AI model usage.</p></>;
 }
 return <><Title name={text(w.name)} back={"/"+locale+"/admin/workspaces"}/><SubNav base={base} items={workspaceTabs} active={sub}/>{content}</>;
}
export async function AdminUserDetail({locale,id}:{locale:AdminLocale;id:string}){
 if(!UUID.test(id))notFound();
 const base="/"+locale+"/admin/users";
 const [r,members,sessions]=await Promise.all([
 database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,u.disabled_at,u.created_at,p.role FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id WHERE u.id=${id}::uuid LIMIT 1`,
 database()`SELECT m.workspace_id,w.name,m.role,m.joined_at FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=${id}::uuid ORDER BY m.joined_at DESC LIMIT 100`,
 database()`SELECT id,created_at,last_seen_at,expires_at,revoked_at FROM auth_sessions WHERE user_id=${id}::uuid ORDER BY created_at DESC LIMIT 100`]);
 if(!r.length)notFound();
 const u=r[0],active=sessions.filter(s=>!s.revoked_at&&new Date(String(s.expires_at))>new Date()).length;
 return <><Title name={text(u.display_name)} back={base}/><div className="pa-surface pa-description"><dl>{[["User ID",id],["Email",text(u.email)],["Email verified",u.email_verified_at?"Yes":"No"],["Account",u.disabled_at?"Disabled":"Enabled"],["Platform role",text(u.role)],["Created",format(u.created_at,locale)]].map(([k,v])=><div className="pa-description-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
 <h2 className="pa-subhead">Workspace memberships</h2><AdminTableView table={{headers:["Workspace","Workspace ID","Role","Joined"],rows:members.map(x=>[text(x.name),text(x.workspace_id),text(x.role),format(x.joined_at,locale)])}}/>
 <h2 className="pa-subhead">Sessions</h2><AdminTableView table={{headers:["Session ID","Created","Last seen","Expires","Status"],rows:sessions.map(x=>[text(x.id),format(x.created_at,locale),format(x.last_seen_at,locale),format(x.expires_at,locale),x.revoked_at?"Revoked":new Date(String(x.expires_at))>new Date()?"Active":"Expired"])}}/>
 <AdminStepUpLink locale={locale}/><div className="pa-admin-controls"><div className="pa-surface"><UserSessionsAction locale={locale} userId={id} active={active}/></div><div className="pa-surface"><UserStatusAction locale={locale} userId={id} disabled={Boolean(u.disabled_at)} protectedUser={Boolean(u.role)}/></div></div></>;
}
export async function AdminGlobalInventory({locale,kind,sub="",query=""}:{locale:AdminLocale;kind:string;sub?:string;query?:string}){
 const q=query.trim().slice(0,80),term="%"+q+"%";
 let table:AdminTable;
 if(kind==="billing"&&sub!=="revenue"){
  if(sub==="invoices"){
   const r=await database()`SELECT i.id,i.workspace_id,w.name,i.plan_id,i.amount_minor,i.status,i.created_at,i.paid_at FROM pg13_platform_invoices i JOIN workspaces w ON w.id=i.workspace_id WHERE (${q}='' OR w.name ILIKE ${term} OR i.id::text ILIKE ${term}) ORDER BY i.created_at DESC LIMIT 100`;
   table={headers:["Invoice","Workspace","Plan","Amount (BDT)","Status","Created","Paid at"],rows:r.map(x=>[text(x.id),text(x.name),text(x.plan_id),(Number(x.amount_minor)/100).toFixed(2),text(x.status),format(x.created_at,locale),format(x.paid_at,locale)])};
  }else if(sub==="subscriptions"||!sub){
   const r=await database()`SELECT w.id,w.name,s.plan_id,s.paid_until::text,s.grace_until::text FROM pg13_subscriptions s JOIN workspaces w ON w.id=s.workspace_id WHERE (${q}='' OR w.name ILIKE ${term}) ORDER BY s.paid_until DESC LIMIT 100`;
   table={headers:["Workspace","Plan","Paid until","Grace until","State"],rows:r.map(x=>[<Link key={String(x.id)} className="pa-action-link" href={"/"+locale+"/admin/workspaces/"+String(x.id)+"/billing"}>{text(x.name)}</Link>,text(x.plan_id),format(x.paid_until,locale),format(x.grace_until,locale),x.paid_until==="infinity"||new Date(String(x.paid_until))>new Date()?"Active":x.grace_until==="infinity"||new Date(String(x.grace_until))>new Date()?"Grace":"Expired"])};
  }else return null;
 }else if(kind==="billing"&&sub==="revenue"){
  const r=await database()`SELECT i.plan_id,count(*)::int AS paid_count,coalesce(sum(i.amount_minor),0)::bigint AS paid_minor,max(i.paid_at) AS last_paid FROM pg13_platform_invoices i WHERE i.status='paid' AND i.paid_at>=now()-interval '30 days' GROUP BY i.plan_id ORDER BY paid_minor DESC LIMIT 100`;
  table={headers:["Plan","Paid invoices (30 days)","Collected BDT (30 days)","Most recent payment"],rows:r.map(x=>[text(x.plan_id),Number(x.paid_count),(Number(x.paid_minor)/100).toFixed(2),format(x.last_paid,locale)])};
 }else if(kind==="support"){
  const r=await database()`SELECT t.id,t.workspace_id,w.name AS workspace,t.subject,t.status,t.created_at,u.email AS opened_by FROM pg13_support t JOIN workspaces w ON w.id=t.workspace_id JOIN app_users u ON u.id=t.actor_id
  WHERE (${q}='' OR t.subject ILIKE ${term} OR w.name ILIKE ${term} OR t.id::text ILIKE ${term}) ORDER BY t.created_at DESC LIMIT 100`;
  table={headers:["Ticket","Workspace","Subject","Status","Opened by","Created"],rows:r.map(x=>[<Link key={String(x.id)} className="pa-action-link" href={"/"+locale+"/admin/support/"+String(x.id)}>{String(x.id).slice(0,8)+"…"}</Link>,text(x.workspace),text(x.subject),text(x.status),text(x.opened_by),format(x.created_at,locale)])};
 }else if(kind==="privacy"){
  const r=await database()`SELECT p.id,p.workspace_id,w.name AS workspace,p.kind,p.status,p.created_at,p.updated_at,u.email AS requester FROM pg13_privacy_requests p JOIN workspaces w ON w.id=p.workspace_id JOIN app_users u ON u.id=p.actor_id
  WHERE (${q}='' OR w.name ILIKE ${term} OR p.id::text ILIKE ${term}) ORDER BY p.created_at DESC LIMIT 100`;
  table={headers:["Request ID","Workspace","Type","Status","Requested by","Created","Updated"],rows:r.map(x=>[text(x.id),text(x.workspace),text(x.kind),text(x.status),text(x.requester),format(x.created_at,locale),format(x.updated_at,locale)])};
 }else if(kind==="staff"&&(sub==="sessions"||sub==="roles")){
  if(sub==="sessions"){
   const r=await database()`SELECT s.id,u.email,p.role,s.created_at,s.last_seen_at,s.expires_at,s.revoked_at FROM auth_sessions s JOIN app_users u ON u.id=s.user_id JOIN platform_administrators p ON p.user_id=u.id WHERE (${q}='' OR u.email ILIKE ${term}) ORDER BY s.last_seen_at DESC LIMIT 100`;
   table={headers:["Session ID","Admin email","Role","Created","Last seen","Status"],rows:r.map(x=>[text(x.id),text(x.email),text(x.role),format(x.created_at,locale),format(x.last_seen_at,locale),x.revoked_at?"Revoked":new Date(String(x.expires_at))>new Date()?"Active":"Expired"])};
  }else{
   const r=await database()`SELECT u.email,u.display_name,p.role,p.granted_at,p.granted_by,m.confirmed_at FROM platform_administrators p JOIN app_users u ON u.id=p.user_id LEFT JOIN platform_admin_mfa m ON m.user_id=u.id ORDER BY p.granted_at DESC LIMIT 100`;
   table={headers:["Admin","Email","Role","Granted","MFA enrolled"],rows:r.map(x=>[text(x.display_name),text(x.email),text(x.role),format(x.granted_at,locale),x.confirmed_at?"Yes":"No"])};
  }
 }else if(kind==="api"&&(!sub||sub==="keys")){
  const r=await database()`SELECT k.public_id,k.name,k.environment,k.scopes,k.created_at,k.last_used_at,k.expires_at,k.revoked_at,w.name AS workspace FROM merchant_api_keys k JOIN workspaces w ON w.id=k.workspace_id WHERE (${q}='' OR k.public_id ILIKE ${term} OR w.name ILIKE ${term}) ORDER BY k.created_at DESC LIMIT 100`;
  table={headers:["Public ID","Name","Workspace","Environment","Scopes","Status","Last used"],rows:r.map(x=>[text(x.public_id),text(x.name),text(x.workspace),text(x.environment),Array.isArray(x.scopes)?x.scopes.join(", "):"—",x.revoked_at?"Revoked":new Date(String(x.expires_at))<new Date()?"Expired":"Active",format(x.last_used_at,locale)])};
 }else if(kind==="ai"&&(!sub||sub==="workspaces")){
  const r=await database()`SELECT w.id,w.name,p.enabled,p.updated_at FROM workspace_product_access p JOIN workspaces w ON w.id=p.workspace_id WHERE p.product='ai' AND (${q}='' OR w.name ILIKE ${term}) ORDER BY p.updated_at DESC LIMIT 100`;
  table={headers:["Workspace","AI Bot access","Changed","Workspace ID"],rows:r.map(x=>[<Link key={String(x.id)} className="pa-action-link" href={"/"+locale+"/admin/workspaces/"+String(x.id)}>{text(x.name)}</Link>,status(x.enabled===true),format(x.updated_at,locale),text(x.id)])};
 }else if(kind==="payments"&&(!sub||sub==="workspaces")){
  const r=await database()`SELECT w.id,w.name,p.enabled,p.updated_at FROM workspace_product_access p JOIN workspaces w ON w.id=p.workspace_id WHERE p.product='payments' AND (${q}='' OR w.name ILIKE ${term}) ORDER BY p.updated_at DESC LIMIT 100`;
  table={headers:["Workspace","Payment gateway access","Changed","Workspace ID"],rows:r.map(x=>[text(x.name),status(x.enabled===true),format(x.updated_at,locale),text(x.id)])};
 }else return null;
 return <><form className="pa-filter-bar" method="get"><input type="search" name="q" maxLength={80} placeholder="Search workspace, name or ID" defaultValue={q}/><button className="pa-button pa-button-secondary" type="submit">Search</button></form><AdminTableView table={table}/></>;
}

export async function AdminHealthView({locale}:{locale:AdminLocale}){
 const origin=goOrigin();
 let control:"ready"|"error"="error";
 try{const r=await database()`SELECT 1 AS reachable`;if(r.length)control="ready";}catch{control="error";}
 const probe=async(path:string)=>{
  if(!origin)return {state:"Not configured",code:"—"};
  try{const result=await fetch(new URL(path,origin),{cache:"no-store",signal:AbortSignal.timeout(4500)});
   return {state:result.ok?"Ready":"Not ready",code:String(result.status)};
  }catch{return {state:"Unreachable",code:"—"};}
 };
 const [api,financial]=await Promise.all([probe("/healthz"),probe("/readyz")]);
 const items=[{name:"Control database",state:control==="ready"?"Ready":"Unavailable",code:control==="ready"?"Query OK":"Query failed"},
 {name:"Go API process",...api},{name:"Financial release readiness",...financial}];
 return <><div className="pa-page-head"><p className="pa-subtle">Live, read-only health checks. These are current observations, not uptime percentages or synthetic provider metrics.</p><AdminRefreshButton/></div>
 <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr><th>Component</th><th>Status</th><th>Evidence</th></tr></thead><tbody>{items.map(item=><tr key={item.name}><td className="pa-primary-cell">{item.name}</td><td>{item.state}</td><td>{item.code}</td></tr>)}</tbody></table></div></section></>;
}

export async function AdminSupportDetail({locale,id}:{locale:AdminLocale;id:string}){
 if(!UUID.test(id))notFound();
 const [tickets,replies]=await Promise.all([
  database()`SELECT t.id,t.workspace_id,w.name AS workspace,t.actor_id,t.subject,t.message,t.status,t.created_at FROM pg13_support t JOIN workspaces w ON w.id=t.workspace_id WHERE t.id=${id}::uuid LIMIT 1`,
  database()`SELECT r.message,r.created_at,u.display_name,u.email FROM pg13_support_replies r JOIN app_users u ON u.id=r.actor_id WHERE r.ticket_id=${id}::uuid ORDER BY r.created_at ASC LIMIT 100`
 ]);
 if(!tickets.length)notFound();const t=tickets[0];
 return <><Title name={text(t.subject)} back={"/"+locale+"/admin/support"}/>
  <section className="pa-surface pa-description"><dl>{[["Ticket ID",id],["Workspace",text(t.workspace)],["Status",text(t.status)],["Created",format(t.created_at,locale)]].map(([k,v])=><div className="pa-description-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  <section className="pa-surface pa-support-thread"><div className="pa-support-entry"><strong>Merchant message</strong><p>{text(t.message)}</p></div>
  {replies.map((r,i)=><div className="pa-support-entry" key={i}><strong>{text(r.display_name)} <small>· {format(r.created_at,locale)}</small></strong><p>{text(r.message)}</p></div>)}</section>
  <AdminStepUpLink locale={locale}/><section className="pa-surface pa-session-card"><AdminSupportReply locale={locale} ticketId={id}/></section>
 </>;
}
