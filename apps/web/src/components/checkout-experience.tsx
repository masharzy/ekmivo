"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CustomerRefundRequest} from "./customer-refund-request";
import {checkoutReturnUrl} from "../lib/checkout-return";
import type {MerchantBrandInfo} from "./merchant-brand";
import {ProviderMark,isPayMethod,payMethods,payNames,type PayMethod} from "./provider-mark";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {resolveCheckoutTheme} from "../lib/checkout-theme";
import {chooseReceivingAccountId} from "../lib/checkout-account-selection";
import {ThemedCheckout,ThemedResult,WalletToken,type ThemeStep} from "./themed-checkout";
import {normalizeBangladeshPayer,payerLocalDigits} from "../lib/bd-payer-number";
type Locale="en"|"bn";
type Checkout={
 checkout_origin?:"merchant"|"payment_link"; id:string; merchant_name:string;brand?:MerchantBrandInfo;source_reference?:string;items?:{title:string;quantity:number;unit_amount_minor:number}[]; merchant_reference:string;amount_minor:number;currency:string;
 environment:string;created_at:string;expires_at:string;server_time:string;state:string;
 payer_suffix:string|null;method:string|null;methods:string[];receiving_accounts?:{id:string;method:string;suffix:string}[];
 destination:string|null;verification_available:boolean;
 verification?:{method:string;verified_at:string;original_transaction_at:string;time_precision:string;amount_minor:number;currency:string;receipt_method:string;receiving_suffix:string};return_url?:string;cancel_url?:string;notice_available?:boolean;
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
// Only called after a network response, never while React renders.
function captureServerClock(iso:string){
 const timestamp=Date.parse(iso);
 if(!Number.isFinite(timestamp))throw {code:"INVALID_FINANCIAL_RESULT"};
 const monotonic=performance.now();
 return {timestamp,monotonic};
}
export function CheckoutExperience({locale,token,initialMethod}:{locale:Locale;token:string;initialMethod?:PayMethod}){
 const router=useRouter();
 const bn=locale==="bn";
 const [info,setInfo]=useState<Checkout|null>(null);
 const [status,setStatus]=useState<"loading"|"ready"|"missing"|"offline"|"error">("loading");
 const [code,setCode]=useState("");
 const [payer,setPayer]=useState("");
 const [payerTouched,setPayerTouched]=useState(false);
 const [method,setMethod]=useState<PayMethod>(initialMethod||"bkash");
 const [selectedAccountId,setSelectedAccountId]=useState("");
 const [step,setStep]=useState<"methods"|"payer">(initialMethod?"payer":"methods");
 const [destinationCopied,setDestinationCopied]=useState(false);
 const [locking,setLocking]=useState(false);
 const [cancelling,setCancelling]=useState(false);
 const [clock,setClock]=useState(0);
 const [serverAnchor,setServerAnchor]=useState({time:0,monotonic:0});
 const [updated,setUpdated]=useState<number|null>(null);
 const [copied,setCopied]=useState(false);
 const [customerDetails,setCustomerDetails]=useState<Record<string,string>>({}),[methodChosen,setMethodChosen]=useState(Boolean(initialMethod));
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
   const {timestamp,monotonic}=captureServerClock((json as Checkout).server_time);
   setClock(monotonic);setServerAnchor({time:timestamp,monotonic});
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
  if(info.receiving_accounts!==undefined&&!info.receiving_accounts.some(account=>account.id===accountId&&account.method===method))return;
  const canonical=normalizeBangladeshPayer(payer);
  setPayerTouched(true);
  if(!canonical){setCode("INVALID_PAYER_OR_METHOD");return}
  sequence.current++;
  setLocking(true);setCode("");
  try{
   const response=await fetch(route,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({payer_number:canonical,method,receiving_account_id:accountId||undefined,customer_details:customerDetails}),credentials:"same-origin"});
   const json=await response.json();
   if(!response.ok)throw {code:json.error?.code||json.code,status:response.status};
   const {timestamp,monotonic}=captureServerClock((json as Checkout).server_time);
   setClock(monotonic);setServerAnchor({time:timestamp,monotonic});
   latest.current=json as Checkout;sequence.current++;
   setInfo(json as Checkout);setStatus("ready");setUpdated(timestamp);setPayer("");setPayerTouched(false);
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
 const payerInvalid=(payerTouched||payer.length>=11)&&!normalizeBangladeshPayer(payer);
 // A method selected on /pay stays selected on /checkout. Pick an available
 // receiving account deterministically; never force the customer to choose the wallet twice.
 const accountId=info?.receiving_accounts===undefined?selectedAccountId:chooseReceivingAccountId(method,selectedAccountId,info.receiving_accounts,methodChosen);
 const availableSelected=info?.methods?.includes(method)===true&&(info.receiving_accounts===undefined||info.receiving_accounts.some(a=>a.id===accountId&&a.method===method));
 // Show all supported providers, even if a receiver/parser is not ready.
 const tiles=payMethods.flatMap(m=>{
  const accounts=info?.receiving_accounts?.filter(a=>a.method===m)||[];
  return accounts.length?accounts.map(a=>({id:a.id,method:m})):[{id:"",method:m}];
 });
 const tileIndex=(id:string,m:PayMethod)=>tiles.filter(a=>a.method===m).findIndex(a=>a.id===id)+1;
 const pickingAccount=info?.receiving_accounts!==undefined&&!accountId;
 const showPayer=state==="requires_payer"&&step==="payer"&&canLock&&availableSelected&&!pickingAccount;
 const isNagadEntry=showPayer&&selectedMethod==="nagad";
 const isFlow=showPayer||state!=="requires_payer";
 const logoUrl=(()=>{try{if(!info?.brand?.logo_url)return "";if(/^\/api\/checkout-logos\/[a-f0-9]{64}$/.test(info.brand.logo_url))return info.brand.logo_url;const u=new URL(info.brand.logo_url);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""}catch{return ""}})();
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
 function leave(){const target=state==="cancelled"?info?.cancel_url:info?.return_url;if(target){window.location.assign(target);return}if(window.history.length>1)router.back();else router.push("/")}
 async function copyReceiving(){if(!info?.destination)return;try{await navigator.clipboard.writeText(info.destination);setDestinationCopied(true)}catch{setCode("COPY_FAILED")}}
 function switchLanguage(){document.cookie=`ekmivo-locale=${bn?"en":"bn"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==="https:"?"; Secure":""}`;const target=`/checkout/${token}${initialMethod?`?method=${initialMethod}`:""}`;if(location.pathname!==`/checkout/${token}`)router.replace(target);else router.refresh()}
 const theme=info?resolveCheckoutTheme(info.brand?.checkout_theme,info.merchant_name,logoUrl):null;
 if(theme&&info&&status==="ready"){
  const themeStep:ThemeStep=state==="completed"?"success":state==="cancelled"?"cancelled":state==="expired"?"expired":state==="requires_payer"?(showPayer?"payer":"pay"):"waiting";
  const selected=state==="requires_payer"&&!methodChosen?null:selectedMethod;
  const seconds=Math.max(0,Math.ceil((Date.parse(info.expires_at)-serverClock)/1000));
  const tr=(en:string,be:string)=>bn?be:en;
  return <ThemedCheckout config={theme} locale={locale} step={themeStep} method={selected} amountMinor={info.amount_minor} reference={info.source_reference||info.merchant_reference} seconds={seconds} onLanguage={switchLanguage}>
   {themeStep==='pay'?<><h2 className="tk-h">{tr('How would you like to pay?','কীভাবে পরিশোধ করতে চান?')}</h2><div className="tk-ms">{tiles.map(tile=><button type="button" className="tk-m" key={tile.id||tile.method} aria-pressed={methodChosen&&method===tile.method&&accountId===tile.id} onClick={()=>{setMethod(tile.method);setSelectedAccountId(tile.id);setMethodChosen(true)}}><WalletToken method={tile.method}/><span className="tk-mt">{methods[tile.method]}</span>{!info.methods.includes(tile.method)||info.receiving_accounts!==undefined&&!info.receiving_accounts.some(a=>a.id===tile.id&&a.method===tile.method)?<span className="tk-method-status">{tr("Not ready","প্রস্তুত নয়")}</span>:null}{tileIndex(tile.id,tile.method)>1&&<span className="tk-m-index">{String(tileIndex(tile.id,tile.method)).padStart(2,"0")}</span>}<i className="tk-rd"/></button>)}</div>{theme.info&&([['name','Full name','পুরো নাম'],['email','Email','ইমেইল'],['addr','Address','ঠিকানা'],['note','Order note','অর্ডার নোট']] as const).filter(([key])=>theme.f[key]).map(([key,en,be])=><label className="tk-fl" key={key}>{tr(en,be)}<input className="tk-in" type={key==='email'?'email':'text'} maxLength={key==='note'?1000:254} value={customerDetails[key]||''} onChange={e=>setCustomerDetails(d=>({...d,[key]:e.target.value}))}/></label>)}<button type="button" className="tk-cta" disabled={!canLock||!availableSelected||!methodChosen} onClick={()=>setStep('payer')}>{!methodChosen?tr('Choose a wallet to pay','পরিশোধের মাধ্যম বেছে নিন'):tr('Pay ৳'+amount,'৳'+amount+' পরিশোধ করুন')}</button>{(!canLock||methodChosen&&!availableSelected)&&<p className="tk-err" role="alert">{tr("Payment verification is not available for this method. Do not send money.","এই মাধ্যমে পেমেন্ট যাচাই প্রস্তুত নয়। টাকা পাঠাবেন না।")}</p>}</>:
   themeStep==='payer'?<><div className="tk-prov"><WalletToken method={selectedMethod}/>{methods[selectedMethod]}</div><h2 className="tk-h">{tr('Which '+methods[selectedMethod]+' number will you pay from?','কোন '+methods[selectedMethod]+' নম্বর থেকে পরিশোধ করবেন?')}</h2><p className="tk-sub">{tr('We use it to match your payment, so it is confirmed automatically.','এই নম্বর দিয়েই আপনার পেমেন্ট মিলিয়ে নিজে থেকেই নিশ্চিত করা হবে।')}</p><form onSubmit={lock} noValidate><label className="tk-fl"><input className="tk-in" type="tel" inputMode="tel" maxLength={20} placeholder="01XXXXXXXXX" autoComplete="tel-national" aria-label={tr('Your sending number','আপনার প্রেরক নম্বর')} aria-invalid={payerInvalid} disabled={locking} value={payer} onBlur={()=>setPayerTouched(true)} onChange={e=>{setPayer(e.target.value);setCode('')}}/></label>{payerInvalid&&<p className="tk-err" role="alert">{tr('Please enter a valid mobile number, like 01712345678.','সঠিক মোবাইল নম্বর দিন, যেমন 01712345678।')}</p>}<div className="tk-act"><button className="tk-gh" type="button" disabled={locking} onClick={()=>setStep('methods')}>{tr('Back','পিছনে')}</button><button className="tk-cta" type="submit" disabled={locking}>{locking?tr('Confirming…','নিশ্চিত হচ্ছে…'):tr('Continue','এগিয়ে যান')}</button></div></form></>:
   themeStep==='waiting'?<><div className="tk-prov"><WalletToken method={selectedMethod}/>{methods[selectedMethod]}</div><h2 className="tk-h">{tr('Send ৳'+amount+' on '+methods[selectedMethod],methods[selectedMethod]+'-এ ৳'+amount+' পাঠান')}</h2>{info.environment==='live'&&info.source_online===false&&<p className="tk-err" role="alert">{tr('Receiving phone is offline. If you already paid, do not pay again.','গ্রহণকারী ফোন অফলাইনে। টাকা পাঠিয়ে থাকলে আবার পাঠাবেন না।')}</p>}<div className="tk-box"><div><small>{tr('Send to this number','এই নম্বরে পাঠান')}</small><strong data-testid="checkout-receiving-number">{info.destination||'—'}</strong></div><button className="tk-cp" type="button" disabled={!info.destination} onClick={()=>void copyReceiving()}>{destinationCopied?'✓':tr('Copy','কপি')}</button></div><div className="tk-box"><div><small>{tr('Amount to send','যে পরিমাণ পাঠাবেন')}</small><strong>৳{amount}</strong></div><button className="tk-cp" type="button" onClick={()=>void navigator.clipboard.writeText(String(info.amount_minor/100)).catch(()=>setCode('COPY_FAILED'))}>{tr('Copy','কপি')}</button></div><ol className="tk-ol"><li>{tr('Open the '+methods[selectedMethod]+' app and tap Send Money',methods[selectedMethod]+' অ্যাপ খুলে “সেন্ড মানি” চাপুন')}</li><li>{tr('Enter the number above and send exactly ৳'+amount+', no more, no less','উপরের নম্বরে ঠিক ৳'+amount+' পাঠান, কম বা বেশি নয়')}</li><li>{tr('Stay on this page. We will confirm it the moment it arrives.','এই পেজেই থাকুন। টাকা পৌঁছানো মাত্র আমরা নিশ্চিত করব।')}</li></ol><div className="tk-st" role="status"><i className="tk-dot"/><span>{state==='processing'?tr('Verification in progress','যাচাই চলছে'):tr('Waiting for your payment','আপনার পেমেন্টের অপেক্ষায়')}</span>{theme.theme!=='dial'&&<b>{remaining(info.expires_at,serverClock)}</b>}</div><button className="tk-gh tk-cx" disabled={cancelling} onClick={()=>void cancelPayment()}>{tr('Cancel this payment','এই পেমেন্ট বাতিল করুন')}</button></>:
   <ThemedResult locale={locale} step={themeStep} amountMinor={info.amount_minor} method={selectedMethod} reference={info.source_reference||info.merchant_reference} store={theme.store.name} returnDestination={checkoutReturnUrl(info.state,info.checkout_origin,info.return_url,info.cancel_url)}/>}
   {code&&<p className="tk-err" role="alert">{describe(code,bn)}</p>}
  </ThemedCheckout>;
 }
 return <main data-customer-checkout="true" className="provider-checkout pg05-checkout pg05-standalone" data-method={isFlow?selectedMethod:"selection"} lang={locale}>
  <div className={"provider-checkout-modal"+(isFlow?" is-flow":"")} data-method={isFlow?selectedMethod:"selection"}>
   <nav className="provider-checkout-nav" aria-label={bn?"চেকআউট":"Checkout"}>
    <button type="button" className="provider-checkout-back" aria-label={bn?"পেছনে":"Back"}
     onClick={()=>{if(["requires_payer","awaiting_payment","processing"].includes(state))void cancelPayment();else leave()}}>←</button>
    <button type="button" onClick={switchLanguage} className="provider-checkout-language">{bn?"Eng":"বাংলা"}</button>
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
      {tiles.map(tile=><button key={tile.id||tile.method} type="button" aria-pressed={method===tile.method&&selectedAccountId===tile.id}
       onClick={()=>{setMethod(tile.method);setSelectedAccountId(tile.id);setMethodChosen(true)}} data-method={tile.method}><WalletToken method={tile.method}/>{tileIndex(tile.id,tile.method)>1&&<span className="pg05-account-index">{String(tileIndex(tile.id,tile.method)).padStart(2,"0")}</span>}</button>)}
     </div>
     {canLock&&!!info.methods?.length?<button type="button" className="provider-primary-action pg05-pay" disabled={!availableSelected||!methodChosen} onClick={()=>setStep("payer")}>
      {bn?"পরিশোধ করুন ":"Pay "}{amount} BDT
     </button>:<div className="provider-pay-blocked" role="alert">{info.phone_connected
      ?(bn?"ফোন সংযুক্ত, কিন্তু পেমেন্ট যাচাই এখনো প্রস্তুত নয়। টাকা পাঠাবেন না।":"Phone connected, but automatic verification is not ready. Do not send funds.")
      :(bn?"বিক্রেতার receiving account প্রস্তুত নয়। টাকা পাঠাবেন না।":"Merchant receiving account is not ready. Do not send funds.")}</div>}
    </section>}
    {isFlow&&<div className="provider-flow" data-provider={selectedMethod}>
     {!isNagadEntry&&<header className="provider-flow-brand">
      <ProviderMark method={selectedMethod} bn={bn}/>
     </header>}
     {!isNagadEntry&&<div className="provider-flow-invoice">
      <div className="provider-flow-merchant"><div className="provider-flow-shopicon">⌑</div>
       <div><strong>{info.merchant_name}</strong><span>{bn?"ইনভয়েস":"Invoice"}: {info.merchant_reference}</span></div>
      </div>
      <strong className="provider-flow-amount">৳{amount}</strong>
     </div>}
     <section className="provider-flow-content" aria-live="polite">
      {info.environment==="sandbox"&&!isNagadEntry&&<p className="provider-sandbox-note" role="note">{bn?"স্যান্ডবক্স — আসল টাকা পাঠাবেন না":"SANDBOX — DO NOT SEND MONEY"}</p>}
      {isNagadEntry&&<div className="ek-nagad-entry">
       <div className="ek-nagad-top"><ProviderMark method="nagad" bn={bn}/>
        {info.environment==="sandbox"&&<span className="ek-nagad-realm">{bn?"স্যান্ডবক্স":"SANDBOX"}</span>}
       </div>
       <h1 className="ek-nagad-merchant">{info.merchant_name}</h1>
       <div className="ek-nagad-facts">
        <p><span>{bn?"ইনভয়েস নং":"Invoice No"}:</span><strong>{info.merchant_reference}</strong></p>
        <p><span>{bn?"মোট পরিমাণ":"Total Amount"}:</span><strong>BDT {amount}</strong></p>
        <p><span>{bn?"চার্জ":"Charge"}:</span><strong>BDT 0</strong></p>
       </div>
       <form className="ek-nagad-form" onSubmit={lock} noValidate>
        <label htmlFor="ek-nagad-number">{bn?"আপনার নগদ অ্যাকাউন্ট নম্বর":"Your Nagad Account Number"}</label>
        <div className="ek-nagad-digit-entry">
         <div className="ek-nagad-digits" aria-hidden="true">
          {Array.from({length:11},(_,index)=><span key={index} className="ek-nagad-digit">{payerLocalDigits(payer)[index]||""}</span>)}
         </div>
         <input id="ek-nagad-number" className="ek-nagad-number-input" type="tel" inputMode="tel" autoComplete="tel-national"
          aria-label={bn?"নগদ নম্বর লিখুন (01 বা +8801)":"Enter Nagad number starting with 01 or +8801"}
          aria-invalid={payerInvalid} aria-describedby={payerInvalid?"ek-nagad-number-error":"ek-nagad-number-help"}
          maxLength={20} required disabled={locking} value={payer}
          onBlur={()=>setPayerTouched(true)} onChange={e=>{setPayer(e.target.value);setCode("")}}/>
        </div>
        <p className="ek-nagad-consent" id="ek-nagad-number-help">{bn?"Proceed চাপলে শর্তাবলীতে সম্মতি দিচ্ছেন।":"By clicking Proceed, you agree to our Terms and Conditions."}</p>
        {payerInvalid&&<p className="ek-nagad-error" id="ek-nagad-number-error" role="alert">{bn?"সঠিক BD নম্বর দিন: 01XXXXXXXXX বা +8801XXXXXXXXX":"Enter a valid BD number: 01XXXXXXXXX or +8801XXXXXXXXX"}</p>}
        {code&&!(payerInvalid&&code==="INVALID_PAYER_OR_METHOD")&&<p className="ek-nagad-error" role="alert">{describe(code,bn)}</p>}
        <div className="ek-nagad-actions">
         <button type="submit" disabled={locking}>{locking?"…":bn?"এগিয়ে যান":"Proceed"}</button>
         <button type="button" onClick={leave} disabled={locking}>{bn?"বন্ধ":"Close"}</button>
        </div>
       </form>
       <div className="ek-nagad-footer-brand"><ProviderMark method="nagad" bn={bn}/></div>
      </div>}
      {showPayer&&selectedMethod!=="nagad"&&<div className="provider-payer-step">
       <form onSubmit={lock} className="provider-payer-form pg05-form" noValidate>
        <label htmlFor="provider-customer-number">{bn?"আপনার ":"Your "}{methods[method]} {bn?"অ্যাকাউন্ট নম্বর":"Account Number"}</label>
        <input id="provider-customer-number" autoFocus type="tel" inputMode="tel" autoComplete="tel-national"
         required maxLength={20} minLength={11} disabled={locking} placeholder="01XXXXXXXXX / +8801XXXXXXXXX"
         aria-invalid={payerInvalid} aria-describedby="provider-payer-help" value={payer}
         onBlur={()=>setPayerTouched(true)} onChange={e=>{setPayer(e.target.value);setCode("")}}/>
        {payerInvalid?<p className="provider-payer-error" role="alert" id="provider-payer-help">{bn?"সঠিক BD নম্বর দিন: 01XXXXXXXXX বা +8801XXXXXXXXX":"Enter a valid BD number: 01XXXXXXXXX or +8801XXXXXXXXX"}</p>
        :<p className="provider-payer-format" id="provider-payer-help">{bn?"01XXXXXXXXX অথবা +8801XXXXXXXXX":"01XXXXXXXXX or +8801XXXXXXXXX"}</p>}
        <p>{bn?"নম্বরটি নিশ্চিত করলে পরে বদলানো যাবে না।":"Confirming locks your sending number to this payment."}</p>
        <div className="provider-payer-consent">{bn?"এগিয়ে গেলে আপনি শর্তাবলীতে সম্মতি দিচ্ছেন।":"By proceeding you agree to the payment terms."}</div>
        <div className="provider-flow-controls">
         <button type="button" onClick={()=>void cancelPayment()} disabled={locking||cancelling}>{bn?"বাতিল":"Cancel"}</button>
         <button type="submit" disabled={locking}>{locking?(bn?"অপেক্ষা…":"Confirming…"):(bn?"নিশ্চিত করুন":"Confirm")}</button>
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
         src={selectedMethod==="bkash"?"/payment-assets/bkash-send-money.gif":"/payment-assets/nagad-send-money.gif"}
         width={selectedMethod==="bkash"?616:619} height={selectedMethod==="bkash"?411:416} loading="lazy"/>
        
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
      {code&&!isNagadEntry&&<div className="provider-transfer-warning" role="alert">{describe(code,bn)}</div>}
     </section>
    </div>}
   </>}

  </div>
 <style>{`
 .ek-send-money-guide{position:relative;max-width:520px;margin:0 auto;overflow:hidden;border-radius:16px;background:white;}
 .ek-send-money-guide img{display:block;width:100%;height:auto;object-fit:contain;max-height:none}
 .ek-send-money-guide img{max-width:100%;border-radius:12px}
`}</style>
 </main>;
}
