import {cookies} from "next/headers";
import {database} from "../lib/server/db";
import {goOrigin} from "../lib/server/go-origin";
import {planName,type PlanTerms} from "../lib/payment-plans";
type PaymentUsage={effective?:{terms?:PlanTerms;active?:boolean;extra_payments?:number;period_start?:string;period_end?:string};usage?:{used:number;reserved:number};resources?:Record<string,number>;usage_error?:boolean;resource_usage_error?:boolean};
export async function AdminWorkspaceUsage({locale,workspaceId,payments,ai}:{locale:"en"|"bn";workspaceId:string;payments:boolean;ai:boolean}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 const n=(v:number|undefined)=>v===undefined?"—":v.toLocaleString(bn?"bn-BD":"en-BD");
 const paymentRead=async():Promise<PaymentUsage|null>=>{if(!payments)return null;try{
  const origin=goOrigin(),token=(await cookies()).get("ekmivo-session")?.value;if(!origin||!token)return null;
  const r=await fetch(new URL(`/v1/platform/workspaces/${workspaceId}/payment-usage`,origin),{headers:{Cookie:`ekmivo-session=${token}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!r.ok)return null;return await r.json() as PaymentUsage;
 }catch{return null}};
 const [payment,credit]=await Promise.all([paymentRead(),ai?database()`SELECT balance,updated_at FROM platform_ai_credit_balances WHERE workspace_id=${workspaceId}::uuid LIMIT 1`.catch(()=>null):Promise.resolve(null)]);
 const terms=payment?.effective?.terms,resources=payment?.resources;
 const rows:Array<[string,number|undefined,number|null|undefined]>=[
  [t("Successful payments","সফল পেমেন্ট"),payment?.usage?.used,terms?terms.payment_limit===null?null:terms.payment_limit+(payment?.effective?.extra_payments??0):undefined],
  [t("Receiving accounts","রিসিভিং অ্যাকাউন্ট"),resources?.payment_methods,terms?.limits.payment_methods],
  [t("SMS devices","এসএমএস ডিভাইস"),resources?.devices,terms?.limits.devices],
  [t("API keys","এপিআই কী"),resources?.api_keys,terms?.limits.api_keys],
  [t("Team members","সদস্য"),resources?.team_members,terms?.limits.team_members],
  [t("Unpaid checkouts at once","একসঙ্গে অসম্পূর্ণ পেমেন্ট"),resources?.active_checkouts,terms?.active_checkout_limit],
 ];
 const date=(v:string)=>new Date(v).toLocaleDateString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"});
 return <>
 {payments&&<section className="pa-surface pa-table-card"><div className="pa-description"><h2>{t("Payment gateway usage","পেমেন্ট গেটওয়ের ব্যবহার")}</h2>
 {terms&&<p>{planName(terms,bn)} · {payment?.effective?.active?t("Active","সক্রিয়"):t("Inactive","নিষ্ক্রিয়")}{payment?.effective?.period_start&&payment.effective.period_end?` · ${date(payment.effective.period_start)} – ${date(payment.effective.period_end)}`:""}</p>}
 {!payment&&<p role="status">{t("Payment usage is unavailable. Retry using Refresh.","পেমেন্ট ব্যবহারের তথ্য পাওয়া যায়নি। রিফ্রেশ করে আবার দেখুন।")}</p>}
 {payment&&!terms&&<p role="status">{t("No current payment plan is available.","বর্তমান পেমেন্ট প্ল্যান পাওয়া যায়নি।")}</p>}
 {(payment?.usage_error||payment?.resource_usage_error)&&<p role="status">{t("Some usage is unavailable; unknown values are shown as —.","কিছু ব্যবহারের তথ্য পাওয়া যায়নি; অজানা সংখ্যা — দিয়ে দেখানো হয়েছে।")}</p>}
 </div><div className="pa-table-wrap"><table className="pa-usage-table"><thead><tr>{[t("Resource","সুবিধা"),t("Used","ব্যবহৃত"),t("Plan limit","প্ল্যানের সীমা"),t("Remaining","অবশিষ্ট")].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(([label,used,limit])=>{
 const held=label===rows[0][0]?payment?.usage?.reserved??0:0;
 return <tr key={label}><td>{label}</td><td>{n(used)}{held>0?` (+${n(held)} ${t("reserved","অপেক্ষমাণ")})`:""}</td><td>{limit===null?t("Unlimited","সীমাহীন"):n(limit)}</td><td>{limit===null?t("Unlimited","সীমাহীন"):limit===undefined||used===undefined?"—":n(Math.max(0,limit-used-held))}</td></tr>;
 })}</tbody></table></div>{terms&&<p className="pa-description pa-subtle">{t("New payments allowed per minute","প্রতি মিনিটে নতুন পেমেন্টের সীমা")}: {n(terms.create_per_minute)}</p>}</section>}
 {ai&&<section className="pa-surface pa-description"><h2>{t("AI credits","এআই ক্রেডিট")}</h2><dl><div className="pa-description-row"><dt>{t("Available credits","অবশিষ্ট ক্রেডিট")}</dt><dd>{credit?n(Number(credit[0]?.balance??0)):"—"}</dd></div><div className="pa-description-row"><dt>{t("Last adjusted","সর্বশেষ পরিবর্তন")}</dt><dd>{credit?.[0]?.updated_at?date(String(credit[0].updated_at)):"—"}</dd></div></dl><p className="pa-subtle">{t("Credit balance only; metered AI model usage is not available.","এটি ক্রেডিট ব্যালান্স; এআই মডেলের প্রকৃত ব্যবহারের হিসাব এখনো নেই।")}</p></section>}
 {!payments&&!ai&&<section className="pa-surface pa-description"><p>{t("No product is enabled for this workspace.","এই ওয়ার্কস্পেসে কোনো প্রোডাক্ট চালু নেই।")}</p></section>}
 </>;
}
