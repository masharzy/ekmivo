"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Intent={id:string;merchant_reference:string;amount_minor:number;currency:string;
 created_at?:string;expires_at:string;state:string;checkout_token:string};
type Fields={reference:string;amount:string;expiry:string};
type LoadState="loading"|"ready"|"offline"|"unavailable"|"forbidden"|"error";
const empty:Fields={reference:"",amount:"",expiry:"15"};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const short=(code:string,bn:boolean)=>({
 UNAUTHENTICATED:bn?"সেশন শেষ হয়েছে। আবার লগইন করুন।":"Session expired. Sign in again.",
 ACCESS_DENIED:bn?"আপনার এই কাজের অনুমতি নেই।":"You do not have permission for this action.",
 FINANCIAL_SERVICE_UNAVAILABLE:bn?"আর্থিক ডেটাবেস সংযুক্ত হয়নি।":"Financial database is not connected.",
 LIVE_SOURCE_NOT_CONNECTED:bn?"Live receiving source যুক্ত হয়নি। Sandbox বেছে নিন।":"Live receiving source is not connected. Choose sandbox.",
 CONFLICT:bn?"একই রেফারেন্স বা idempotency key-তে ভিন্ন অনুরোধ আছে।":"The reference or idempotency key already belongs to a different request.",
 LOCKED_OR_EXPIRED:bn?"রিকোয়েস্টটি লক বা মেয়াদোত্তীর্ণ।":"Request is locked or expired.",
 INVALID_REQUEST:bn?"সঠিক amount, reference ও মেয়াদ দিন।":"Check the amount, reference and expiry."
} as Record<string,string>)[code]||(bn?"অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।":"Request was not completed. Retry.");
function minor(value:string):number|null{
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(value))return null;
 const [t,p=""]=value.split(".");
 const n=Number(t)*100+Number((p+"00").slice(0,2));
 return Number.isSafeInteger(n)&&n>0&&n<=100000000000?n:null;
}
const number=(amount:number,locale:Locale)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(amount/100);
function statusLabel(status:string,bn:boolean){
 const labels:Record<string,[string,string]>={
 requires_payer:["Awaiting payer","প্রেরকের নম্বর বাকি"],
 awaiting_payment:["Awaiting verification","যাচাইয়ের অপেক্ষায়"],
 completed:["Verified","যাচাইকৃত"],
 expired:["Expired","মেয়াদোত্তীর্ণ"],
 cancelled:["Cancelled","বাতিল"],
 processing:["Processing","প্রক্রিয়াধীন"]
 };
 const pair=labels[status]||["Pending","অপেক্ষমাণ"];
 return bn?pair[1]:pair[0];
}
export function PaymentRequests({locale,userId,workspaceId,environment}:{
 locale:Locale;userId:string;workspaceId:string;environment:PaymentEnvironment;
}){
 const bn=locale==="bn";
 const [data,setData]=useState<Intent[]>([]);
 const [load,setLoad]=useState<LoadState>("loading");
 const [error,setError]=useState("");
 const [fields,setFields]=useState<Fields>(empty);
 const [draftBase,setDraftBase]=useState<Fields>(empty);
 const [expanded,setExpanded]=useState(false);
 const [search,setSearch]=useState("");
 const [statusFilter,setStatusFilter]=useState("all");
 const [submitting,setSubmitting]=useState(false);
 const [acting,setActing]=useState("");
 const [notice,setNotice]=useState("");
 const [copied,setCopied]=useState("");
 const keyRef=useRef("");
 const stateRef=useRef({fields,base:draftBase,expanded});
 stateRef.current={fields,base:draftBase,expanded};
 const draftKey="ekmivo:pg05-request:v1:"+userId+":"+workspaceId+":"+environment;
 const api="/api/go/workspaces/"+workspaceId+"/payment-intents?environment="+environment;
 const dirty=expanded&&(fields.reference!==draftBase.reference||fields.amount!==draftBase.amount||fields.expiry!==draftBase.expiry);
 useEffect(()=>registerDraft({
  id:"pg05:"+workspaceId+":"+environment,
  isDirty:()=>{
   const d=stateRef.current;
   return d.expanded&&JSON.stringify(d.fields)!==JSON.stringify(d.base);
  },
  save:async()=>{
   try{
    const d=stateRef.current;
    sessionStorage.setItem(draftKey,JSON.stringify(d.fields));
    setDraftBase({...d.fields});
    return true;
   }catch{return false;}
  },
  discard:()=>{
   setFields({...stateRef.current.base});
   keyRef.current="";
  }
 }),[workspaceId,environment,draftKey]);
 const refresh=useCallback(async()=>{
  setLoad("loading");setError("");
  try{
   const response=await fetch(api,{cache:"no-store",credentials:"same-origin"});
   const body=await response.json();
   if(!response.ok)throw {status:response.status,code:body.error?.code||body.code};
   setData(Array.isArray(body.data)?body.data:[]);
   setLoad("ready");
  }catch(reason){
   const failure=reason as {status?:number;code?:string};
   setData([]);
   setError(short(failure.code||"",bn));
   setLoad(typeof navigator!=="undefined"&&!navigator.onLine?"offline":
    failure.status===401||failure.status===403?"forbidden":
    failure.status===503?"unavailable":"error");
  }
 },[api,bn]);
 useEffect(()=>{void refresh()},[refresh]);
 const edit=(field:keyof Fields,value:string)=>{
  setFields(f=>({...f,[field]:value}));
  keyRef.current="";
  setNotice("");
 };
 const saveDraft=()=>{
  try{
   sessionStorage.setItem(draftKey,JSON.stringify(fields));
   setDraftBase({...fields});
   setNotice(bn?"খসড়া শুধু এই ট্যাবে সংরক্ষিত। কোনো পেমেন্ট রিকোয়েস্ট তৈরি হয়নি।":"Draft saved only in this tab. No payment request was created.");
  }catch{setError(bn?"এই ব্রাউজারে খসড়া রাখা যাচ্ছে না।":"Cannot save a draft in this browser.")}
 };
 const restoreDraft=()=>{
  try{
   const raw=sessionStorage.getItem(draftKey);
   if(!raw){setNotice(bn?"সংরক্ষিত খসড়া নেই।":"No saved draft found.");return;}
   const value=JSON.parse(raw) as Fields;
   if(typeof value.reference!=="string"||typeof value.amount!=="string"||!["5","10","15","30","60"].includes(value.expiry))throw Error("bad draft");
   setFields(value);setDraftBase(value);setExpanded(true);keyRef.current="";
   setNotice(bn?"খসড়া ফিরেছে; এটি এখনও জমা দেওয়া হয়নি।":"Draft restored; not submitted.");
  }catch{setError(bn?"খসড়াটি ফিরিয়ে আনা যায়নি।":"Unable to restore the draft.")}
 };
 async function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  const amount=minor(fields.amount);
  if(amount===null||fields.reference.trim().length<1||fields.reference.length>128){
   setError(bn?"সঠিক রেফারেন্স ও ২ দশমিক পর্যন্ত পরিমাণ দিন।":"Enter a valid reference and amount with up to two decimals.");return;
  }
  if(!keyRef.current)keyRef.current=crypto.randomUUID();
  setSubmitting(true);setError("");setNotice("");
  try{
   const result=await fetch(api,{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","Idempotency-Key":keyRef.current},
    body:JSON.stringify({merchant_reference:fields.reference.trim(),amount_minor:amount,currency:"BDT",expires_in_minutes:Number(fields.expiry)})});
   const json=await result.json();
   if(!result.ok)throw {code:json.error?.code||json.code};
   keyRef.current="";
   setFields(empty);setDraftBase(empty);setExpanded(false);
   try{sessionStorage.removeItem(draftKey)}catch{}
   setNotice(bn?"Sandbox payment request তৈরি হয়েছে। টাকা পাঠানোর দরকার নেই।":"Sandbox payment request created. Do not send real money.");
   await refresh();
   if(json.checkout_token){
    setCopied("");
   }
  }catch(reason){
   const failure=reason as {code?:string};
   setError(short(failure.code||"",bn));
  }finally{setSubmitting(false);}
 }
 async function cancel(id:string){
  if(!uuid.test(id))return;
  if(!window.confirm(bn?"এই অনিশ্চিত রিকোয়েস্ট বাতিল করবেন? আগে পাঠানো টাকা যাচাই হয়নি—বাতিল মানে ফেরত নয়।":"Cancel this outstanding request? Cancellation does not refund any money that may have been sent."))return;
  setActing(id);setError("");setNotice("");
  try{
   const response=await fetch("/api/go/workspaces/"+workspaceId+"/payment-intents/"+id+"/cancel?environment="+environment,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
   const body=await response.json();
   if(!response.ok)throw {code:body.error?.code||body.code};
   setNotice(bn?"রিকোয়েস্ট বাতিল; আগের ইতিহাস রাখা হয়েছে।":"Request cancelled; original history retained.");
   await refresh();
  }catch(reason){setError(short((reason as {code?:string}).code||"",bn));}
  finally{setActing("");}
 }
 const visible=data.filter(item=>(statusFilter==="all"||item.state===statusFilter)
   &&(item.merchant_reference||"").toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="pg05-merchant">
  <section className="ds-panel pg05-section">
   <div className="pg05-topline">
    <div><p className="ds-eyebrow">{bn?"রিকোয়েস্ট ব্যবস্থাপনা":"REQUEST OPERATIONS"}</p>
     <h2>{bn?"পেমেন্ট রিকোয়েস্ট":"Payment requests"}</h2>
     <p>{bn?"সার্ভার-নির্ধারিত পরিমাণ, নির্দিষ্ট মেয়াদ ও প্রেরকের নম্বর। পেমেন্ট কেবল প্রকৃত প্রমাণে যাচাই হবে।":"Server-issued amount, expiry and payer lock. Only trusted receipt evidence can verify funds."}</p></div>
    <button type="button" className="ek-action" onClick={()=>setExpanded(x=>!x)} aria-expanded={expanded} disabled={load==="forbidden"||environment==="live"}>
     {expanded?(bn?"ফর্ম বন্ধ":"Close form"):(bn?"রিকোয়েস্ট তৈরি":"+ Create request")}</button>
   </div>
   <p className="pg05-banner" role="note">{environment==="sandbox"?(bn?"Sandbox পরীক্ষা — আসল টাকা পাঠাবেন না; কোনো বাস্তব গ্রহণকারী নম্বর নেই।":"Sandbox test — no real money; no genuine receiving number is configured."):(bn?"Live receiving source সংযুক্ত নয়। নতুন রিকোয়েস্ট নিরাপদে বন্ধ রাখা হয়েছে।":"Live receiving source unavailable. New requests are disabled.")}</p>
   {expanded&&<form onSubmit={create} className="pg05-form">
    <div className="pg05-two">
     <label>{bn?"ব্যবসার রেফারেন্স":"Merchant reference"}
      <input required maxLength={128} value={fields.reference} onChange={e=>edit("reference",e.target.value)} placeholder="ORDER-1024"/></label>
     <label>{bn?"পরিমাণ (BDT)":"Amount (BDT)"}
      <input required inputMode="decimal" value={fields.amount} onChange={e=>edit("amount",e.target.value)} placeholder="500.00" aria-describedby="pg05-amount-hint"/>
      <small id="pg05-amount-hint">{bn?"নির্দিষ্ট পরিমাণ; পরবর্তী সময়ে বদলানো যাবে না।":"Exact amount; cannot be edited after issuance."}</small></label>
     <label>{bn?"মেয়াদ":"Expires in"}
      <select value={fields.expiry} onChange={e=>edit("expiry",e.target.value)}>{[5,10,15,30,60].map(value=><option key={value} value={value}>{value} {bn?"মিনিট":"minutes"}</option>)}</select></label>
     <div className="pg05-disabled-field" aria-disabled="true"><strong>{bn?"অর্ডার / ইনভয়েস সংযোগ":"Order / invoice link"}</strong>
       <small>{bn?"অর্ডার ও ইনভয়েসের server snapshot API তৈরি না হওয়া পর্যন্ত আলাদা লিংক নিষ্ক্রিয়; অনুমান করে পরিমাণ পাঠানো হবে না।":"Linked server-side order and invoice amount snapshots are not connected. No client-supplied total is accepted."}</small></div>
    </div>
    <div className="pg05-actions">
     <button type="submit" className="ek-action" disabled={submitting||environment==="live"}>{submitting?(bn?"তৈরি হচ্ছে…":"Creating…"):(bn?"Sandbox রিকোয়েস্ট তৈরি":"Create sandbox request")}</button>
     <button type="button" onClick={saveDraft}>{bn?"খসড়া রাখুন":"Save draft"}</button>
     <button type="button" onClick={restoreDraft}>{bn?"খসড়া ফিরিয়ে আনুন":"Restore draft"}</button>
     <button type="button" onClick={()=>{setFields(empty);setDraftBase(empty);keyRef.current="";try{sessionStorage.removeItem(draftKey)}catch{}}}>{bn?"মুছে ফেলুন":"Discard"}</button>
    </div>
    {dirty&&<p className="pg05-muted" role="status">{bn?"সংরক্ষণ না করা পরিবর্তন আছে।":"Unsaved changes."}</p>}
   </form>}
  </section>
  <section className="ds-panel pg05-section">
   <div className="pg05-topline"><div><h2>{bn?"ইস্যু করা রিকোয়েস্ট":"Issued requests"}</h2>
    <p>{bn?"সর্বশেষ ৫০টি; প্রতিটি অবস্থা সার্ভার থেকে পড়া।":"Latest 50; states are derived by the server."}</p></div>
    <button type="button" onClick={()=>void refresh()} disabled={load==="loading"}>{bn?"রিফ্রেশ":"Refresh"} ↻</button></div>
   <div className="pg05-two">
    <label>{bn?"রেফারেন্স খুঁজুন":"Find a reference"}<input value={search} onChange={e=>setSearch(e.target.value)} type="search" placeholder={bn?"রেফারেন্স লিখুন":"Search reference"}/></label>
    <label>{bn?"অবস্থা":"Status"}<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
     <option value="all">{bn?"সব":"All"}</option>
     {["requires_payer","awaiting_payment","completed","expired","cancelled"].map(key=><option value={key} key={key}>{statusLabel(key,bn)}</option>)}
    </select></label>
   </div>
   {load==="loading"?<p role="status" aria-live="polite">{bn?"আসল রিকোয়েস্ট লোড হচ্ছে…":"Loading actual requests…"}</p>:
    load!=="ready"?<div className="ds-empty" role={load==="forbidden"?"alert":"status"}><h3>{load==="forbidden"?(bn?"অনুমতি নেই":"Access denied"):(bn?"ডেটার উৎস উপলব্ধ নয়":"Data source unavailable")}</h3><p>{error}</p><button type="button" onClick={()=>void refresh()}>{bn?"আবার চেষ্টা করুন":"Retry"}</button></div>:
    visible.length===0?<div className="ds-empty"><h3>{bn?"কোনো মিল পাওয়া যায়নি":"No matching requests"}</h3><p>{data.length===0?(bn?"এই sandbox-এ এখনো কোনো বাস্তব request record নেই।":"No issued request records in this sandbox yet."):(bn?"অন্য ফিল্টার দিয়ে দেখুন।":"Try another filter.")}</p></div>:
    <div className="pg05-records">{visible.map(item=>{
     const checkout="/"+locale+"/checkout/"+item.checkout_token;
     return <article className="pg05-record" key={item.id}>
      <div className="pg05-record-main"><div><strong>{item.merchant_reference}</strong><small>{item.id}</small></div>
       <div className="pg05-total"><strong>{number(item.amount_minor,locale)}</strong><span className="pg05-state" data-state={item.state}>{statusLabel(item.state,bn)}</span></div></div>
      <div className="pg05-record-meta"><span>{bn?"মেয়াদ":"Expires"}: {new Date(item.expires_at).toLocaleString(locale==="bn"?"bn-BD":"en-BD")}</span><span>{bn?"পরিবেশ":"Environment"}: Sandbox</span></div>
      <div className="pg05-actions">
       <Link href={checkout}>{bn?"চেকআউট খুলুন":"Open checkout"} ↗</Link>
       <button type="button" onClick={async()=>{
        try{await navigator.clipboard.writeText(location.origin+checkout);setCopied(item.id);}
        catch{setError(bn?"লিংক কপি করা যায়নি।":"Could not copy link.")}
       }}>{copied===item.id?(bn?"কপি হয়েছে":"Copied"):(bn?"লিংক কপি":"Copy link")}</button>
       {["requires_payer","awaiting_payment"].includes(item.state)&&<button disabled={acting===item.id} type="button" onClick={()=>void cancel(item.id)}>{acting===item.id?(bn?"বাতিল হচ্ছে…":"Cancelling…"):(bn?"বাতিল করুন":"Cancel request")}</button>}
      </div></article>})}</div>}
   {error&&load==="ready"&&<p role="alert" className="ek-form-error">{error}</p>}
   {notice&&<p role="status" className="ek-account-success">{notice}</p>}
  </section>
 </div>;
}
