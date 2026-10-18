"use client";
import {PlanResourceStatus,useResourceLimit} from "./plan-resource-status";
import {planLimitMessage} from "../lib/plan-resource-limits";

import {useDashboardInitialData} from "./dashboard-initial-data";
import Link from "next/link";
import {PaymentRequestDetail} from "./payment-request-detail";
import {RefModal,RefIcon} from "./reference-ui";
import {merchantStatusLabel} from "../lib/dashboard-status-labels";
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
const short=(code:string,bn:boolean)=>planLimitMessage(code,bn,"payments")??(({
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
} as Record<string,string>)[code]||(bn?"অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।":"Request was not completed. Retry."));
function minor(value:string):number|null{
 value=value.replace(/[০-৯]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(value))return null;
 const [t,p=""]=value.split(".");
 const n=Number(t)*100+Number((p+"00").slice(0,2));
 return Number.isSafeInteger(n)&&n>0&&n<=100000000000?n:null;
}
const number=(amount:number,locale:Locale)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(amount/100);
function statusLabel(status:string,bn:boolean){return merchantStatusLabel("request",status,bn?"bn":"en")}
export function PaymentRequests({locale,userId,workspaceId,environment,canWrite,canPaymentLinks=false,canInvoices=false}:{
 locale:Locale;userId:string;workspaceId:string;environment:PaymentEnvironment;canWrite:boolean;canPaymentLinks?:boolean;canInvoices?:boolean;
}){
 const bn=locale==="bn";
 const paymentLimit=useResourceLimit("payments",workspaceId,environment);
 const [selected,setSelected]=useState("");
 useEffect(()=>{const id=new URLSearchParams(location.search).get("request");if(id&&uuid.test(id))void Promise.resolve().then(()=>setSelected(id));},[]);
 function selectDetail(id:string){setSelected(id);const url=new URL(location.href);if(id)url.searchParams.set("request",id);else url.searchParams.delete("request");history.replaceState(history.state,"",url);}

 const seed=useDashboardInitialData<{data:Intent[]}>("requests");
 const sourcesSeed=useDashboardInitialData<{data:Source[];items:{id:string;reference:string;status:string;amount_minor:number;paid_minor:number;created_at:string;body:{items:Source["items"]}}[]}>("sources");
 const [data,setData]=useState<Intent[]>(seed?.data?.data??[]);
 const [sources,setSources]=useState<Source[]>(environment==="live"?(sourcesSeed?.data?.items??[]).filter(x=>x.status==="issued"&&x.amount_minor>x.paid_minor).map(x=>({id:x.id,source_kind:"invoice",source_reference:x.reference,amount_minor:x.amount_minor-x.paid_minor,issued_at:x.created_at,items:x.body.items})):sourcesSeed?.data?.data??[]);
 const [sourceLoad,setSourceLoad]=useState<"loading"|"ready"|"error">(sourcesSeed?(sourcesSeed.error?"error":"ready"):"loading");
 const [sourceDraft,setSourceDraft]=useState<SourceDraft>(initialSource);
 const [extraLines,setExtraLines]=useState<SourceLine[]>([]);
 const [sourceBase,setSourceBase]=useState<{draft:SourceDraft;lines:SourceLine[]}>({draft:initialSource,lines:[]});
 const [sourceBusy,setSourceBusy]=useState(false);
 const [sourceError,setSourceError]=useState("");
 const [load,setLoad]=useState<LoadState>(seed?(seed.error?"error":"ready"):"loading");
 const [error,setError]=useState(seed?.error??"");
 const [fields,setFields]=useState<Fields>(empty);
 const [draftBase,setDraftBase]=useState<Fields>(empty);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get("create")!=="1")return;const timer=setTimeout(()=>{url.searchParams.delete("create");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);setExpanded(true)},0);return()=>clearTimeout(timer)},[]);
 const openNewRequest=()=>{if(paymentLimit.blocked)return;setFields(current=>({...current,reference:current.reference.trim()||"REQ-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase()}));setExpanded(true)};
 const [sourceOpen,setSourceOpen]=useState(false);
 const [visibleLimit,setVisibleLimit]=useState(20);
 const createDialog=useRef<HTMLDialogElement|null>(null),sourceDialog=useRef<HTMLDialogElement|null>(null);
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
 useEffect(()=>{const dialog=createDialog.current;if(!dialog)return;if(expanded&&!dialog.open)dialog.showModal();else if(!expanded&&dialog.open)dialog.close()},[expanded]);
 useEffect(()=>{const dialog=sourceDialog.current;if(!dialog)return;if(sourceOpen&&!dialog.open)dialog.showModal();else if(!sourceOpen&&dialog.open)dialog.close()},[sourceOpen]);

 useEffect(()=>{if(!notice&&!copied)return;const timer=setTimeout(()=>{setNotice("");setCopied("")},2400);return()=>clearTimeout(timer)},[notice,copied]);
 const draftKey="ekmivo:pg05-request:v1:"+userId+":"+workspaceId+":"+environment;
 const api="/api/go/workspaces/"+workspaceId+"/payment-intents?environment="+environment;
 const sourcesApi="/api/go/workspaces/"+workspaceId+(environment==="live"?"/documents/invoices":"/linked-sources")+"?environment="+environment;
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
  if(environment==="live"&&!canInvoices){setSources([]);setSourceLoad("ready");setSourceError("");return;}

  setSourceLoad("loading");
  try{
   const response=await fetch(sourcesApi,{cache:"no-store",credentials:"same-origin"});
   const body=await response.json();
   if(!response.ok){if(response.status===401||response.status===403)setSources([]);throw Error(body.error?.code||body.code);}
   setSources(environment==="live"?(body.items||[]).filter((x:{status:string;amount_minor:number;paid_minor:number})=>x.status==="issued"&&x.amount_minor>x.paid_minor).map((x:{id:string;reference:string;amount_minor:number;paid_minor:number;created_at:string;body:{items:Source["items"]}})=>({id:x.id,source_kind:"invoice",source_reference:x.reference,amount_minor:x.amount_minor-x.paid_minor,issued_at:x.created_at,items:x.body.items})):Array.isArray(body.data)?body.data:[]);
   setSourceLoad("ready");setSourceError("");
  }catch{setSourceLoad("error");setSourceError(bn?"নথি লোড হয়নি। আবার চেষ্টা করুন।":"Document sources unavailable. Retry.");}
 },[sourcesApi,environment,bn,canInvoices]);
 useEffect(()=>{if(seed)return;void Promise.resolve().then(()=>refresh())},[refresh,seed]);
 useEffect(()=>{if(sourcesSeed)return;void Promise.resolve().then(()=>refreshSources())},[refreshSources,sourcesSeed]);
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
  if(submitting||paymentLimit.blocked||!canWrite)return;
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
   setNotice(environment==="sandbox"?(bn?"Sandbox payment request তৈরি হয়েছে। আসল টাকা পাঠাবেন না।":"Sandbox payment request created. Do not send real money."):(bn?"পেমেন্ট রিকোয়েস্ট তৈরি হয়েছে। সার্ভার যাচাই ছাড়া Paid হবে না।":"Payment request created. Paid status requires server verification."));
   await refresh();
   if(json.checkout_token){
    setCopied("");
   }
  }catch(reason){
   const failure=reason as {code?:string};
   setError(short(failure.code||"",bn));
  }finally{setSubmitting(false);void paymentLimit.refresh();}
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
   setSourceOpen(false);setExpanded(true);
   setNotice(bn?"সার্ভার নথির মোট হিসাব করেছে; কোনো পেমেন্ট হয়নি।":"Server-priced document issued; no payment occurred.");
   await refreshSources();
  }catch(reason){setSourceError(short((reason as {code?:string}).code||"",bn));}
  finally{setSourceBusy(false);}
 }
 const selectedRequest=data.find(item=>item.id===selected);
 const visible=data.filter(item=>(statusFilter==="all"||item.state===statusFilter)
   &&(item.merchant_reference||"").toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="pg05-merchant ekv3-requests">
  <div className="ref-dashboard"><div className="ref-page">
  <header className="ekv3-page-header top"><div><h1>{bn?"একবারের রিকোয়েস্ট":"One-time requests"}</h1><p>{bn?"একবারের পেমেন্ট অনুরোধ তৈরি ও পরিচালনা করুন।":"Create and manage one-time payments."}</p></div><div className="ekv3-head-actions"><button type="button" className="ekv3-icon-button" disabled={load==="loading"} aria-label={bn?"রিফ্রেশ":"Refresh"} title={bn?"রিফ্রেশ":"Refresh"} onClick={()=>void refresh()}><RefIcon name="refresh"/></button>{canWrite&&<button type="button" className="ekv3-primary" disabled={paymentLimit.blocked} aria-haspopup="dialog" onClick={openNewRequest}>{bn?"নতুন রিকোয়েস্ট":"New request"}</button>}</div></header>
  <PlanResourceStatus value={paymentLimit} locale={locale}/>
  <div className="tabs">{canPaymentLinks&&<Link href={`/w/${workspaceId}/payments/payment-links`}>{bn?"পেমেন্ট লিংক":"Payment links"}</Link>}<button type="button" className="on" aria-current="page">{bn?"একবারের রিকোয়েস্ট":"One-time requests"}</button></div><div className="card ekv3-request-card"><div className="ekv3-requests-toolbar toolbar"><input type="search" aria-label={bn?"রেফারেন্স খুঁজুন":"Search reference"} placeholder={bn?"রেফারেন্স খুঁজুন":"Search reference"} value={search} onChange={event=>{setSearch(event.target.value);setVisibleLimit(20)}}/><select aria-label={bn?"অবস্থা":"Status"} value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setVisibleLimit(20)}}><option value="all">{bn?"সব":"All"}</option>{["completed","requires_payer","awaiting_payment","expired","cancelled"].map(key=><option value={key} key={key}>{statusLabel(key,bn)}</option>)}</select></div>
  {error&&<div className="ekv3-page-error" role="alert">{error}<button type="button" onClick={()=>void refresh()}>{bn?"আবার চেষ্টা করুন":"Try again"}</button></div>}
  <div className="ekv3-table-scroller tw" role="region" tabIndex={0} aria-label={bn?"একবারের রিকোয়েস্ট":"One-time requests"}><table className="ekv3-table"><thead><tr><th>{bn?"রেফারেন্স":"Reference"}</th><th className="ekv3-numeric">{bn?"পরিমাণ":"Amount"}</th><th>{bn?"অবস্থা":"Status"}</th><th>{bn?"মেয়াদ":"Expires"}</th><th><span className="sr-only">{bn?"অ্যাকশন":"Actions"}</span></th></tr></thead>
   <tbody>{load==="loading"&&!data.length?[0,1,2].map(n=><tr className="ekv3-loading-row" key={n}><td colSpan={5}><div className="ekv3-skeleton-row"><i/><span/><b/></div></td></tr>):visible.slice(0,visibleLimit).map(item=>{const checkout="/checkout/"+item.checkout_token;return <tr key={item.id} className="ekv3-clickable" tabIndex={0} onClick={()=>selectDetail(item.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectDetail(item.id)}}}>
    <td><strong title={item.merchant_reference}>{item.source_reference?item.source_reference:item.merchant_reference.startsWith("DOC-")?"REQ-"+item.id.slice(0,8).toUpperCase():item.merchant_reference.length>35?item.merchant_reference.slice(0,31)+"…":item.merchant_reference}</strong>{item.source_kind==="invoice"&&<small className="ekv3-request-origin">{bn?"ইনভয়েস থেকে":"From invoice"}</small>}</td>
    <td className="ekv3-numeric">{number(item.amount_minor,locale)}</td>
    <td><span className="ekv3-status" data-tone={item.state==="completed"?"success":item.state==="expired"||item.state==="cancelled"?"neutral":"warning"}>{statusLabel(item.state,bn)}</span></td>
    <td><time dateTime={item.expires_at} title={new Date(item.expires_at).toLocaleString(locale==="bn"?"bn-BD":"en-BD")}>{new Date(item.expires_at).toLocaleDateString(locale==="bn"?"bn-BD":"en-BD",{day:"numeric",month:"short"})}</time></td>
    <td><details className="ekv3-row-menu" onClick={event=>event.stopPropagation()}><summary aria-label={bn?"রিকোয়েস্ট অ্যাকশন":"Request actions"} title={bn?"আরও":"More"}><RefIcon name="more"/></summary><div className="ekv3-row-popover"><button type="button" onClick={()=>selectDetail(item.id)}>{bn?"বিস্তারিত দেখুন":"View details"}</button><Link href={checkout}>{bn?"চেকআউট খুলুন":"Open checkout"}</Link><button type="button" onClick={()=>void navigator.clipboard.writeText(location.origin+checkout).then(()=>setCopied(item.id)).catch(()=>setError(bn?"লিংক কপি হয়নি।":"Unable to copy link."))}>{bn?"লিংক কপি":"Copy link"}</button>{canWrite&&["requires_payer","awaiting_payment"].includes(item.state)&&<button type="button" disabled={acting===item.id} onClick={()=>void cancel(item.id)}>{bn?"বাতিল করুন":"Cancel request"}</button>}</div></details></td>
   </tr>})}</tbody></table>
   {load!=="loading"&&visible.length===0&&<p className="ekv3-empty">{bn?"কোনো রিকোয়েস্ট পাওয়া যায়নি।":"No requests found."}</p>}
  </div>
  {visible.length>visibleLimit&&<div className="ekv3-load-more"><button type="button" onClick={()=>setVisibleLimit(v=>v+20)}>{bn?"আরও দেখুন":"Load more"}</button></div>}
  </div></div></div>
  <dialog ref={createDialog} className="ekv3-request-modal" aria-labelledby="ekv3-request-title" onCancel={()=>setExpanded(false)} onClose={()=>setExpanded(false)} onClick={e=>{if(e.target===e.currentTarget)setExpanded(false)}}>
   <div className="ekv3-modal-heading"><h2 id="ekv3-request-title">{bn?"নতুন রিকোয়েস্ট":"New request"}</h2><button type="button" aria-label={bn?"বন্ধ":"Close"} onClick={()=>setExpanded(false)}>×</button></div>
   <form onSubmit={create} className="pg05-form"><fieldset disabled={submitting||paymentLimit.blocked||!canWrite}>
    <div className="pg05-two">
     <label>{bn?"ব্যবসার রেফারেন্স":"Merchant reference"}
      <input required maxLength={128} value={fields.reference} onChange={e=>edit("reference",e.target.value)} placeholder="ORDER-1024"/></label>
     <label>{bn?"রিকোয়েস্টের ধরন":"Request type"}
      <select value={fields.sourceKind} onChange={e=>{keyRef.current="";setNotice("");setFields(f=>({...f,sourceKind:e.target.value as Fields["sourceKind"],sourceId:""}))}}>
       <option value="standalone">{bn?"স্বতন্ত্র":"Standalone"}</option>
       <option value="order" disabled={environment==="live"}>{bn?"ইস্যু করা অর্ডার":"Issued order"}</option>
       {(environment!=="live"||canInvoices)&&<option value="invoice">{bn?"ইস্যু করা ইনভয়েস":"Issued invoice"}</option>}
      </select></label>
     {fields.sourceKind==="standalone"?<label>{bn?"পরিমাণ (BDT)":"Amount (BDT)"}
      <input required inputMode="decimal" value={fields.amount} onChange={e=>edit("amount",e.target.value)} placeholder="500.00"/>
      </label>:
      <label>{bn?"ইস্যু করা নথি":"Issued source document"}
       <select required value={fields.sourceId} onChange={e=>edit("sourceId",e.target.value)}>
        <option value="">{bn?"নথি নির্বাচন করুন":"Select document"}</option>
        {sources.filter(x=>x.source_kind===fields.sourceKind).map(x=><option key={x.id} value={x.id}>{x.source_reference} — {number(x.amount_minor,locale)}</option>)}
       </select>
       
      </label>}
     <label>{bn?"মেয়াদ":"Expires in"}
      <select value={fields.expiry} onChange={e=>edit("expiry",e.target.value)}>{[5,10,15,30,60].map(value=><option key={value} value={value}>{value} {bn?"মিনিট":"minutes"}</option>)}</select></label>
     
    </div>
    <div className="pg05-actions ekv3-modal-footer"><button type="button" onClick={()=>setExpanded(false)}>{bn?"বাতিল":"Cancel"}</button>
     <button type="submit" className="ekv3-primary" disabled={submitting}>{submitting?(bn?"তৈরি হচ্ছে…":"Creating…"):(bn?"রিকোয়েস্ট তৈরি":"Create request")}</button>
     
     
     
    </div>
    
   </fieldset></form>
   {(environment!=="live"||canInvoices)&&<div className="ekv3-source-link"><button type="button" onClick={()=>{setExpanded(false);setSourceOpen(true)}}>{bn?"নতুন ইনভয়েস বা অর্ডার তৈরি":"Issue source document"}</button></div>}
  </dialog>
  <dialog ref={sourceDialog} className="ekv3-request-modal ekv3-request-large" aria-labelledby="ekv3-source-title" onCancel={()=>setSourceOpen(false)} onClose={()=>setSourceOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setSourceOpen(false)}}>
   <div className="ekv3-modal-heading"><h2 id="ekv3-source-title">{bn?"নথি তৈরি":"Issue document"}</h2><button type="button" aria-label={bn?"বন্ধ":"Close"} onClick={()=>setSourceOpen(false)}>×</button></div>
   <form className="pg05-form" onSubmit={createSource}><fieldset disabled={sourceBusy||!canWrite||environment==="live"}>
    <div className="pg05-two">
     <label>{bn?"নথির ধরন":"Document type"}
      <select value={sourceDraft.kind} onChange={e=>setSourceDraft(f=>({...f,kind:e.target.value as SourceDraft["kind"]}))} disabled={sourceBusy}>
       {(environment!=="live"||canInvoices)&&<option value="invoice">{bn?"ইনভয়েস":"Invoice"}</option>}<option value="order" disabled={environment==="live"}>{bn?"অর্ডার":"Order"}</option>
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
    
    <button className="ekv3-primary" type="submit" disabled={sourceBusy||environment==="live"}>{sourceBusy?(bn?"ইস্যু হচ্ছে…":"Issuing…"):(bn?"নথি ইস্যু করুন":"Issue document")}</button>
    {sourceError&&<p role="alert" className="ek-form-error">{sourceError}</p>}
    
   <div className="ekv3-modal-footer"><button type="button" onClick={()=>setSourceOpen(false)}>{bn?"বাতিল":"Cancel"}</button></div></fieldset></form>
  </dialog>
  <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={Boolean(selected)} drawer title={bn?"রিকোয়েস্টের বিস্তারিত":"Request details"} onClose={()=>selectDetail("")} footer={<><button className="ib" onClick={()=>selectDetail("")}>{bn?"বন্ধ করুন":"Close"}</button>{selectedRequest&&<button className="ib" type="button" onClick={()=>void navigator.clipboard.writeText(location.origin+"/checkout/"+selectedRequest.checkout_token).then(()=>setCopied(selectedRequest.id)).catch(()=>setError(bn?"লিংক কপি হয়নি।":"Unable to copy link."))}>{bn?"লিংক কপি":"Copy link"}</button>}{selectedRequest&&canWrite&&["requires_payer","awaiting_payment"].includes(selectedRequest.state)&&<button className="ib dg" type="button" disabled={Boolean(acting)} onClick={()=>void cancel(selectedRequest.id)}>{bn?"রিকোয়েস্ট বাতিল":"Cancel request"}</button>}</>}>{selected&&<PaymentRequestDetail key={selected} id={selected} workspaceId={workspaceId} environment={environment} locale={locale} onClose={()=>selectDetail("")}/>}</RefModal>
  {(notice||copied)&&<div role="status" className="ekv3-toast">{notice||(bn?"লিংক কপি হয়েছে":"Link copied")}</div>}
 </section>;
}
