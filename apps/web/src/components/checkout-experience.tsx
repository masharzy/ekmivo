"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ReceiptNotice} from "./receipt-notice";
import {CustomerRefundRequest} from "./customer-refund-request";
import {MerchantBrand,type MerchantBrandInfo} from "./merchant-brand";
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
const methods:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
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
export function CheckoutExperience({locale,token}:{locale:Locale;token:string}){
 const bn=locale==="bn";
 const [info,setInfo]=useState<Checkout|null>(null);
 const [status,setStatus]=useState<"loading"|"ready"|"missing"|"offline"|"error">("loading");
 const [code,setCode]=useState("");
 const [payer,setPayer]=useState("");
 const [method,setMethod]=useState("bkash");
 const [step,setStep]=useState<"methods"|"payer">("methods");
 const [destinationCopied,setDestinationCopied]=useState(false);
 const [locking,setLocking]=useState(false);
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
  if(!window.confirm(bn?"এটি কি যে নম্বর থেকে টাকা পাঠাবেন? একবার লক হলে পরিবর্তন করা যাবে না।":"Is this the actual number you will pay from? Once locked, it cannot be edited."))return;
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
 const amount=info?new Intl.NumberFormat(bn?"bn-BD":"en-BD",{currency:"BDT",style:"currency"}).format(info.amount_minor/100):"—";
 const serverClock=serverAnchor.time+clock-serverAnchor.monotonic;
 const ended=info?Date.parse(info.expires_at)<=serverClock:false;
 const state=info?(ended&&["requires_payer","awaiting_payment"].includes(info.state)?"expired":info.state):"";
 const title=statusLabels[state]?.[bn?1:0]||(bn?"পেমেন্টের তথ্য":"Payment details");
 const canLock=state==="requires_payer"&&(info?.environment==="sandbox"||info?.environment==="live"&&info.verification_available);
 return <main className="pg05-checkout pg05-standalone" data-method={step==="payer"||state!=="requires_payer"?info?.method||method:"selection"} lang={locale}>
  <div className="pg05-checkout-wrap">
   <nav className="pg05-checkout-back"><button type="button" onClick={()=>{if(state==="requires_payer"&&step==="payer")setStep("methods");else if(info?.return_url)location.assign(info.return_url);else setCode(bn?"বিক্রেতার সঙ্গে যোগাযোগ করুন।":"Contact the merchant to leave this checkout.")}} aria-label={bn?"পেছনে":"Back"}>←</button><Link href={`/${bn?"en":"bn"}/pay/${token}`} hrefLang={bn?"en":"bn"}>{bn?"English":"বাংলা"}</Link></nav>
   <header className="pg05-checkout-heading">
    <h1>{state==="requires_payer"&&step==="methods"?(bn?"পেমেন্টের মাধ্যম বেছে নিন":"Choose your payment method"):methods[info?.method||method]||title}</h1>
   </header>
   {info?.environment==="sandbox"&&<div className="pg05-banner pg05-warning" role="note">
    <strong>{bn?"স্যান্ডবক্স — আসল টাকা পাঠাবেন না":"SANDBOX — DO NOT SEND REAL MONEY"}</strong>
    <span>{bn?"এটি একটি পরীক্ষা। এখানে কোনো বাস্তব bKash, Nagad বা Rocket প্রাপক নম্বর দেওয়া নেই।":"This is a test. No real bKash, Nagad or Rocket destination is provided."}</span>
   </div>}
   {status==="loading"&&<section className="pg05-checkout-card" role="status"><h2>{bn?"সার্ভার থেকে তথ্য আনা হচ্ছে…":"Loading your checkout…"}</h2><p>{bn?"কোনো লেনদেন নিশ্চিত করা হয়নি।":"No transaction has been confirmed."}</p></section>}
   {status!=="loading"&&status!=="ready"&&<section className="pg05-checkout-card" role="alert">
    <h2>{status==="missing"?(bn?"চেকআউট পাওয়া যায়নি":"Checkout not found"):(bn?"চেকআউট উপলব্ধ নয়":"Checkout unavailable")}</h2>
    <p>{describe(code,bn)}</p><button type="button" onClick={()=>{setStatus("loading");void refresh()}}>{bn?"আবার চেষ্টা করুন":"Retry"}</button>
   </section>}
   {info&&status==="ready"&&<div className="pg05-checkout-grid">
    <section className="pg05-checkout-card">
     <div className="pg05-summary-overline"><span>{bn?"অবস্থা":"STATE"}</span><span className="pg05-state" data-state={state}>{title}</span></div>
     <MerchantBrand name={info.merchant_name} brand={info.brand} locale={locale}/>
     <p className="pg05-muted">{bn?"রেফারেন্স":"Merchant reference"}</p>
     <h2 className="pg05-reference">{info.merchant_reference}</h2>
     {info.source_reference&&<p>{bn?"নথি":"Document"}: {info.source_reference}</p>}
     {info.items&&<ul>{info.items.map((line,index)=><li key={index}>{line.title} — {line.quantity} × {new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(line.unit_amount_minor/100)}</li>)}</ul>}
     <div className="pg05-amount"><span>{bn?"পরিশোধযোগ্য":"Exact amount"}</span><strong>{amount}</strong></div>
     <dl className="pg05-summary">
      <div><dt>{bn?"পেমেন্ট মাধ্যম":"Method"}</dt><dd>{info.method?methods[info.method]||info.method:(bn?"পছন্দ করা হয়নি":"Not selected")}</dd></div>
      <div><dt>{bn?"প্রেরক নম্বর":"Sending number"}</dt><dd>{info.payer_suffix?"••••"+info.payer_suffix:(bn?"নির্বাচিত নয়":"Not confirmed")}</dd></div>
      <div><dt>{bn?"মেয়াদ":"Expires"}</dt><dd><time dateTime={info.expires_at}>{new Date(info.expires_at).toLocaleString(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",timeZoneName:"short"})}</time></dd></div>
     </dl>
     <div className="pg05-timer" role="timer" aria-label={bn?"অবশিষ্ট সময়":"Time remaining"}>{["requires_payer","awaiting_payment"].includes(state)?remaining(info.expires_at,serverClock):"—"}</div>
    </section>
    <section className="pg05-checkout-card" aria-live="polite">
     {canLock&&step==="methods"&&<><h2>{bn?"মোবাইল ব্যাংকিং":"Mobile Banking"}</h2><div className="pg05-method-options">{info.methods.map(option=><button type="button" key={option} data-method={option} aria-pressed={method===option} onClick={()=>setMethod(option)}>{methods[option]||option}</button>)}</div><button type="button" className="pg05-pay" disabled={!info.methods.includes(method)} onClick={()=>setStep("payer")}>{bn?"পরিশোধ করুন":"Pay"} {amount}</button></>}
     {state==="requires_payer"&&!canLock&&<p role="alert">{info.phone_connected
       ?(bn?"বিক্রেতার ফোন সংযুক্ত আছে, কিন্তু পেমেন্ট রসিদ স্বয়ংক্রিয়ভাবে যাচাই করার ব্যবস্থা এখনো প্রস্তুত নয়। টাকা পাঠাবেন না।":"The merchant phone is connected, but automatic receipt verification is not ready. Do not send money.")
       :(bn?"বিক্রেতার টাকা গ্রহণের সংযোগ এখনো প্রস্তুত নয়। টাকা পাঠাবেন না; বিক্রেতার সঙ্গে যোগাযোগ করুন।":"The merchant's payment connection is not ready. Do not send money; contact the merchant.")}</p>}
     {canLock&&step==="payer"&&<>
      <h2>{bn?`আপনার ${methods[method]||method} নম্বর`:`Your ${methods[method]||method} account number`}</h2>
      <form onSubmit={lock} className="pg05-form"><fieldset disabled={locking||code==="OFFLINE"}>
       <label htmlFor="pg05-payer">{bn?"যে নম্বর থেকে টাকা পাঠাবেন":"Number you will pay from"}</label>
        <input id="pg05-payer" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={payer} onChange={e=>setPayer(e.target.value)} placeholder="017XXXXXXXX" aria-describedby="pg05-payer-hint"/>
        <small id="pg05-payer-hint">{bn?"১১ সংখ্যার পূর্ণ বাংলাদেশি মোবাইল নম্বর; বাংলা সংখ্যাও গ্রহণযোগ্য।":"Full 11-digit Bangladesh mobile number; Bengali digits accepted."}</small>
       <button className="ek-action" type="submit" disabled={locking||!info.methods?.length}>{locking?(bn?"সংরক্ষণ হচ্ছে…":"Securing…"):(bn?"নম্বর ও মাধ্যম নিশ্চিত করুন":"Confirm number and method")}</button>
      </fieldset></form></>}
     {state==="awaiting_payment"&&<>
      <h2>{bn?"টাকা পাঠানোর নির্দেশনা":"Payment instructions"}</h2>
      {info.environment==="live"&&info.source_online===false&&<p role="alert">{bn?"গ্রহণকারী device-এর sync দেরি হচ্ছে। আগে টাকা পাঠিয়ে থাকলে আবার পাঠাবেন না। নতুন করে পাঠানোর আগে সংযোগ স্বাভাবিক হওয়া পর্যন্ত অপেক্ষা করুন।":"Receiving-device sync is delayed. If you already sent money, do not send it again. Wait for the connection to recover before sending new funds."}</p>}
      <div className="pg05-simulated"><strong>{info.environment==="sandbox"?(bn?"শুধু পরীক্ষামূলক গন্তব্য":"SIMULATED DESTINATION ONLY"):(bn?"ব্যবসার গ্রহণকারী নম্বর":"Merchant receiving number")}</strong>
       <p data-testid="checkout-receiving-number">{info.destination||"SIMULATED — DO NOT SEND MONEY"}</p>
       {info.environment==="live"&&info.destination&&<button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(info.destination!);setDestinationCopied(true)}catch{setCode("COPY_FAILED")}}}>{destinationCopied?(bn?"কপি হয়েছে":"Copied"):(bn?"নম্বর কপি করুন":"Copy number")}</button>}
       <small>{info.environment==="sandbox"?(bn?"কোনো বাস্তব নম্বরে টাকা পাঠাবেন না। এটি sandbox; server-এর receipt evidence ছাড়া payment নিশ্চিত হবে না।":"Do not send real funds from this sandbox checkout. Payment requires verified server receipt evidence."):(bn?"শুধু প্রদর্শিত নম্বর ও নির্দিষ্ট পরিমাণ ব্যবহার করুন। নম্বর, সময়, amount, গ্রহণকারী account ও method মিলে গেলে স্বয়ংক্রিয়ভাবে যাচাই হবে।":"Use only the shown receiving number and exact amount. Actual payer, original time, amount, receiving account and method must match automatically.")}</small></div>
      <ol className="pg05-payment-steps"><li>{bn?"উপরের গ্রহণকারী নম্বর কপি করুন।":"Copy the receiving number above."}</li><li>{bn?`${methods[info.method||method]||method} অ্যাপের Send Money নির্বাচন করুন।`:`Open ${methods[info.method||method]||method} and select Send Money.`}</li><li>{bn?`দেখানো নম্বরে ঠিক ${amount} পাঠান। এই পেজ খোলা রাখুন; আবার টাকা পাঠাবেন না।`:`Send exactly ${amount} to the shown number. Keep this page open; do not send twice.`}</li></ol><p role="status">{bn?"আপনার পেমেন্টের জন্য অপেক্ষা করছি…":"Waiting for your payment…"}</p><p className="pg05-session">{bn?"অবশিষ্ট সময়":"Session expires in"} {remaining(info.expires_at,serverClock)}</p>
     </>}
     {state==="processing"&&<><h2>{title}</h2><p>{bn?"সার্ভার পেমেন্টের প্রমাণ যাচাই করছে।":"The server is examining actual payment evidence."}</p></>}
     {state==="completed"&&<><h2>{title}</h2><p>{bn?"এই অবস্থা শুধু সার্ভারের যাচাইকৃত ledger থেকে এসেছে।":"This status is derived only from verified server-side allocations."}</p><button type="button" onClick={()=>window.print()}>{bn?"রসিদ print / PDF":"Print receipt / save PDF"}</button>{info.verification&&<dl><dt>{bn?"যাচাই পদ্ধতি":"Verification method"}</dt><dd>{info.verification.method}</dd><dt>{bn?"আসল transaction সময়":"Original transaction time"}</dt><dd>{new Date(info.verification.original_transaction_at).toLocaleString(locale)} ({info.verification.time_precision})</dd><dt>{bn?"যাচাইয়ের সময়":"Verified at"}</dt><dd>{new Date(info.verification.verified_at).toLocaleString(locale)}</dd><dt>{bn?"Receiving account":"Receiving account"}</dt><dd>••••{info.verification.receiving_suffix}</dd></dl>}{info.return_url&&<a href={info.return_url} rel="noreferrer">{bn?"বিক্রেতার কাছে ফিরুন":"Return to merchant"}</a>}<CustomerRefundRequest locale={locale} token={token} maximumMinor={info.amount_minor}/></>}
     {["expired","cancelled"].includes(state)&&<><h2>{title}</h2><p>{bn?"এই রিকোয়েস্টে আর টাকা পাঠাবেন না। আগে কোনো টাকা পাঠানো হয়ে থাকলে ব্যবসার সঙ্গে যোগাযোগ করুন; এখানে ফেরত দেওয়া হয়েছে বলা হচ্ছে না।":"Do not send more money. If funds were already sent, contact the merchant. This screen does not claim a refund."}</p></>}
     {info.notice_available&&<ReceiptNotice key={token} token={token} bn={bn} deliveryAvailable={info.notice_delivery_available===true}/>}
     <div className="pg05-checkout-actions">
      <button type="button" onClick={()=>void refresh()}>{bn?"সার্ভার থেকে আবার দেখুন":"Refresh server status"} ↻</button>
      {updated&&<small>{bn?"সর্বশেষ দেখা":"Last checked"}: {new Date(updated).toLocaleTimeString(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka"})}</small>}
     </div>
     {code&&<p role="alert" className="ek-form-error">{describe(code,bn)}</p>}
    </section>
   </div>}
   <footer className="pg05-checkout-foot"><p>{bn?"PIN, OTP, TrxID বা পেমেন্টের স্ক্রিনশট এখানে চাইবে না।":"We never ask for a PIN, OTP, TrxID or payment screenshot."}</p>
    <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(location.href);setCopied(true)}catch{setCopied(false)}}}>{copied?(bn?"লিংক কপি হয়েছে":"Link copied"):(bn?"এই checkout লিংক কপি":"Copy checkout link")}</button></footer>
  </div>
 </main>;
}
