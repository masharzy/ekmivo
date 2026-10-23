import "server-only";
import Link from "next/link";
import {BriofoldResponseReport} from "./briofold-response-report";
import {database} from "../lib/server/db";
import styles from "./briofold-growth-reports.module.css";

type Locale="bn"|"en";
type Metric={name:string;value:number};
type Snapshot={customers:Metric[]|null;commerce:Metric[]|null;inbox:Metric[]|null;operations:Record<string,Metric[]>|null;asOf:string};

function count(raw:unknown):number{
 if(raw===null||raw===undefined)throw Error("MISSING_AGGREGATE");
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value<0)throw Error("INVALID_AGGREGATE");
 return value;
}

// Use aggregate-only, workspace AND realm constrained data. No customer PII,
// contact claim, COD, invoice, or order amount is treated as verified revenue.
async function readSnapshot(workspaceId:string,actorId:string,environment:"live"|"sandbox",mode:string):Promise<Snapshot|null>{
 try{
  const db=database();
  const operational=process.env.BRIOFOLD_GROWTH_ANALYTICS_ENABLED==="true";
  const [row]=operational
   ?await db`SELECT briofold_growth_snapshot(${workspaceId}::uuid,${environment},${actorId}::uuid) AS snapshot,briofold_growth_operational_snapshot(${workspaceId}::uuid,${environment},${actorId}::uuid) AS operations`
   :await db`SELECT briofold_growth_snapshot(${workspaceId}::uuid,${environment},${actorId}::uuid) AS snapshot`;
  const raw=row?.snapshot as Record<string,unknown>|undefined;
  if(!raw||typeof raw!=="object")return null;
  const metrics=(kind:string,names:string[]):Metric[]=>{
   const values=raw[kind];
   if(!values||typeof values!=="object")throw Error("INVALID_REPORT_SOURCE");
   const source=values as Record<string,unknown>;
   return names.map(name=>({name,value:count(source[name])}));
  };
  const customers=metrics("customers",["total","qualified","won","assigned","opted_in","due","upcoming","done"]);
  const commerce=metrics("commerce",["total","draft","confirmed","delivered","cancelled","returned","ai","api","manual"]);
  const inbox=mode==="commerce"?null:metrics("inbox",["conversations","messages_7d"]);
  let operations:Record<string,Metric[]>|null=null;
  if(operational){
   const source=row?.operations as Record<string,unknown>|undefined;
   if(!source||typeof source!=="object")throw Error("INVALID_OPERATIONS_SOURCE");
   const aggregate=(kind:string,keys:string[]):Metric[]=>{
    const group=source[kind];
    if(!group||typeof group!=="object")throw Error("INVALID_OPERATIONS_GROUP");
    return keys.map(name=>({name,value:count((group as Record<string,unknown>)[name])}));
   };
   operations={
    campaigns:aggregate("campaigns",["broadcast_drafts","broadcast_planned","post_drafts","post_planned"]),
    bookings:aggregate("bookings",["booking_requested","booking_confirmed","booking_completed","booking_cancelled"]),
    team:aggregate("team",["assigned","unassigned","open","pending","resolved","overdue"])
     .map(({name,value})=>({name:`team_${name}`,value})),
    messages:aggregate("messages",["inbound_7d","human_outbound_7d","ai_outbound_7d"])
   };
  }
  return {customers,commerce,inbox,operations,asOf:String(raw.as_of)};
 }catch(error){console.error("BRIOFOLD_REPORT_ACCESS_UNAVAILABLE",error instanceof Error?error.name:"unknown");return null;}
}

const names:Record<string,[string,string]>={
 total:["Total","মোট"],qualified:["Qualified leads","যোগ্য লিড"],won:["Won leads","সফল লিড"],
 assigned:["Assigned profiles","দায়িত্ব দেওয়া প্রোফাইল"],opted_in:["Profile consent candidates*","প্রোফাইলে সম্মত গ্রাহক*"],
 due:["Follow-ups due","বাকি ফলো-আপ"],upcoming:["Upcoming follow-ups","আসন্ন ফলো-আপ"],done:["Completed follow-ups","সম্পন্ন ফলো-আপ"],
 draft:["Draft orders","খসড়া অর্ডার"],confirmed:["Confirmed orders","নিশ্চিত অর্ডার"],
 delivered:["Delivered orders","ডেলিভারি হয়েছে"],cancelled:["Cancelled orders","বাতিল অর্ডার"],returned:["Returned orders","ফেরত অর্ডার"],
 ai:["AI-source orders","AI উৎসের অর্ডার"],api:["API-source orders","API উৎসের অর্ডার"],manual:["Manual orders","ম্যানুয়াল অর্ডার"],
 conversations:["Conversations","কথোপকথন"],messages_7d:["Messages · 7 days","মেসেজ · ৭ দিন"],
 broadcast_drafts:["Broadcast drafts","ব্রডকাস্ট খসড়া"],broadcast_planned:["Broadcasts planned (not sent)","পরিকল্পিত ব্রডকাস্ট (পাঠানো হয়নি)"],
 post_drafts:["Post drafts","পোস্ট খসড়া"],post_planned:["Posts planned (not published)","পরিকল্পিত পোস্ট (প্রকাশিত হয়নি)"],
 booking_requested:["Bookings requested","বুকিংয়ের অনুরোধ"],booking_confirmed:["Bookings confirmed internally","অভ্যন্তরীণভাবে নিশ্চিত বুকিং"],
 booking_completed:["Bookings completed","সম্পন্ন বুকিং"],booking_cancelled:["Bookings cancelled","বাতিল বুকিং"],
 team_assigned:["Assigned threads","দায়িত্ব দেওয়া কথোপকথন"],team_unassigned:["Unassigned threads","দায়িত্ব দেওয়া হয়নি"],
 team_open:["Open threads","খোলা কথোপকথন"],team_pending:["Pending threads","অপেক্ষমাণ কথোপকথন"],
 team_resolved:["Resolved threads","সমাধানকৃত কথোপকথন"],team_overdue:["Overdue threads","সময় পার হওয়া কথোপকথন"],
 inbound_7d:["Customer messages · 7 days","গ্রাহকের মেসেজ · ৭ দিন"],
 human_outbound_7d:["Human replies · 7 days","মানুষের রিপ্লাই · ৭ দিন"],
 ai_outbound_7d:["AI replies · 7 days","AI রিপ্লাই · ৭ দিন"]
};

export async function BriofoldGrowthReports({workspaceId,actorId,locale,environment,mode,focus="all",canExport=false}:{
 workspaceId:string;actorId:string;locale:Locale;environment:"live"|"sandbox";mode:string;focus?:"all"|"ai";canExport?:boolean;
}){
 const snapshot=await readSnapshot(workspaceId,actorId,environment,mode);
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const sections=focus==="ai"?[
  {key:"inbox",title:t("Conversations","কথোপকথন"),href:"/inbox",data:snapshot?.inbox}
 ]:[
  {key:"customers",title:t("Customers & follow-ups","গ্রাহক ও ফলো-আপ"),href:"/customers/follow-ups",data:snapshot?.customers},
  {key:"commerce",title:t("Orders by state and source","অর্ডারের অবস্থা ও উৎস"),href:"/orders",data:snapshot?.commerce},
  ...(mode==="commerce"?[]:[{key:"inbox",title:t("Conversations","কথোপকথন"),href:"/inbox",data:snapshot?.inbox}]),
  ...(snapshot?.operations?[
   {key:"campaigns",title:t("Draft campaigns (not delivered)","প্রচার পরিকল্পনা (পাঠানো হয়নি)"),href:"/customers/broadcasts",data:snapshot.operations.campaigns},
   {key:"bookings",title:t("Internal bookings","অভ্যন্তরীণ বুকিং"),href:"/customers/bookings",data:snapshot.operations.bookings},
   {key:"team",title:t("Team Inbox workflow","ইনবক্স টিমের কাজ"),href:"/inbox",data:snapshot.operations.team},
   {key:"messages",title:t("Message activity (7 days)","মেসেজের কার্যক্রম (৭ দিন)"),href:"/inbox",data:snapshot.operations.messages}
  ]:[])
 ];
 return <div className={styles.root} role="region" aria-label={t("Business reporting metrics","ব্যবসার রিপোর্টের পরিমাপ")}>
  <header className={styles.heading}><div><h1>{focus==="ai"?t("AI & conversations","AI ও কথোপকথন"):t("Business reports","ব্যবসার রিপোর্ট")}</h1>
    <p>{t("Authorized, read-only counts. Figures are scoped to your selected business and environment.","অনুমোদিত, শুধু-পড়ার হিসাব। নির্বাচিত ব্যবসা ও পরিবেশের তথ্য।")}</p></div>
    <div className={styles.actions}><span className={styles.realm}>{environment==="live"?"Live":"Sandbox"}</span>
    {canExport&&snapshot?.operations&&<Link className={styles.export} href="/api/reports/growth-export" download>{t("Download metrics CSV","হিসাবের CSV ডাউনলোড")}</Link>}</div></header>
  {snapshot===null&&<p role="alert" className={styles.alert}>{t("Reports are unavailable; no zero values have been assumed.","রিপোর্ট পাওয়া যাচ্ছে না; অনুমান করে শূন্য দেখানো হয়নি।")}</p>}
  <div className={styles.grid}>{sections.map(section=><section className={styles.panel} key={section.key} aria-labelledby={`growth-${section.key}`}>
   <div className={styles.sectionHead}><h2 id={`growth-${section.key}`}>{section.title}</h2><Link href={section.href}>{t("View records","তথ্য দেখুন")}</Link></div>
   {section.data===null||section.data===undefined?<p role="alert" className={styles.alert}>{t("This data source is unavailable; counts cannot be verified.","এই তথ্যের উৎস পাওয়া যাচ্ছে না; হিসাব যাচাই করা যাচ্ছে না।")}</p>
   :<dl className={styles.metrics}>{section.data.map(item=><div key={item.name}><dt>{names[item.name]?.[bn?1:0]??item.name}</dt><dd>{new Intl.NumberFormat(bn?"bn-BD":"en-GB").format(item.value)}</dd></div>)}</dl>}
  </section>)}</div>
  {mode!=="commerce"&&process.env.BRIOFOLD_GROWTH_ANALYTICS_ENABLED==="true"&&<BriofoldResponseReport workspaceId={workspaceId} actorId={actorId} environment={environment} locale={locale}/>}
  <aside className={styles.note}>
   <p>{t("Orders are workflow counts—not verified revenue. Payment totals remain solely in the authoritative payment report.","অর্ডারগুলো কাজের অবস্থার হিসাব, যাচাইকৃত আয় নয়। প্রকৃত পেমেন্টের হিসাব শুধু মূল পেমেন্ট রিপোর্টে আছে।")}</p>
   <p>{t("*Profile-level marketing consent is not a channel-specific send permission. Provider opt-in, quiet hours, suppression and audience validation are still required before any broadcast.","*প্রোফাইলে প্রচারণার সম্মতি থাকলেই কোনো চ্যানেলে মেসেজ পাঠানোর অনুমতি হয় না। Broadcast-এর আগে provider consent, quiet hours ও audience যাচাই জরুরি।")}</p>
   {snapshot&&<p>{t("Calculated at","হিসাব করা হয়েছে")}: <time dateTime={snapshot.asOf}>{new Date(snapshot.asOf).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})} · Asia/Dhaka</time></p>}
   <Link href="/reports/payments">{t("Open verified payment reports","যাচাইকৃত পেমেন্ট রিপোর্ট খুলুন")}</Link>
  </aside>
 </div>;
}
