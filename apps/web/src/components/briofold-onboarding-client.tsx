"use client";
import {useActionState} from "react";
import {submitBriofoldSetup,type SetupResult} from "../actions/briofold-onboarding";
import styles from "./briofold-onboarding.module.css";
type Plan={id:string;name:string;description:string;kind:string;price:string};
// Server Actions deliberately return stable, non-sensitive errors. Keep their
// English messages as the API fallback while localizing the merchant display.
const setupErrorBn:Record<string,string>={
 "Business unavailable.":"ব্যবসার তথ্য পাওয়া যায়নি।",
 "Your selected business changed. Refresh setup and try again.":"নির্বাচিত ব্যবসা বদলেছে। সেটআপ রিফ্রেশ করে আবার চেষ্টা করুন।",
 "Invalid setup step.":"সেটআপের ধাপটি সঠিক নয়।",
 "Check your business name and type.":"ব্যবসার নাম ও ধরন পরীক্ষা করুন।",
 "Choose AI, Payments, or Both.":"AI, Payments অথবা দুটোই নির্বাচন করুন।",
 "Invalid plan selection.":"নির্বাচিত প্ল্যানটি সঠিক নয়।",
 "Store profile unavailable.":"ব্যবসার প্রোফাইল এখন পাওয়া যাচ্ছে না।",
 "Service configuration unavailable.":"সেবার সেটিংস এখন পাওয়া যাচ্ছে না।",
 "Business services changed. Refresh setup.":"ব্যবসার সেবা বদলেছে। সেটআপ রিফ্রেশ করুন।",
 "Choose an available plan.":"তালিকা থেকে একটি উপলব্ধ প্ল্যান নির্বাচন করুন।",
 "Owner access required.":"শুধুমাত্র বর্তমান মালিক সেটআপ পরিবর্তন করতে পারবেন।",
 "This setup changed. Refresh and try again.":"সেটআপের অবস্থা বদলেছে। রিফ্রেশ করে আবার চেষ্টা করুন।",
 "Could not save setup. Check the details and retry.":"সেটআপ সংরক্ষণ করা যায়নি। তথ্য পরীক্ষা করে আবার চেষ্টা করুন।",
};
const initial:SetupResult={status:"idle",message:""};
export function BriofoldOnboardingClient({locale,step,businessId,businessName,mode,plans,gatewayPlansUnavailable=false}:{
 businessId:string;locale:"bn"|"en";step:"business"|"services"|"billing";businessName:string;
 mode:"ai"|"commerce"|"both"|"off";plans:Plan[];gatewayPlansUnavailable?:boolean;
}){
 const bn=locale==="bn",t=(en:string,b:string)=>bn?b:en;
 const [result,action,pending]=useActionState(submitBriofoldSetup,initial);
 return <main className={styles.page}>
  <section className={styles.card}>
   <div className={styles.brand}>Briofold</div>
   <div className={styles.progress} aria-label={t("Setup steps","সেটআপ ধাপ")}>
    {(["business","services","billing"] as const).map((s,i)=><span key={s} data-active={s===step}>{i+1}</span>)}
   </div>
   <h1>{step==="business"?t("Tell us about your store","আপনার স্টোরের তথ্য দিন")
    :step==="services"?t("What do you want to use?","কোন সেবা ব্যবহার করবেন?")
    :t("Choose how to get started","শুরু করার প্ল্যান বেছে নিন")}</h1>
   <p className={styles.subtitle}>{step==="billing"?
    t("Gateway plans and AI credits are separate. No paid access is activated by choosing a tier.",
    "Gateway প্ল্যান ও AI ক্রেডিট আলাদা। প্ল্যান বাছলেই পেইড সুবিধা চালু হয় না।"):
    t("You can edit these settings later.","পরে সেটিংস থেকে পরিবর্তন করতে পারবেন।")}</p>
   <form action={action} className={styles.form}>
    <input type="hidden" name="step" value={step}/>
    <input type="hidden" name="business_id" value={businessId}/>
    {step==="business"&&<>
     <label>{t("Store name","স্টোরের নাম")}<input name="name" defaultValue={businessName==="New business"?"":businessName} required minLength={2} maxLength={40} autoFocus/></label>
     <label>{t("Business type","ব্যবসার ধরন")}<select name="business_type" defaultValue="online">
      <option value="online">{t("Online store","অনলাইন স্টোর")}</option>
      <option value="physical">{t("Physical store","ফিজিক্যাল স্টোর")}</option>
      <option value="service">{t("Services","সেবা")}</option>
      <option value="other">{t("Other","অন্যান্য")}</option>
     </select></label>
     <label>{t("Short description (optional)","সংক্ষিপ্ত পরিচিতি (ঐচ্ছিক)")}<input name="description" maxLength={60}/></label>
     <label>{t("Address (optional)","ঠিকানা (ঐচ্ছিক)")}<input name="address" maxLength={250}/></label>
    </>}
    {step==="services"&&<fieldset className={styles.choices}>
     <legend>{t("Select services","সেবা নির্বাচন")}</legend>
     {[
      {key:"ai",title:"AI Bot",desc:t("Inbox and AI assistance","ইনবক্স ও AI সহায়তা")},
      {key:"commerce",title:t("Payment Gateway","পেমেন্ট গেটওয়ে"),desc:t("Verified payments, links and invoices","পেমেন্ট যাচাই, লিংক ও ইনভয়েস")},
      {key:"both",title:t("Both services","দুটিই"),desc:t("One business dashboard, separate billing","এক Dashboard, আলাদা বিলিং")}
     ].map(x=><label className={styles.option} key={x.key}>
      <input type="radio" name="mode" value={x.key} defaultChecked={x.key===mode} required/>
      <span><strong>{x.title}</strong><small>{x.desc}</small></span>
     </label>)}
    </fieldset>}
    {step==="billing"&&<>
     {mode==="ai"?<div className={styles.notice}>{t("AI-only setup starts with no purchased credits. Paid AI requests require a funded wallet.","AI-only সেটআপে কেনা ক্রেডিট থাকে না। পেইড AI চালাতে আগে ওয়ালেট ফান্ড করতে হবে।")}</div>
     :<fieldset className={styles.choices}><legend>{t("Payment Gateway plan","Payment Gateway প্ল্যান")}</legend>
      {plans.map((plan,i)=><label key={plan.id} className={styles.option}>
       <input name="plan" value={plan.id} type="radio" required defaultChecked={i===0}/>
       <span><strong>{plan.name} · {plan.price}</strong><small>{plan.description}</small></span>
      </label>)}
     </fieldset>}
     {mode!=="ai"&&gatewayPlansUnavailable&&<p role="alert" className={styles.error}>{t("Gateway plans are unavailable. Your saved setup is safe. Retry to load available plans.","Gateway প্ল্যান এখন পাওয়া যাচ্ছে না। সংরক্ষিত সেটআপ ঠিক আছে। প্ল্যান আবার লোড করুন।")} <a href="/setup">{t("Retry","আবার চেষ্টা করুন")}</a></p>}
     {mode!=="commerce"&&<div className={styles.notice}>{t("AI uses separate prepaid credits based on actual metered usage. There is no unlimited AI plan.","AI-তে বাস্তব ব্যবহার অনুযায়ী prepaid credits কাটবে। Unlimited AI প্ল্যান নেই।")}</div>}
    </>}
    {result.status==="error"&&<p role="alert" className={styles.error}>{bn?(setupErrorBn[result.message]??result.message):result.message}</p>}
    <button className={styles.submit} type="submit" disabled={pending||step==="billing"&&mode!=="ai"&&plans.length===0}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):step==="billing"?t("Finish setup","সেটআপ শেষ করুন"):t("Continue","পরবর্তী ধাপ")}</button>
   </form>
  </section>
 </main>;
}
