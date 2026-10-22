import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor,primaryStoreFor} from "../../../../../lib/server/auth";
import {publicPaymentPlans} from "../../../../../lib/server/payment-plans";
import {resumePurchase,readPurchase,validPurchaseToken,IntentError,type Intent} from "../../../../../lib/server/purchase-intents";
import {SubscriptionOrderSummary} from "../../../../../components/subscription-order-summary";
import {FreePurchaseClaim} from "../../../../../components/free-purchase-claim";
import "../../../../../components/subscription-order-summary.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review your order · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};

function SelectionUnavailable({locale,code}:{locale:"bn"|"en";code:string}){
 const bn=locale==="bn";
 const messages:Record<string,[string,string]>={
  INTENT_EXPIRED:["Your selection expired. Choose a current offer to continue.","আপনার নির্বাচনের মেয়াদ শেষ। আবার অফার বেছে নিন।"],
  OFFER_CHANGED:["The published offer changed. Please select the current version.","অফারের নতুন সংস্করণ এসেছে। বর্তমান অফার বেছে নিন।"],
  OFFER_UNAVAILABLE:["This offer is no longer available.","এই অফারটি এখন আর পাওয়া যাচ্ছে না।"],
  COUPON_UNAVAILABLE:["The selected coupon is no longer eligible.","নির্বাচিত কুপনটি আর প্রযোজ্য নয়।"],
 };
 const message=messages[code]||["This purchase cannot be resumed. No payment has been started.","এই কেনাকাটা আবার চালু করা যাচ্ছে না। কোনো পেমেন্ট শুরু হয়নি।"];
 return <main className="ek-order" lang={locale}><div className="ek-order-shell">
  <nav className="ek-order-nav"><Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link></nav>
  <section className="ek-order-card"><h1>{bn?"নির্বাচনটি যাচাই করুন":"Review your selection"}</h1>
   <p role="alert">{message[bn?1:0]}</p><Link href="/pricing">{bn?"বর্তমান অফার দেখুন":"See current offers"}</Link>
  </section></div></main>;
}

function FreeOfferSummary({locale,intent,storeName,token}:{locale:"bn"|"en";intent:Intent;storeName:string;token:string}){
 const bn=locale==="bn";
 return <main className="ek-order" lang={locale}><div className="ek-order-shell">
  <nav className="ek-order-nav"><Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link>
   <span className="ek-order-secure">{bn?"নিরাপদ অর্ডার রিভিউ":"Secure order review"}</span></nav>
  <div className="ek-order-head"><p>{bn?"বিনামূল্যের প্ল্যান":"Free plan"}</p>
   <h1>{bn?"আপনার নির্বাচিত অফার":"Your selected offer"}</h1></div>
  <section className="ek-order-card" aria-labelledby="free-purchase-heading">
   <div className="ek-order-cardhead"><h2 id="free-purchase-heading">{bn?"পেমেন্টস · বিনামূল্যে":"Payments · Free"}</h2>
    <Link href="/pricing">{bn?"অফার পরিবর্তন":"Change offer"}</Link></div>
   <div className="ek-order-field"><span>{bn?"স্টোর":"Store"}</span><strong>{storeName}</strong></div>
   <div className="ek-order-field"><span>{bn?"পরিমাণ":"Quantity"}</span><strong>{intent.quantity}</strong></div>
   <div className="ek-order-field"><span>{bn?"প্রকাশিত মূল্য":"Published price"}</span><strong>৳0</strong></div>
   <p>{bn?"বিনামূল্যের ক্লেইম পেমেন্ট নয়। এই ধাপে কোনো ওয়ালেট বা ইনভয়েস তৈরি হয় না।":"Claiming this free plan is not a payment; no wallet payment or invoice is created here."}</p>
   <FreePurchaseClaim token={token} locale={locale}/>
  </section></div></main>;
}

export default async function SubscriptionOrderPage({params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale:raw,plan}=await params;
 if(raw!=="bn"&&raw!=="en")notFound();
 const locale=raw as "bn"|"en";
 // Legacy plan names are entry routes, never a buyer-owned purchase capability.
 if(!validPurchaseToken(plan)){
  if(/^[a-z][a-z0-9_-]{1,39}$/.test(plan))redirect(`/subscribe/${plan}`);
  notFound();
 }
 let intent:Intent;
 try{
  const flow=await resumePurchase(plan);
  if(flow.stage!=="summary")redirect(flow.stage==="login"?"/login":flow.stage==="verify"?"/verify-email":flow.stage==="store"?"/workspaces":"/setup");
  intent=flow.intent;
 }catch(error){
  if(error instanceof IntentError&&error.code==="INTENT_CONFIRMED"){
   try{intent=await readPurchase(plan)}catch{return <SelectionUnavailable locale={locale} code="INTENT_UNAVAILABLE"/>;}
  }else if(error instanceof IntentError){
   return <SelectionUnavailable locale={locale} code={error.code}/>;
  }else throw error;
 }
 const user=await requireUser(locale);
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace)redirect("/workspaces/open");
 if(workspace.role!=="owner"&&workspace.role!=="admin")notFound();
 const primary=await primaryStoreFor(user.id);
 if(primary!==workspace.id||intent.actorId!==user.id||intent.storeId!==workspace.id)notFound();
 // The free entitlement is Phase 4's distinct claim flow, not a zero-due paid invoice.
 if(intent.product==="payments"&&intent.quantity===1&&intent.amountMinor===0&&
  !intent.couponCode&&intent.status==="selected"){
  const catalog=await publicPaymentPlans();
  if(!catalog.unavailable&&catalog.plans.some(item=>item.version_id===intent.gatewayPlanVersionId&&item.terms.kind==="free"))
   return <FreeOfferSummary locale={locale} intent={intent} storeName={workspace.name} token={plan}/>;
 }
 return <SubscriptionOrderSummary locale={locale} intentId={intent.id} storeId={workspace.id} storeName={workspace.name}/>;
}
