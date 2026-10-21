
import {AdminTrustedDevices} from "./admin-trusted-devices";
import {canReadAdmin} from "../lib/admin-permissions";
import Link from "next/link";
import type {ReactNode} from "react";
import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {currentUser,requireUser} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {platformRole,platformSettings,verifiedAdmin} from "../lib/server/platform-admin";
import {sessionMfaValid} from "../lib/server/mfa";
import {mailReady} from "../lib/server/email";
import {publicSandboxConfig} from "../lib/server/public-sandbox";
import {AdminPlatformReceiving} from "./admin-platform-receiving";
import {VerificationSettings,RoleControls} from "./admin-controls";
import {AdminShell,type AdminLocale} from "./platform-admin-shell";
import {AdminModal,AdminCopy} from "./platform-admin-widgets";
import {AdminPaymentPlansPage} from "./admin-payment-plans-page";
import {AdminSubscriptionCouponsPage} from "./admin-subscription-coupons-page";
import {AdminSubscriptionPoliciesPage} from "./admin-subscription-policies-page";
import {AdminSubscriptionOffersPage} from "./admin-subscription-offers-page";
import {AdminProvidersPage,AdminCreditsPage,AdminSubscriptionsPage} from "./admin-catalog-page";
import {AdminWorkspaceCreationForm} from "./admin-catalog-management";
import {AdminWorkspaceDetail,AdminUserDetail,AdminGlobalInventory,AdminHealthView,AdminSupportDetail} from "./platform-admin-inventory";

type RecordRow={id:string;cells:string[];href?:string};
type RecordPage={columns:string[];rows:RecordRow[];next?:string};
type Props={locale:AdminLocale;segments?:string[];query?:string;after?:string;couponStatus?:string};
const names:Record<string,[string,string]>={
 "":["Overview","ওভারভিউ"],workspaces:["Workspaces","ওয়ার্কস্পেস"],users:["Users","ব্যবহারকারী"],
 payments:["Payments","পেমেন্ট"],subscriptions:["Subscriptions","সাবস্ক্রিপশন"],billing:["Billing & Revenue","বিলিং ও আয়"],credits:["AI Credits","এআই ক্রেডিট"],providers:["Payment Providers","পেমেন্ট প্রোভাইডার"],
 plans:["Plans & Pricing","প্ল্যান ও মূল্য"],"gateway/providers":["Providers","প্রোভাইডার"],"gateway/devices":["Receipt devices","রিসিপ্ট ডিভাইস"],
 "gateway/webhooks":["Webhooks & jobs","ওয়েবহুক ও জব"],ai:["AI Bot","এআই বট"],
 api:["API & sandbox","এপিআই ও স্যান্ডবক্স"],health:["Platform health","প্ল্যাটফর্মের অবস্থা"],
 staff:["Staff & security","স্টাফ ও নিরাপত্তা"],audit:["Audit log","অডিট লগ"],support:["Support tickets","সাপোর্ট টিকিট"],privacy:["Privacy requests","গোপনীয়তার আবেদন"],settings:["Settings","সেটিংস"]
};
const tabs:Record<string,string[]>={
 payments:["Payments","Exceptions","Disputes","Refunds","Reconciliation"],
 billing:["Subscriptions","Invoices","Revenue","Coupons","Offers"],
 credits:["Balances","Ledger","Packs","Rules"],
 plans:["Payment gateway","AI Bot"],
 "gateway/webhooks":["Deliveries","Endpoints","Queues"],
 ai:["Workspaces","Models & usage","Conversations","Safety","Handover"],
 api:["Keys","Sandbox","Limits","Versions"],
 staff:["Staff","Roles","Sessions","Security policy"],
 settings:["Authentication & email","Feature flags","Legal & contact"]
};
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function label(locale:AdminLocale,en:string,bn:string){return locale==="bn"?bn:en;}
function short(v:string){return v.length>12?v.slice(0,8)+"…":v;}
function formatDate(value:unknown,locale:AdminLocale){if(!value)return "—";const d=new Date(String(value));return Number.isNaN(d.valueOf())?"—":new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(d);}
function titleCase(s:string){return s.replace(/[._-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function PageHead({title,action,description}:{title:string;action?:ReactNode;description?:string}){return <div className="pa-page-head"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="pa-page-actions">{action}</div>}</div>;}
function Offline({locale,description}:{locale:AdminLocale;description?:string}){return <div className="pa-surface pa-not-connected"><p><span className="pa-muted-dot"/>{label(locale,"Not connected","সংযুক্ত নয়")}</p><span>{description||label(locale,"The platform backend does not provide this capability yet.","এই সুবিধাটি এখনো প্ল্যাটফর্মের backend-এ যুক্ত হয়নি।")}</span></div>;}
function Denied({locale}:{locale:AdminLocale}){return <div className="pa-surface pa-not-connected"><p>{label(locale,"You don't have access to this information.","এই তথ্য দেখার অনুমতি নেই।")}</p></div>;}
function PageTabs({locale,base,items,active}:{locale:AdminLocale;base:string;items:string[];active?:string}){return <nav className="pa-tabs" aria-label="Sections">{items.map((name,i)=>{const slug=name.toLowerCase().replaceAll(" & ","-").replaceAll(" ","-");return <Link key={slug} href={base+"/"+slug} aria-current={(active||items[0].toLowerCase().replaceAll(" & ","-").replaceAll(" ","-"))===slug?"page":undefined}>{name}</Link>;})}</nav>;}
function Search({locale,query,kind}:{locale:AdminLocale;query:string;kind?:string}){
 const href=kind?"/"+locale+"/admin/exports?"+new URLSearchParams({kind,q:query}).toString():"";
 return <form className="pa-filter-bar" method="get"><label htmlFor="pa-list-search" className="pa-sr-only">Search</label><input id="pa-list-search" type="search" maxLength={80} name="q" defaultValue={query} placeholder={label(locale,"Search name, ID or email","নাম, আইডি বা ইমেইল খুঁজুন")}/><button className="pa-button pa-button-secondary" type="submit">{label(locale,"Search","খুঁজুন")}</button>{href?<a href={href} className="pa-button pa-button-secondary">{label(locale,"Export CSV (up to 5,000)","CSV এক্সপোর্ট (সর্বোচ্চ ৫,০০০)")}</a>:null}</form>;
}
function Records({locale,page,base,query}:{locale:AdminLocale;page:RecordPage;base:string;query:string}){return <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr>{page.columns.map(c=><th key={c} scope="col">{c}</th>)}</tr></thead><tbody>
 {page.rows.map(row=><tr key={row.id}>{row.cells.map((cell,i)=><td key={i} className={i===0?"pa-primary-cell":""}>{i===0&&row.href?<Link href={row.href}>{cell}</Link>:cell}{i===0&&UUID.test(row.id)&&<AdminCopy value={row.id} label="Copy full ID"/>}</td>)}</tr>)}
 {!page.rows.length&&<tr><td className="pa-empty-row" colSpan={page.columns.length}>{label(locale,"No matching records","কোনো তথ্য পাওয়া যায়নি")}</td></tr>}
 </tbody></table></div><div className="pa-table-footer"><span>{page.rows.length} {label(locale,"records","রেকর্ড")}</span>{page.next&&<Link className="pa-button pa-button-secondary" href={base+"?"+new URLSearchParams({q:query,after:page.next}).toString()}>{label(locale,"Next page","পরের পৃষ্ঠা")} →</Link>}</div></section>;}
function Fields({values}:{values:Array<[string,string,string?]>}){return <div className="pa-surface pa-description"><dl>{values.map(([key,value,copy])=><div className="pa-description-row" key={key}><dt>{key}</dt><dd>{value}{copy&&<AdminCopy value={copy} label="Copy ID"/>}</dd></div>)}</dl></div>;}
async function workspaces(locale:AdminLocale,query:string,after:string):Promise<RecordPage>{
 const term="%"+query+"%",cursor=UUID.test(after)?after:null;
 const r=await database()`SELECT w.id,w.name,w.created_at,
 (SELECT u.email FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w.id AND m.role='owner' LIMIT 1) AS owner,
 EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='payments' AND p.enabled=true) AS pay,
 EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='ai' AND p.enabled=true) AS ai
 FROM workspaces w WHERE (${query}='' OR w.name ILIKE ${term} OR w.id::text ILIKE ${term}
 OR EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w.id AND m.role='owner' AND u.email ILIKE ${term}))
 AND (${cursor}::uuid IS NULL OR w.id<${cursor}::uuid) ORDER BY w.id DESC LIMIT 26`;
 const p=r.slice(0,25);return {columns:["Workspace","Owner","Payment gateway","AI Bot","Created"],
 rows:p.map(v=>({id:String(v.id),href:"/"+locale+"/admin/workspaces/"+v.id,cells:[String(v.name)+" · "+short(String(v.id)),v.owner?String(v.owner):"—",v.pay?"Enabled":"Disabled",v.ai?"Enabled":"Disabled",formatDate(v.created_at,locale)]})),next:r.length>25?String(p[p.length-1].id):undefined};
}
async function users(locale:AdminLocale,query:string,after:string,staffOnly=false):Promise<RecordPage>{
 const term="%"+query+"%",cursor=UUID.test(after)?after:null;
 const r=await database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,u.created_at,p.role,
 EXISTS(SELECT 1 FROM platform_admin_mfa m WHERE m.user_id=u.id AND m.confirmed_at IS NOT NULL) AS has_mfa
 FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id
 WHERE (${query}='' OR u.display_name ILIKE ${term} OR u.email ILIKE ${term} OR u.id::text ILIKE ${term})
 AND (${cursor}::uuid IS NULL OR u.id<${cursor}::uuid)
 AND (${staffOnly}=false OR p.user_id IS NOT NULL) ORDER BY u.id DESC LIMIT 26`;
 const p=r.slice(0,25);
 return {columns:["User","Email","Verified","MFA","Admin role","Created"],rows:p.map(v=>({id:String(v.id),href:"/"+locale+"/admin/users/"+v.id,cells:[String(v.display_name),String(v.email),v.email_verified_at?"Verified":"Unverified",v.has_mfa?"On":"Off",v.role?titleCase(String(v.role)):"—",formatDate(v.created_at,locale)]})),next:r.length>25?String(p[p.length-1].id):undefined};
}
async function audit(locale:AdminLocale,query:string,after:string):Promise<RecordPage>{
 const term="%"+query+"%",offset=/^\d{1,5}$/.test(after)?Math.min(Number(after),10000):0;
 const r=await database()`SELECT a.actor_id,a.action,a.subject_id,a.description,a.occurred_at,u.display_name FROM platform_admin_audit a
 LEFT JOIN app_users u ON u.id=a.actor_id WHERE (${query}='' OR a.action ILIKE ${term} OR u.email ILIKE ${term})
 ORDER BY a.occurred_at DESC,a.id DESC LIMIT 26 OFFSET ${offset}`;
 return {columns:["Time","Actor","Action","Target","Reason / details"],rows:r.slice(0,25).map((v,i)=>({id:"audit-"+i,cells:[formatDate(v.occurred_at,locale),v.display_name?String(v.display_name):"—",titleCase(String(v.action)),v.subject_id?short(String(v.subject_id)):"—",String(v.description||"—")]})),next:r.length>25?String(offset+25):undefined};
}
async function Details({locale,kind,id}:{locale:AdminLocale;kind:"users"|"workspaces";id:string}){
 if(!UUID.test(id))notFound();
 if(kind==="users"){
 const r=await database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,u.created_at,p.role FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id WHERE u.id=${id}::uuid LIMIT 1`;
 if(!r.length)notFound();const u=r[0];return <><PageHead title={String(u.display_name)} action={<Link className="pa-button pa-button-secondary" href={"/"+locale+"/admin/users"}>← Users</Link>}/><Fields values={[["User ID",short(String(u.id)),String(u.id)],["Email",String(u.email)],["Email verified",u.email_verified_at?"Yes":"No"],["Admin role",u.role?titleCase(String(u.role)):"—"],["Created",formatDate(u.created_at,locale)]]}/><Offline locale={locale} description="Sessions, security actions and user activity are not connected."/></>;
 }
 const r=await database()`SELECT w.id,w.name,w.created_at,
 (SELECT u.email FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w.id AND m.role='owner' LIMIT 1) AS owner,
 EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='payments' AND p.enabled=true) AS pay,
 EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='ai' AND p.enabled=true) AS ai
 FROM workspaces w WHERE w.id=${id}::uuid LIMIT 1`;
 if(!r.length)notFound();const w=r[0];return <><PageHead title={String(w.name)} action={<Link className="pa-button pa-button-secondary" href={"/"+locale+"/admin/workspaces"}>← Workspaces</Link>}/><PageTabs locale={locale} base={"/"+locale+"/admin/workspaces/"+id} items={["Overview","Products & plan","Members","Payments","Devices","API keys","Usage & credits","Billing","Activity"]}/><Fields values={[["Workspace ID",short(String(w.id)),String(w.id)],["Owner",w.owner?String(w.owner):"—"],["Payment gateway",w.pay?"Enabled":"Disabled"],["AI Bot",w.ai?"Enabled":"Disabled"],["Created",formatDate(w.created_at,locale)]]}/><Offline locale={locale} description="Plan changes, suspensions, credits and product actions are not connected."/></>;
}

const offlineColumns:Record<string,string[]>={
 payments:["Reference","Workspace","Method","Amount","Status","Created","Verified at"],
 "payments/exceptions":["Receipt","Workspace","Reason","Amount","Received","Status"],
 "payments/disputes":["Case","Workspace","Payment","Opened","SLA","Status"],
 "payments/refunds":["Reference","Workspace","Method","Amount","Requested","Status"],
 "payments/reconciliation":["Date","Method","Expected","Matched","Unmatched","Status"],
 billing:["Workspace","Product","Plan","Status","Renews","MRR"],
 "billing/invoices":["Invoice","Workspace","Amount","Status","Due date"],
 "billing/revenue":["Product","Plan","MRR","ARR","Period"],
 "billing/coupons":["Code","Product","Discount","Redemptions","Status"],
 credits:["Workspace","Product","Balance","Included","Used","Expires","Status"],
 "credits/ledger":["Date","Workspace","Product","Change","Balance after","Actor"],
 "credits/packs":["Pack","Product","Credits","Price","Validity","Status"],
 "credits/rules":["Rule","Product","Credits","Effective date","Version"],
 plans:["Name","Price","Interval","Subscribers","Status","Visibility","Updated"],
 "gateway/providers":["Provider","Type","Status","Last check","Workspaces"],
 "gateway/devices":["Device","Workspace","Status","Version","Last sync","Queued"],
 "gateway/webhooks":["Event","Workspace","Endpoint","Status","Attempts","Last attempt","Response"],
 "gateway/webhooks/endpoints":["Workspace","Endpoint","Status","Failure rate","Updated"],
 "gateway/webhooks/queues":["Queue","Pending","Running","Failed","Oldest","Dead-letter"],
 api:["Key prefix","Workspace","Environment","Scopes","Created","Last used","Status"],
 "api/limits":["Plan / Key","Requests/min","Burst","Override","Updated"],
 "api/versions":["Version","Status","Sunset","Updated"],
 health:["Component","Status","p50 latency","p95 latency","Error rate"],
 "settings/feature-flags":["Flag","Description","Scope","Status"],
 "settings/legal-contact":["Field","Value","Status"]
};
const offlineActions:Record<string,string>={
 payments:"Export CSV",billing:"Export CSV",credits:"Grant credits",plans:"New plan",
 "gateway/providers":"Run health check","gateway/devices":"Revoke device","gateway/webhooks":"Retry failed",
 api:"Rotate key",health:"Create incident"
};
function OfflineList({locale,kind,sub}:{locale:AdminLocale;kind:string;sub:string}){
 const source=kind+(sub&&offlineColumns[kind+"/"+sub]?"/"+sub:"");
 const columns=offlineColumns[source]||offlineColumns[kind]||["Name","Status","Updated"];
 return <><div className="pa-filter-bar"><input type="search" disabled placeholder={label(locale,"Search (not connected)","খোঁজ (সংযুক্ত নয়)")}/><button className="pa-button pa-button-secondary" disabled>Filters</button><button className="pa-button pa-button-secondary" disabled>Export CSV</button></div>
 <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr>{columns.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length} className="pa-empty-row"><span className="pa-muted-dot"/> {label(locale,"Not connected","সংযুক্ত নয়")}</td></tr></tbody></table></div><div className="pa-table-footer"><span>—</span><button disabled className="pa-button pa-button-secondary">Next →</button></div></section></>;
}

function Stat({title,value,unavailable=false}:{title:string;value:string|number;unavailable?:boolean}){return <div className="pa-stat"><span>{title}</span><strong>{value}</strong>{unavailable&&<small>Not connected</small>}</div>;}
async function Overview({locale,isSuper}:{locale:AdminLocale;isSuper:boolean}){
 const [counts,activities,revenue,plans,attention]=await Promise.all([
 database()`SELECT
  (SELECT count(*) FROM workspaces)::int AS workspaces,
  (SELECT count(*) FROM pg13_subscriptions WHERE paid_until>now())::int AS active_subscriptions,
  (SELECT count(*) FROM pg13_platform_invoices WHERE status='issued' AND created_at<now()-interval '7 days')::int AS overdue,
  (SELECT count(*) FROM pg13_support WHERE status IN ('submitted','reviewing'))::int AS open_cases,
  (SELECT coalesce(sum(amount_minor),0) FROM pg13_platform_invoices WHERE status='paid' AND paid_at>=now()-interval '30 days')::bigint AS collected_minor`,
 isSuper?database()`SELECT a.action,a.occurred_at,u.display_name FROM platform_admin_audit a LEFT JOIN app_users u ON u.id=a.actor_id ORDER BY a.occurred_at DESC LIMIT 5`:Promise.resolve([]),
 database()`SELECT to_char(m.month_start,'Mon') AS label,coalesce(sum(i.amount_minor),0)::bigint AS revenue_minor FROM
  (SELECT date_trunc('month',now()) - n*interval '1 month' AS month_start FROM generate_series(11,0,-1) n) m
  LEFT JOIN pg13_platform_invoices i ON i.status='paid' AND i.paid_at>=m.month_start AND i.paid_at<m.month_start+interval '1 month'
  GROUP BY m.month_start ORDER BY m.month_start`,
 database()`SELECT s.plan_id,count(*)::int AS workspaces FROM pg13_subscriptions s WHERE s.paid_until>now() GROUP BY s.plan_id ORDER BY workspaces DESC LIMIT 8`,
 database()`SELECT i.id,w.name,i.amount_minor,i.created_at,w.id AS workspace_id
  FROM pg13_platform_invoices i JOIN workspaces w ON w.id=i.workspace_id
  WHERE i.status='issued' AND i.created_at<now()-interval '7 days' ORDER BY i.created_at ASC LIMIT 6`
 ]);
 const stats=counts[0],r=revenue.map(v=>({label:String(v.label),value:Number(v.revenue_minor)/100})),maximum=Math.max(1,...r.map(v=>v.value));
 const x=(i:number)=>30+i*(550/Math.max(r.length-1,1)),y=(v:number)=>140-(v/maximum)*112;
 const points=r.map((v,i)=>x(i)+","+y(v.value)).join(" ");
 const money=(n:number)=>"৳"+n.toLocaleString("en-BD",{maximumFractionDigits:2});
 const root="/"+locale+"/admin";
 return <>
 <PageHead title={label(locale,"Overview","ওভারভিউ")} description={label(locale,"Sales and account health.","আয়, সাবস্ক্রিপশন ও সার্ভিসের অবস্থা।")}/>
 <section className="pa-surface pa-stats-strip">
 <Stat title={label(locale,"Revenue collected (30 days)","গত ৩০ দিনে আয়")} value={money(Number(stats.collected_minor)/100)}/>
 <Stat title={label(locale,"Active subscriptions","সক্রিয় সাবস্ক্রিপশন")} value={Number(stats.active_subscriptions)}/>
 <Stat title={label(locale,"Overdue invoices","বকেয়া ইনভয়েস")} value={Number(stats.overdue)}/>
 <Stat title={label(locale,"Open support cases","খোলা সাপোর্ট টিকিট")} value={Number(stats.open_cases)}/></section>
 <div className="pa-overview-grid">
  <div>
   <section className="pa-surface pa-chart-panel"><div className="pa-split-head"><h2>{label(locale,"Revenue","আয়")}</h2><span className="pa-subtle">{label(locale,"Last 12 months · paid platform invoices","গত ১২ মাস · পরিশোধিত ইনভয়েস")}</span></div>
    <svg viewBox="0 0 620 165" width="100%" role="img" aria-label="Collected subscription revenue by month">
     {[20,80,140].map(n=><line key={n} x1="20" x2="610" y1={n} y2={n} stroke="var(--bd)" strokeWidth="1"/>)}
     {points&&<polyline points={points} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>}
     {r.map((v,i)=><text key={i} x={x(i)} y="160" fontSize="10" fill="var(--mu)" textAnchor="middle">{v.label}</text>)}
    </svg>
   </section>
   <section className="pa-surface pa-chart-panel"><div className="pa-split-head"><h2>{label(locale,"Needs follow-up","যা দেখতে হবে")}</h2><Link href={root+"/billing/invoices"}>{label(locale,"View invoices","ইনভয়েস দেখুন")}</Link></div>
    {attention.length?attention.map(a=><div className="pa-attention-row" key={String(a.id)}><span><Link href={root+"/workspaces/"+a.workspace_id+"/billing"}>{String(a.name)}</Link> <small>{label(locale,"Overdue platform invoice","বকেয়া প্ল্যাটফর্ম ইনভয়েস")}</small></span><strong>{money(Number(a.amount_minor)/100)}</strong></div>):<p className="pa-subtle">{label(locale,"No overdue invoices.","কোনো বকেয়া ইনভয়েস নেই।")}</p>}
   </section>
  </div>
  <div>
   <section className="pa-surface pa-chart-panel"><div className="pa-split-head"><h2>{label(locale,"Workspaces by plan","প্ল্যান অনুযায়ী ওয়ার্কস্পেস")}</h2><Link href={root+"/subscriptions"}>{label(locale,"View subscriptions","সাবস্ক্রিপশন দেখুন")}</Link></div>
    {plans.map(p=><div key={String(p.plan_id)} className="pa-attention-row"><span>{String(p.plan_id)}</span><strong>{Number(p.workspaces)}</strong></div>)}
    {!plans.length&&<p className="pa-subtle">{label(locale,"No active paid plans yet.","কোনো সক্রিয় প্ল্যান নেই।")}</p>}
   </section>
   <section className="pa-surface pa-chart-panel"><div className="pa-split-head"><h2>{label(locale,"Latest admin actions","সাম্প্রতিক অ্যাডমিন কাজ")}</h2><Link href={root+"/audit"}>{label(locale,"View all","সব দেখুন")}</Link></div>
    {!isSuper?<p className="pa-subtle">{label(locale,"Access restricted.","অ্যাক্সেস সীমিত।")}</p>:activities.map((a,i)=><div className="pa-attention-row" key={i}><span>{titleCase(String(a.action))}<small> {String(a.display_name||"System")}</small></span><span>{formatDate(a.occurred_at,locale)}</span></div>)}
    {isSuper&&!activities.length&&<p className="pa-subtle">{label(locale,"No admin actions recorded.","অ্যাডমিন কাজের কোনো রেকর্ড নেই।")}</p>}
   </section>
  </div>
 </div>
 </>;
}
export async function PlatformAdminConsole({locale,segments=[],query="",after="",couponStatus="all"}:Props){
 if(!await currentUser())redirect("/"+locale+"/admin/sign-in");
 const user=await requireUser(locale);
 const role=await platformRole(user.id);
 if(!role)notFound();
 if(!await sessionMfaValid(user.id))redirect("/"+locale+"/admin/verify");
 const admin=await verifiedAdmin();
 if(!admin||admin.user.id!==user.id)notFound();
 const key=segments[0]==="gateway"?"gateway/"+(segments[1]||""):segments[0]||"";
 if(!Object.prototype.hasOwnProperty.call(names,key))notFound();
 if(!key&&admin.role==="support")redirect("/"+locale+"/admin/support");
 const extra=segments[0]==="gateway"?segments.slice(2):segments.slice(1);
 const sub=extra[0]||"",base="/"+locale+"/admin"+(key?"/"+key:"");
 const t=names[key][locale==="bn"?1:0],isSuper=admin.role==="super_admin",canRead=canReadAdmin(admin.role,key),q=query.trim().slice(0,80);
 const cookie=await cookies();const rawTheme=cookie.get("ekmivo-admin-theme")?.value;const theme=rawTheme==="light"||rawTheme==="dark"?rawTheme:"system";
 let body:ReactNode;
 if(!canRead&&key!=="settings"){body=<><PageHead title={t}/><Denied locale={locale}/></>;}
 else if(!key){body=<Overview locale={locale} isSuper={isSuper}/>;}
 else if((key==="workspaces"||key==="users")&&extra[0]){
 body=!canRead?<><PageHead title={t}/><Denied locale={locale}/></>:key==="workspaces"?<AdminWorkspaceDetail locale={locale} id={extra[0]} sub={extra[1]||""} actor={admin.user.id}/>:!extra[1]?<AdminUserDetail locale={locale} id={extra[0]}/>:notFound();
 }else if(key==="workspaces"||key==="users"||key==="audit"){
 const page=canRead?(key==="workspaces"?await workspaces(locale,q,after):key==="users"?await users(locale,q,after):await audit(locale,q,after)):null;
 body=<><PageHead title={t} action={key==="workspaces"&&isSuper?<AdminModal title="New workspace" label="Add workspace"><AdminWorkspaceCreationForm locale={locale}/></AdminModal>:undefined}/>{page?<><Search locale={locale} query={q} kind={key}/><Records locale={locale} base={base} query={q} page={page}/></>:<Denied locale={locale}/>}</>;
 }else if(key==="subscriptions"){
 body=canRead?<AdminSubscriptionsPage locale={locale} query={q}/>:<><PageHead title={t}/><Denied locale={locale}/></>;
 }else if(key==="providers"){
 body=canRead?<AdminProvidersPage isSuper={isSuper} locale={locale}/>:<><PageHead title={t}/><Denied locale={locale}/></>;
 }else if(key==="credits"){
 body=canRead?<AdminCreditsPage isSuper={isSuper} locale={locale}/>:<><PageHead title={t}/><Denied locale={locale}/></>;
 }else if(key==="plans"){
 body=isSuper?<AdminPaymentPlansPage locale={locale} actor={admin.user.id}/>:<Denied locale={locale}/>;
 }else if(key==="billing"&&sub==="coupons"){
  body=<><PageHead title={t}/><PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>{isSuper?<AdminSubscriptionCouponsPage locale={locale} actor={admin.user.id} query={q} status={couponStatus} after={after}/>:<Denied locale={locale}/>}</>;
 }else if(key==="billing"&&sub==="offers"){
  body=<><PageHead title={t}/><PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>{isSuper?<AdminSubscriptionOffersPage locale={locale} actor={admin.user.id}/>:<Denied locale={locale}/>}</>;
 }else if(key==="settings"&&sub==="legal-contact"){
  body=<><PageHead title={t}/><PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>{isSuper?<AdminSubscriptionPoliciesPage locale={locale} actor={admin.user.id}/>:<Denied locale={locale}/>}</>;
 }else if(key==="staff"){
 const page=isSuper&&(!sub||sub==="staff")?await users(locale,q,after,true):null;
 let list:Array<{id:string;name:string;email:string;verified:boolean;role:string|null}>=[];
 if(isSuper&&(!sub||sub==="staff"||sub==="roles")){const r=await database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,p.role FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 80`;list=r.map(v=>({id:String(v.id),name:String(v.display_name),email:String(v.email),verified:!!v.email_verified_at,role:v.role?String(v.role):null}));}
 const staffInventory=isSuper?await AdminGlobalInventory({locale,kind:"staff",sub,query:q}):null;
 body=<><PageHead title={t} action={isSuper&&(page||sub==="roles")?<AdminModal title="Staff roles" label="Manage roles"><RoleControls locale={locale} users={list}/></AdminModal>:undefined}/><PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>{!isSuper?<Denied locale={locale}/>:page?<><Search locale={locale} query={q} kind="staff"/><Records locale={locale} base={base} query={q} page={page}/></>:staffInventory||<Offline locale={locale}/>}</>;
 }else if(key==="settings"){
 const settings=isSuper?await platformSettings():null;
 const receiving=isSuper?await database()`SELECT w.id,w.name FROM platform_billing_settings s JOIN workspaces w ON w.id=s.workspace_id WHERE s.singleton`:[];
 const receivingOptions=isSuper?await database()`SELECT w.id,w.name FROM workspaces w JOIN workspace_members mine ON mine.workspace_id=w.id AND mine.user_id=${admin.user.id}::uuid AND mine.role IN ('owner','admin') WHERE EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='payments' AND p.enabled) AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.role='owner') AND NOT EXISTS(SELECT 1 FROM workspace_members m LEFT JOIN platform_administrators p ON p.user_id=m.user_id JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w.id AND (p.role IS DISTINCT FROM 'super_admin' OR u.disabled_at IS NOT NULL)) ORDER BY w.name,w.id LIMIT 200`:[];
 let staff:Array<{id:string;name:string;email:string;verified:boolean;role:string|null}>=[];
 if(isSuper){const rows=await database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,p.role
 FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 150`;
 staff=rows.map(x=>({id:String(x.id),name:String(x.display_name),email:String(x.email),verified:!!x.email_verified_at,role:x.role?String(x.role):null}));}
 const roles=isSuper?await AdminGlobalInventory({locale,kind:"staff",sub:"roles",query:""}):null;
 const sessions=isSuper?await AdminGlobalInventory({locale,kind:"staff",sub:"sessions",query:""}):null;
 body=<><PageHead title={t}/>{isSuper?<>
 <AdminPlatformReceiving locale={locale} current={receiving[0]?{id:String(receiving[0].id),name:String(receiving[0].name)}:null} options={receivingOptions.map(w=>({id:String(w.id),name:String(w.name)}))}/>
 <section className="pa-surface pa-settings-grid"><div><h2>Email verification</h2><p>{settings?.emailVerification?"Required":"Off"}</p>
 <span className="pa-status-text"><span className={"pa-status-dot "+(mailReady()?"green":"grey")}/>Email service: {mailReady()?"Configured":"Configuration required"}</span>
 </div><AdminModal label="Manage verification" title="Email verification"><VerificationSettings locale={locale} enabled={!!settings?.emailVerification} providerReady={mailReady()}/></AdminModal></section>
 <div className="pa-page-head"><h2>Admin team</h2><AdminModal title="Admin roles" label="Manage roles"><RoleControls locale={locale} users={staff}/></AdminModal></div>
 {roles}
 <div className="pa-page-head"><h2>Admin sessions</h2></div>{sessions}
 </>:null}<AdminTrustedDevices locale={locale} userId={admin.user.id} isSuper={isSuper}/></>;
 }else if(key==="support"&&extra[0]){
 body=canRead?<AdminSupportDetail locale={locale} id={extra[0]}/>:<Denied locale={locale}/>;
 }else if(key==="health"){
 body=<><PageHead title={t}/>{canRead?<AdminHealthView locale={locale}/>:<Denied locale={locale}/>}</>;
 }else if(key==="api"){
 let config:Awaited<ReturnType<typeof publicSandboxConfig>>=null;
 if(isSuper&&sub==="sandbox"){try{config=await publicSandboxConfig();}catch{config=null;}}
 body=<><PageHead title={t}/><PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>{!isSuper?<Denied locale={locale}/>:sub==="sandbox"&&config?<section className="pa-surface pa-description"><h2>Public sandbox</h2><p className="pa-subtle">Test data only. Never use real customer data.</p><dl><div className="pa-description-row"><dt>Shared test key</dt><dd className="pa-mono">{config.testKey.slice(0,12)+"••••"+config.testKey.slice(-4)}</dd></div><div className="pa-description-row"><dt>Workspace</dt><dd>{short(config.workspaceId)}<AdminCopy value={config.workspaceId} label="Copy workspace ID"/></dd></div><div className="pa-description-row"><dt>Sandbox API URL</dt><dd>{config.apiOrigin||"—"}</dd></div><div className="pa-description-row"><dt>Status</dt><dd>{config.enabled?"Enabled":"Disabled"}</dd></div></dl><div className="pa-inline-actions"><button className="pa-button pa-button-secondary" disabled>Check service</button><button className="pa-button pa-button-secondary" disabled>Rotate key</button><button className="pa-button pa-button-secondary" disabled>Revoke key</button></div><p className="pa-subtle">Audited step-up operations not connected.</p></section>:<Offline locale={locale}/>}</>;
 }else{
 const op=offlineActions[key];
 const inventory=canRead?await AdminGlobalInventory({locale,kind:key,sub,query:q}):null;
 body=<><PageHead title={t} action={key==="billing"&&isSuper?<a className="pa-button" href={"/"+locale+"/admin/exports?"+new URLSearchParams({kind:"invoices",q}).toString()}>Export invoices CSV</a>:op&&!inventory?<button type="button" disabled className="pa-button pa-button-secondary">{op}</button>:undefined}/>
 {tabs[key]&&<PageTabs locale={locale} base={base} items={tabs[key]} active={sub}/>}
 {!canRead?<Denied locale={locale}/>:inventory||<OfflineList locale={locale} kind={key} sub={sub}/>}</>;
 }
 return <AdminShell locale={locale} role={admin.role} name={user.name} theme={theme} production={process.env.NODE_ENV==="production"}>{body}</AdminShell>;
}
