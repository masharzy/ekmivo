import {readAiWallet} from "../lib/server/briofold-ai-wallet";
import {BriofoldAiTopupControls} from "./briofold-ai-topup-controls";
import {BriofoldAiStatement} from "./briofold-ai-statement";
import styles from "./briofold-ai-credit-summary.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";
export async function BriofoldAiCreditSummary({workspaceId,actorId,locale,standalone=false}:{
 workspaceId:string;actorId:string;locale:"bn"|"en";standalone?:boolean;
}){
 const wallet=await readAiWallet(workspaceId,actorId),bn=locale==="bn";
 const t=(en:string,be:string)=>bn?be:en;
 const money=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
 const low=wallet.status!=="unavailable"&&(wallet.minimum_request_minor===null||wallet.available_minor<wallet.minimum_request_minor);
 return <div className="ref-dashboard"><section className={`ref-page ${styles.section}`} aria-labelledby="briofold-ai-credit-title">
  <div className="top"><h1 id="briofold-ai-credit-title">{standalone?t("Billing & usage","বিলিং ও ব্যবহার"):t("AI credits","AI ক্রেডিট")}</h1><p>{t("Prepaid credits for AI replies. Separate from your payment gateway plan.","AI উত্তরের জন্য প্রিপেইড ক্রেডিট। পেমেন্ট গেটওয়ে প্ল্যান থেকে আলাদা।")}</p></div>
  {wallet.status==="unavailable"?<div className="notice" role="alert">{t("AI credit balance is unavailable right now. Paid AI replies stay off until it is back.","AI ক্রেডিটের হিসাব এখন পাওয়া যাচ্ছে না। ফিরে না আসা পর্যন্ত পেইড AI উত্তর বন্ধ থাকবে।")}</div>:
  <>
   <div className={styles.kpis}>
    <div className={`card ${styles.kpi}`}><span>{t("Available","ব্যবহারযোগ্য")}</span><strong>{money(wallet.available_minor)}</strong></div>
    <div className={`card ${styles.kpi}`}><span>{t("Held for pending replies","চলমান উত্তরের জন্য রিজার্ভ")}</span><strong>{money(wallet.reserved_minor)}</strong></div>
   </div>
   {low&&<div className="notice" role="status">{wallet.minimum_request_minor===null
     ?t("AI pricing is not published yet, so paid AI replies cannot start.","AI-এর রেট এখনো প্রকাশ হয়নি, তাই পেইড AI উত্তর শুরু হবে না।")
     :wallet.available_minor===0
      ?t("No credits left. AI replies are paused; your inbox and payments keep working.","ক্রেডিট শেষ। AI উত্তর বন্ধ; ইনবক্স ও পেমেন্ট চলবে।")
      :t("Balance is too low for even the smallest AI reply.","ব্যালেন্স সবচেয়ে ছোট AI উত্তরের জন্যও কম।")+" "+t("Minimum:","সর্বনিম্ন:")+" "+money(wallet.minimum_request_minor)}</div>}
   <BriofoldAiTopupControls workspaceId={workspaceId} locale={locale} enabled={process.env.BRIOFOLD_AI_TOPUPS_ENABLED==="true"} topups={wallet.topups}/>
   <BriofoldAiStatement key={workspaceId} workspaceId={workspaceId} locale={locale} initial={wallet.entries} nextCursor={wallet.next_cursor}/>
   <p className={styles.note}>{t("Credits are added only after a verified payment or an authorized grant.","ক্রেডিট শুধু যাচাইকৃত পেমেন্ট বা অনুমোদিত গ্রান্টের পর যোগ হয়।")}</p>
  </>}
 </section></div>;
}
