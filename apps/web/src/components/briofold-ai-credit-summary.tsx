import {readAiWallet} from "../lib/server/briofold-ai-wallet";
import {BriofoldAiTopupControls} from "./briofold-ai-topup-controls";
import {BriofoldAiStatement} from "./briofold-ai-statement";
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
    {wallet.minimum_request_minor===null?<p role="status" className={styles.warning}>
     {t("No published AI model rate is configured. Paid AI requests cannot start until Admin publishes a tariff.","কোনো AI মডেলের রেট প্রকাশ করা হয়নি। অ্যাডমিন রেট চালু না করা পর্যন্ত পেইড AI অনুরোধ শুরু হবে না।")}
    </p>:wallet.available_minor<wallet.minimum_request_minor?<p role="status" className={styles.warning}>
     {wallet.available_minor===0
      ?t("No spendable AI credits remain. New paid AI requests are paused; manual inbox and payments are not affected.","ব্যবহারযোগ্য AI ক্রেডিট শেষ। নতুন পেইড AI অনুরোধ বন্ধ থাকবে; ম্যানুয়াল ইনবক্স ও পেমেন্ট চলবে।")
      :t("Low AI balance: the available credits cannot cover even the smallest configured AI request reservation.","AI ব্যালেন্স কম: বর্তমান ক্রেডিট দিয়ে সবচেয়ে কম রিজার্ভের AI অনুরোধও চালানো যাবে না।")}
     {" "}{t("Minimum reservation:","সর্বনিম্ন রিজার্ভ:")} {money(wallet.minimum_request_minor)}
    </p>:null}
    <p className={styles.note}>{t("Credits may only be added after an authoritative payment verification or authorized grant. AI usage rates and funding must be configured before paid AI is activated.","কর্তৃপক্ষের যাচাইকৃত পেমেন্ট বা অনুমোদিত ক্রেডিট গ্রান্ট ছাড়া ব্যালেন্স যোগ হবে না। AI usage rate ও funding সম্পন্ন হওয়ার আগে পেইড AI চালু হবে না।")}</p>
    <BriofoldAiTopupControls workspaceId={workspaceId} locale={locale} enabled={process.env.BRIOFOLD_AI_TOPUPS_ENABLED==="true"} topups={wallet.topups}/>
    <BriofoldAiStatement workspaceId={workspaceId} locale={locale} initial={wallet.entries} nextCursor={wallet.next_cursor}/>
  </>}
 </section>;
}
