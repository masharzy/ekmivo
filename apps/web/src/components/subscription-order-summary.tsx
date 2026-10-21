"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import type {BillingActivation} from "../lib/billing-activation";
import {verifiedSubscriptionQuote,allPoliciesAccepted,type SubscriptionQuote} from "../lib/subscription-order";
import type {PaymentPlan} from "../lib/payment-plans";
import "./subscription-order-summary.css";

type LegalKey="terms"|"privacy"|"refund";
type LegalLinks=Record<LegalKey,string|null>;
type Data={plans:{id:string;terms:{kind:string}}[];effective?:{active:boolean;plan_id?:string;terms?:{kind:string;amount_minor:number;period_days:number}};scheduled?:{prepaid?:boolean}|null};

export function SubscriptionOrderSummary({locale,plan,storeId,storeName,legalLinks,legalVersions,purchaseEnabled}:{locale:"bn"|"en";plan:PaymentPlan;storeId:string;storeName:string;legalLinks:LegalLinks;legalVersions:Record<LegalKey,string|null>;purchaseEnabled:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const router=useRouter();
 const [cycles,setCycles]=useState(1),[activation,setActivation]=useState<BillingActivation>("now");
 const [quote,setQuote]=useState<SubscriptionQuote|null>(null),[quoteLoading,setQuoteLoading]=useState(plan.terms.kind==="paid");
 const [quoteError,setQuoteError]=useState(""),[paymentError,setPaymentError]=useState(""),[busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0),[state,setState]=useState<Data|null>(null),[consents,setConsents]=useState<Record<LegalKey,boolean>>({terms:false,privacy:false,refund:false});
 const key=useRef<{quoteId:string;value:string}|null>(null);
 const base=`/api/go/workspaces/${storeId}/billing`;
 const money=(minor:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
 const qty=new Intl.NumberFormat(bn?"bn-BD":"en-US").format(cycles);
 const isPaid=plan.terms.kind==="paid";
 const linksReady=Object.values(legalLinks).every(Boolean);
 const consentsReady=allPoliciesAccepted(legalLinks,consents);
 const quoteReady=isPaid?verifiedSubscriptionQuote(quote,plan.id,cycles,activation):false;
 const total=quoteReady&&quote?quote.amount_minor:plan.terms.amount_minor*cycles;
 const subtotal=plan.terms.amount_minor*cycles;
 const proration=quoteReady&&quote&&quote.operation==="upgrade"?Math.max(0,subtotal-total):0;
 const currentActive=Boolean(state?.effective?.active);
 const lowerPlan=Boolean(currentActive&&state?.effective?.terms&&plan.terms.amount_minor/plan.terms.period_days<=state.effective.terms.amount_minor/state.effective.terms.period_days&&state.effective.plan_id!==plan.id);
 const alreadyOnPlan=state?.effective?.plan_id===plan.id&&state.effective.active;

 useEffect(()=>{
  const abort=new AbortController();
  void fetch(base,{cache:"no-store",signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<Data>}).then(data=>{if(!abort.signal.aborted)setState(data)}).catch(()=>{if(!abort.signal.aborted)setQuoteError(t("Your billing account is unavailable. Retry.","আপনার বিলিং তথ্য পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।"))});
  return ()=>abort.abort();
 // Account status is read after each manual retry.
 },[base,revision,t]);

 useEffect(()=>{
  if(!isPaid)return;
  const abort=new AbortController();
  queueMicrotask(()=>{if(!abort.signal.aborted){setQuote(null);setQuoteError("");setQuoteLoading(true);key.current=null;}});
  void fetch(`${base}/quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_id:plan.id,cycles,activation_timing:activation}),signal:abort.signal}).then(async response=>{
   if(!response.ok)throw new Error(String(response.status));return response.json() as Promise<SubscriptionQuote>;
  }).then(result=>{if(!abort.signal.aborted&&result.plan_id===plan.id&&result.cycle_count===cycles)setQuote(result);else if(!abort.signal.aborted)throw Error("QUOTE_MISMATCH")}).catch(()=>{if(!abort.signal.aborted)setQuoteError(t("A verified price is unavailable. Please retry before paying.","যাচাই করা মূল্য পাওয়া যায়নি। পেমেন্টের আগে আবার চেষ্টা করুন।"))}).finally(()=>{if(!abort.signal.aborted)setQuoteLoading(false)});
  return ()=>abort.abort();
 },[base,plan.id,isPaid,cycles,activation,revision,t]);

 const duration=useMemo(()=>plan.terms.period_days*cycles,[cycles,plan.terms.period_days]);

 async function goToPayment(){
  if(busy||!purchaseEnabled||!consentsReady||quoteLoading||!state)return;
  if(isPaid&&!quoteReady)return;
  setPaymentError("");setBusy(true);
  try{
   if(!isPaid){
    const response=await fetch(`${base}/free`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_id:plan.id}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`FREE_ACTIVATION_${response.status}`);
    router.push("/dashboard");return;
   }
   if(!verifiedSubscriptionQuote(quote,plan.id,cycles,activation))throw Error("QUOTE_EXPIRED");
   if(key.current?.quoteId!==quote.id)key.current={quoteId:quote.id,value:crypto.randomUUID()};
   const response=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key.current.value},body:JSON.stringify({quote_id:quote.id}),signal:AbortSignal.timeout(15000)});
   const result=await response.json().catch(()=>null) as {checkout_token?:string;error?:{code?:string}}|null;
   if(!response.ok)throw Error(result?.error?.code||`CHECKOUT_${response.status}`);
   if(!result?.checkout_token||!/^[A-Za-z0-9_-]{43}$/.test(result.checkout_token))throw Error("CHECKOUT_UNCONFIRMED");
   key.current=null;
   router.push(`/pay/subscription/${result.checkout_token}`);
  }catch(error){
   const code=error instanceof Error?error.message:"UNKNOWN";
   setPaymentError(code==="BILLING_STATE_CHANGED"?t("The plan changed. Review the price and invoices before retrying.","প্ল্যান বদলেছে। আবার চেষ্টা করার আগে মূল্য ও ইনভয়েস দেখুন।"):t("Payment was not confirmed. Check your invoices before retrying.","পেমেন্ট নিশ্চিত হয়নি। আবার চেষ্টা করার আগে ইনভয়েস দেখুন।")+` (${code})`);
  }finally{setBusy(false)}
 }

 function consent(key:LegalKey,label:string){const href=legalLinks[key];return <label className="ek-order-consent" key={key}><input type="checkbox" checked={consents[key]} onChange={event=>setConsents(current=>({...current,[key]:event.target.checked}))} disabled={!href||busy}/><span>{t("I have read and agree to the","আমি পড়েছি ও সম্মতি দিচ্ছি:")} {href?<a href={href} target="_blank" rel="noopener noreferrer">{label}{legalVersions[key]?` (${legalVersions[key]})`:""}</a>:<span>{label}</span>}</span></label>}

 return <main className="ek-order" lang={locale}>
  <div className="ek-order-shell">
   <nav className="ek-order-nav" aria-label={t("Checkout","চেকআউট")}><Link className="ek-order-brand" href="/">ekmivo<span>.</span></Link><span className="ek-order-secure">{t("Secure order review","নিরাপদ অর্ডার রিভিউ")}</span></nav>
   <div className="ek-order-head"><p>{t("Step 1 of 2 · Order summary","ধাপ ১/২ · অর্ডার সামারি")}</p><h1>{t("Review your order","আপনার অর্ডার যাচাই করুন")}</h1><span>{t("See your exact total before choosing how to pay.","পেমেন্ট মেথড বেছে নেওয়ার আগে পুরো হিসাব দেখুন।")}</span></div>
   <div className="ek-order-grid"><section className="ek-order-card" aria-labelledby="ek-order-detail-heading">
    <div className="ek-order-cardhead"><h2 id="ek-order-detail-heading">{t("Order details","অর্ডারের বিবরণ")}</h2><Link href="/pricing">{t("Change plan","প্ল্যান পরিবর্তন")}</Link></div>
    <div className="ek-order-product"><div className="ek-order-product-icon">E</div><div><h3>{bn?plan.terms.name_bn||plan.terms.name:plan.terms.name}</h3><p>{bn?plan.terms.description_bn||plan.terms.description:plan.terms.description}</p></div><strong>{isPaid?money(plan.terms.amount_minor):t("Free","ফ্রি")}</strong></div>
    <div className="ek-order-field"><span>{t("For your store","আপনার স্টোরের জন্য")}</span><strong>{storeName}</strong></div>
    {isPaid&&<><fieldset className="ek-order-period"><legend>{t("Billing duration","বিলিং মেয়াদ")}</legend><div>{[1,3,6].map(count=><button key={count} type="button" disabled={busy} aria-pressed={cycles===count} onClick={()=>setCycles(count)}>{count===1?t("1 period","১ মেয়াদ"):t(`${count} periods`,`${count} মেয়াদ`)}</button>)}</div><small>{t(`One period is ${plan.terms.period_days} days. Longer terms currently have no advertised discount.`,`প্রতি মেয়াদ ${plan.terms.period_days} দিন। একাধিক মেয়াদের জন্য এখন কোনো ঘোষিত ছাড় নেই।`)}</small></fieldset>
    {currentActive&&!alreadyOnPlan&&<fieldset className="ek-order-period"><legend>{t("When should the new plan start?","নতুন প্ল্যান কখন শুরু হবে?")}</legend><div><button type="button" disabled={busy} aria-pressed={activation==="now"} onClick={()=>setActivation("now")}>{t("After payment","পেমেন্টের পর")}</button><button type="button" disabled={busy} aria-pressed={activation==="period_end"} onClick={()=>setActivation("period_end")}>{t("After current term","বর্তমান মেয়াদ শেষে")}</button></div></fieldset>}</>}
    <div className="ek-order-coupon"><label htmlFor="ek-order-coupon-code">{t("Coupon code","কুপন কোড")}</label><div><input id="ek-order-coupon-code" placeholder={t("Coupon support coming soon","শিগগিরই কুপন চালু হবে")} autoComplete="off" disabled aria-describedby="ek-order-coupon-info"/><button disabled>{t("Apply","প্রয়োগ")}</button></div><small id="ek-order-coupon-info">{t("Coupon redemption is not enabled until the admin-backed validation service is ready.","অ্যাডমিন-নিয়ন্ত্রিত ভ্যালিডেশন চালু হলে কুপন ব্যবহার করা যাবে।")}</small></div>
    <div className="ek-order-paywith"><p>{t("Payment provider","পেমেন্ট প্রোভাইডার")}</p><label><input type="radio" name="provider" value="ekmivo" checked readOnly/><span className="ek-order-provider-name"><b>Pay with Ekmivo</b><small>{t("Payment methods are shown on the next secure page.","পেমেন্টের মেথড পরের নিরাপদ পেজে দেখানো হবে।")}</small></span></label></div>
    <fieldset className="ek-order-legal"><legend>{t("Review and accept","পড়ুন ও সম্মতি দিন")}</legend>
     {consent("terms",t("Terms of Service","সেবার শর্তাবলি"))}
     {consent("privacy",t("Privacy Policy","গোপনীয়তা নীতি"))}
     {consent("refund",t("Refund Policy","রিফান্ড নীতি"))}
     {!linksReady&&<p role="alert" className="ek-order-warning">{t("The three published policy URLs must be configured before we can take payment.","পেমেন্ট চালুর আগে তিনটি প্রকাশিত পলিসির লিংক কনফিগার করতে হবে।")}</p>}
    </fieldset>
   </section><aside className="ek-order-card ek-order-totals" aria-label={t("Payment summary","পেমেন্ট সামারি")}>
    <h2>{t("Payment summary","পেমেন্ট সামারি")}</h2>
    <div className="ek-order-line"><span>{t("Plan price","প্ল্যানের মূল্য")}</span><strong>{money(plan.terms.amount_minor)}</strong></div>
    <div className="ek-order-line"><span>{t("Quantity / terms","পরিমাণ / মেয়াদ")}</span><strong>{qty}</strong></div>
    <div className="ek-order-line"><span>{t("Duration","সময়কাল")}</span><strong>{new Intl.NumberFormat(bn?"bn-BD":"en-US").format(duration)} {t("days","দিন")}</strong></div>
    <div className="ek-order-separator"/>
    <div className="ek-order-line"><span>{t("Subtotal","সাবটোটাল")}</span><strong>{money(subtotal)}</strong></div>
    {proration>0&&<div className="ek-order-line ek-order-saving"><span>{t("Proration adjustment","আনুপাতিক মূল্য সমন্বয়")}</span><strong>−{money(proration)}</strong></div>}
    <div className="ek-order-line"><span>{t("Annual / bundle discount","বার্ষিক / বান্ডল ছাড়")}</span><strong>{t("Not applied","প্রযোজ্য নয়")}</strong></div>
    <div className="ek-order-line"><span>{t("Coupon discount","কুপন ছাড়")}</span><strong>{money(0)}</strong></div>
    <div className="ek-order-line"><span>{t("Tax","ট্যাক্স")}</span><strong>{t("Not separately charged","আলাদা চার্জ নেই")}</strong></div>
    <div className="ek-order-separator"/>
    <div className="ek-order-line ek-order-grand"><span>{t("Total due","মোট পরিশোধযোগ্য")}</span><strong>{quoteReady||!isPaid?money(total):"—"}</strong></div>
    {quoteLoading&&<p role="status" className="ek-order-message">{t("Verifying current price…","বর্তমান দাম যাচাই করা হচ্ছে…")}</p>}
    {quoteError&&<p role="alert" className="ek-order-message ek-order-warning">{quoteError}</p>}
    {paymentError&&<p role="alert" className="ek-order-message ek-order-warning">{paymentError}</p>}
    {!purchaseEnabled&&<p className="ek-order-message ek-order-warning" role="status">{t("Preview only. The secure order confirmation and coupon engine are not yet released; use Billing for existing plan payments.","এটি প্রিভিউ। নিরাপদ অর্ডার কনফার্মেশন ও কুপন ইঞ্জিন এখনো রিলিজ হয়নি; বর্তমান পেমেন্টের জন্য বিলিং ব্যবহার করুন।")}</p>}
    {lowerPlan&&<p className="ek-order-message ek-order-warning">{t("Downgrades begin after your current term; manage them from billing.","ডাউনগ্রেড বর্তমান মেয়াদ শেষে শুরু হয়; বিলিং থেকে পরিবর্তন করুন।")}</p>}
    {alreadyOnPlan&&<p className="ek-order-message">{t("You already use this plan; this payment will renew your subscription.","আপনি এই প্ল্যান ব্যবহার করছেন; এটি নবায়ন করবে।")}</p>}
    <button className="ek-order-submit" type="button" onClick={()=>void goToPayment()} disabled={!purchaseEnabled||busy||quoteLoading||!state||!consentsReady||(isPaid&&!quoteReady)||lowerPlan||!!quoteError}>{busy?t("Processing…","প্রক্রিয়াধীন…"):isPaid?t("Go to Pay","পেমেন্টে যান"):t("Activate free plan","ফ্রি প্ল্যান চালু করুন")}</button>
    <button className="ek-order-retry" type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>{t("Refresh verified total","যাচাই করা দাম রিফ্রেশ")}</button>
    <p className="ek-order-note">{t("No money is collected on this page. You will choose bKash, Nagad or Rocket on the next page if those receiving methods are enabled.","এই পেজে টাকা নেওয়া হয় না। পরের পেজে চালু থাকা বিকাশ, নগদ বা রকেট মেথড বেছে নিতে পারবেন।")}</p>
   </aside></div>
  </div>
 </main>;
}
