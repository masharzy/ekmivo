import type {Locale} from "../lib/site-copy";

export function PaymentEditorialIcon({kind}:{kind:"link"|"phone"|"check"|"code"}){
 return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==="link"?<><path d="m25 39 14-14M23 31l-4 4a10 10 0 0 0 14 14l8-8M41 33l4-4a10 10 0 0 0-14-14l-8 8"/><path d="m11 11 5 5m32 32 5 5M7 31h7m36 2h7"/></>:kind==="phone"?<><rect x="17" y="6" width="30" height="52" rx="7"/><path d="M27 12h10m-8 39h6M24 27l6 6 11-13"/></>:kind==="code"?<><rect x="5" y="12" width="54" height="41" rx="6"/><path d="M5 23h54M23 32l-7 6 7 6m18-12 7 6-7 6m-8-15-4 17"/></>:<><path d="m32 6 20 8v16c0 13-20 24-20 24S12 43 12 30V14l20-8Z"/><path d="m22 30 7 7 14-15"/></>}</svg>;
}

export function PaymentEditorialArt({locale}:{locale:Locale}){
 const bn=locale==="bn",t=(en:string,বাংলা:string)=>bn?বাংলা:en;
 return <div className="pg-art" aria-label={t("Illustration of payment request, checkout and verified receipt","পেমেন্টের অনুরোধ, চেকআউট ও যাচাইয়ের চিত্র")}>
  <svg className="pg-art-path" viewBox="0 0 1000 300" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M135 180C285 50 320 270 505 165S770 60 885 175"/><path className="pg-art-travel" d="M135 180C285 50 320 270 505 165S770 60 885 175"/></svg>
  <div className="pg-art-note pg-art-note-left"><svg viewBox="0 0 100 50" fill="none" aria-hidden="true"><path d="M4 9c48-14 41 38 89 27m-12-9 13 10-16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span>{t("Made for your business","আপনার ব্যবসার জন্য")}</span></div>
  <article className="pg-art-card pg-art-request"><div className="pg-art-card-top"><PaymentEditorialIcon kind="link"/><span>{t("Payment link","পেমেন্ট লিংক")}</span></div><strong>{t("A request.\nReady to share.","পেমেন্টের লিংক।\nশেয়ার করার জন্য তৈরি।")}</strong><div className="pg-art-url"><span aria-hidden="true">↗</span> briofold · checkout</div><div className="pg-art-lines" aria-hidden="true"><i/><i/></div></article>
  <article className="pg-art-card pg-art-checkout"><div className="pg-art-card-top"><span className="pg-art-brand" aria-hidden="true">e.</span><span>{t("Your business","আপনার ব্যবসা")}</span></div><p>{t("Choose how to pay","পেমেন্টের মাধ্যম বেছে নিন")}</p><div className="pg-art-wallets"><span>bKash</span><span>{bn?"নগদ":"Nagad"}</span><span>Rocket</span></div><div className="pg-art-pay">{t("Continue to payment","পেমেন্ট করতে এগিয়ে যান")} <span aria-hidden="true">→</span></div></article>
  <article className="pg-art-card pg-art-result"><div className="pg-art-stamp"><PaymentEditorialIcon kind="check"/></div><strong>{t("Checked.\nConnected.","যাচাই হয়েছে।\nআপডেট পৌঁছেছে।")}</strong><p>{t("Dashboard + webhook","ড্যাশবোর্ড + ওয়েবহুক")}</p></article>
  <span className="pg-art-spark pg-art-spark-one" aria-hidden="true">✳</span><span className="pg-art-spark pg-art-spark-two" aria-hidden="true">✳</span>
  <span className="pg-art-caption">{t("Illustration of the payment flow · no live transaction","পেমেন্ট প্রক্রিয়ার চিত্র · আসল লেনদেন নয়")}</span>
 </div>;
}
