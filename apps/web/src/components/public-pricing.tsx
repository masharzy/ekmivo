import Link from "next/link";
import {publicPaymentPlans} from "../lib/server/payment-plans";
import {PaymentPlanCards} from "./payment-plan-cards";
import {publicSubscriptionOffers} from "../lib/server/public-subscription-offers";
import {SubscriptionOfferPricing} from "./subscription-offer-pricing";
export async function PublicPricing({locale,compact=false}:{locale:"en"|"bn";compact?:boolean}){
 const [{plans,unavailable},{offers}]=await Promise.all([publicPaymentPlans(),publicSubscriptionOffers()]);
 const bn=locale==="bn",t=(a:string,b:string)=>bn?b:a;
 // Never show conflicting legacy prices alongside a published price pinned to
 // the SAME current Gateway plan version. Unmatched legacy plans remain live.
 const displayedOffers=compact?offers.filter(o=>o.product==="payments"):offers;
 const remaining=offers.length?plans.filter(plan=>!offers.some(o=>o.product==="payments"&&o.gateway_plan_version_id===plan.version_id)):plans;
 const empty=<p className="mp-message">{t("No public pricing has been published yet.","এখনো কোনো পাবলিক মূল্য প্রকাশ করা হয়নি।")}</p>;
 const cards=(variant:"default"|"landing")=><>
  <SubscriptionOfferPricing locale={locale} offers={displayedOffers} compact={variant==="landing"}/>
  {remaining.length>0&&<PaymentPlanCards plans={remaining} locale={locale} variant={variant}/>}
 </>;
 if(compact)return <div className="ekm-plan-data">
  {unavailable&&!displayedOffers.length?<p className="mp-message" role="status">{t("Pricing is temporarily unavailable. Please try again later.","প্ল্যানের তথ্য এখন পাওয়া যাচ্ছে না। একটু পরে আবার দেখুন।")}</p>:!remaining.length&&!displayedOffers.length?empty:cards("landing")}
 </div>;
 const Heading=compact?"h2":"h1"; return <section className="mp-public" id="pricing" lang={locale}>
  <header><span className="mp-eyebrow">{t("PAYMENT GATEWAY PRICING","পেমেন্ট গেটওয়ের প্ল্যান")}</span><Heading>{t("One Store. Every integration.","এক স্টোরে আপনার সব ইন্টিগ্রেশন।")}</Heading><p>{t("Choose your successful-payment allowance. Connect your websites, apps and bots.","সফল পেমেন্টের প্রয়োজন অনুযায়ী প্ল্যান নিন। যুক্ত করুন আপনার website, app ও bot।")}</p><Link href="/ai-bot">{t("AI Bot uses separate prepaid billing","AI Bot-এর prepaid billing আলাদা")} ↗</Link></header>
  {unavailable&&!offers.length?<p className="mp-message" role="status">{t("Pricing is temporarily unavailable. Please try again later.","প্ল্যানের তথ্য এখন পাওয়া যাচ্ছে না। একটু পরে আবার দেখুন।")}</p>:!remaining.length&&!offers.length?empty:cards("default")}
  <p className="mp-fine">{t("All API keys share your workspace allowance. No charge for failed or expired payments, verification retries or webhook retries. Payment-provider charges are separate.","সব API চাবি একই ওয়ার্কস্পেসের allowance ব্যবহার করে। ব্যর্থ বা মেয়াদোত্তীর্ণ পেমেন্ট, verification retry ও webhook retry-তে allowance কাটে না। Payment provider-এর নিজস্ব চার্জ আলাদা।")}</p>
  {!compact&&<div className="mp-faq">{[
   [t("What counts as a payment?","কোন পেমেন্ট গণনা হয়?"),t("A payment consumes one reserved slot only after successful verification. Repeated verification does not count again. Refunds do not restore a consumed payment allowance.","পেমেন্ট সফলভাবে যাচাই হলে একটি reserved slot খরচ হয়। বারবার যাচাইয়ে আবার কাটে না। Refund করলে খরচ হওয়া allowance ফেরত আসে না।")],
   [t("What does reserved mean?","Reserved মানে কী?"),t("An open checkout temporarily reserves a slot. Unpaid expired or cancelled checkouts release it. This protects customers who are already paying.","খোলা checkout-এর জন্য একটি slot সাময়িক সংরক্ষিত থাকে। টাকা না দেওয়া checkout বাতিল বা মেয়াদ শেষ হলে slot ফিরে আসে।")],
   [t("What if my allowance runs out?","Allowance শেষ হলে কী হবে?"),t("Upgrade before creating another checkout. Existing accepted payments, verification and webhook delivery continue. There are no automatic overage charges.","নতুন checkout তৈরির আগে upgrade করুন। আগের পেমেন্টের processing, verification ও webhook চলবে। অনুমতি ছাড়া অতিরিক্ত চার্জ হয় না।")],
   [t("Does unused allowance roll over?","অব্যবহৃত allowance কি জমে?"),t("No. It resets at the allowance period shown on your plan. API safety and concurrent-checkout limits also apply.","না। প্ল্যানে উল্লেখ করা ব্যবহার মেয়াদে allowance নতুন হয়। API নিরাপত্তা ও একসঙ্গে খোলা checkout-এর সীমাও প্রযোজ্য।")],
   [t("When does a paid change apply?","Paid প্ল্যান পরিবর্তন কখন হবে?"),t("After verified payment. Renewing the same purchased version extends its access; buying another version replaces the current terms immediately. There is no automatic prorated refund or usage reset within the same allowance period.","পেমেন্ট যাচাইয়ের পর। একই কেনা version নবায়নে মেয়াদ বাড়ে; অন্য version কিনলে তখনই বর্তমান শর্ত বদলায়। নিজে থেকে আনুপাতিক refund হয় না এবং একই allowance মেয়াদে আগের ব্যবহার মুছে যায় না।")]
  ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>}
 </section>
}
