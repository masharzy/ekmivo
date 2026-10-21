import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../../lib/server/auth";
import {publicSubscriptionOffers} from "../../../../../lib/server/public-subscription-offers";
import {publishedSubscriptionPolicies} from "../../../../../lib/server/subscription-policies";
import {quotePublishedPrice} from "../../../../../lib/public-subscription-quote";
import {priceInBdt,publishedPriceComparison,type SubscriptionTerm} from "../../../../../lib/public-subscription-offers";
import "../../../../../components/subscription-order-summary.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Published price review · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};

export default async function PublishedOfferReview({params,searchParams}:{
 params:Promise<{locale:string;offer:string}>;
 searchParams:Promise<{version?:string|string[];term?:string|string[]}>;
}){
 const [{locale,offer},query]=await Promise.all([params,searchParams]);
 if((locale!=="bn"&&locale!=="en")||!/^[a-z][a-z0-9_-]{2,63}$/.test(offer))notFound();
 const version=typeof query.version==="string"?query.version:"";
 const term=typeof query.term==="string"?query.term:"";
 const user=await requireUser(locale);
 const [catalog,store,policies]=await Promise.all([
  publicSubscriptionOffers(),preferredWorkspaceFor(user.id),publishedSubscriptionPolicies()
 ]);
 if(catalog.unavailable)throw new Error("Published subscription catalog unavailable");
 if(!store)redirect("/workspaces/open");
 if(store.role!=="owner"&&store.role!=="admin")redirect("/pricing");
 const result=quotePublishedPrice(catalog.offers,{key:offer,version_id:version,term:term as SubscriptionTerm});
 if(result.status==="invalid"||result.status==="not_found")notFound();
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const current=result.status==="ok"?result.offer:null;
 const validPrice=current?priceInBdt(current.amount_minor,locale):null;
 const name=current?(bn&&current.name_bn?current.name_bn:current.name):"";
 const description=current?(bn&&current.description_bn?current.description_bn:current.description):"";
 const comparison=current?publishedPriceComparison(catalog.offers,current):null;
 const legal=[
  {key:"tos",label:t("Terms of Service","সেবার শর্তাবলি"),document:policies.terms},
  {key:"privacy",label:t("Privacy Policy","গোপনীয়তা নীতি"),document:policies.privacy},
  {key:"refund",label:t("Refund Policy","রিফান্ড নীতি"),document:policies.refund}
 ];
 return <main className="ek-order" lang={locale}>
  <div className="ek-order-shell">
   <nav className="ek-order-nav" aria-label={t("Price review","মূল্য পর্যালোচনা")}>
    <Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link>
    <span className="ek-order-secure">{t("Read-only approved price","অনুমোদিত মূল্য—শুধু পর্যালোচনা")}</span>
   </nav>
   <div className="ek-order-head"><p>{t("Subscription offer","সাবস্ক্রিপশন অফার")}</p>
    <h1>{t("Review your selected offer","আপনার নির্বাচিত অফার দেখুন")}</h1>
    <span>{t("This is the published price, not yet a final checkout or payable invoice.","এটি প্রকাশিত মূল্য; এখনো চূড়ান্ত চেকআউট বা পরিশোধযোগ্য ইনভয়েস নয়।")}</span>
   </div>
   {result.status==="price_changed"?<section className="ek-order-card" role="status">
    <h2>{t("The offer has changed","অফারটি পরিবর্তিত হয়েছে")}</h2>
    <p>{t("The selected version is no longer current. Choose the latest offer before continuing.","নির্বাচিত সংস্করণ আর বর্তমান নয়। এগোনোর আগে নতুন অফার বেছে নিন।")}</p>
    <Link href="/pricing">{t("Review current pricing","বর্তমান মূল্য দেখুন")}</Link>
   </section>:
   <div className="ek-order-grid">
    <section className="ek-order-card" aria-labelledby="ek-order-detail-heading">
     <div className="ek-order-cardhead"><h2 id="ek-order-detail-heading">{t("Your order details","অর্ডারের বিবরণ")}</h2><Link href="/pricing">{t("Change offer","অফার পরিবর্তন")}</Link></div>
     <div className="ek-order-product"><div className="ek-order-product-icon" aria-hidden="true">E</div>
      <div><h3>{name}</h3><p>{description}</p></div>
      <strong>{validPrice}</strong>
     </div>
     <div className="ek-order-field"><span>{t("Store","স্টোর")}</span><strong>{store.name}</strong></div>
     <div className="ek-order-field"><span>{t("Billing term","বিলিং মেয়াদ")}</span><strong>{current?.term==="monthly"?t("Monthly","মাসিক"):current?.term==="yearly"?t("Yearly","বার্ষিক"):t("One-time prepaid","একবারের প্রিপেইড")}</strong></div>
     {current?.included_ai_credits&&<div className="ek-order-field"><span>{t("Included AI credits","অন্তর্ভুক্ত AI ক্রেডিট")}</span><strong>{new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(BigInt(current?.included_ai_credits??"0"))}</strong></div>}
     <div className="ek-order-coupon"><label htmlFor="ek-offer-coupon">{t("Coupon code","কুপন কোড")}</label>
      <div><input id="ek-offer-coupon" disabled placeholder={t("Available at secure checkout","নিরাপদ চেকআউটে পাওয়া যাবে")} aria-describedby="ek-offer-coupon-help"/><button type="button" disabled>{t("Apply","প্রয়োগ")}</button></div>
      <small id="ek-offer-coupon-help">{t("Coupon validation is not enabled on this read-only price preview.","শুধু মূল্য দেখার এই পেজে কুপন প্রয়োগ এখনো চালু হয়নি।")}</small></div>
     <div className="ek-order-paywith"><p>{t("Payment provider","পেমেন্ট প্রোভাইডার")}</p>
      <label><input type="radio" checked readOnly name="provider" value="ekmivo"/><span className="ek-order-provider-name"><b>Pay with Ekmivo</b><small>{t("Wallet choices belong to the next payment page, not this summary.","ওয়ালেট পরের পেমেন্ট পেজে দেখানো হবে, এখানে নয়।")}</small></span></label></div>
     <fieldset className="ek-order-legal"><legend>{t("Legal agreements","নীতিমালায় সম্মতি")}</legend>
      {legal.map(item=><label className="ek-order-consent" key={item.key}>
       <input type="checkbox" disabled/>
       <span>{item.document?.url?<a href={item.document.url} target="_blank" rel="noopener noreferrer">{item.label} ({item.document.version})</a>:item.label}</span>
      </label>)}
      <p className="ek-order-message">{t("Three individual consents will be recorded by the secured order-confirmation service, before any payment.","পেমেন্টের আগে নিরাপদ অর্ডার কনফার্মেশনে তিনটি পৃথক সম্মতি রেকর্ড করা হবে।")}</p>
     </fieldset>
    </section>
    <aside className="ek-order-card ek-order-totals" aria-label={t("Published price summary","প্রকাশিত মূল্যের সামারি")}>
     <h2>{t("Published price summary","প্রকাশিত মূল্যের সামারি")}</h2>
     <div className="ek-order-line"><span>{t("Product","পণ্য")}</span><strong>{name}</strong></div>
     <div className="ek-order-line"><span>{t("Quantity","পরিমাণ")}</span><strong>1</strong></div>
     <div className="ek-order-line"><span>{t("Catalog subtotal","ক্যাটালগ সাবটোটাল")}</span><strong>{validPrice}</strong></div>
     {comparison?.annual_saving_minor&&<div className="ek-order-line ek-order-saving"><span>{t("Yearly saving vs 12 approved months (comparison only)","১২টি অনুমোদিত মাসিক চার্জের তুলনায় বার্ষিক সাশ্রয়")}</span><strong>{priceInBdt(comparison.annual_saving_minor,locale)}</strong></div>}
     {comparison?.bundle_saving_minor&&<div className="ek-order-line ek-order-saving"><span>{t("Bundle saving vs separately published packs (comparison only)","পৃথক প্রকাশিত প্যাকের তুলনায় বান্ডেল সাশ্রয় (শুধু তুলনা)")}</span><strong>{priceInBdt(comparison.bundle_saving_minor,locale)}</strong></div>}
     <div className="ek-order-line"><span>{t("Coupon and tax","কুপন ও কর")}</span><strong>{t("Not quoted yet","এখনো হিসাব হয়নি")}</strong></div>
     <div className="ek-order-separator"/>
     <div className="ek-order-line ek-order-grand"><span>{t("Published catalog price","প্রকাশিত ক্যাটালগ মূল্য")}</span><strong>{validPrice}</strong></div>
     <p className="ek-order-message ek-order-warning" role="status">{t("Payment remains disabled until server-side tax, coupon, policy consent and final settlement verification are released.","সার্ভার-সাইড কর, কুপন, পলিসি সম্মতি ও চূড়ান্ত পেমেন্ট যাচাই প্রস্তুত না হওয়া পর্যন্ত পেমেন্ট বন্ধ।")}</p>
     <button className="ek-order-submit" type="button" disabled>{t("Go to Pay","পেমেন্টে যান")}</button>
     <p className="ek-order-note">{t("No charge has been created. This price version is checked again before an order is issued.","কোনো চার্জ তৈরি হয়নি। অর্ডার তৈরির আগে মূল্য সংস্করণ আবার যাচাই হবে।")}</p>
    </aside>
   </div>}
  </div>
 </main>;
}
