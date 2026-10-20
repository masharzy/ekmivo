import {readAiWallet} from "../lib/server/briofold-ai-wallet";
import {BriofoldAiTopupControls} from "./briofold-ai-topup-controls";
import styles from "./briofold-ai-credit-summary.module.css";
export async function BriofoldAiCreditSummary({workspaceId,actorId,locale}:{
 workspaceId:string;actorId:string;locale:"bn"|"en";
}){
 const wallet=await readAiWallet(workspaceId,actorId),bn=locale==="bn";
 const t=(en:string,be:string)=>bn?be:en;
 const money=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
 return <section className={styles.section} aria-labelledby="briofold-ai-credit-title">
  <header><h2 id="briofold-ai-credit-title">{t("AI prepaid credits","AI প্রিপেইড ক্রেডিট")}</h2>
   <p>{t("Metered AI usage and credits are separate from your Payment Gateway subscription.","AI ব্যবহার ও ক্রেডিট Payment Gateway সাবস্ক্রিপশন থেকে আলাদা।")}</p></header>
  {wallet.status==="unavailable"?<p role="alert">{t("AI credit balance is currently unavailable; paid AI operations must remain disabled.","AI ক্রেডিটের হিসাব এখন পাওয়া যাচ্ছে না; পেইড AI কার্যক্রম বন্ধ রাখতে হবে।")}</p>:
  <><dl><div><dt>{t("Available","ব্যবহারযোগ্য")}</dt><dd>{money(wallet.available_minor)}</dd></div>
    <div><dt>{t("Reserved for pending requests","চলমান অনুরোধে রিজার্ভ")}</dt><dd>{money(wallet.reserved_minor)}</dd></div></dl>
    <p className={styles.note}>{t("Credits may only be added after an authoritative payment verification or authorized grant. AI usage rates and funding must be configured before paid AI is activated.","কর্তৃপক্ষের যাচাইকৃত পেমেন্ট বা অনুমোদিত ক্রেডিট গ্রান্ট ছাড়া ব্যালেন্স যোগ হবে না। AI usage rate ও funding সম্পন্ন হওয়ার আগে পেইড AI চালু হবে না।")}</p>
    <BriofoldAiTopupControls workspaceId={workspaceId} locale={locale} enabled={process.env.BRIOFOLD_AI_TOPUPS_ENABLED==="true"} topups={wallet.topups}/>
    {wallet.entries.length>0&&<details><summary>{t("Recent ledger activity","সাম্প্রতিক লেজার")}</summary>
      <ul>{wallet.entries.map((row,i)=><li key={row.created_at+row.kind+i}><span>{row.kind}</span><span>{money(row.available_delta_minor)}</span><time>{new Date(row.created_at).toLocaleDateString(locale==="bn"?"bn-BD":"en-BD")}</time></li>)}</ul>
    </details>}
  </>}
 </section>;
}
