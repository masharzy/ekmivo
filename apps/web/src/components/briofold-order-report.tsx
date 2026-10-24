import "server-only";
import {database} from "../lib/server/db";
import {OrderReportExport} from "./briofold-order-report-export";
import styles from "./briofold-order-report.module.css";

type Row={day:string;status:string;source:string;assignee_id:string|null;assignee_name:string|null;orders:number};
type Assignee={id:string;name:string};
type Report={total:number;by_state:Record<string,number>;by_source:Record<string,number>;rows:Row[];truncated:boolean;can_export:boolean;assignees:Assignee[];from:string;to:string;realm:string};
type Filters=Record<string,string|string[]|undefined>;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const states=["draft","hold","confirmed","packed","shipped","delivered","cancelled","returned"];
const sources=["manual","api","ai"];
const pick=(value:string|string[]|undefined)=>typeof value==="string"?value:"";
const validCount=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
const validGroup=(value:unknown)=>!!value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.values(value).every(validCount);
function validReport(value:unknown):value is Report{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const r=value as Partial<Report>;
 return validCount(r.total)&&validGroup(r.by_state)&&validGroup(r.by_source)&&
  typeof r.can_export==="boolean"&&typeof r.truncated==="boolean"&&
  typeof r.from==="string"&&date.test(r.from)&&typeof r.to==="string"&&date.test(r.to)&&
  (r.realm==="live"||r.realm==="sandbox")&&Array.isArray(r.rows)&&
  r.rows.every(row=>row&&typeof row.day==="string"&&date.test(row.day)&&
   states.includes(row.status)&&sources.includes(row.source)&&validCount(row.orders)&&
   (row.assignee_id===null||typeof row.assignee_id==="string"&&uuid.test(row.assignee_id))&&
   (row.assignee_name===null||typeof row.assignee_name==="string"))&&
  Array.isArray(r.assignees)&&r.assignees.every(a=>a&&uuid.test(a.id)&&typeof a.name==="string");
}

export async function BriofoldOrderReport({workspaceId,actorId,locale,environment,filters={}}:{
 workspaceId:string;actorId:string;locale:"bn"|"en";environment:"live"|"sandbox";filters?:Filters;
}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const start=pick(filters.from),end=pick(filters.to),state=pick(filters.status),source=pick(filters.source),agent=pick(filters.assignee);
 const invalid=(start&&!date.test(start))||(end&&!date.test(end))||(state&&!states.includes(state))||
  (source&&!sources.includes(source))||(agent&&!uuid.test(agent));
 let report:Report|null=null;
 if(!invalid){try{
  const [row]=await database()`SELECT commerce_order_report(${workspaceId}::uuid,${environment},${actorId}::uuid,
   ${start||null}::date,${end||null}::date,${state},${source},${agent||null}::uuid) AS result`;
  if(validReport(row?.result))report=row.result;
 }catch(error){console.error("BRIOFOLD_ORDER_REPORT_UNAVAILABLE",error instanceof Error?error.name:"unknown");}}
 const count=(value:number|undefined)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(value??0);
 return <section className={styles.root} aria-label={t("Order operations report","অর্ডার পরিচালনার রিপোর্ট")}>
  <header className={styles.heading}><div><h1>{t("Order reports","অর্ডার রিপোর্ট")}</h1>
   <p>{t("Business-scoped workflow counts by date, source, status and assigned team member.","নির্বাচিত ব্যবসার তারিখ, উৎস, অবস্থা ও দায়িত্বপ্রাপ্ত সদস্য অনুযায়ী অর্ডারের হিসাব।")}</p></div>
   <span className={styles.realm}>{environment==="live"?"Live":"Sandbox"}</span></header>
  <form className={styles.filters} method="GET" action="/reports/orders">
   <label>{t("From","শুরু")}<input type="date" name="from" defaultValue={start||report?.from||""}/></label>
   <label>{t("To","শেষ")}<input type="date" name="to" defaultValue={end||report?.to||""}/></label>
   <label>{t("Status","অবস্থা")}<select name="status" defaultValue={state}><option value="">{t("All","সব")}</option>{states.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
   <label>{t("Source","উৎস")}<select name="source" defaultValue={source}><option value="">{t("All","সব")}</option>{sources.map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
   {report?.can_export&&<label>{t("Assigned to","দায়িত্বপ্রাপ্ত")}<select name="assignee" defaultValue={agent}><option value="">{t("All","সব")}</option>{report.assignees.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
   <button type="submit">{t("Apply filters","ফিল্টার করুন")}</button>
  </form>
  {!report&&<p className={styles.alert} role="alert">{invalid?t("Invalid report filter. Check the dates and choices.","রিপোর্টের ফিল্টার ঠিক নেই। তারিখ ও অপশন দেখুন।"):
   t("The operational report source is unavailable. No totals have been assumed.","অর্ডার রিপোর্টের তথ্য পাওয়া যাচ্ছে না; অনুমান করে মোট দেখানো হয়নি।")}</p>}
  {report&&<>
   <div className={styles.summary}>
    <div><span>{t("Orders","অর্ডার")}</span><strong>{count(report.total)}</strong></div>
    <div><span>{t("Delivered","ডেলিভারি হয়েছে")}</span><strong>{count(report.by_state.delivered)}</strong></div>
    <div><span>{t("Cancelled","বাতিল")}</span><strong>{count(report.by_state.cancelled)}</strong></div>
    <div><span>{t("AI / API source","AI / API উৎস")}</span><strong>{count((report.by_source.ai??0)+(report.by_source.api??0))}</strong></div>
   </div>
   <div className={styles.listTitle}><h2>{t("Daily breakdown","দৈনিক বিস্তারিত")}</h2>
    {report.can_export&&<OrderReportExport bn={bn} rows={report.rows} from={report.from} to={report.to} truncated={report.truncated}/>}
   </div>
   {report.truncated&&<p role="alert" className={styles.alert}>{t("The table has been capped. Narrow your date range before export.","তালিকার সীমা পূর্ণ হয়েছে। ডাউনলোডের আগে তারিখের সীমা কমান।")}</p>}
   <div className={styles.tableScroll}><table><thead><tr><th>{t("Date","তারিখ")}</th><th>{t("State","অবস্থা")}</th><th>{t("Source","উৎস")}</th>
    {report.can_export&&<th>{t("Team member","টিম সদস্য")}</th>}<th>{t("Count","সংখ্যা")}</th></tr></thead><tbody>
    {report.rows.map((r,i)=><tr key={`${r.day}:${r.status}:${r.source}:${r.assignee_id??"none"}:${i}`}>
     <td>{r.day}</td><td>{r.status}</td><td>{r.source.toUpperCase()}</td>
     {report.can_export&&<td>{r.assignee_name??t("Unassigned","দায়িত্ব দেওয়া হয়নি")}</td>}<td>{count(r.orders)}</td>
    </tr>)}
    {report.rows.length===0&&<tr><td colSpan={report.can_export?5:4}>{t("No orders match these filters.","এই ফিল্টারে কোনো অর্ডার নেই।")}</td></tr>}
   </tbody></table></div>
   <p className={styles.note}>{t("Operational orders are not settled revenue. Verified payments, COD and refunds must be taken from the authoritative payment report.","অর্ডারের সংখ্যা মানে আয় নিশ্চিত নয়। যাচাইকৃত পেমেন্ট, COD ও রিফান্ডের সঠিক হিসাব পেমেন্ট রিপোর্ট থেকে নিন।")}</p>
  </>}
 </section>;
}
