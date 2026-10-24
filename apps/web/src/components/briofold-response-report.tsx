import "server-only";
import {database} from "../lib/server/db";
import styles from "./briofold-growth-reports.module.css";
type Totals={conversations:number;responded:number;unanswered:number;human_first:number;ai_first:number;within_five_minutes:number;average_seconds:number|null};
type Report={totals:Totals;channels:(Totals&{provider:string})[];people:{id:string;name:string;open:number;overdue:number}[];can_view_people:boolean};
export async function BriofoldResponseReport({workspaceId,actorId,environment,locale}:{workspaceId:string;actorId:string;environment:"live"|"sandbox";locale:"en"|"bn"}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 let report:Report|null=null;
 try{const [row]=await database()`SELECT briofold_response_snapshot(${workspaceId}::uuid,${environment},${actorId}::uuid) AS data`;report=row?.data as Report;
  if(!report?.totals||!Array.isArray(report.channels)||!Array.isArray(report.people))throw Error("INVALID_RESPONSE_REPORT");
 }catch(error){console.error("BRIOFOLD_RESPONSE_REPORT_UNAVAILABLE",error instanceof Error?error.name:"unknown");report=null;}
 const number=(value:number|null)=>value===null?"—":new Intl.NumberFormat(bn?"bn-BD":"en-GB").format(value);
 const labels:[keyof Totals,string,string][]=[
  ["conversations","Conversations with inbound messages","মেসেজ আসা কথোপকথন"],
  ["responded","Received a successful first reply","সফল প্রথম উত্তর পেয়েছে"],
  ["unanswered","No successful reply yet","এখনো সফল উত্তর নেই"],
  ["human_first","Human first replies","মানুষের প্রথম উত্তর"],
  ["ai_first","AI first replies","AI-এর প্রথম উত্তর"],
  ["within_five_minutes","First reply within 5 minutes","৫ মিনিটের মধ্যে প্রথম উত্তর"],
  ["average_seconds","Average first response (seconds)","প্রথম উত্তরের গড় সময় (সেকেন্ড)"]
 ];
 return <section className={styles.panel} aria-label={t("Response time and team workload","উত্তরের সময় ও টিমের কাজ")}>
  <h2>{t("Response time · last 7 days","উত্তরের সময় · গত ৭ দিন")}</h2>
  <p>{t("Each conversation is counted once, from its first inbound message in the rolling seven-day window to the first successful human or AI reply. Queued and failed messages do not count as replies.","গত সাত দিনের মধ্যে আসা প্রথম মেসেজ থেকে মানুষ বা AI-এর প্রথম সফল উত্তর পর্যন্ত প্রতিটি কথোপকথন একবার গণনা হয়। অপেক্ষমাণ বা ব্যর্থ মেসেজ উত্তর হিসেবে ধরা হয় না।")}</p>
  {!report?<p role="alert">{t("Response data is unavailable. Try again later.","উত্তরের তথ্য পাওয়া যাচ্ছে না। পরে আবার দেখুন।")}</p>:<>
   <dl className={styles.metrics}>{labels.map(([key,en,be])=><div key={key}><dt>{t(en,be)}</dt><dd>{number(report.totals[key])}</dd></div>)}</dl>
   <h3>{t("Channel sources","চ্যানেলের উৎস")}</h3>
   {!report.channels.length?<p>{t("No inbound conversations in this window.","এই সময়ে কোনো মেসেজ আসেনি।")}</p>:report.channels.map(channel=><p key={channel.provider}><b>{({ms:"Messenger",ig:"Instagram",wa:"WhatsApp",web:t("Website","ওয়েবসাইট")} as Record<string,string>)[channel.provider]??channel.provider}</b> · {t("Conversations","কথোপকথন")}: {number(channel.conversations)} · {t("Replied","উত্তর দেওয়া")}: {number(channel.responded)} · {t("Average seconds","গড় সেকেন্ড")}: {number(channel.average_seconds)}</p>)}
   {report.can_view_people&&<><h3>{t("Current team workload (up to 50 members)","টিমের বর্তমান কাজ (সর্বোচ্চ ৫০ সদস্য)")}</h3><p>{t("Current assignees, including older conversations. This does not attribute historical replies to these people.","পুরোনো কথোপকথনসহ বর্তমান দায়িত্বপ্রাপ্ত সদস্য। আগের উত্তরগুলো তাঁদের দেওয়া বলে দাবি করা হচ্ছে না।")}</p>{!report.people.length?<p>{t("No assigned conversations.","কোনো কথোপকথনের দায়িত্ব দেওয়া হয়নি।")}</p>:report.people.map(person=><p key={person.id}><b>{person.name}</b> · {t("Open","খোলা")}: {number(person.open)} · {t("Overdue","সময় পেরিয়েছে")}: {number(person.overdue)}</p>)}</>}
  </>}
 </section>;
}
