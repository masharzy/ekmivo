"use client";
import {useState} from "react";
import {publishedPriceComparison,priceInBdt,type PublishedSubscriptionOffer,type SubscriptionProduct,type SubscriptionTerm} from "../lib/public-subscription-offers";

type Locale="en"|"bn";
const groups:{id:SubscriptionProduct;en:string;bn:string}[]=[
 {id:"payments",en:"Payments",bn:"পেমেন্ট"},
 {id:"ai_credit",en:"AI prepaid",bn:"এআই প্রিপেইড"},
 {id:"bundle",en:"AI + Payments",bn:"এআই ও পেমেন্ট"}
];
export function SubscriptionOfferPricing({offers,locale,compact=false}:{offers:PublishedSubscriptionOffer[];locale:Locale;compact?:boolean}){
 const [product,setProduct]=useState<SubscriptionProduct>("payments");
 const [preferredTerm,setPreferredTerm]=useState<"monthly"|"yearly">("monthly");
 if(!offers.length)return null;
 const available=groups.filter(g=>offers.some(o=>o.product===g.id));
 const active=available.find(g=>g.id===product)?.id||available[0].id;
 const candidates=offers.filter(o=>o.product===active);
 const terms:SubscriptionTerm[]=active==="ai_credit"?["one_time"]:(["monthly","yearly"] as const).filter(t=>candidates.some(o=>o.term===t));
 const selectedTerm=terms.includes(preferredTerm)?preferredTerm:terms[0];
 const visible=candidates.filter(o=>o.term===selectedTerm);
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 return <section className={"sop-root"+(compact?" sop-compact":"")} aria-label={t("Approved subscription offers","অনুমোদিত সাবস্ক্রিপশন অফার")}>
  <div className="sop-heading"><div>
   <strong>{t("Published offers","প্রকাশিত অফার")}</strong>
   <p>{t("Exact prices from the approved Ekmivo catalog. AI credits are prepaid, not recurring.","Ekmivo-র অনুমোদিত ক্যাটালগের নির্দিষ্ট মূল্য। AI ক্রেডিট প্রিপেইড, স্বয়ংক্রিয় মাসিক চার্জ নয়।")}</p>
  </div></div>
  {available.length>1&&<div className="sop-selector" role="group" aria-label={t("Product","পণ্য")}>
   {available.map(g=><button key={g.id} type="button" aria-pressed={g.id===active} onClick={()=>setProduct(g.id)}>{g[locale]}</button>)}
  </div>}
  {active!=="ai_credit"&&terms.length>1&&<div className="sop-selector sop-terms" role="group" aria-label={t("Billing interval","বিলিং মেয়াদ")}>
   {terms.map(term=><button key={term} type="button" aria-pressed={term===selectedTerm} onClick={()=>setPreferredTerm(term as "monthly"|"yearly")}>{term==="monthly"?t("Monthly","মাসিক"):t("Yearly","বার্ষিক")}</button>)}
  </div>}
  <div className="sop-cards">{visible.map(o=>{
   const comparison=publishedPriceComparison(offers,o);
   return <article className="sop-card" key={o.version_id}>
   <p className="sop-product">{o.product==="bundle"?t("AI + Payments bundle","এআই ও পেমেন্ট বান্ডেল"):o.product==="ai_credit"?t("One-time AI credits","একবারের এআই ক্রেডিট"):t("Payment subscription","পেমেন্ট সাবস্ক্রিপশন")}</p>
   <h3>{locale==="bn"&&o.name_bn?o.name_bn:o.name}</h3>
   <div className="sop-price">{priceInBdt(o.amount_minor,locale)}<small>{o.term==="one_time"?t(" / one time"," / একবার"):o.term==="monthly"?t(" / month"," / মাস"):t(" / year"," / বছর")}</small></div>
   {comparison.annual_saving_minor&&<p className="sop-savings">{t("Compared with 12 published monthly charges: save ","প্রকাশিত ১২টি মাসিক চার্জের তুলনায় সাশ্রয়: ")}<strong>{priceInBdt(comparison.annual_saving_minor,locale)}</strong></p>}
   {comparison.bundle_saving_minor&&<p className="sop-savings">{t("Compared with separately published Payments and AI pack prices: save ","পৃথকভাবে প্রকাশিত পেমেন্ট ও এআই প্যাকের মূল্যের তুলনায় সাশ্রয়: ")}<strong>{priceInBdt(comparison.bundle_saving_minor,locale)}</strong></p>}
   {(o.description||o.description_bn)&&<p className="sop-description">{locale==="bn"&&o.description_bn?o.description_bn:o.description}</p>}
   {o.included_ai_credits&&<p className="sop-credits">{t("Included AI credits","অন্তর্ভুক্ত AI ক্রেডিট")}: <strong>{new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD").format(BigInt(o.included_ai_credits))}</strong></p>}
   <div className="sop-availability">{t("Published price · Purchase handoff opens after verified checkout release","প্রকাশিত মূল্য · যাচাইকৃত চেকআউট চালু হলে অর্ডার করা যাবে")}</div>
  </article>})}</div>
  <p className="sop-disclaimer">{t("Offers display the current published price version. Discounts, tax and final payable amount must be rechecked at checkout. No unapproved annual savings or free credits are assumed.","বর্তমান প্রকাশিত মূল্য সংস্করণ দেখানো হচ্ছে। ছাড়, কর ও মোট মূল্য চেকআউটে পুনরায় যাচাই হবে। অনুমোদন ছাড়া বার্ষিক ছাড় বা ফ্রি ক্রেডিট ধরে নেওয়া হয়নি।")}</p>
 </section>;
}
