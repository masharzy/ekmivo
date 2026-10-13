"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {CustomerRefundRequest} from "./customer-refund-request";
import {PaymentSuccess} from "./payment-success";
import type {MerchantBrandInfo} from "./merchant-brand";
import {ProviderMark,isPayMethod,payMethods,payNames,type PayMethod} from "./provider-mark";
import Image from "next/image";
import {useRouter} from "next/navigation";
type Locale="en"|"bn";
type Checkout={
 id:string; merchant_name:string;brand?:MerchantBrandInfo;source_reference?:string;items?:{title:string;quantity:number;unit_amount_minor:number}[]; merchant_reference:string;amount_minor:number;currency:string;
 environment:string;created_at:string;expires_at:string;server_time:string;state:string;
 payer_suffix:string|null;method:string|null;methods:string[];
 destination:string|null;verification_available:boolean;
 verification?:{method:string;verified_at:string;original_transaction_at:string;time_precision:string;amount_minor:number;currency:string;receipt_method:string;receiving_suffix:string};return_url?:string;notice_available?:boolean;
 source_online?:boolean;phone_connected?:boolean;
 notice_delivery_available?:boolean;
};
const methods:Record<string,string>=payNames;
const statusLabels:Record<string,[string,string]>={
 requires_payer:["Choose how to pay","পেমেন্টের মাধ্যম বেছে নিন"],
 awaiting_payment:["Waiting for automatic verification","স্বয়ংক্রিয় যাচাইয়ের অপেক্ষায়"],
 processing:["Verification in progress","যাচাই চলছে"],
 completed:["Payment verified","পেমেন্ট যাচাইকৃত"],
 expired:["Checkout expired","পেমেন্টের মেয়াদ শেষ"],
 cancelled:["Request cancelled","রিকোয়েস্ট বাতিল"],
};
function remaining(iso:string,now:number){
 const milliseconds=Date.parse(iso)-now;
 if(!Number.isFinite(milliseconds)||milliseconds<=0)return "00:00";
 const t=Math.ceil(milliseconds/1000);
 return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");
}
function describe(code:string,bn:boolean){
 const labels:Record<string,[string,string]>={
 OFFLINE:["You are offline. Showing the last server result; reconnect to refresh.","সংযোগ নেই। সর্বশেষ তথ্য দেখানো হচ্ছে; সংযোগ ফিরলে আবার দেখুন।"],
 RATE_LIMITED:["Too many requests. Wait one minute before retrying.","এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।"],
 NOT_FOUND:["This checkout link is invalid or no longer available.","লিংকটি ভুল বা এই checkout আর উপলব্ধ নেই।"],
 LOCKED_OR_EXPIRED:["This request expired or was cancelled. No payment was verified.","রিকোয়েস্টটির মেয়াদ শেষ বা বাতিল। কোনো পেমেন্ট যাচাই হয়নি।"],
 CONFLICT:["This payer or receiving route has a conflicting active attempt. Do not resend money.","প্রেরক/মাধ্যমের অন্য একটি সক্রিয় পেমেন্ট রয়েছে। পুনরায় টাকা পাঠাবেন না।"],
 INVALID_PAYER_OR_METHOD:["Enter the complete number you will send money from.","যে পূর্ণ নম্বর থেকে টাকা পাঠাবেন, সেটি লিখুন।"],
 CHECKOUT_SERVICE_UNAVAILABLE:["Checkout is unavailable. Check your connection and retry. Do not send money.","চেকআউট সেবা পাওয়া যাচ্ছে না। নেটওয়ার্ক দেখে আবার চেষ্টা করুন। টাকা পাঠাবেন না।"],
 FINANCIAL_SERVICE_UNAVAILABLE:["Payment service is not connected. Do not send money.","পেমেন্টের সেবা সংযুক্ত হয়নি। টাকা পাঠাবেন না।"]
 ,COPY_FAILED:["Could not copy. Select and copy the receiving number manually.","কপি করা যায়নি। গ্রহণকারী নম্বর নির্বাচন করে কপি করুন।"]
 };
 return (labels[code]||["Could not complete this action. Nothing has been confirmed.","কাজটি সম্পন্ন হয়নি। কোনো পেমেন্ট নিশ্চিত হয়নি।"])[bn?1:0];
}
export function CheckoutExperience({locale,token,initialMethod}:{locale:Locale;token:string;initialMethod?:PayMethod}){
 const router=useRouter();
 const bn=locale==="bn";
 const [info,setInfo]=useState<Checkout|null>(null);
 const [status,setStatus]=useState<"loading"|"ready"|"missing"|"offline"|"error">("loading");
 const [code,setCode]=useState("");
 const [payer,setPayer]=useState("");
 const [method,setMethod]=useState<PayMethod>(initialMethod||"bkash");
 const [step,setStep]=useState<"methods"|"payer">(initialMethod?"payer":"methods");
 const [destinationCopied,setDestinationCopied]=useState(false);
 const [locking,setLocking]=useState(false);
 const [cancelling,setCancelling]=useState(false);
 const [clock,setClock]=useState(0);
 const [serverAnchor,setServerAnchor]=useState({time:0,monotonic:0});
 const [updated,setUpdated]=useState<number|null>(null);
 const [copied,setCopied]=useState(false);
 const live=useRef(true);
 const sequence=useRef(0);
 const latest=useRef<Checkout|null>(null);
 const route="/api/checkout/"+token;
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const request=++sequence.current;
  try{
   const response=await fetch(route,{cache:"no-store",signal});
   const json=await response.json();
   if(!response.ok)throw {status:response.status,code:json.error?.code||json.code};
   if(!live.current||request!==sequence.current)return;
   const timestamp=Date.parse((json as Checkout).server_time);
   if(!Number.isFinite(timestamp))throw {code:"INVALID_FINANCIAL_RESULT"};
   const monotonic=performance.now();setClock(monotonic);setServerAnchor({time:timestamp,monotonic});
   latest.current=json as Checkout;
   setInfo(json as Checkout);setStatus("ready");setCode("");setUpdated(timestamp);
  }catch(err){
   if(signal?.aborted||!live.current||request!==sequence.current)return;
   const e=err as {status?:number;code?:string};
   setCode(!navigator.onLine?"OFFLINE":e.code||"CHECKOUT_SERVICE_UNAVAILABLE");
   if(e.status===404){latest.current=null;setInfo(null)}
   if(latest.current&&e.status!==404){setStatus("ready");return;}
   setStatus(e.status===404?"missing":typeof navigator!=="undefined"&&!navigator.onLine?"offline":"error");
  }
 },[route]);
 useEffect(()=>{
  live.current=true;
  const controller=new AbortController();
  void Promise.resolve().then(()=>refresh(controller.signal));
  return ()=>{live.current=false;controller.abort();};
 },[refresh]);
 useEffect(()=>{const online=()=>void refresh();const offline=()=>setCode("OFFLINE");window.addEventListener("online",online);window.addEventListener("offline",offline);return ()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline)};},[refresh]);
 useEffect(()=>{
  const tick=window.setInterval(()=>setClock(performance.now()),1000);
  return ()=>window.clearInterval(tick);
 },[]);
 useEffect(()=>{
  if(!info||!["awaiting_payment","processing","requires_payer"].includes(info.state))return;
  // Refetch from authoritative source. No browser callback can set a paid status.
  const poll=window.setInterval(()=>{if(document.visibilityState==="visible"&&navigator.onLine)void refresh()},9000);
  return ()=>window.clearInterval(poll);
 },[info,refresh]);
 async function lock(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(locking||!info)return;
  if(!info.methods?.includes(method))return; // URL preferences never bypass availability.
  sequence.current++;
  setLocking(true);setCode("");
  try{
   const response=await fetch(route,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({payer_number:payer,method}),credentials:"same-origin"});
   const json=await response.json();
   if(!response.ok)throw {code:json.error?.code||json.code,status:response.status};
   const timestamp=Date.parse((json as Checkout).server_time);
   if(!Number.isFinite(timestamp))throw {code:"INVALID_FINANCIAL_RESULT"};
   const monotonic=performance.now();setClock(monotonic);setServerAnchor({time:timestamp,monotonic});
   latest.current=json as Checkout;sequence.current++;
   setInfo(json as Checkout);setStatus("ready");setUpdated(timestamp);setPayer("");
  }catch(err){
   const e=err as {code?:string};
   setCode(!navigator.onLine?"OFFLINE":e.code||"CHECKOUT_SERVICE_UNAVAILABLE");
  }finally{setLocking(false);}
 }
 const amount=info?(info.amount_minor/100).toLocaleString(bn?"bn-BD":"en-BD",{maximumFractionDigits:2}):"—";
 const serverClock=serverAnchor.time+clock-serverAnchor.monotonic;
 const ended=info?Date.parse(info.expires_at)<=serverClock:false;
 const state=info?(ended&&["requires_payer","awaiting_payment"].includes(info.state)?"expired":info.state):"";
 const title=statusLabels[state]?.[bn?1:0]||(bn?"পেমেন্ট":"Payment");
 const canLock=state==="requires_payer"&&(info?.environment==="sandbox"||info?.environment==="live"&&info.verification_available);
 const selectedMethod=(info?.method&&isPayMethod(info.method)?info.method:method);
 const availableSelected=info?.methods?.includes(method)===true;
 const showPayer=state==="requires_payer"&&step==="payer"&&canLock&&availableSelected;
 const isFlow=showPayer||state!=="requires_payer";
 const logoUrl=(()=>{try{if(!info?.brand?.logo_url)return "";const u=new URL(info.brand.logo_url);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""}catch{return ""}})();
 const contactUrl=(()=>{try{if(!info?.brand?.support_url)return "";const u=new URL(info.brand.support_url);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""}catch{return ""}})();
 async function cancelPayment(){
  if(cancelling||!info||!["requires_payer","awaiting_payment","processing"].includes(info.state))return;
  setCancelling(true);setCode("");
  try{
   const result=await fetch(route+"/cancel",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin"});
   const body=await result.json();
   if(!result.ok)throw new Error(body.error?.code||"CHECKOUT_SERVICE_UNAVAILABLE");
   if(body.state==="cancelled"){setInfo(current=>current?{...current,state:"cancelled"}:current);setCode("");}
   await refresh();
  }catch(e){setCode(e instanceof Error?e.message:"CHECKOUT_SERVICE_UNAVAILABLE")}
  finally{setCancelling(false)}
 }
 function leave(){if(info?.return_url){window.location.assign(info.return_url);return}if(window.history.length>1)router.back();else router.push("/")}
 async function copyReceiving(){if(!info?.destination)return;try{await navigator.clipboard.writeText(info.destination);setDestinationCopied(true)}catch{setCode("COPY_FAILED")}}
 if(info&&status==="ready"&&state==="completed")return <PaymentSuccess method={selectedMethod} returnUrl={info.return_url} bn={bn}/>;
 if(info&&status==="ready"&&state==="cancelled")return <main className="provider-checkout pg05-checkout pg05-standalone" lang={locale}>
  <section className="provider-result" role="status" style={{minHeight:"100dvh",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",gap:16,padding:32,background:"#faf9f6",color:"#2a2625"}}>
   <div aria-hidden="true" style={{width:70,height:70,borderRadius:"50%",border:"3px solid #bd3838",color:"#bd3838",display:"grid",placeItems:"center",fontSize:35}}>×</div>
   <h1 style={{fontSize:"clamp(23px,5vw,34px)",lineHeight:1.35,margin:0}}>{bn?"এই পেমেন্ট রিকোয়েস্টটি বাতিল করা হয়েছে":"This payment request has been cancelled"}</h1>
   <p style={{maxWidth:470,lineHeight:1.7,fontSize:17,margin:0}}>{bn?"নতুন পেমেন্ট লিংকের জন্য বিক্রেতার সঙ্গে যোগাযোগ করুন। এই রিকোয়েস্টে আর টাকা পাঠাবেন না।":"Please contact the merchant for a new payment link. Do not send money using this request."}</p>
  </section>
 </main>;
 return <main className="provider-checkout pg05-checkout pg05-standalone" data-method={isFlow?selectedMethod:"selection"} lang={locale}>
  <div className={"provider-checkout-modal"+(isFlow?" is-flow":"")} data-method={isFlow?selectedMethod:"selection"}>
   <nav className="provider-checkout-nav" aria-label={bn?"চেকআউট":"Checkout"}>
    <button type="button" className="provider-checkout-back" aria-label={bn?"পেছনে":"Back"}
     onClick={()=>{if(["requires_payer","awaiting_payment","processing"].includes(state))void cancelPayment();else leave()}}>←</button>
    <Link href={"/"+(bn?"en":"bn")+"/checkout/"+token+(initialMethod?"?method="+initialMethod:"")} hrefLang={bn?"en":"bn"} className="provider-checkout-language">{bn?"Eng":"বাংলা"}</Link>
    <button type="button" className="provider-checkout-close" onClick={()=>{if(["requires_payer","awaiting_payment","processing"].includes(state))void cancelPayment();else leave()}} aria-label={bn?"বন্ধ":"Close"}>×</button>
   </nav>
   {status==="loading"&&<div className="provider-checkout-empty" role="status">{bn?"পেমেন্ট লোড হচ্ছে…":"Loading payment…"}</div>}
   {status!=="loading"&&status!=="ready"&&<div className="provider-checkout-empty" role="alert">
    <h1>{status==="missing"?(bn?"পেমেন্ট লিংক পাওয়া যায়নি":"Payment link not found"):(bn?"পেমেন্ট চালু নেই":"Payment unavailable")}</h1>
    <p>{describe(code,bn)}</p><button type="button" onClick={()=>{setStatus("loading");void refresh()}}>{bn?"আবার চেষ্টা করুন":"Retry"}</button>
   </div>}
   {info&&status==="ready"&&<>
    {state==="requires_payer"&&(step==="methods"||!availableSelected)&&<section className="provider-method-picker">
     <div className="provider-merchant-head">
      <div className="provider-merchant-avatar">{logoUrl?<Image src={logoUrl} unoptimized width={54} height={54} alt={info.merchant_name} referrerPolicy="no-referrer"/>:<span>{info.merchant_name.slice(0,1).toUpperCase()}</span>}</div>
      <h1>{info.merchant_name}</h1>
      {contactUrl&&<a href={contactUrl} target="_blank" rel="noopener noreferrer">{bn?"যোগাযোগ":"Contact"}</a>}
     </div>
     <div className="provider-pay-headline">{bn?"মোবাইল ব্যাংকিং":"Mobile Banking"}</div>
     <div className="provider-checkout-options pg05-method-options">
      {payMethods.filter(x=>info.methods?.includes(x)).map(option=><button key={option} type="button" aria-pressed={method===option}
       onClick={()=>setMethod(option)} data-method={option}><ProviderMark method={option} bn={bn}/></button>)}
     </div>
     {canLock&&!!info.methods?.length?<button type="button" className="provider-primary-action pg05-pay" onClick={()=>setStep("payer")}>
      {bn?"পরিশোধ করুন ":"Pay "}{amount} BDT
     </button>:<div className="provider-pay-blocked" role="alert">{info.phone_connected
      ?(bn?"ফোন সংযুক্ত, কিন্তু পেমেন্ট যাচাই এখনো প্রস্তুত নয়। টাকা পাঠাবেন না।":"Phone connected, but automatic verification is not ready. Do not send funds.")
      :(bn?"বিক্রেতার receiving account প্রস্তুত নয়। টাকা পাঠাবেন না।":"Merchant receiving account is not ready. Do not send funds.")}</div>}
    </section>}
    {isFlow&&<div className="provider-flow" data-provider={selectedMethod}>
     <header className="provider-flow-brand">
      <ProviderMark method={selectedMethod} bn={bn}/>
     </header>
     <div className="provider-flow-invoice">
      <div className="provider-flow-merchant"><div className="provider-flow-shopicon">⌑</div>
       <div><strong>{info.merchant_name}</strong><span>{bn?"ইনভয়েস":"Invoice"}: {info.merchant_reference}</span></div>
      </div>
      <strong className="provider-flow-amount">৳{amount}</strong>
     </div>
     <section className="provider-flow-content" aria-live="polite">
      {info.environment==="sandbox"&&<p className="provider-sandbox-note" role="note">{bn?"স্যান্ডবক্স — আসল টাকা পাঠাবেন না":"SANDBOX — DO NOT SEND MONEY"}</p>}
      {showPayer&&selectedMethod==="nagad"&&<div className="ek-nagad-entry">
       <div className="ek-nagad-sandbox-title">{info.merchant_name}</div>
       <div className="ek-nagad-facts">
        <p><strong>{bn?"ইনভয়েস নং:":"Invoice No:"}</strong><span>{info.merchant_reference}</span></p>
        <p><strong>{bn?"মোট পরিমাণ:":"Total Amount:"}</strong><span>BDT {amount}</span></p>
        <p><strong>{bn?"চার্জ:":"Charge:"}</strong><span>BDT 0</span></p>
       </div>
       <form className="ek-nagad-form" onSubmit={lock}>
        <label htmlFor="ek-nagad-number">{bn?"আপনার নগদ অ্যাকাউন্ট নম্বর":"Your Nagad Account Number"}</label>
        <input id="ek-nagad-number" type="tel" autoFocus inputMode="numeric" pattern="01[0-9]{9}"
         placeholder="01XXXXXXXXX" minLength={11} maxLength={11} required disabled={locking}
         value={payer} onChange={e=>setPayer(e.target.value.replace(/\D/g,"").slice(0,11))}/>
        <p className="ek-nagad-consent">{bn?"Proceed চাপলে আপনি আমাদের শর্তাবলীতে সম্মতি দিচ্ছেন।":'By clicking/tapping "Proceed" you are agreeing to our Terms and Conditions'}</p>
        <div className="ek-nagad-actions">
         <button type="submit" disabled={locking||!/^(?:01)[0-9]{9}$/.test(payer)}>{locking?"…":bn?"এগিয়ে যান":"Proceed"}</button>
         <button type="button" onClick={()=>void cancelPayment()} disabled={locking||cancelling}>{bn?"বাতিল":"Close"}</button>
        </div>
       </form>
       <div className="ek-nagad-footer-brand"><ProviderMark method="nagad" bn={bn}/></div>
      </div>}
      {showPayer&&selectedMethod!=="nagad"&&<div className="provider-payer-step">
       <form onSubmit={lock} className="provider-payer-form pg05-form">
        <label htmlFor="provider-customer-number">{bn?"আপনার ":"Your "}{methods[method]} {bn?"অ্যাকাউন্ট নম্বর":"Account Number"}</label>
        <input id="provider-customer-number" autoFocus type="tel" inputMode="tel" autoComplete="tel"
         required maxLength={20} minLength={11} disabled={locking} placeholder="e.g 01XXXXXXXXX" value={payer} onChange={e=>setPayer(e.target.value)}/>
        <p>{bn?"নম্বরটি নিশ্চিত করলে পরে বদলানো যাবে না।":"Confirming locks your sending number to this payment."}</p>
        <div className="provider-payer-consent">{bn?"এগিয়ে গেলে আপনি শর্তাবলীতে সম্মতি দিচ্ছেন।":"By proceeding you agree to the payment terms."}</div>
        <div className="provider-flow-controls">
         <button type="button" onClick={()=>void cancelPayment()} disabled={locking||cancelling}>{bn?"বাতিল":"Cancel"}</button>
         <button type="submit" disabled={locking||payer.trim().length<11}>{locking?(bn?"অপেক্ষা…":"Confirming…"):(bn?"নিশ্চিত করুন":"Confirm")}</button>
        </div>
       </form>
      </div>}
      {state==="awaiting_payment"&&<div className="provider-transfer">
       {info.environment==="live"&&info.source_online===false&&<p role="alert" className="provider-transfer-warning">{bn?"গ্রহণকারী ফোন অফলাইনে আছে। টাকা পাঠিয়ে থাকলে দ্বিতীয়বার পাঠাবেন না।":"Receiving phone is offline. If you already paid, do not pay again."}</p>}
       <div className="provider-recipient">
        <div><small>{bn?"PERSONAL NUMBER":"PERSONAL NUMBER"}</small><strong data-testid="checkout-receiving-number">{info.destination||(info.environment==="sandbox"?"SIMULATED ONLY":"—")}</strong></div>
        {info.environment==="live"&&info.destination&&<button type="button" aria-label={bn?"নম্বর কপি":"Copy number"} onClick={()=>void copyReceiving()}>{destinationCopied?"✓":"▣"}</button>}
       </div>
       <ol className="provider-instructions">
        <li><span>1</span>{bn?"উপরের পার্সোনাল অ্যাকাউন্ট নম্বর কপি করুন":"Copy the personal account number above"}</li>
        <li><span>2</span>{bn?methods[selectedMethod]+" অ্যাপ থেকে 'সেন্ড মানি' নির্বাচন করুন":"Open "+methods[selectedMethod]+" and choose Send Money"}</li>
       </ol>
       {selectedMethod!=="rocket"&&<div className="provider-instruction-graphic ek-send-money-guide"
         aria-label={bn?"সেন্ড মানি বেছে নেওয়ার নির্দেশনা":"How to select Send Money"}>
        <img alt={bn?"সেন্ড মানি অপশন দেখানো আসল অ্যাপ স্ক্রিনশট":"Actual app screenshot showing Send Money"} 
         src={selectedMethod==="bkash"?"/payment-assets/bkash-send-money.webp":"/payment-assets/nagad-send-money.webp"}
         width={330} height={222} loading="lazy"/>
        
       </div>}
       <ol className="provider-instructions" start={3}>
        <li><span>3</span>{bn?"সঠিক নম্বরে ৳"+amount+" পাঠিয়ে এই পেজে অপেক্ষা করুন। আবার টাকা পাঠাবেন না।":"Send exactly ৳"+amount+" to this number and keep this page open. Do not pay twice."}</li>
       </ol>
       <div className="provider-waiting" role="status"><span className="provider-waiting-dot"/>{bn?"আপনার পেমেন্টের জন্য অপেক্ষা করছি…":"Waiting for your payment…"}</div>
       <p className="provider-expiry">{bn?"সেশন শেষ হতে":"Session expires in"} {remaining(info.expires_at,serverClock)}</p>
       <div className="provider-flow-controls"><button type="button" onClick={()=>void cancelPayment()} disabled={cancelling}>{cancelling?(bn?"বাতিল হচ্ছে…":"Cancelling…"):(bn?"পেমেন্ট বাতিল":"Cancel payment")}</button><button type="button" onClick={()=>void refresh()}>{bn?"যাচাই হচ্ছে…":"Auto verifying…"} ↻</button></div>
      </div>}
      {state==="processing"&&<div className="provider-result"><h1>{title}</h1><p>{bn?"সার্ভার পেমেন্টের প্রমাণ যাচাই করছে।":"The server is validating payment evidence."}</p><button onClick={()=>void refresh()}>{bn?"রিফ্রেশ":"Refresh"}</button></div>}
      {state==="completed"&&<div className="provider-result is-complete"><h1>{title}</h1><p>{bn?"সার্ভারের যাচাইকৃত রেকর্ড অনুযায়ী পেমেন্ট সম্পন্ন হয়েছে।":"The payment has been verified against server evidence."}</p>
       {info.verification&&<dl><dt>{bn?"পদ্ধতি":"Verification"}</dt><dd>{info.verification.method}</dd><dt>{bn?"সময়":"Transaction time"}</dt><dd>{new Date(info.verification.original_transaction_at).toLocaleString(locale)}</dd><dt>{bn?"গ্রহণকারী":"Receiving"}</dt><dd>••••{info.verification.receiving_suffix}</dd></dl>}
       <button type="button" onClick={()=>window.print()}>{bn?"রসিদ প্রিন্ট":"Print receipt"}</button>{info.return_url&&<a href={info.return_url} rel="noreferrer">{bn?"বিক্রেতার কাছে ফিরুন":"Return to merchant"}</a>}
       <CustomerRefundRequest locale={locale} token={token} maximumMinor={info.amount_minor}/></div>}
      {["expired","cancelled"].includes(state)&&<div className="provider-result"><h1>{title}</h1><p>{state==="cancelled"?(bn?"এই checkout বাতিল হয়েছে। আবার টাকা পাঠাবেন না।":"This checkout was cancelled. Do not send funds."):(bn?"পেমেন্ট সেশনের মেয়াদ শেষ। আবার টাকা পাঠাবেন না।":"This checkout session has expired. Do not send funds.")}</p></div>}
      {code&&<div className="provider-transfer-warning" role="alert">{describe(code,bn)}</div>}
     </section>
    </div>}
   </>}
  <style>{`
  .ek-nagad-entry{position:relative;background:radial-gradient(circle at 44% 48%,#ed181b 0,#c4141b 46%,#8e1319 100%);color:#fff;min-height:700px;padding:32px 22px 22px;display:flex;flex-direction:column;text-align:center;gap:10px}
  .ek-nagad-sandbox-title{font-size:clamp(22px,4vw,33px);font-weight:800;margin:8px 0 16px}
  .ek-nagad-facts{text-align:left;font-size:clamp(16px,2.9vw,24px);line-height:1.5;margin-bottom:auto}
  .ek-nagad-facts p{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 13px}
  .ek-nagad-facts strong{font-weight:800}
  .ek-nagad-form{display:flex;flex-direction:column;align-items:center;gap:17px;margin:auto 0}
  .ek-nagad-form label{font-weight:800;font-size:clamp(18px,3vw,24px)}
  .ek-nagad-form input{max-width:380px;width:100%;box-sizing:border-box;background:#fff;border:2px solid #fff;border-radius:8px;color:#222;font-size:24px;letter-spacing:.13em;text-align:center;padding:15px 8px}
  .ek-nagad-consent{font-size:clamp(14px,2.4vw,20px);max-width:520px;line-height:1.5}
  .ek-nagad-actions{display:flex;justify-content:space-around;gap:28px;width:100%;margin-top:30px}
  .ek-nagad-actions button{background:white;color:#aa0c14;border:0;border-radius:7px;font-weight:800;font-size:20px;padding:11px 22px;min-width:116px;cursor:pointer}
  .ek-nagad-actions button:disabled{opacity:.55}
  .ek-nagad-footer-brand{margin-top:auto;display:flex;justify-content:center;padding-top:48px}
  .ek-nagad-footer-brand svg{width:190px;height:74px;filter:none!important} .ek-nagad-footer-brand{background:#fff;border-radius:14px;width:max-content;max-width:100%;padding:10px 14px;margin-left:auto;margin-right:auto}
  @media(max-width:480px){.ek-nagad-entry{min-height:570px;padding:22px 16px}.ek-nagad-actions{margin-top:12px}.ek-nagad-form input{font-size:20px}}
  `}</style>
  </div>
 <style>{`
 .ek-send-money-guide{position:relative;max-width:520px;margin:0 auto;overflow:hidden;border-radius:16px;background:white;}
 .ek-send-money-guide img{display:block;width:100%;height:auto;object-fit:contain;max-height:none}
 .ek-send-money-guide img{max-width:100%;border-radius:12px}
`}</style>
 </main>;
}
