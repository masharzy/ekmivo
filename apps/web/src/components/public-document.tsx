"use client";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {useEffect,useRef,useState} from "react";
import {ProviderMark,isPayMethod,payMethods,type PayMethod} from "./provider-mark";
import {resolveCheckoutTheme} from "../lib/checkout-theme";
import {ThemedCheckout,WalletToken} from "./themed-checkout";
import type {MerchantBrandInfo} from "./merchant-brand";

type Field={id:string;label:string;type:string;required:boolean;options:string[]};
type Document={receiving_accounts?:{id:string;method:string;suffix?:string;source_online?:boolean;ready?:boolean}[];merchant_name:string;brand?:MerchantBrandInfo;kind:string;reference:string;status?:string;environment:string;amount_minor:number;due_minor?:number;paid_minor:number;configured_methods?:string[];methods?:string[];body:{max_quantity?:number;image_url?:string;description?:string;notes?:string;due_at?:string;items?:{title:string;quantity:number;unit_amount_minor:number}[];fields?:Field[]}};
function safeUrl(raw?:string){if(!raw)return "";try{const u=new URL(raw);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""}catch{return ""}}
function ContactIcon({kind}:{kind:"support"|"email"}){return kind==="email"
 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>
 : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2ZM19 19a5 5 0 0 1-5 3h-2"/></svg>;
}
export function PublicDocument({locale,token,standalone=false}:{locale:"en"|"bn";token:string;standalone?:boolean}){
 const router=useRouter();
 const bn=locale==="bn",t=(en:string,bengali:string)=>bn?bengali:en;
 const [doc,setDoc]=useState<Document|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[quantity,setQuantity]=useState(1),[values,setValues]=useState<Record<string,string|string[]>>({});
 const [selected,setSelected]=useState<{id:string;method:PayMethod;source_online?:boolean;ready?:boolean}|null>(null);
 const [customerDetails,setCustomerDetails]=useState<Record<string,string>>({});
 const key=useRef<string|null>(null),pendingBody=useRef<string|null>(null),completedToken=useRef<string|null>(null);
 const [unconfirmed,setUnconfirmed]=useState(false);
 // Reuse the same immutable checkout capability for this browser tab across
 // reloads. Never mint another payment intent merely because the UI remounted.
 useEffect(()=>{
  try{
   const current=sessionStorage.getItem("ekmivo:document:"+token);
   if(!current)return;
   const saved=JSON.parse(current) as {checkout?:string;key?:string;body?:string};
   if(saved.key&&/^[0-9a-f-]{36}$/.test(saved.key))key.current=saved.key;
   if(saved.body&&saved.body.length<50000)pendingBody.current=saved.body;
   if(saved.checkout&&/^[A-Za-z0-9_-]{43}$/.test(saved.checkout))
    completedToken.current=saved.checkout;
  }catch{}
 },[token]);
 const [terminal,setTerminal]=useState(false);
 const locked=busy||unconfirmed;
 function checkoutError(code:string){
  const messages:Record<string,[string,string]>={
   RECEIVING_SOURCE_UNAVAILABLE:["The seller's receiving source is not ready. Do not send money yet.","বিক্রেতার টাকা গ্রহণের ব্যবস্থা প্রস্তুত নয়। এখন টাকা পাঠাবেন না।"],
   PAYMENT_LINK_EXPIRED:["This link expired. Request a new link.","লিংকটির মেয়াদ শেষ। নতুন লিংক চান।"],
   PAYMENT_LINK_LIMIT_REACHED:["This payment link has reached its limit.","এই পেমেন্ট লিংকের সীমা পূর্ণ হয়েছে।"],
   BILLING_REQUIRED:["This merchant's payment service is inactive.","বিক্রেতার পেমেন্ট সেবা বন্ধ আছে।"],
   LOCKED_OR_EXPIRED:["This checkout is no longer available.","এই checkout আর ব্যবহার করা যাবে না।"]
  };
  return messages[code]?.[bn?1:0]||t("Could not create checkout. Retry the same request.","Checkout তৈরি হয়নি। একই অনুরোধ আবার চেষ্টা করুন।");
 }
 useEffect(()=>{
  const abort=new AbortController();
  fetch("/api/documents/"+token,{cache:"no-store",signal:abort.signal})
   .then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error?.code||String(response.status));return result as Document})
   .then(value=>{if(!abort.signal.aborted)setDoc(value)})
   .catch(e=>{if(!abort.signal.aborted)setError(checkoutError(String(e.message)))})
   .finally(()=>{if(!abort.signal.aborted)setLoading(false)});
  return()=>abort.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[token]);
 function back(){if(window.history.length>1)router.back();else router.push("/")}
 async function pay(e:React.FormEvent){
  e.preventDefault();
  if(busy||!doc||!selected||!doc.methods?.includes(selected.method)||selected.source_online===false||selected.ready===false||terminal)return;
  if(completedToken.current){router.push("/checkout/"+completedToken.current+"?method="+selected.method+(selected.id?"&account="+selected.id:""));return}
  if(!pendingBody.current&&doc.body.fields?.some(f=>f.type==="checkbox"&&f.required&&(!Array.isArray(values[f.id])||values[f.id].length===0))){
   setError(t("Choose all required options.","প্রয়োজনীয় অপশন নির্বাচন করুন।"));return;
  }
  // Single immutable submission and idempotency key for lost-response recovery.
  pendingBody.current??=JSON.stringify({fields:values,quantity,customer_details:customerDetails});
  key.current??=crypto.randomUUID();
  try{sessionStorage.setItem("ekmivo:document:"+token,JSON.stringify({key:key.current,body:pendingBody.current,checkout:completedToken.current}))}catch{}
  setBusy(true);setUnconfirmed(true);setError("");
  try{
   const r=await fetch("/api/documents/"+token,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key.current},body:pendingBody.current});
   const d=await r.json();
   if(!r.ok){
    const code=d.error?.code||d.code||"UNCONFIRMED";
    if([400,401,403,404,410,413,415,422].includes(r.status)||["RECEIVING_SOURCE_UNAVAILABLE","PAYMENT_LINK_EXPIRED","PAYMENT_LINK_LIMIT_REACHED","LOCKED_OR_EXPIRED"].includes(code)){
     pendingBody.current=null;key.current=null;setUnconfirmed(false);
    }
    if(["PAYMENT_LINK_EXPIRED","PAYMENT_LINK_LIMIT_REACHED","LOCKED_OR_EXPIRED"].includes(code))setTerminal(true);
    throw Error(code);
   }
   if(typeof d.checkout_token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(d.checkout_token))throw Error("UNCONFIRMED");
   completedToken.current=d.checkout_token;
   try{sessionStorage.setItem("ekmivo:document:"+token,JSON.stringify({key:key.current,body:pendingBody.current,checkout:d.checkout_token}))}catch{}
   router.push("/checkout/"+d.checkout_token+"?method="+selected.method+(selected.id?"&account="+selected.id:""));
  }catch(e){setError(checkoutError(e instanceof Error?e.message:"UNCONFIRMED"))}
  finally{setBusy(false)}
 }
 async function upload(id:string,file:File){
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/documents/"+token+"/files",{method:"POST",headers:{"X-Filename":encodeURIComponent(file.name),"X-Filename-Encoding":"uri-component"},body:file});
   const d=await r.json();if(!r.ok)throw Error(d.error?.code||d.code);setValues(v=>({...v,[id]:d.file_id}))
  }catch{setError(t("File upload is unavailable. Please retry.","ফাইল আপলোড হয়নি, আবার চেষ্টা করুন।"))}finally{setBusy(false)}
 }
 const configured=(doc?.configured_methods||[]).filter(isPayMethod);
 // Every enabled receiver gets an individual tile, preserving account identity.
 const tiles=doc?.receiving_accounts!==undefined?doc.receiving_accounts.filter(a=>isPayMethod(a.method)).map(a=>({...a,method:a.method as PayMethod})):doc?.environment==='sandbox'?payMethods.map(method=>({id:'',method,source_online:true,ready:true})):[];
 const tileIndex=(tile:{id:string;method:PayMethod})=>tiles.filter(a=>a.method===tile.method).findIndex(a=>a.id===tile.id)+1;
 const readyMethods=doc?.methods||[];
 const selectedReady=selected!==null&&readyMethods.includes(selected.method)&&selected.source_online!==false&&selected.ready!==false;
 const payable=Math.max(0,doc?.kind==="payment-links"?(doc?.amount_minor||0)*quantity:(doc?.due_minor??doc?.amount_minor??0));
 const amount=(payable/100).toLocaleString(bn?"bn-BD":"en-BD",{maximumFractionDigits:2});
 const support=safeUrl(doc?.brand?.support_url),email=doc?.brand?.support_email||"";
 const logo=safeUrl(doc?.brand?.logo_url);
 const theme=doc?resolveCheckoutTheme(doc.brand?.checkout_theme,doc.merchant_name,logo):null;
 if(doc?.kind==="invoices"&&(doc.status==="cancelled"||doc.status==="draft"))return <main data-customer-checkout="true" className="customer-pay-screen" lang={locale}><div className="customer-pay-shell" style={{padding:32,textAlign:"center"}}><h1>{doc.status==="draft"?t("Invoice draft","ইনভয়েস খসড়া"):t("Invoice cancelled","ইনভয়েস বাতিল হয়েছে")}</h1><p>{doc.status==="draft"?t("This invoice has not been issued yet. Payment is unavailable.","ইনভয়েসটি এখনো ইস্যু হয়নি। পেমেন্ট করা যাবে না।"):t("This invoice is void. No payment can be made.","এই ইনভয়েসটি বাতিল। কোনো পেমেন্ট করা যাবে না।")}</p><a href={"/invoice/"+token}>{t("View invoice","ইনভয়েস দেখুন")}</a></div></main>;
 if(theme&&doc)return <ThemedCheckout config={theme} locale={locale} method={selected?.method||null} step="pay" amountMinor={payable} reference={doc.reference} onLanguage={()=>{document.cookie=`ekmivo-locale=${bn?'en':'bn'}; Path=/; Max-Age=31536000; SameSite=Lax`;window.location.reload()}}>
  <h2 className="tk-h">{t('How would you like to pay?','কীভাবে পরিশোধ করতে চান?')}</h2><form onSubmit={pay} className="tk-document-form"><div className="tk-ms">{tiles.map(tile=><button className="tk-m" key={tile.id||tile.method} type="button" disabled={locked} aria-pressed={selected?.id===tile.id&&selected.method===tile.method} onClick={()=>setSelected(tile)} aria-label={tile.method+" account "+tileIndex(tile)}><WalletToken method={tile.method}/><span className="tk-mt">{tile.method==='bkash'?'bKash':tile.method==='nagad'?'Nagad':'Rocket'}</span>{(tile.source_online===false||tile.ready===false||!readyMethods.includes(tile.method))&&<span className="tk-method-status">{t("Not ready","প্রস্তুত নয়")}</span>}{tileIndex(tile)>1&&<span className="tk-m-index">{tileIndex(tile)}</span>}<i className="tk-rd"/></button>)}</div>
  {theme.info&&([['name','Full name','পুরো নাম'],['email','Email','ইমেইল'],['addr','Address','ঠিকানা'],['note','Order note','অর্ডার নোট']] as const).filter(([key])=>theme.f[key]).map(([key,en,be])=><label className="tk-fl" key={key}>{t(en,be)}<input className="tk-in" type={key==='email'?'email':'text'} maxLength={key==='note'?1000:254} disabled={locked} value={customerDetails[key]||''} onChange={e=>setCustomerDetails(d=>({...d,[key]:e.target.value}))}/></label>)}
  {doc.kind==='payment-links'&&(doc.body.max_quantity||1)>1&&<label className="tk-fl">{t('Quantity','পরিমাণ')}<input className="tk-in" type="number" required min={1} max={doc.body.max_quantity} disabled={locked} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>}
       {doc.body.fields?.map(f=><div className="customer-pay-field" key={f.id}>
        {f.type==="checkbox"||f.type==="radio"?<fieldset disabled={locked}><legend>{f.label}{f.required?" *":""}</legend>{f.options.map(option=><label key={option}><input type={f.type} name={"field-"+f.id} required={f.type==="radio"&&f.required} checked={f.type==="radio"?values[f.id]===option:Array.isArray(values[f.id])&&values[f.id].includes(option)} onChange={e=>setValues(v=>{if(f.type==="radio")return{...v,[f.id]:option};const list=Array.isArray(v[f.id])?v[f.id] as string[]:[];return{...v,[f.id]:e.target.checked?[...list,option]:list.filter(x=>x!==option)}})}/>{option}</label>)}</fieldset>:<><label htmlFor={"customer-field-"+f.id}>{f.label}{f.required?" *":""}</label>{f.type==="file"?<><input id={"customer-field-"+f.id} type="file" required={f.required&&!values[f.id]} accept="image/jpeg,image/png,application/pdf" disabled={locked} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(f.id,file)}}/>{values[f.id]&&<span>{t("Uploaded","আপলোড হয়েছে")}</span>}</>:f.type==="select"?<select id={"customer-field-"+f.id} required={f.required} value={String(values[f.id]||"")} disabled={locked} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}><option value="">{t("Select","বেছে নিন")}</option>{f.options.map(option=><option key={option}>{option}</option>)}</select>:f.type==="textarea"?<textarea id={"customer-field-"+f.id} required={f.required} maxLength={2000} disabled={locked} value={String(values[f.id]||"")} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}/>:<input id={"customer-field-"+f.id} required={f.required} maxLength={2000} disabled={locked} value={String(values[f.id]||"")} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}/>}</>}
       </div>)}

  <button className="tk-cta" type="submit" disabled={busy||terminal||!selectedReady||payable<=0}>{busy?t('Preparing checkout…','চেকআউট তৈরি হচ্ছে…'):unconfirmed?t('Retry same checkout','একই checkout আবার চেষ্টা করুন'):!selected?t('Choose a wallet to pay','পরিশোধের মাধ্যম বেছে নিন'):t('Pay ৳'+amount,'৳'+amount+' পরিশোধ করুন')}</button></form>{selected&&!selectedReady&&<p className="tk-err" role="alert">{!configured.includes(selected.method)?t("This merchant has not configured this provider. Do not send money.","এই বিক্রেতা এই মাধ্যমটি সেটআপ করেননি। টাকা পাঠাবেন না।"):t("Payment verification is not ready. Do not send money.","পেমেন্ট যাচাই প্রস্তুত নয়। টাকা পাঠাবেন না।")}</p>}{error&&<p className="tk-err" role="alert">{error}</p>}{doc.body.notes&&<p className="tk-sub">{doc.body.notes}</p>}
 </ThemedCheckout>;
 return <main data-customer-checkout="true" className="customer-pay-screen" data-standalone={standalone} lang={locale}>
  <div className="customer-pay-shell">
   <div className="customer-pay-toolbar">
    <button type="button" onClick={back} aria-label={t("Go back","ফিরে যান")}>←</button>
    <div className="customer-pay-toolbar-right"><button type="button" className="customer-pay-lang" onClick={()=>{document.cookie=`ekmivo-locale=${bn?"en":"bn"}; Path=/; Max-Age=31536000; SameSite=Lax`;window.location.reload()}}>{bn?"EN":"বাং"}</button><button type="button" onClick={back} aria-label={t("Close checkout","চেকআউট বন্ধ করুন")}>×</button></div>
   </div>
   {loading?<div className="customer-pay-loading" role="status">{t("Loading payment details…","পেমেন্টের তথ্য লোড হচ্ছে…")}</div>
    :doc?<>
     <div className="customer-pay-merchant">
      <div className="customer-pay-avatar">{logo?<Image src={logo} alt={doc.merchant_name} unoptimized width={68} height={68} referrerPolicy="no-referrer"/>:<span>{doc.merchant_name.slice(0,1).toUpperCase()}</span>}</div>
      <h1>{doc.merchant_name}</h1>
      {doc.brand?.title&&doc.brand.title!==doc.merchant_name&&<p>{doc.brand.title}</p>}
      {doc.brand?.description&&<p>{doc.brand.description}</p>}
      <div className="customer-pay-contact" aria-label={t("Merchant contacts","বিক্রেতার যোগাযোগ")}>
       {support&&<a href={support} target="_blank" rel="noopener noreferrer" aria-label={t("Contact support","সহায়তায় যোগাযোগ")} title={t("Support","সহায়তা")}><ContactIcon kind="support"/></a>}
       {email&&<a href={"mailto:"+encodeURIComponent(email).replace(/%40/g,"@")} aria-label={t("Email merchant","বিক্রেতাকে ইমেইল")} title={t("Email","ইমেইল")}><ContactIcon kind="email"/></a>}
      </div>
     </div>
     {doc.environment==="sandbox"&&<div className="customer-pay-warning" role="note">{t("SANDBOX · Do not send real money","স্যান্ডবক্স · আসল টাকা পাঠাবেন না")}</div>}
     {doc.reference&&<div className="customer-pay-reference"><strong>{doc.reference}</strong></div>}
     <section className="customer-pay-body" aria-label={t("Choose a payment method","পেমেন্ট মাধ্যম বাছাই")}>
      <div className="customer-pay-section-title">{t("Mobile Banking","মোবাইল ব্যাংকিং")}</div>
      <div className="customer-pay-methods">
       {tiles.map(tile=><button type="button" key={tile.id||tile.method} data-method={tile.method} data-ready={readyMethods.includes(tile.method)&&tile.source_online!==false} aria-pressed={selected?.id===tile.id&&selected.method===tile.method} disabled={locked||terminal} onClick={()=>{setSelected(tile);setError("")}} aria-label={tile.method+" account "+tileIndex(tile)}>
         <ProviderMark method={tile.method}/>{tileIndex(tile)>1&&<span className="pg05-account-index">{tileIndex(tile)}</span>}
         {(tile.source_online===false||tile.ready===false||!readyMethods.includes(tile.method))&&<span className="customer-pay-disabled">{t("Not ready","প্রস্তুত নয়")}</span>}</button>)}
      </div>
      {configured.length===0&&<div className="customer-pay-unavailable" role="status">{t("No receiving method has been configured yet.","এখনো কোনো receiving account যুক্ত করা হয়নি।")}</div>}
      {configured.length>0&&readyMethods.length===0&&!selected&&<div className="customer-pay-unavailable" role="status">{t("The merchant has receiving accounts, but payment verification is not ready. Select a method to check its status. Do not send money.","বিক্রেতার receiving account আছে, কিন্তু payment verification প্রস্তুত নয়। অবস্থা দেখতে একটি মাধ্যম বেছে নিন। টাকা পাঠাবেন না।")}</div>}
      {selected&&!selectedReady&&<div className="customer-pay-unavailable" role="status">{!configured.includes(selected.method)?t("The merchant has not configured "+selected.method+". Do not send money.","বিক্রেতা "+selected.method+" সেটআপ করেননি। টাকা পাঠাবেন না।"):t("Payment through "+selected.method+" is not ready yet. The merchant needs a verified receiving source. Do not send money.","এই "+selected.method+" মাধ্যমে পেমেন্ট এখনো প্রস্তুত নয়। বিক্রেতাকে যাচাইকৃত receiving source যুক্ত করতে হবে। টাকা পাঠাবেন না।")}</div>}
      {doc.body.description&&<p className="customer-pay-description">{doc.body.description}</p>}
      {doc.body.image_url&&<Image className="customer-pay-product" src={doc.body.image_url} alt={doc.body.description||t("Product image","পণ্যের ছবি")} unoptimized width={620} height={320} referrerPolicy="no-referrer"/>}
      <form onSubmit={pay} className="customer-pay-form">
       {doc.kind==="payment-links"&&(doc.body.max_quantity??1)>1&&<label>{t("Quantity","পরিমাণ")}<input type="number" min={1} max={doc.body.max_quantity} value={quantity} required disabled={locked} onChange={e=>{setQuantity(Number(e.target.value));key.current=null}}/></label>}
       {doc.body.fields?.map(f=><div className="customer-pay-field" key={f.id}>
        {f.type==="checkbox"||f.type==="radio"?<fieldset disabled={locked}><legend>{f.label}{f.required?" *":""}</legend>{f.options.map(option=><label key={option}><input type={f.type} name={"field-"+f.id} required={f.type==="radio"&&f.required} checked={f.type==="radio"?values[f.id]===option:Array.isArray(values[f.id])&&values[f.id].includes(option)} onChange={e=>setValues(v=>{if(f.type==="radio")return{...v,[f.id]:option};const list=Array.isArray(v[f.id])?v[f.id] as string[]:[];return{...v,[f.id]:e.target.checked?[...list,option]:list.filter(x=>x!==option)}})}/>{option}</label>)}</fieldset>:<><label htmlFor={"customer-field-"+f.id}>{f.label}{f.required?" *":""}</label>{f.type==="file"?<><input id={"customer-field-"+f.id} type="file" required={f.required&&!values[f.id]} accept="image/jpeg,image/png,application/pdf" disabled={locked} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(f.id,file)}}/>{values[f.id]&&<span>{t("Uploaded","আপলোড হয়েছে")}</span>}</>:f.type==="select"?<select id={"customer-field-"+f.id} required={f.required} value={String(values[f.id]||"")} disabled={locked} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}><option value="">{t("Select","বেছে নিন")}</option>{f.options.map(option=><option key={option}>{option}</option>)}</select>:f.type==="textarea"?<textarea id={"customer-field-"+f.id} required={f.required} maxLength={2000} disabled={locked} value={String(values[f.id]||"")} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}/>:<input id={"customer-field-"+f.id} required={f.required} maxLength={2000} disabled={locked} value={String(values[f.id]||"")} onChange={e=>setValues(v=>({...v,[f.id]:e.target.value}))}/>}</>}
       </div>)}
       <div className="customer-pay-total"><span>{t("Total","মোট")}</span><strong>{amount} BDT</strong></div>
       <button type="submit" className="customer-pay-submit" disabled={locked||terminal||!selectedReady||payable<=0}>
        {busy?t("Preparing checkout…","চেকআউট তৈরি হচ্ছে…"):unconfirmed?t("Retry same checkout","একই checkout আবার চেষ্টা করুন"):selected&&!selectedReady?t("Verification not ready","পেমেন্ট যাচাই প্রস্তুত নয়"):t("Pay ","পরিশোধ করুন ")+amount+" BDT"}
       </button>
      </form>
      {doc.body.notes&&<p className="customer-pay-note">{doc.body.notes}</p>}
      {doc.body.due_at&&<p className="customer-pay-note">{t("Due","শেষ সময়")}: {new Date(doc.body.due_at).toLocaleString(locale)}</p>}
     </section>
    </>:null}
   {error&&<div className="customer-pay-error" role="alert">{error}{!doc&&<button onClick={()=>window.location.reload()}>{t("Retry","আবার চেষ্টা")}</button>}</div>}
  </div>
 </main>;
}
