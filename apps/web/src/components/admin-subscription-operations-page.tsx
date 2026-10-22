import Link from "next/link";
import {database} from "../lib/server/db";
import type {AdminLocale} from "./platform-admin-shell";

type NumberRow={awaiting:number;paid:number;expired:number;cancelled:number;recovery:number;open_cases:number;stale_selections:number;oldest_minutes:number|null};
type CaseRow={id:string;intent_id:string;invoice_id:string;workspace_id:string;reason:string;status:string;created_at:string};
const title=(locale:AdminLocale,en:string,bn:string)=>locale==="bn"?bn:en;
const date=(value:string,locale:AdminLocale)=>new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{
 dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka",
}).format(new Date(value));

// Read-only control-plane monitoring. Do not infer a successful payment from
// this view: the financial realm and payment provider remain authoritative.
// This component is mounted exclusively behind verifiedAdmin + Super Admin MFA.
export async function AdminSubscriptionOperationsPage({locale,actor}:{locale:AdminLocale;actor:string}){
 let stats:NumberRow|null=null,cases:CaseRow[]=[];
 try{
  const available=await database()`SELECT to_regprocedure('public.platform_subscription_admin_operations(uuid)') IS NOT NULL AS ready`;
  if(available[0]?.ready){
   const rows=await database()`SELECT platform_subscription_admin_operations(${actor}::uuid) AS data`;
   const data=rows[0]?.data as {stats:NumberRow;cases:CaseRow[]}|undefined;
   if(data){stats=data.stats;cases=data.cases;}
  }
 }catch(error){
  // Missing schema/role grants or a disconnected backend is not "zero cases".
  console.error("[subscription operations] source unavailable",error instanceof Error?error.name:"unknown");
 }
 if(!stats)return <section className="pa-surface pa-not-connected" role="status"><h2>{title(locale,"Subscription recovery unavailable","সাবস্ক্রিপশন রিকভারি পাওয়া যাচ্ছে না")}</h2>
  <p>{title(locale,"The control-plane payment ledger is unavailable or release migration 0154 has not been applied. No numbers are inferred.","কন্ট্রোল-প্লেন পেমেন্ট লেজার পাওয়া যাচ্ছে না অথবা ০১৫৪ মাইগ্রেশন হয়নি। কোনো সংখ্যা অনুমান করা হয়নি।")}</p></section>;
 const metric=(label:string,value:number|string)=><div className="pa-surface" key={label}><p className="pa-subtle">{label}</p><strong className="pa-metric-value">{value}</strong></div>;
 return <>
  <section className="pa-stats-grid" aria-label={title(locale,"Subscription payment operations","সাবস্ক্রিপশন পেমেন্ট অপারেশন")}>
   {metric(title(locale,"Awaiting payment","পেমেন্টের অপেক্ষায়"),stats.awaiting)}
   {metric(title(locale,"Verified paid","যাচাইকৃত পরিশোধিত"),stats.paid)}
   {metric(title(locale,"Expired","মেয়াদোত্তীর্ণ"),stats.expired)}
   {metric(title(locale,"Cancelled","বাতিল"),stats.cancelled)}
   {metric(title(locale,"Recovery required","রিকভারি প্রয়োজন"),stats.recovery)}
   {metric(title(locale,"Unresolved cases","অসম্পন্ন কেস"),stats.open_cases)}
   {metric(title(locale,"Stale selections (24h+)","পুরোনো নির্বাচন (২৪ ঘণ্টা+)"),stats.stale_selections)}
  </section>
  <section className="pa-surface pa-table-card"><div className="pa-split-head"><div><h2>{title(locale,"Payment recovery queue","পেমেন্ট রিকভারি সারি")}</h2>
   <p className="pa-subtle">{title(locale,"Oldest waiting invoice (minutes)","সবচেয়ে পুরোনো অপেক্ষমাণ ইনভয়েস (মিনিট)")}: {stats.oldest_minutes??"—"}. {title(locale,"Financial/provider reconciliation is independent; never mark paid from this screen.","আর্থিক যাচাই পৃথক; এখান থেকে paid চিহ্নিত করবেন না।")}</p></div>
   <div className="pa-inline-actions"><a className="pa-button pa-button-secondary" href={`/${locale}/admin/exports?kind=subscription-recovery`}>{title(locale,"Export cases CSV","কেস CSV রপ্তানি")}</a>
    <a className="pa-button pa-button-secondary" href={`/${locale}/admin/exports?kind=subscription-coupon-audit`}>{title(locale,"Coupon audit CSV","কুপন অডিট CSV")}</a></div></div>
   <div className="pa-table-wrap"><table><thead><tr>
    <th scope="col">{title(locale,"Created","তৈরির সময়")}</th><th scope="col">{title(locale,"Invoice","ইনভয়েস")}</th>
    <th scope="col">{title(locale,"Store","স্টোর")}</th><th scope="col">{title(locale,"Reason","কারণ")}</th><th scope="col">{title(locale,"Status","অবস্থা")}</th>
   </tr></thead><tbody>{cases.map(x=><tr key={x.id}><td>{date(x.created_at,locale)}</td><td className="pa-mono">{x.invoice_id}</td>
    <td><Link href={`/${locale}/admin/workspaces/${x.workspace_id}/billing`}>{x.workspace_id}</Link></td><td>{x.reason}</td><td>{x.status}</td></tr>)}</tbody></table>
   {!cases.length&&<p className="pa-subtle">{title(locale,"No unresolved recovery cases.","কোনো অসম্পন্ন রিকভারি কেস নেই।")}</p>}</div>
  </section>
  <p className="pa-subtle">{title(locale,"Read-only · first 50 unresolved cases · no automated refunds. Use verified support and financial audit processes for resolution.","শুধু দেখা যাবে · প্রথম ৫০টি অসম্পন্ন কেস · স্বয়ংক্রিয় রিফান্ড নেই। সমাধানের জন্য যাচাইকৃত সাপোর্ট ও ফিন্যান্সিয়াল অডিট প্রক্রিয়া ব্যবহার করুন।")}</p>
 </>;
}
