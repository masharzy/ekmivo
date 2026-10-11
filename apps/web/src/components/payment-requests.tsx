"use client";
import Link from "next/link";
import {PaymentRequestDetail} from "./payment-request-detail";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Intent={id:string;merchant_reference:string;amount_minor:number;currency:string;
 created_at?:string;expires_at:string;state:string;checkout_token:string;
 source_kind?:string|null;source_reference?:string|null};
type Source={id:string;source_kind:"order"|"invoice";source_reference:string;amount_minor:number;issued_at:string;items:{title:string;quantity:number;unit_amount_minor:number}[]};
type SourceLine={title:string;quantity:string;unitPrice:string};
type SourceDraft=SourceLine&{kind:"order"|"invoice";reference:string};
const initialSource:SourceDraft={kind:"invoice",reference:"",title:"",quantity:"1",unitPrice:""};
type Fields={reference:string;amount:string;expiry:string;sourceKind:"standalone"|"order"|"invoice";sourceId:string};
type LoadState="loading"|"ready"|"offline"|"unavailable"|"forbidden"|"error";
const empty:Fields={reference:"",amount:"",expiry:"15",sourceKind:"standalone",sourceId:""};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const short=(code:string,bn:boolean)=>({
 UNAUTHENTICATED:bn?"সেশন শেষ হয়েছে। আবার লগইন করুন।":"Session expired. Sign in again.",
 ACCESS_DENIED:bn?"আপনার এই কাজের অনুমতি নেই।":"You do not have permission for this action.",
 FINANCIAL_SERVICE_UNAVAILABLE:bn?"আর্থিক ডেটাবেস সংযুক্ত হয়নি।":"Financial database is not connected.",
 LIVE_SOURCE_NOT_CONNECTED:bn?"Live receiving source যুক্ত হয়নি। Sandbox বেছে নিন।":"Live receiving source is not connected. Choose sandbox.",
 RATE_LIMITED:bn?"এক মিনিট পরে চেষ্টা করুন।":"Too many requests. Retry in one minute.",
 CONFLICT:bn?"একই রেফারেন্স বা idempotency key-তে ভিন্ন অনুরোধ আছে।":"The reference or idempotency key already belongs to a different request.",
 LOCKED_OR_EXPIRED:bn?"রিকোয়েস্টটি লক বা মেয়াদোত্তীর্ণ।":"Request is locked or expired.",
 INVALID_REQUEST:bn?"সঠিক amount, reference ও মেয়াদ দিন।":"Check the amount, reference and expiry.",
 SOURCE_NOT_FOUND:bn?"নির্বাচিত নথি পাওয়া যায়নি।":"Selected source document not found.",
 INVALID_SOURCE:bn?"নথির লাইন বা পরিমাণ ভুল।":"Invalid document line or price."
} as Record<string,string>)[code]||(bn?"অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।":"Request was not completed. Retry.");
function minor(value:string):number|null{
 value=value.replace(/[০-৯]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
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
export function PaymentRequests({locale,userId,workspaceId,environment,canWrite}:{
 locale:Locale;userId:string;workspaceId:string;environment:PaymentEnvironment;canWrite:boolean;
}){
 const bn=locale==="bn";
 const [selected,setSelected]=useState("");
 useEffect(()=>{const id=new URLSearchParams(location.search).get("request");if(id&&uuid.test(id))void Promise.resolve().then(()=>setSelected(id));},[]);
 function selectDetail(id:string){setSelected(id);const url=new URL(location.href);if(id)url.searchParams.set("request",id);else url.searchParams.delete("request");history.replaceState(history.state,"",url);}

 const [data,setData]=useState<Intent[]>([]);
 const [sources,setSources]=useState<Source[]>([]);
 const [sourceLoad,setSourceLoad]=useState<"loading"|"ready"|"error">("loading");
 const [sourceDraft,setSourceDraft]=useState<SourceDraft>(initialSource);
 const [extraLines,setExtraLines]=useState<SourceLine[]>([]);
 const [sourceBase,setSourceBase]=useState<{draft:SourceDraft;lines:SourceLine[]}>({draft:initialSource,lines:[]});
 const [sourceBusy,setSourceBusy]=useState(false);
 const [sourceError,setSourceError]=useState("");
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
 const sourceRef=useRef({draft:sourceDraft,lines:extraLines,base:sourceBase});
 useEffect(()=>{stateRef.current={fields,base:draftBase,expanded}},[fields,draftBase,expanded]);
 useEffect(()=>{sourceRef.current={draft:sourceDraft,lines:extraLines,base:sourceBase}},[sourceDraft,extraLines,sourceBase]);
 const draftKey="ekmivo:pg05-request:v1:"+userId+":"+workspaceId+":"+environment;
 const api="/api/go/workspaces/"+workspaceId+"/payment-intents?environment="+environment;
 const sourcesApi="/api/go/workspaces/"+workspaceId+"/linked-sources?environment="+environment;
 const dirty=(JSON.stringify(fields)!==JSON.stringify(draftBase))||
  JSON.stringify({draft:sourceDraft,lines:extraLines})!==JSON.stringify(sourceBase);
 useEffect(()=>registerDraft({
  id:"pg05:"+workspaceId+":"+environment,
  isDirty:()=>{
   const d=stateRef.current;
   const source=sourceRef.current;
   return (JSON.stringify(d.fields)!==JSON.stringify(d.base))||
    JSON.stringify({draft:source.draft,lines:source.lines})!==JSON.stringify(source.base);
  },
  save:async()=>{
   try{
    const d=stateRef.current;
    const source=sourceRef.current;
    sessionStorage.setItem(draftKey,JSON.stringify(d.fields));
    sessionStorage.setItem(draftKey+":key",keyRef.current);
    stateRef.current={...d,base:{...d.fields}};
    sourceRef.current={...source,base:{draft:{...source.draft},lines:source.lines.map(x=>({...x}))}};
    sessionStorage.setItem(draftKey+":source",JSON.stringify({draft:source.draft,lines:source.lines}));
    setDraftBase({...d.fields});
    setSourceBase({draft:{...source.draft},lines:source.lines.map(x=>({...x}))});
    return true;
   }catch{return false;}
  },
  discard:()=>{
   stateRef.current={...stateRef.current,fields:{...stateRef.current.base}};
   sourceRef.current={...sourceRef.current,...sourceRef.current.base};
   setFields({...stateRef.current.base});
   const source=sourceRef.current.base;
   setSourceDraft({...source.draft});setExtraLines(source.lines.map(x=>({...x})));
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
   if(failure.status===401||failure.status===403)setData([]);
   setError(short(failure.code||"",bn));
   setLoad(typeof navigator!=="undefined"&&!navigator.onLine?"offline":
    failure.status===401||failure.status===403?"forbidden":
    failure.status===503?"unavailable":"error");
  }
 },[api,bn]);
 const refreshSources=useCallback(async()=>{
  if(environment==="live"){setSources([]);setSourceLoad("error");setSourceError(short("LIVE_SOURCE_NOT_CONNECTED",bn));return;}
  setSourceLoad("loading");
  try{
   const response=await fetch(sourcesApi,{cache:"no-store",credentials:"same-origin"});
   const body=await response.json();
   if(!response.ok){if(response.status===401||response.status===403)setSources([]);throw Error(body.error?.code||body.code);}
   setSources(Array.isArray(body.data)?body.data:[]);
   setSourceLoad("ready");setSourceError("");
  }catch{setSourceLoad("error");setSourceError(bn?"নথি লোড হয়নি। আবার চেষ্টা করুন।":"Document sources unavailable. Retry.");}
 },[sourcesApi,environment,bn]);
 useEffect(()=>{void Promise.resolve().then(()=>refresh())},[refresh]);
 useEffect(()=>{void Promise.resolve().then(()=>refreshSources())},[refreshSources]);
 const edit=(field:keyof Fields,value:string)=>{
  setFields(f=>({...f,[field]:value}));
  keyRef.current="";
  setNotice("");
 };
 const saveDraft=()=>{
  try{
   sessionStorage.setItem(draftKey,JSON.stringify(fields));
   sessionStorage.setItem(draftKey+":key",keyRef.current);
   sessionStorage.setItem(draftKey+":source",JSON.stringify({draft:sourceDraft,lines:extraLines}));
   setDraftBase({...fields});
   setSourceBase({draft:{...sourceDraft},lines:extraLines.map(x=>({...x}))});
   setNotice(bn?"খসড়া শুধু এই ট্যাবে সংরক্ষিত। কোনো পেমেন্ট রিকোয়েস্ট তৈরি হয়নি।":"Draft saved only in this tab. No payment request was created.");
  }catch{setError(bn?"এই ব্রাউজারে খসড়া রাখা যাচ্ছে না।":"Cannot save a draft in this browser.")}
 };
 const restoreDraft=()=>{
  try{
   const raw=sessionStorage.getItem(draftKey);
   if(!raw){setNotice(bn?"সংরক্ষিত খসড়া নেই।":"No saved draft found.");return;}
   const value=JSON.parse(raw) as Fields;
   if(typeof value.reference!=="string"||typeof value.amount!=="string"||!["5","10","15","30","60"].includes(value.expiry))throw Error("bad draft");
   const restored:Fields={...empty,...value};
   if(!["standalone","order","invoice"].includes(restored.sourceKind)||typeof restored.sourceId!=="string")throw Error("bad source");
   const rawSource=sessionStorage.getItem(draftKey+":source");
   if(rawSource){
    const parsed=JSON.parse(rawSource) as {draft:SourceDraft;lines:SourceLine[]};
    const validLine=(line:SourceLine)=>typeof line?.title==="string"&&typeof line?.quantity==="string"&&typeof line?.unitPrice==="string";
    if(!["order","invoice"].includes(parsed.draft?.kind)||typeof parsed.draft.reference!=="string"||
     !validLine(parsed.draft)||!Array.isArray(parsed.lines)||parsed.lines.length>19||!parsed.lines.every(validLine))throw Error("bad source draft");
    setSourceDraft(parsed.draft);setExtraLines(parsed.lines);
    setSourceBase({draft:parsed.draft,lines:parsed.lines});
   }
   setFields(restored);setDraftBase(restored);setExpanded(true);keyRef.current=sessionStorage.getItem(draftKey+":key")||"";
   setNotice(bn?"খসড়া ফিরেছে; এটি এখনও জমা দেওয়া হয়নি।":"Draft restored; not submitted.");
  }catch{setError(bn?"খসড়াটি ফিরিয়ে আনা যায়নি।":"Unable to restore the draft.")}
 };
 async function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(submitting||!canWrite||environment!=="sandbox")return;
  const linked=fields.sourceKind!=="standalone";
  const amount=linked?null:minor(fields.amount);
  const source=linked?sources.find(x=>x.id===fields.sourceId&&x.source_kind===fields.sourceKind):undefined;
  if((!linked&&amount===null)||(linked&&!source)||fields.reference.trim().length<1||fields.reference.length>128){
   setError(bn?"সঠিক রেফারেন্স ও ২ দশমিক পর্যন্ত পরিমাণ দিন।":"Enter a valid reference and amount with up to two decimals.");return;
  }
  if(!keyRef.current)keyRef.current=crypto.randomUUID();
  try{sessionStorage.setItem(draftKey,JSON.stringify(fields));sessionStorage.setItem(draftKey+":key",keyRef.current)}catch{}
  setSubmitting(true);setError("");setNotice("");
  try{
   const result=await fetch(api,{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","Idempotency-Key":keyRef.current},
    body:JSON.stringify({merchant_reference:fields.reference.trim(),
     ...(linked?{[fields.sourceKind+"_id"]:source?.id}:{amount_minor:amount}),
     currency:"BDT",expires_in_minutes:Number(fields.expiry)})});
   const json=await result.json();
   if(!result.ok)throw {code:json.error?.code||json.code};
   keyRef.current="";
   setFields(empty);setDraftBase(empty);setExpanded(false);
   try{sessionStorage.removeItem(draftKey);sessionStorage.removeItem(draftKey+":key")}catch{}
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
  if(!uuid.test(id)||!canWrite||acting)return;
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
 async function createSource(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(sourceBusy||!canWrite||environment!=="sandbox")return;
  setSourceError("");setNotice("");
  const rawLines:SourceLine[]=[{title:sourceDraft.title,quantity:sourceDraft.quantity,unitPrice:sourceDraft.unitPrice},...extraLines];
  const lines=rawLines.map(row=>({title:row.title.trim(),quantity:Number(row.quantity),unit_amount_minor:minor(row.unitPrice)}));
  const total=lines.reduce((sum,row)=>sum+row.quantity*(row.unit_amount_minor||0),0);
  if(!sourceDraft.reference.trim()||sourceDraft.reference.length>128||lines.length>20||
   !lines.every(row=>row.title.length>0&&row.title.length<=160&&
    Number.isSafeInteger(row.quantity)&&row.quantity>=1&&row.quantity<=9999&&row.unit_amount_minor!==null)||
   !Number.isSafeInteger(total)||total<=0||total>100000000000){
   setSourceError(bn?"প্রতিটি লাইনের শিরোনাম, সংখ্যা ও মূল্য সঠিক দিন।":"Check every line title, quantity and unit price.");return;
  }
  setSourceBusy(true);
  try{
   const response=await fetch(sourcesApi,{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({source_kind:sourceDraft.kind,source_reference:sourceDraft.reference.trim(),
     items:lines})});
   const body=await response.json();
   if(!response.ok)throw {code:body.error?.code||body.code};
   const issued=body as Source;
   setSourceDraft(initialSource);setExtraLines([]);
   setSourceBase({draft:initialSource,lines:[]});
   try{sessionStorage.removeItem(draftKey+":source")}catch{}
   keyRef.current="";
   setFields(prev=>({...prev,sourceKind:issued.source_kind,sourceId:issued.id}));
   setExpanded(true);
   setNotice(bn?"সার্ভার নথির মোট হিসাব করেছে; কোনো পেমেন্ট হয়নি।":"Server-priced document issued; no payment occurred.");
   await refreshSources();
  }catch(reason){setSourceError(short((reason as {code?:string}).code||"",bn));}
  finally{setSourceBusy(false);}
 }
 const visible=data.filter(item=>(statusFilter==="all"||item.state===statusFilter)
   &&(item.merchant_reference||"").toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="pg05-merchant">
  {selected&&<PaymentRequestDetail key={selected} id={selected} workspaceId={workspaceId} environment={environment} locale={locale} onClose={()=>selectDetail("")}/>}
  <section className="ds-panel pg05-section">
   <div className="pg05-topline">
    <div><p className="ds-eyebrow">{bn?"রিকোয়েস্ট ব্যবস্থাপনা":"REQUEST OPERATIONS"}</p>
     <h2>{bn?"পেমেন্ট রিকোয়েস্ট":"Payment requests"}</h2>
     <p>{bn?"সার্ভার-নির্ধারিত পরিমাণ, নির্দিষ্ট মেয়াদ ও প্রেরকের নম্বর। পেমেন্ট কেবল প্রকৃত প্রমাণে যাচাই হবে।":"Server-issued amount, expiry and payer lock. Only trusted receipt evidence can verify funds."}</p></div>
    <button type="button" className="ek-action" onClick={()=>setExpanded(x=>!x)} aria-expanded={expanded} disabled={!canWrite||load==="forbidden"||environment==="live"}>
     {expanded?(bn?"ফর্ম বন্ধ":"Close form"):(bn?"রিকোয়েস্ট তৈরি":"+ Create request")}</button>
   </div>
   <p className="pg05-banner" role="note">{environment==="sandbox"?(bn?"Sandbox পরীক্ষা — আসল টাকা পাঠাবেন না; কোনো বাস্তব গ্রহণকারী নম্বর নেই।":"Sandbox test — no real money; no genuine receiving number is configured."):(bn?"Live receiving source সংযুক্ত নয়। নতুন রিকোয়েস্ট নিরাপদে বন্ধ রাখা হয়েছে।":"Live receiving source unavailable. New requests are disabled.")}</p>
   {!canWrite&&<p role="note">{bn?"শুধু দেখার অনুমতি আছে।":"Read-only access. An editor can issue or cancel requests."}</p>}
   {expanded&&<form onSubmit={create} className="pg05-form"><fieldset disabled={submitting||!canWrite||environment==="live"}>
    <div className="pg05-two">
     <label>{bn?"ব্যবসার রেফারেন্স":"Merchant reference"}
      <input required maxLength={128} value={fields.reference} onChange={e=>edit("reference",e.target.value)} placeholder="ORDER-1024"/></label>
     <label>{bn?"রিকোয়েস্টের ধরন":"Request type"}
      <select value={fields.sourceKind} onChange={e=>{keyRef.current="";setNotice("");setFields(f=>({...f,sourceKind:e.target.value as Fields["sourceKind"],sourceId:""}))}}>
       <option value="standalone">{bn?"স্বতন্ত্র":"Standalone"}</option>
       <option value="order">{bn?"ইস্যু করা অর্ডার":"Issued order"}</option>
       <option value="invoice">{bn?"ইস্যু করা ইনভয়েস":"Issued invoice"}</option>
      </select></label>
     {fields.sourceKind==="standalone"?<label>{bn?"পরিমাণ (BDT)":"Amount (BDT)"}
      <input required inputMode="decimal" value={fields.amount} onChange={e=>edit("amount",e.target.value)} placeholder="500.00" aria-describedby="pg05-amount-hint"/>
      <small id="pg05-amount-hint">{bn?"নির্দিষ্ট পরিমাণ; পরবর্তী সময়ে বদলানো যাবে না।":"Exact amount; cannot be edited after issuance."}</small></label>:
      <label>{bn?"ইস্যু করা নথি":"Issued source document"}
       <select required value={fields.sourceId} onChange={e=>edit("sourceId",e.target.value)}>
        <option value="">{bn?"নথি নির্বাচন করুন":"Select document"}</option>
        {sources.filter(x=>x.source_kind===fields.sourceKind).map(x=><option key={x.id} value={x.id}>{x.source_reference} — {number(x.amount_minor,locale)}</option>)}
       </select>
       <small>{sourceLoad==="loading"?(bn?"নথি লোড হচ্ছে…":"Loading documents…"):sourceLoad==="error"?(bn?"নথি লোড হয়নি":"Documents unavailable"):
        (bn?"পরিমাণ সার্ভার নির্ধারণ করে; ফর্ম দিয়ে বদলানো যায় না।":"Source amount is resolved by the server, not by the form.")}</small>
      </label>}
     <label>{bn?"মেয়াদ":"Expires in"}
      <select value={fields.expiry} onChange={e=>edit("expiry",e.target.value)}>{[5,10,15,30,60].map(value=><option key={value} value={value}>{value} {bn?"মিনিট":"minutes"}</option>)}</select></label>
     <div className="pg05-disabled-field"><strong>{bn?"নথির মোট অপরিবর্তনীয়":"Immutable document total"}</strong>
       <small>{bn?"নথির লাইন থেকে সার্ভার মোট হিসাব করে। সংশোধন করতে নতুন নথি ইস্যু করুন।":"The server computes totals from document lines. Issue a new source to make a correction."}</small></div>
    </div>
    <div className="pg05-actions">
     <button type="submit" className="ek-action" disabled={submitting||environment==="live"}>{submitting?(bn?"তৈরি হচ্ছে…":"Creating…"):(bn?"Sandbox রিকোয়েস্ট তৈরি":"Create sandbox request")}</button>
     <button type="button" onClick={saveDraft}>{bn?"খসড়া রাখুন":"Save draft"}</button>
     <button type="button" onClick={restoreDraft}>{bn?"খসড়া ফিরিয়ে আনুন":"Restore draft"}</button>
     <button type="button" onClick={()=>{setFields(empty);setDraftBase(empty);keyRef.current="";try{sessionStorage.removeItem(draftKey);sessionStorage.removeItem(draftKey+":key")}catch{}}}>{bn?"মুছে ফেলুন":"Discard"}</button>
    </div>
    {dirty&&<p className="pg05-muted" role="status">{bn?"সংরক্ষণ না করা পরিবর্তন আছে।":"Unsaved changes."}</p>}
   </fieldset></form>}
  </section>
  <section className="ds-panel pg05-section">
   <div className="pg05-topline"><div>
    <p className="ds-eyebrow">{bn?"ইস্যু করা নথি":"ISSUED DOCUMENTS"}</p>
    <h2>{bn?"অর্ডার / ইনভয়েসের উৎস":"Order and invoice sources"}</h2>
    <p>{bn?"একটি নথির লাইন থেকে BDT মোট হিসাব করে সার্ভার ইস্যু করবে। এটি যাচাইকৃত পেমেন্ট বা পূর্ণ ইনভয়েস ম্যানেজমেন্ট নয়।":"Issue a minimal immutable order or invoice snapshot. The server calculates the BDT total from lines. This is not a paid invoice or full commerce management."}</p>
   </div><button type="button" onClick={()=>void refreshSources()} disabled={sourceLoad==="loading"}>{bn?"নথি রিফ্রেশ":"Refresh sources"}</button></div>
   <form className="pg05-form" onSubmit={createSource}><fieldset disabled={sourceBusy||!canWrite||environment==="live"}>
    <div className="pg05-two">
     <label>{bn?"নথির ধরন":"Document type"}
      <select value={sourceDraft.kind} onChange={e=>setSourceDraft(f=>({...f,kind:e.target.value as SourceDraft["kind"]}))} disabled={sourceBusy}>
       <option value="invoice">{bn?"ইনভয়েস":"Invoice"}</option><option value="order">{bn?"অর্ডার":"Order"}</option>
      </select></label>
     <label>{bn?"নথির রেফারেন্স":"Document reference"}
      <input required maxLength={128} value={sourceDraft.reference} onChange={e=>setSourceDraft(f=>({...f,reference:e.target.value}))} placeholder="INV-2026-001" disabled={sourceBusy}/></label>
     <label>{bn?"লাইনের বিবরণ":"Line description"}
      <input required maxLength={160} value={sourceDraft.title} onChange={e=>setSourceDraft(f=>({...f,title:e.target.value}))} placeholder={bn?"সেবা বা পণ্যের নাম":"Product or service name"} disabled={sourceBusy}/></label>
     <label>{bn?"সংখ্যা":"Quantity"}
      <input required inputMode="numeric" pattern="[1-9][0-9]*" value={sourceDraft.quantity} onChange={e=>setSourceDraft(f=>({...f,quantity:e.target.value}))} disabled={sourceBusy}/></label>
     <label>{bn?"প্রতি ইউনিট মূল্য (BDT)":"Unit price (BDT)"}
      <input required inputMode="decimal" value={sourceDraft.unitPrice} onChange={e=>setSourceDraft(f=>({...f,unitPrice:e.target.value}))} placeholder="250.00" disabled={sourceBusy}/></label>
    </div>
    {extraLines.map((line,index)=><div className="pg05-two" key={index}>
      <label>{bn?"লাইনের বিবরণ":"Line description"} ({index+2})
       <input required maxLength={160} value={line.title} disabled={sourceBusy}
        onChange={e=>setExtraLines(rows=>rows.map((x,i)=>i===index?{...x,title:e.target.value}:x))}/></label>
      <label>{bn?"সংখ্যা":"Quantity"}
       <input required inputMode="numeric" pattern="[1-9][0-9]*" value={line.quantity} disabled={sourceBusy}
        onChange={e=>setExtraLines(rows=>rows.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label>
      <label>{bn?"প্রতি ইউনিট মূল্য (BDT)":"Unit price (BDT)"}
       <input required inputMode="decimal" value={line.unitPrice} disabled={sourceBusy}
        onChange={e=>setExtraLines(rows=>rows.map((x,i)=>i===index?{...x,unitPrice:e.target.value}:x))}/></label>
      <button type="button" disabled={sourceBusy} onClick={()=>setExtraLines(rows=>rows.filter((_,i)=>i!==index))}>{bn?"লাইন বাদ দিন":"Remove line"}</button>
     </div>)}
    <button type="button" disabled={sourceBusy||extraLines.length>=19} onClick={()=>setExtraLines(rows=>[...rows,{title:"",quantity:"1",unitPrice:""}])}>
     {bn?"আরেকটি লাইন যোগ করুন":"Add another line"} ({extraLines.length+1}/20)
    </button>
    <p className="pg05-muted">{bn?"সর্বোচ্চ ২০টি লাইন; সার্ভারই মোট মূল্য হিসাব করবে এবং ইস্যু করা নথি পরিবর্তন করা যাবে না।":"Up to 20 lines. The server computes and locks the issued document total, regardless of any client preview."}</p>
    <button className="ek-action" type="submit" disabled={sourceBusy||environment==="live"}>{sourceBusy?(bn?"ইস্যু হচ্ছে…":"Issuing…"):(bn?"নথি ইস্যু করুন":"Issue document")}</button>
    {sourceError&&<p role="alert" className="ek-form-error">{sourceError}</p>}
    {dirty&&<p role="status" className="pg05-muted">{bn?"নথি বা রিকোয়েস্টে সংরক্ষণ না করা পরিবর্তন আছে।":"Unsaved document or request changes."}</p>}
   </fieldset></form>
   {sourceLoad==="loading"?<p role="status">{bn?"ইস্যু করা নথি লোড হচ্ছে…":"Loading issued documents…"}</p>:
    sourceLoad==="error"?<div className="ds-empty" role="alert"><p>{sourceError|| (bn?"নথির তালিকা পাওয়া যাচ্ছে না।":"Issued documents unavailable.")}</p>
     <button type="button" onClick={()=>void refreshSources()}>{bn?"আবার চেষ্টা করুন":"Retry"}</button></div>:
    sources.length===0?<p className="pg05-muted">{bn?"এখনো কোনো ইস্যু করা নথি নেই।":"No issued source documents yet."}</p>:
    <div className="pg05-records" aria-label={bn?"ইস্যু করা নথি":"Issued documents"}>
     {sources.map(source=><article key={source.id} className="pg05-record">
      <div className="pg05-record-main"><div><strong>{source.source_reference}</strong>
       <small>{source.source_kind==="invoice"?(bn?"ইনভয়েস":"Invoice"):(bn?"অর্ডার":"Order")}</small></div>
       <div className="pg05-total"><strong>{number(source.amount_minor,locale)}</strong></div></div>
      <div className="pg05-record-meta"><span>{bn?"ইস্যুর সময়":"Issued"}: {new Date(source.issued_at).toLocaleString(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",timeZoneName:"short"})}</span></div>
      <details><summary>{bn?"ইস্যু করা লাইন দেখুন":"View issued line items"}</summary><ul>{source.items.map((line,index)=><li key={index}>{line.title} — {line.quantity} × {number(line.unit_amount_minor,locale)}</li>)}</ul></details>
      <div className="pg05-actions"><button type="button" disabled={!canWrite||environment==="live"||load==="forbidden"}
       onClick={()=>{setFields(prev=>({...prev,sourceKind:source.source_kind,sourceId:source.id,reference:prev.reference||source.source_reference+"-pay"}));
        keyRef.current="";setExpanded(true);setNotice("");}}>
       {bn?"এই নথির পেমেন্ট রিকোয়েস্ট":"Create payment request"} ↗</button></div>
     </article>)}
    </div>}
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
   {load!=="ready"&&data.length>0&&<p role="status" className="pg05-banner">{bn?"সর্বশেষ পাওয়া তথ্য দেখানো হচ্ছে।":"Showing the last loaded records."} {error}</p>}
   {load==="loading"&&data.length===0?<p role="status" aria-live="polite">{bn?"আসল রিকোয়েস্ট লোড হচ্ছে…":"Loading actual requests…"}</p>:
    load!=="ready"&&data.length===0?<div className="ds-empty" role={load==="forbidden"?"alert":"status"}><h3>{load==="forbidden"?(bn?"অনুমতি নেই":"Access denied"):(bn?"ডেটার উৎস উপলব্ধ নয়":"Data source unavailable")}</h3><p>{error}</p><button type="button" onClick={()=>void refresh()}>{bn?"আবার চেষ্টা করুন":"Retry"}</button></div>:
    visible.length===0?<div className="ds-empty"><h3>{bn?"কোনো মিল পাওয়া যায়নি":"No matching requests"}</h3><p>{data.length===0?(bn?"এই sandbox-এ এখনো কোনো বাস্তব request record নেই।":"No issued request records in this sandbox yet."):(bn?"অন্য ফিল্টার দিয়ে দেখুন।":"Try another filter.")}</p></div>:
    <div className="pg05-records">{visible.map(item=>{
     const checkout="/"+locale+"/checkout/"+item.checkout_token;
     return <article className="pg05-record" key={item.id}>
      <div className="pg05-record-main"><div><strong>{item.merchant_reference}</strong><small>{item.id}</small></div>
       <div className="pg05-total"><strong>{number(item.amount_minor,locale)}</strong><span className="pg05-state" data-state={item.state}>{statusLabel(item.state,bn)}</span></div></div>
      <div className="pg05-record-meta">{item.source_reference&&<span>{item.source_kind==="invoice"?(bn?"ইনভয়েস":"Invoice"):(bn?"অর্ডার":"Order")}: {item.source_reference}</span>}<span>{bn?"মেয়াদ":"Expires"}: {new Date(item.expires_at).toLocaleString(locale==="bn"?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",timeZoneName:"short"})}</span><span>{bn?"পরিবেশ":"Environment"}: Sandbox</span></div>
      <div className="pg05-actions">
       <button type="button" onClick={()=>selectDetail(item.id)}>{bn?"তথ্য ও ইতিহাস":"Details and history"}</button>
       <Link href={checkout}>{bn?"চেকআউট খুলুন":"Open checkout"} ↗</Link>
       <button type="button" onClick={async()=>{
        try{await navigator.clipboard.writeText(location.origin+checkout);setCopied(item.id);}
        catch{setError(bn?"লিংক কপি করা যায়নি।":"Could not copy link.")}
       }}>{copied===item.id?(bn?"কপি হয়েছে":"Copied"):(bn?"লিংক কপি":"Copy link")}</button>
       {canWrite&&["requires_payer","awaiting_payment"].includes(item.state)&&<button disabled={acting===item.id} type="button" onClick={()=>void cancel(item.id)}>{acting===item.id?(bn?"বাতিল হচ্ছে…":"Cancelling…"):(bn?"বাতিল করুন":"Cancel request")}</button>}
      </div></article>})}</div>}
   {error&&load==="ready"&&<p role="alert" className="ek-form-error">{error}</p>}
   {notice&&<p role="status" className="ek-account-success">{notice}</p>}
  </section>
 </div>;
}
