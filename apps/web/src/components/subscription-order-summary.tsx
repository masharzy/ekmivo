"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {allPoliciesAccepted,consentPayload,moneyBDT,orderErrorMessage,
 safePolicyUrl,verifiedLegalDocuments,verifiedSubscriptionQuote,
 type CheckoutPolicy,type OrderRead,type OrderQuote} from "../lib/subscription-order";
import "./subscription-order-summary.css";

type ResponseError={code?:string;error?:{code?:string}};
type ConfirmResult={quote_id?:string;invoice_id?:string;checkout_token?:string;code?:string};
const blankConsents=()=>({terms:false,privacy:false,refund:false});

export function SubscriptionOrderSummary({locale,intentId,storeId,storeName}:{
 locale:"bn"|"en";intentId:string;storeId:string;storeName:string;
}){
 const bn=locale==="bn";
 const t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const router=useRouter();
 const [order,setOrder]=useState<OrderRead|null>(null);
 const [couponInput,setCouponInput]=useState("");
 const [consents,setConsents]=useState<Record<CheckoutPolicy,boolean>>(blankConsents);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [couponError,setCouponError]=useState("");
 const [couponSuccess,setCouponSuccess]=useState("");
 const [tick,setTick]=useState(0);
 const requestSerial=useRef(0);
 const idempotency=useRef<{quote:string;key:string}|null>(null);
 const couponCommand=useRef<{code:string;revision:number;key:string}|null>(null);
 const base=`/api/go/workspaces/${storeId}/subscription-orders/${intentId}`;
 const couponBase=`/api/go/platform/purchase-intents/${intentId}/quote`;
 const paymentBase=`/api/go/workspaces/${storeId}/subscription-purchases/${intentId}/payment`;
 const money=(minor:string)=>moneyBDT(minor,locale);
 const quote:OrderQuote|null=order?.quote??null;
 const quoteReady=verifiedSubscriptionQuote(quote);
 const legalReady=verifiedLegalDocuments(order?.policies);
 const agreed=allPoliciesAccepted(order?.policies??null,consents);
 const confirmed=order?.status==="confirmed";
 const checkoutEnabled=order?.checkout_enabled===true;
 const currencyOkay=confirmed?Boolean(order?.quote_id&&order?.invoice_id):quoteReady&&quote?.currency==="BDT";

 const read=useCallback(async(signal?:AbortSignal):Promise<OrderRead>=>{
  const response=await fetch(base,{cache:"no-store",signal});
  const data=await response.json().catch(()=>({})) as OrderRead&ResponseError;
  if(!response.ok)throw Error(data.code||data.error?.code||`ORDER_${response.status}`);
  if(data.status!=="confirmed"&&(!data.intent_id||data.store_id!==storeId||!data.offer))throw Error("ORDER_MISMATCH");
  return data;
 },[base,storeId]);

 const post=useCallback(async(path:"quote"|"confirm",payload:object,key?:string)=>{
  const response=await fetch(`${base}/${path}`,{method:"POST",headers:{"Content-Type":"application/json",
   ...(key?{"Idempotency-Key":key}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),cache:"no-store"});
  const data=await response.json().catch(()=>({})) as ConfirmResult&ResponseError;
  if(!response.ok)throw Error(data.code||data.error?.code||`ORDER_${response.status}`);
  return data;
 },[base]);

 const postCoupon=useCallback(async(code:string,revision:number,key:string)=>{
  const response=await fetch(couponBase,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({operation_key:key,revision,coupon_code:code}),
   signal:AbortSignal.timeout(15000),cache:"no-store"});
  const data=await response.json().catch(()=>({})) as ResponseError;
  if(!response.ok)throw Error(data.code||data.error?.code||`COUPON_${response.status}`);
 },[couponBase]);

 const load=useCallback(async()=>{
  const serial=++requestSerial.current;
  setLoading(true);setError("");
  try{
   let data=await read();
   if(data.status!=="confirmed"&&(!data.quote||!verifiedSubscriptionQuote(data.quote))){
    await post("quote",{});
    data=await read();
   }
   if(data.status!=="confirmed"&&data.selected_coupon_code&&
    data.quote?.coupon_code!==data.selected_coupon_code&&data.intent_revision&&verifiedSubscriptionQuote(data.quote)){
    // Phase 4's retained selection is applied through Phase 3 exactly once.
    try{
     const code=data.selected_coupon_code;
     const command=couponCommand.current?.code===code&&couponCommand.current.revision===data.intent_revision
      ?couponCommand.current:{code,revision:data.intent_revision,key:crypto.randomUUID()};
     couponCommand.current=command;
     await postCoupon(command.code,command.revision,command.key);
     data=await read();couponCommand.current=null;
    }catch(caught){setCouponError(orderErrorMessage(caught instanceof Error?caught.message:"",bn));}
   }
   if(serial===requestSerial.current){
    setOrder(data);setCouponInput(data.quote?.coupon_code||data.selected_coupon_code||"");
    if(!verifiedLegalDocuments(data.policies))setError(orderErrorMessage("POLICY_UNAVAILABLE",bn));
   }
  }catch(caught){if(serial===requestSerial.current){setOrder(null);setError(orderErrorMessage(caught instanceof Error?caught.message:"",bn));}}
  finally{if(serial===requestSerial.current)setLoading(false);}
 },[read,post,postCoupon,bn]);
 useEffect(()=>{
  const initial=requestSerial.current;
  queueMicrotask(()=>{if(requestSerial.current===initial)void load();});
  return ()=>{requestSerial.current=initial+2;};
 },[load,tick]);

 async function changeCoupon(code:string){
  if(busy||loading||confirmed)return;
  setBusy(true);setCouponError("");setCouponSuccess("");setError("");
  try{
   if(!order?.intent_revision||!verifiedSubscriptionQuote(order.quote))throw Error("QUOTE_REQUIRED");
   const command=couponCommand.current?.code===code&&couponCommand.current.revision===order.intent_revision
    ?couponCommand.current:{code,revision:order.intent_revision,key:crypto.randomUUID()};
   couponCommand.current=command;
   await postCoupon(command.code,command.revision,command.key);
   const data=await read();
   if(data.quote?.coupon_code!==(code||null))throw Error("QUOTE_CHANGED");
   setOrder(data);setCouponInput(data.quote?.coupon_code||"");couponCommand.current=null;
   setConsents(blankConsents());idempotency.current=null;
   setCouponSuccess(code?t("Coupon applied. The server recalculated your total.","কুপন প্রয়োগ হয়েছে। সার্ভার নতুন মোট হিসাব করেছে।"):t("Coupon removed. Total recalculated.","কুপন সরানো হয়েছে। নতুন মোট হিসাব হয়েছে।"));
  }catch(caught){
   // A lost POST response is ambiguous; read the authoritative quote before
   // another attempt. Keep the original operation key for safe replay.
   try{const data=await read();setOrder(data);setCouponInput(data.quote?.coupon_code||data.selected_coupon_code||"");}catch{/* keep retry key */}
   setCouponError(orderErrorMessage(caught instanceof Error?caught.message:"",bn));
  }
  finally{setBusy(false);}
 }

 async function goToPay(){
  if(busy||loading||!order||!checkoutEnabled||!currencyOkay||(!agreed&&!confirmed))return;
  setBusy(true);setError("");
  try{
   const current=confirmed?order.quote_id??"":quote!.id;
   if(idempotency.current?.quote!==current)idempotency.current={quote:current,key:crypto.randomUUID()};
   if(!confirmed&&!verifiedLegalDocuments(order.policies))throw Error("POLICY_UNAVAILABLE");
   const response=await post("confirm",{quote_id:current,
    consents:verifiedLegalDocuments(order.policies)?consentPayload(order.policies,consents):{}},idempotency.current.key);
   if(!response.invoice_id||!response.quote_id||response.quote_id!==current)throw Error("ORDER_SERVICE_UNAVAILABLE");
   // Phase 6 alone creates the financial capability. Its bind is idempotent
   // for the confirmed invoice, including a lost response and two open tabs.
   const handoff=await fetch(paymentBase,{method:"POST",headers:{"Content-Type":"application/json",
    "Idempotency-Key":idempotency.current.key},body:JSON.stringify({quote_id:response.quote_id,
    invoice_id:response.invoice_id}),signal:AbortSignal.timeout(15000),cache:"no-store"});
   const payment=await handoff.json().catch(()=>({})) as ConfirmResult&ResponseError;
   if(!handoff.ok)throw Error(payment.code||payment.error?.code||"PAYMENT_HANDOFF_RETRY");
   if(!payment.checkout_token||!/^[A-Za-z0-9_-]{43}$/.test(payment.checkout_token))throw Error("PAYMENT_HANDOFF_RETRY");
   router.push(`/pay/subscription/${payment.checkout_token}`);
  }catch(caught){
   const code=caught instanceof Error?caught.message:"";
   if(["POLICY_CHANGED","POLICY_ACCEPTANCE_REQUIRED","QUOTE_STALE"].includes(code)){
    setConsents(blankConsents());idempotency.current=null;
    try{
     if(code==="QUOTE_STALE"){
      await post("quote",{});couponCommand.current=null;
      setTick(value=>value+1);
     }else setOrder(await read());
    }catch{/* keep original error visible */}
   }
   setError(orderErrorMessage(code,bn));
  }finally{setBusy(false);}
 }

 async function refreshQuote(){
  if(busy||loading)return;
  setBusy(true);setError("");setCouponError("");setConsents(blankConsents());
  idempotency.current=null;couponCommand.current=null;
  try{if(!confirmed)await post("quote",{});}catch(caught){
   setError(orderErrorMessage(caught instanceof Error?caught.message:"",bn));
  }finally{setBusy(false);setTick(value=>value+1);}
 }

 function policyConsent(kind:CheckoutPolicy,label:string){
  const doc=order?.policies?.[kind];const href=safePolicyUrl(doc?.url);
  return <label className="ek-order-consent" key={kind}>
   <input type="checkbox" checked={consents[kind]} disabled={!href||busy||loading||confirmed}
    onChange={event=>setConsents(current=>({...current,[kind]:event.target.checked}))}
    aria-required="true" aria-label={`${label}${doc?.version?` ${doc.version}`:""}`}/>
   <span>{t("I have read and agree to the","আমি পড়েছি ও সম্মতি দিচ্ছি:")} {href?
    <a href={href} rel="noopener noreferrer" target="_blank">{label} ({doc?.version})</a>:<span>{label}</span>}</span>
  </label>;
 }
 return <main className="ek-order" lang={locale}>
  <div className="ek-order-shell">
   <nav className="ek-order-nav" aria-label={t("Checkout","চেকআউট")}><Link href="/" className="ek-order-brand">ekmivo<span>.</span></Link><span className="ek-order-secure">{t("Secure order review","নিরাপদ অর্ডার রিভিউ")}</span></nav>
   <header className="ek-order-head"><p>{t("Step 1 of 2 · Order summary","ধাপ ১/২ · অর্ডার সামারি")}</p><h1>{t("Review your order","আপনার অর্ডার যাচাই করুন")}</h1><span>{t("Your payment options are on the next page.","পেমেন্ট মেথড পরের পেজে পাবেন।")}</span></header>
   <div className="ek-order-grid">
    <section className="ek-order-card" aria-labelledby="ek-order-detail-heading">
     <div className="ek-order-cardhead"><h2 id="ek-order-detail-heading">{t("Order details","অর্ডারের বিবরণ")}</h2><Link href="/pricing">{t("Change offer","অফার পরিবর্তন")}</Link></div>
     {order?.offer?<>
      <div className="ek-order-product"><div className="ek-order-product-icon" aria-hidden="true">E</div><div><h3>{bn?order.offer.name_bn||order.offer.name:order.offer.name}</h3>
       <p>{({payments:t("Payments subscription","পেমেন্টস সাবস্ক্রিপশন"),ai_credit:t("AI prepaid credits","এআই প্রিপেইড ক্রেডিট"),bundle:t("Payments + AI bundle","পেমেন্টস + এআই বান্ডেল")})[order.offer.product]}</p>
       {order.offer.included_ai_credits&&<p>{t("Included AI credits:","অন্তর্ভুক্ত এআই ক্রেডিট:")} {order.offer.included_ai_credits}</p>}</div></div>
      <div className="ek-order-field"><span>{t("Business","ব্যবসা")}</span><strong>{storeName}</strong></div>
      <div className="ek-order-field"><span>{t("Term","মেয়াদ")}</span><strong>{({monthly:t("Monthly","মাসিক"),yearly:t("Yearly","বার্ষিক"),one_time:t("One time","এককালীন")})[order.offer.term]}</strong></div>
      <div className="ek-order-field"><span>{t("Quantity","পরিমাণ")}</span><strong>{order.offer.quantity}</strong></div>
      <div className="ek-order-field"><span>{t("Published price version","প্রকাশিত মূল্য সংস্করণ")}</span><strong className="ek-order-version">{order.offer.version_id}</strong></div>
     </>:<p className="ek-order-message" role="status">{t("Loading your verified selection…","যাচাই করা নির্বাচন লোড হচ্ছে…")}</p>}
     <form className="ek-order-coupon" onSubmit={event=>{event.preventDefault();void changeCoupon(couponInput.trim().toUpperCase());}}>
      <label htmlFor="ek-order-coupon-code">{t("Coupon code","কুপন কোড")}</label>
      <div><input id="ek-order-coupon-code" value={couponInput} maxLength={32} autoComplete="off" disabled={busy||loading||confirmed}
       placeholder={t("Enter coupon","কুপন লিখুন")} onChange={event=>setCouponInput(event.target.value.toUpperCase())}/>
       <button type="submit" disabled={busy||loading||confirmed||!quoteReady||couponInput.trim().length<3}>{busy?t("Working…","অপেক্ষা করুন…"):t("Apply","প্রয়োগ")}</button>
       {(quote?.coupon_code||order?.selected_coupon_code)&&<button type="button" onClick={()=>void changeCoupon("")} disabled={busy||loading||confirmed||!quoteReady}>{t("Remove","সরান")}</button>}
      </div>
      {couponError&&<p role="alert" className="ek-order-warning">{couponError}</p>}
      {couponSuccess&&<p role="status" className="ek-order-success">{couponSuccess}</p>}
     </form>
     <div className="ek-order-paywith"><p>{t("Payment provider","পেমেন্ট প্রোভাইডার")}</p><label><input type="radio" name="provider" checked readOnly value="ekmivo"/><span className="ek-order-provider-name"><b>Pay with Ekmivo</b><small>{t("Payment methods appear after order confirmation.","অর্ডার নিশ্চিত হলে পেমেন্ট মেথড দেখা যাবে।")}</small></span></label></div>
     <fieldset className="ek-order-legal"><legend>{t("Review and accept each policy","প্রতিটি নীতিমালা পড়ে সম্মতি দিন")}</legend>
      {policyConsent("terms",t("Terms of Service","সেবার শর্তাবলি"))}
      {policyConsent("privacy",t("Privacy Policy","গোপনীয়তা নীতি"))}
      {policyConsent("refund",t("Refund Policy","রিফান্ড নীতি"))}
      {!legalReady&&!loading&&!confirmed&&<p role="alert" className="ek-order-warning">{orderErrorMessage("POLICY_UNAVAILABLE",bn)}</p>}
     </fieldset>
    </section>
    <aside className="ek-order-card ek-order-totals" aria-label={t("Payment summary","পেমেন্ট সামারি")}>
     <h2>{t("Payment summary","পেমেন্ট সামারি")}</h2>
     {confirmed&&!quoteReady&&order?.total_minor&&<><div className="ek-order-line ek-order-grand"><span>{t("Previously confirmed total","আগে নিশ্চিত করা মোট")}</span><strong>{money(order.total_minor)}</strong></div><p className="ek-order-message">{t("Your confirmed invoice will be resumed, not recreated.","আগের ইনভয়েসটি আবার খোলা হবে, নতুন তৈরি হবে না।")}</p></>}
     {quoteReady&&quote? <>
      {quote.lines.map((line,index)=><div className="ek-order-line" key={`${line.label}-${index}`}><span>{line.label} × {line.quantity}<small className="ek-order-unit">{money(line.unit_price_minor)} {t("each","প্রতি ইউনিট")}</small></span><strong>{money(line.subtotal_minor)}</strong></div>)}
      <div className="ek-order-separator"/>
      <div className="ek-order-line"><span>{t("Subtotal","সাবটোটাল")}</span><strong>{money(quote.subtotal_minor)}</strong></div>
      {quote.annual_discount_minor!=="0"&&<div className="ek-order-line ek-order-saving"><span>{t("Published annual savings","প্রকাশিত বার্ষিক সাশ্রয়")}</span><strong>−{money(quote.annual_discount_minor)}</strong></div>}
      {quote.bundle_discount_minor!=="0"&&<div className="ek-order-line ek-order-saving"><span>{t("Approved bundle savings","অনুমোদিত বান্ডেল সাশ্রয়")}</span><strong>−{money(quote.bundle_discount_minor)}</strong></div>}
      {quote.coupon_discount_minor!=="0"&&<div className="ek-order-line ek-order-saving"><span>{t("Coupon discount","কুপন ছাড়")}</span><strong>−{money(quote.coupon_discount_minor)}</strong></div>}
      <div className="ek-order-line"><span>{t("Configured tax","কনফিগার করা ট্যাক্স")}</span><strong>{money(quote.tax_minor)}</strong></div>
      <div className="ek-order-separator"/>
      <div className="ek-order-line ek-order-grand"><span>{t("Total payable","সর্বমোট পরিশোধযোগ্য")}</span><strong>{money(quote.total_minor)}</strong></div>
      <p className="ek-order-message">{t("Quote valid until:","মূল্য যাচাইয়ের মেয়াদ:")} <time dateTime={quote.expires_at}>{new Intl.DateTimeFormat(bn?"bn-BD":"en-BD",{dateStyle:"medium",timeStyle:"short"}).format(new Date(quote.expires_at))}</time></p>
      {quote.total_minor==="0"&&<p role="alert" className="ek-order-warning">{orderErrorMessage("ZERO_DUE_UNAPPROVED",bn)}</p>}
     </>:!confirmed&&<p className="ek-order-message" role="status">{loading?t("Calculating the authoritative total…","সার্ভার মোট মূল্য হিসাব করছে…"):t("No current verified quote.","এই মুহূর্তে যাচাই করা মূল্য নেই।")}</p>}
     {error&&<p className="ek-order-warning" role="alert">{error}</p>}
     <button className="ek-order-submit" onClick={()=>void goToPay()} disabled={busy||loading||!checkoutEnabled||!currencyOkay||quote?.total_minor==="0"||(!agreed&&!confirmed)}>{busy?t("Confirming…","নিশ্চিত হচ্ছে…"):"Go to Pay"}</button>
     {!checkoutEnabled&&!loading&&<p className="ek-order-message" role="status">{t("Payment handoff is not yet available.","পেমেন্ট হ্যান্ডঅফ এখনো চালু হয়নি।")}</p>}
     <button className="ek-order-retry" onClick={()=>void refreshQuote()} disabled={busy||loading}>{t("Refresh quote / retry safely","নতুন মূল্য যাচাই / আবার চেষ্টা")}</button>
     <p className="ek-order-note">{t("You are not charged by reviewing this page. Confirmation does not activate your subscription before verified payment.","এই পেজ দেখলে টাকা কাটা হবে না। যাচাই করা পেমেন্টের আগে সাবস্ক্রিপশন চালু হবে না।")}</p>
    </aside>
   </div>
  </div>
 </main>;
}
