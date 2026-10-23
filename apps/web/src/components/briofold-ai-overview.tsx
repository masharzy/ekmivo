import "server-only";
import Link from "next/link";
import {database} from "../lib/server/db";
import styles from "./briofold-ai-overview.module.css";

type Stat={conversations:number;waiting:number;channels:number;requests:number|null};
type Activity={id:string;name:string;channel:string;at:string};
type Result={stats:Stat;recent:Activity[]}|null;
const exactCount=(raw:unknown)=>{
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value<0)throw new Error("INBOX_STAT_INVALID");
 return value;
};

// Revalidate the active user, AI entitlement and tenant membership on the
// server. An Inbox/AI overview never reads payment-realm financial records.
async function readOverview(workspaceId:string,userId:string):Promise<Result>{
 try{
  const db=database();
  const [allowed]=await db`
   SELECT 1 AS ok FROM workspace_members m
    JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL
    JOIN workspace_product_access p ON p.workspace_id=m.workspace_id
      AND p.product='ai' AND p.enabled=true
   WHERE m.workspace_id=${workspaceId}::uuid AND m.user_id=${userId}::uuid
   LIMIT 1`;
  if(!allowed)return null;
  const [counts,recent,exists]=await Promise.all([
   db`SELECT
     (SELECT count(*)::bigint FROM inbox_threads t JOIN inbox_connections c
       ON c.id=t.connection_id AND c.workspace_id=t.workspace_id
       WHERE t.workspace_id=${workspaceId}::uuid AND c.environment='live' AND c.enabled=true) AS conversations,
     (SELECT count(*)::bigint FROM (
       SELECT DISTINCT ON(m.thread_id) m.thread_id,m.sender FROM inbox_messages m
       JOIN inbox_threads t ON t.id=m.thread_id AND t.workspace_id=m.workspace_id
       JOIN inbox_connections c ON c.id=t.connection_id
       WHERE m.workspace_id=${workspaceId}::uuid AND c.environment='live' AND c.enabled=true
       ORDER BY m.thread_id,m.sequence DESC
     ) latest WHERE latest.sender='customer') AS waiting,
     (SELECT count(*)::bigint FROM inbox_connections c
       WHERE c.workspace_id=${workspaceId}::uuid AND c.environment='live'
       AND c.enabled=true) AS channels`,
   db`SELECT t.id,t.customer_name,c.provider,t.last_activity_at
       FROM inbox_threads t JOIN inbox_connections c
       ON c.id=t.connection_id AND c.workspace_id=t.workspace_id
       WHERE t.workspace_id=${workspaceId}::uuid AND c.environment='live' AND c.enabled=true
       ORDER BY t.last_activity_at DESC,t.id DESC LIMIT 6`,
   db`SELECT to_regclass('public.briofold_ai_executions') AS rel`
  ]);
  let requests:number|null=null;
  if(exists[0]?.rel){
   try{
    const [row]=await db`SELECT count(*)::bigint AS value
      FROM briofold_ai_executions WHERE workspace_id=${workspaceId}::uuid
      AND created_at>=now()-interval '7 days'`;
    requests=exactCount(row?.value);
   }catch(error){console.error("[briofold AI overview] metering unavailable",error instanceof Error?error.name:"unknown")}
  }
  const row=counts[0];
  if(!row)throw new Error("INBOX_COUNTS_NOT_RETURNED");
  return {
   stats:{conversations:exactCount(row.conversations),waiting:exactCount(row.waiting),
    channels:exactCount(row.channels),requests},
   recent:recent.map(x=>({id:String(x.id),name:String(x.customer_name),
    channel:String(x.provider),at:new Date(x.last_activity_at).toISOString()}))
  };
 }catch(error){
  console.error("[briofold AI overview]",error instanceof Error?error.name:"unknown");
  return null;
 }
}

export async function BriofoldAiOverview({workspaceId,userId,locale}:{
 workspaceId:string;userId:string;locale:"bn"|"en";
}){
 const bn=locale==="bn",data=await readOverview(workspaceId,userId);
 const t=(en:string,be:string)=>bn?be:en;
 const metrics=[
  [t("Conversations","কথোপকথন"),data?.stats.conversations],
  [t("Waiting for reply","উত্তরের অপেক্ষায়"),data?.stats.waiting],
  [t("AI requests · 7 days","AI অনুরোধ · ৭ দিন"),data?.stats.requests],
  [t("Connected channels","সংযুক্ত চ্যানেল"),data?.stats.channels],
 ] as const;
 return <div className={styles.root}>
  <header className={styles.heading}>
   <h1>{t("Overview","ওভারভিউ")}</h1>
   <p>{t("Your conversations and channel activity.","আপনার কথোপকথন ও চ্যানেলের কার্যক্রম।")}</p>
  </header>
  {data===null&&<p role="alert" className={styles.alert}>{t(
   "Inbox activity is temporarily unavailable. No zero counts are being assumed.",
   "ইনবক্সের তথ্য এখন পাওয়া যাচ্ছে না। অনুমান করে শূন্য দেখানো হচ্ছে না।"
  )}</p>}
  <div className={styles.metrics}>{metrics.map(([name,value])=><article key={name}>
   <span>{name}</span><strong>{value===null||value===undefined?"—":new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(value)}</strong>
  </article>)}</div>
  <section className={styles.activity} aria-label={t("Business alerts","ব্যবসার সতর্কতা")}>
   <div className={styles.activityHead}><h2>{t("Business alerts","ব্যবসার সতর্কতা")}</h2><Link href="/inbox">{t("Review queue","তালিকা দেখুন")}</Link></div>
   {data===null?<p role="status">{t("Alerts are unavailable until the Inbox source can be read.","ইনবক্সের তথ্য না পাওয়া পর্যন্ত সতর্কতা দেখানো যাবে না।")}</p>
   :data.stats.waiting>0?<p role="status">{t(`${data.stats.waiting} conversation(s) have a customer message waiting for a reply.`,`${new Intl.NumberFormat("bn-BD").format(data.stats.waiting)}টি কথোপকথনে গ্রাহকের মেসেজের উত্তর বাকি আছে।`)}</p>
   :<p role="status">{t("No conversation currently ends with an unanswered customer message.","এই মুহূর্তে শেষ গ্রাহক মেসেজের উত্তর বাকি নেই।")}</p>}
  </section>
  <section className={styles.activity} aria-label={t("Store setup checklist","স্টোর সেটআপের তালিকা")}>
   <div className={styles.activityHead}><h2>{t("Store setup checklist","স্টোর সেটআপের তালিকা")}</h2><Link href="/settings">{t("Open settings","সেটিংস খুলুন")}</Link></div>
   <ul className={styles.checklist}>
    <li><Link href="/settings/channels">{t("Connect messaging channels","মেসেজের চ্যানেল যুক্ত করুন")}</Link> · {data===null?t("Not verified","যাচাই হয়নি"):data.stats.channels>0?t("Connected","সংযুক্ত"):t("Action needed","কাজ বাকি")}</li>
    <li><Link href="/inbox">{t("Review customer response queue","গ্রাহকের উত্তরের তালিকা দেখুন")}</Link> · {data===null?t("Not verified","যাচাই হয়নি"):data.stats.waiting>0?t("Needs attention","মনোযোগ প্রয়োজন"):t("No waiting replies","অপেক্ষায় কোনো উত্তর নেই")}</li>
    <li><Link href="/inbox/agent-desk">{t("Review AI instructions and publish state","AI নির্দেশনা ও প্রকাশনার অবস্থা দেখুন")}</Link> · {t("Review required","পর্যালোচনা প্রয়োজন")}</li>
    <li><Link href="/settings/business">{t("Review Store details","স্টোরের তথ্য দেখুন")}</Link> · {t("Review required","পর্যালোচনা প্রয়োজন")}</li>
   </ul>
   <p className={styles.empty}>{t("Only connection and queue statuses are measured here; opening other steps never silently marks them complete.","এখানে শুধু সংযোগ ও উত্তর-তালিকার অবস্থা যাচাই হয়; অন্য ধাপ খুললেই সম্পন্ন বলে ধরা হয় না।")}</p>
  </section>
  <section className={styles.activity}>
   <div className={styles.activityHead}><h2>{t("Recent conversations","সাম্প্রতিক কথোপকথন")}</h2>
    <Link href="/inbox">{t("Open Inbox","ইনবক্স খুলুন")}</Link></div>
   {data&&data.recent.length===0?<p className={styles.empty}>{t(
    "No conversations yet. Connect a channel to start receiving messages.",
    "এখনও কোনো কথোপকথন নেই। মেসেজ পেতে চ্যানেল যুক্ত করুন।"
   )}{" "}<Link href="/settings/channels">{t("Manage channels","চ্যানেল পরিচালনা")}</Link></p>:
   data?.recent.map(item=><div key={item.id} className={styles.thread}>
     <span className={styles.customer}>{item.name}</span>
     <span className={styles.channel}>{item.channel==="wa"?"WhatsApp":item.channel==="ig"?"Instagram":item.channel==="ms"?"Messenger":t("Channel","চ্যানেল")}</span>
     <time dateTime={item.at}>{new Date(item.at).toLocaleString(bn?"bn-BD":"en-BD",{dateStyle:"medium",timeStyle:"short"})}</time>
    </div>)}
  </section>
 </div>;
}
