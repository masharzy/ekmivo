import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../../lib/server/auth";
import {publicPaymentPlans} from "../../../../../lib/server/payment-plans";
import {SubscriptionOrderSummary} from "../../../../../components/subscription-order-summary";
import {FreePurchaseClaim} from "../../../../../components/free-purchase-claim";
import {publishedSubscriptionPolicies} from "../../../../../lib/server/subscription-policies";
import {resumePurchase,validPurchaseToken,IntentError} from "../../../../../lib/server/purchase-intents";
import "../../../../../components/subscription-order-summary.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review your order · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};

export default async function SubscriptionOrderPage({params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale:raw,plan}=await params;
 if(raw!=="bn"&&raw!=="en")notFound();
 const locale=raw as "bn"|"en",bn=locale==="bn";
 if(validPurchaseToken(plan)){
  let flow:Awaited<ReturnType<typeof resumePurchase>>;
  try{flow=await resumePurchase(plan)}
  catch(error){
   const code=error instanceof IntentError?error.code:"PURCHASE_INTENT_UNAVAILABLE";
   const messages:Record<string,[string,string]>={
    INTENT_EXPIRED:["Your selection expired. Choose a current offer to continue.","আপনার নির্বাচনটির মেয়াদ শেষ। আবার অফার বেছে নিন।"],
    OFFER_CHANGED:["The offer price or version changed. Please select a current offer.","অফারের দাম বা সংস্করণ বদলেছে। নতুন অফার নির্বাচন করুন।"],
    OFFER_UNAVAILABLE:["This offer is no longer available.","এই অফারটি এখন আর পাওয়া যাচ্ছে না।"],
    COUPON_UNAVAILABLE:["The selected coupon is no longer eligible. Choose an offer to retry.","নির্বাচিত কুপনটি আর প্রযোজ্য নয়। আবার অফার বেছে নিন।"]
   };
   const msg=messages[code]||["This purchase cannot be resumed. No payment has been started.","এই কেনাকাটা আবার চালু করা যাচ্ছে না। কোনো পেমেন্ট শুরু হয়নি।"];
   return <main className="ek-order" lang={locale}><div className="ek-order-shell">
    <nav className="ek-order-nav"><Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link></nav>
    <section className="ek-order-card"><h1>{bn?"নির্বাচনটি যাচাই করুন":"Review your selection"}</h1>
     <p role="alert">{bn?msg[1]:msg[0]}</p><Link href="/pricing">{bn?"বর্তমান অফার দেখুন":"See current offers"}</Link>
    </section></div></main>;
  }
  if(flow.stage!=="summary")redirect(flow.stage==="login"?"/login":flow.stage==="verify"?"/verify-email":flow.stage==="store"?"/workspaces":"/setup");
  const choice=flow.intent;
  const [store,freeCatalog]=await Promise.all([preferredWorkspaceFor(choice.actorId!),publicPaymentPlans()]);
  const freeReady=choice.product==="payments"&&choice.quantity===1&&choice.amountMinor===0&&!choice.couponCode&&
   !freeCatalog.unavailable&&freeCatalog.plans.some(item=>item.version_id===choice.gatewayPlanVersionId&&item.terms.kind==="free");
  const money=new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(choice.amountMinor/100);
  const title=choice.product==="payments"?(bn?"পেমেন্টস":"Payments"):choice.product==="ai_credit"?(bn?"এআই প্রিপেইড ক্রেডিট":"AI prepaid credits"):(bn?"বান্ডল":"Bundle");
  const term=choice.term==="one_time"?(bn?"এককালীন":"One-time"):choice.term==="yearly"?(bn?"বার্ষিক":"Yearly"):(bn?"মাসিক":"Monthly");
  return <main className="ek-order" lang={locale}><div className="ek-order-shell">
   <nav className="ek-order-nav" aria-label={bn?"অর্ডার সামারি":"Order summary"}>
    <Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link>
    <span className="ek-order-secure">{bn?"নিরাপদ অর্ডার রিভিউ":"Secure order review"}</span>
   </nav>
   <div className="ek-order-head"><p>{bn?"ধাপ ১/২ · অর্ডার সামারি":"Step 1 of 2 · Order summary"}</p>
    <h1>{bn?"আপনার নির্বাচিত অফার":"Your selected offer"}</h1>
    <span>{bn?"নির্বাচনটি আপনার অ্যাকাউন্ট ও স্টোরে সুরক্ষিত আছে।":"Your selection is safely associated with your account and Store."}</span>
   </div>
   <section className="ek-order-card" aria-labelledby="purchase-heading">
    <div className="ek-order-cardhead"><h2 id="purchase-heading">{bn?"অর্ডারের বিবরণ":"Order details"}</h2>
     <Link href="/pricing">{bn?"অফার পরিবর্তন":"Change offer"}</Link></div>
    <div className="ek-order-product"><div className="ek-order-product-icon" aria-hidden="true">E</div>
     <div><h3>{title}</h3><p>{term}</p></div></div>
    <div className="ek-order-field"><span>{bn?"স্টোর":"Store"}</span><strong>{store?.name|| (bn?"আপনার স্টোর":"Your Store")}</strong></div>
    <div className="ek-order-field"><span>{bn?"পরিমাণ":"Quantity"}</span><strong>{choice.quantity}</strong></div>
    <div className="ek-order-field"><span>{bn?"প্রকাশিত ইউনিট মূল্য":"Published unit price"}</span><strong>{money}</strong></div>
    <div className="ek-order-field"><span>{bn?"নির্বাচিত কুপন":"Selected coupon"}</span><strong>{choice.couponCode||"—"}</strong></div>
    <p role="status">{bn?"পেমেন্টের মোট মূল্য এখনো সার্ভার থেকে যাচাই করা হয়নি। বার্ষিক/বান্ডল ছাড়, কুপন, ট্যাক্স ও প্রোরেশনসহ চূড়ান্ত মূল্য নিশ্চিত হওয়ার আগে পেমেন্ট শুরু করা যাবে না।":"The server has not issued a final payable quote. No payment can start until discounts, coupon, tax and proration have been verified by the authoritative billing engine."}</p>
    {freeReady?<FreePurchaseClaim token={plan} locale={locale}/>:<Link href="/pricing">{bn?"অফারগুলো দেখুন":"View offers"}</Link>}
   </section>
  </div></main>;
 }
 if(!/^[a-z][a-z0-9_-]{1,39}$/.test(plan))notFound();
 const user=await requireUser(locale);
 const [{plans,unavailable},workspace,policies]=await Promise.all([publicPaymentPlans(),preferredWorkspaceFor(user.id),publishedSubscriptionPolicies()]);
 if(unavailable)throw new Error("Public pricing is unavailable");
 const selected=plans.find(item=>item.id===plan);
 if(!selected)notFound();
 if(selected.terms.kind==="custom")redirect("/pricing");
 if(!workspace||!(["commerce","both"] as string[]).includes(workspace.mode))redirect("/workspaces/open");
 if(workspace.role!=="owner"&&workspace.role!=="admin")redirect("/pricing");
 return <SubscriptionOrderSummary locale={locale} plan={selected} storeId={workspace.id}
  storeName={workspace.name} purchaseEnabled={false}
  legalLinks={{terms:policies.terms?.url||null,privacy:policies.privacy?.url||null,refund:policies.refund?.url||null}}
  legalVersions={{terms:policies.terms?.version||null,privacy:policies.privacy?.version||null,refund:policies.refund?.version||null}}/>;
}
