import "server-only";
import Link from "next/link";
import {database} from "../lib/server/db";
import {UnifiedActivityExport} from "./briofold-unified-activity-export";
import styles from "./briofold-order-report.module.css";

type Activity={source:string;action:string;actor_name:string;created_at:string;scope:string};
type Snapshot={items:Activity[];can_export:boolean;scope:"live"|"sandbox";cursor:number};
type Filters=Record<string,string|string[]|undefined>;
const categories=["orders","customers","comments","settings"];
const pick=(raw:string|string[]|undefined)=>typeof raw==="string"?raw:"";
function validSnapshot(value:unknown):value is Snapshot{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Partial<Snapshot>;
 return Array.isArray(v.items)&&v.items.length<=51&&
  v.items.every(item=>item&&categories.includes(item.source)&&
   typeof item.action==="string"&&item.action.length<=200&&
   typeof item.actor_name==="string"&&item.actor_name.length<=200&&
   typeof item.created_at==="string"&&Number.isFinite(new Date(item.created_at).valueOf())&&
   ["store","realm"].includes(item.scope))&&
  typeof v.can_export==="boolean"&&(v.scope==="live"||v.scope==="sandbox")&&
  typeof v.cursor==="number"&&Number.isSafeInteger(v.cursor)&&v.cursor>=0;
}
export async function BriofoldUnifiedActivity({workspaceId,actorId,locale,environment,filters={},embedded=false}:{
 workspaceId:string;actorId:string;locale:"bn"|"en";environment:"live"|"sandbox";filters?:Filters;embedded?:boolean;
}){
 const Heading=embedded?"h2":"h1";
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const category=pick(filters.category),query=pick(filters.q),cursorRaw=pick(filters.cursor);
 const cursor=cursorRaw===""?0:Number(cursorRaw);
 const invalid=(category!==""&&!categories.includes(category))||query.length>100||
  (cursorRaw!==""&&!/^\d{1,4}$/.test(cursorRaw))||!Number.isInteger(cursor)||cursor<0||cursor>1000;
 let snapshot:Snapshot|null=null;
 if(!invalid)try{
  const [row]=await database()`SELECT briofold_unified_activity(${workspaceId}::uuid,${environment},${actorId}::uuid,
    ${category},${query},${cursor}) AS result`;
  if(validSnapshot(row?.result))snapshot=row.result;
 }catch(error){console.error("BRIOFOLD_ACTIVITY_SOURCE_UNAVAILABLE",error instanceof Error?error.name:"unknown");}
 const events=snapshot?.items.slice(0,50)??[],more=(snapshot?.items.length??0)>50;
 const href=(next:number)=>{
  const params=new URLSearchParams();if(category)params.set("category",category);if(query)params.set("q",query);
  if(next)params.set("cursor",String(next));return "/settings/activity"+(params.size?"?"+params.toString():"");
 };
 const sourceLabel=(source:string)=>({orders:t("Orders","অর্ডার"),customers:t("Customers","গ্রাহক"),comments:t("Comments","কমেন্ট"),settings:t("Settings","সেটিংস")} as Record<string,string>)[source]??source;
 return <section className={styles.root} aria-label={t("Store operational activity","স্টোরের পরিচালনাগত ইতিহাস")}>
  <header className={styles.heading}><div><Heading>{t("Activity log","কার্যক্রমের ইতিহাস")}</Heading>
   <p>{t("Read-only activity from orders, customers, comments and Store settings. Sensitive details are omitted.","অর্ডার, গ্রাহক, কমেন্ট ও স্টোর সেটিংসের শুধু-পড়ার ইতিহাস। সংবেদনশীল তথ্য রাখা হয়নি।")}</p></div>
   <span className={styles.realm}>{environment==="live"?"Live":"Sandbox"}</span>
  </header>
  <form action="/settings/activity" method="GET" className={styles.filters}>
   <label>{t("Source","উৎস")}<select name="category" defaultValue={category}><option value="">{t("All","সব")}</option>
    {categories.map(c=><option key={c} value={c}>{sourceLabel(c)}</option>)}
   </select></label>
   <label>{t("Action search","কাজ খুঁজুন")}<input type="search" name="q" maxLength={100} defaultValue={query} placeholder={t("e.g. order-state","যেমন order-state")}/></label>
   <button type="submit">{t("Apply","দেখুন")}</button>
  </form>
  {!snapshot&&<p role="alert" className={styles.alert}>{invalid?t("Invalid activity filter.","কার্যক্রমের ফিল্টার সঠিক নয়।"):
   t("The activity source is unavailable; no empty history has been assumed.","কার্যক্রমের উৎস পাওয়া যাচ্ছে না; অনুমান করে খালি ইতিহাস দেখানো হয়নি।")}</p>}
  {snapshot&&<>
   <div className={styles.listTitle}><h2>{t("Recent events","সাম্প্রতিক কাজ")}</h2>
    {snapshot.can_export&&<UnifiedActivityExport bn={bn} rows={events} environment={environment}/>}
   </div>
   <div className={styles.tableScroll}><table><thead><tr>
    <th>{t("Time","সময়")}</th><th>{t("Source","উৎস")}</th>
    <th>{t("Action","কাজ")}</th><th>{t("Actor","কে করেছেন")}</th><th>{t("Scope","পরিসর")}</th>
   </tr></thead><tbody>
    {events.map((event,i)=><tr key={`${event.created_at}:${event.source}:${event.action}:${i}`}>
     <td><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}</time></td>
     <td>{sourceLabel(event.source)}</td><td>{event.action}</td><td>{event.actor_name}</td>
     <td>{event.scope==="store"?t("Whole Store","সম্পূর্ণ স্টোর"):environment}</td>
    </tr>)}
    {!events.length&&<tr><td colSpan={5}>{t("No events match this filter.","এই ফিল্টারে কোনো কার্যক্রম নেই।")}</td></tr>}
   </tbody></table></div>
   <div className={styles.listTitle}>
    {cursor>0?<Link href={href(Math.max(0,cursor-50))}>{t("Newer","নতুন")}</Link>:<span/>}
    {more&&cursor<1000?<Link href={href(cursor+50)}>{t("Older","পুরোনো")}</Link>:null}
   </div>
   <p className={styles.note}>{t("The source records are immutable where supported. This is not a financial audit ledger: payment events remain in the authoritative payment operations log below.","সমর্থিত জায়গায় মূল ঘটনার রেকর্ড অপরিবর্তনীয়। এটি আর্থিক লেজার নয়; পেমেন্টের সঠিক ইতিহাস নিচের মূল পেমেন্ট লগেই থাকবে।")}</p>
  </>}
 </section>;
}
