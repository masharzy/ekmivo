"use client";
import {ExportUpgradeLink} from "./plan-feature-upgrade";
import {useDashboardInitialData} from "./dashboard-initial-data";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {FormEvent} from "react";
import Link from "next/link";
import {FinancialIcon as DashboardIcon} from "./financial-icon";
import {PaymentReportLedger} from "./payment-report-ledger";
import "./ek-financial-pages.css";

type Locale="en"|"bn";
type MoneyRow={amount_minor:number;payment_count:number};
type MethodRow=MoneyRow&{method:string};
type AccountRow=MoneyRow&{account_id:string;method:string;display_suffix:string};
type CustomerRow=MoneyRow&{customer_id:string;reference:string;name:string};
type RefundRow={status:string;amount_minor:number;request_count:number};
type DayRow={day:string;amount_minor:number;payment_count?:number};
type Report={
 verified_gross_minor:number;allocated_minor:number;unallocated_minor:number;payment_count:number;
 seller_reported_returned_minor:number;open_requested_refund_minor:number;refund_request_count:number;
 generated_at:string;methods:MethodRow[];accounts:AccountRow[];customers:CustomerRow[];
 refunds:RefundRow[];statement_links:{amount_minor:number;count:number};daily:DayRow[]
};
type AccountOption={id:string;method:string;display_suffix:string};
type Filters={from:string;to:string;account:string};
type Preset="7"|"30"|"90"|"custom";
type Section="summary"|"payments"|"methods"|"customers"|"refunds"|"payouts";
type ViewState={report:Report;filters:Filters};
type CompareSnapshot={key:string;report:Report;from:string;to:string};
function previousPeriod(filters:Filters):Filters|null{
 const from=Date.parse(filters.from+"T00:00:00Z"),to=Date.parse(filters.to+"T00:00:00Z");
 if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)return null;
 const length=Math.round((to-from)/millis)+1;
 return {from:new Date(from-length*millis).toISOString().slice(0,10),to:new Date(from-millis).toISOString().slice(0,10),account:filters.account};
}
function changePercent(current:number,previous:number):string|null{
 if(!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return null;
 const change=(current-previous)/Math.abs(previous)*100;
 return (change>0?"+":"")+change.toFixed(1)+"%";
}

const sections:Section[]=["summary","payments","methods","customers","refunds","payouts"];
const millis=86400000;
function dhakaToday(){return new Date(Date.now()+6*3600000).toISOString().slice(0,10)}
function startDate(end:string,days:number){return new Date(Date.parse(end+"T00:00:00Z")-(days-1)*millis).toISOString().slice(0,10)}
function defaults():Filters{const end=dhakaToday();return {from:startDate(end,30),to:end,account:""}}
function dateRange(filters:Filters){
 const {from,to}=filters;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return null;
 const start=Date.parse(from+"T00:00:00Z"),end=Date.parse(to+"T00:00:00Z");
 if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString().slice(0,10)!==from||new Date(end).toISOString().slice(0,10)!==to||end<start||end-start>365*millis)return null;
 return {start:new Date(from+"T00:00:00+06:00").toISOString(),end:new Date(Date.parse(to+"T00:00:00+06:00")+millis).toISOString()};
}
function isRow(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value)}
function isNumber(value:unknown){return typeof value==="number"&&Number.isFinite(value)}
function validateReport(value:unknown):value is Report{
 if(!isRow(value))return false;
 const numeric=["verified_gross_minor","allocated_minor","unallocated_minor","payment_count","seller_reported_returned_minor","open_requested_refund_minor","refund_request_count"];
 if(!numeric.every(key=>isNumber(value[key])))return false;
 if(typeof value.generated_at!=="string"||!isRow(value.statement_links)||!isNumber(value.statement_links.amount_minor)||!isNumber(value.statement_links.count))return false;
 for(const key of ["methods","accounts","customers","refunds","daily"]){
  if(!Array.isArray(value[key]))return false;
  if(!(value[key] as unknown[]).every(item=>isRow(item)&&isNumber(item.amount_minor)))return false;
 }
 return true;
}
function cash(minor:number,locale:Locale){return "BDT "+new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100)}
function numeric(value:number,locale:Locale){return new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD").format(value)}
function escapeCSV(value:unknown){
 const raw=String(value??"");
 return '"'+( /^[\s]*[=+\-@\t\r]/.test(raw)?"'"+raw:raw ).replaceAll('"','""')+'"';
}
function exportReport(report:Report,period:Filters,scope:"all"|"summary"="all"){
 const rows:(string|number)[][]=[
  ["section","reference","label","status","amount_minor","count","from","through","currency"],
  ["summary","","verified","",""+report.verified_gross_minor,report.payment_count,period.from,period.to,"BDT"],
  ["summary","","allocated","",report.allocated_minor,"","","","BDT"],
  ["summary","","unallocated","",report.unallocated_minor,"","","","BDT"],
  ["summary","","open_refund","",report.open_requested_refund_minor,report.refund_request_count,"","","BDT"],
  ["summary","","seller_reported_returned","",report.seller_reported_returned_minor,"","","","BDT"],
  ...report.methods.map(r=>["method",r.method,r.method,"",r.amount_minor,r.payment_count,"","","BDT"] as (string|number)[]),
  ...report.accounts.map(r=>["account",r.account_id,r.method+" ••••"+r.display_suffix,"",r.amount_minor,r.payment_count,"","","BDT"] as (string|number)[]),
  ...report.customers.map(r=>["customer",r.customer_id,r.name||r.reference,"",r.amount_minor,r.payment_count,"","","BDT"] as (string|number)[]),
  ...report.refunds.map(r=>["refund","",r.status,r.status,r.amount_minor,r.request_count,"","","BDT"] as (string|number)[]),
  ...report.daily.map(r=>["daily",r.day,r.day+" UTC","",r.amount_minor,"","","","BDT"] as (string|number)[]),
  ["statement","merchant_import","","imported",report.statement_links.amount_minor,report.statement_links.count,"","","BDT"]
 ];
 const exportRows=scope==="summary"?rows.filter((row,index)=>index===0||row[0]==="summary"):rows;
 const csv="\uFEFF"+exportRows.map(row=>row.map(escapeCSV).join(",")).join("\r\n")+"\r\n";
 const uri=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=uri;a.download="ekmivo-report-"+period.from+"-"+period.to+".csv";document.body.append(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(uri),2000);
}
export function PaymentReports({locale,workspaceId,environment,canReveal,canExport}:{locale:Locale;workspaceId:string;environment:string;canReveal:boolean;canExport?:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,bengali:string)=>bn?bengali:en,[bn]);
 const seed=useDashboardInitialData<Report>("report");
 const initialLoad=useRef(Boolean(seed));
 const accountSeed=useDashboardInitialData<{receiving?:{items:AccountOption[]}}>("integrations");
 const initialFilters=defaults();
 const [draft,setDraft]=useState<Filters>(initialFilters);
 const exportDialog=useRef<HTMLDialogElement|null>(null);
 const [exportFormat,setExportFormat]=useState<"csv"|"pdf">("csv");
 const [exportScope,setExportScope]=useState<"all"|"summary">("all");
 const [applied,setApplied]=useState<Filters>(initialFilters);
 const [preset,setPreset]=useState<Preset>("30");
 const [section,setSection]=useState<Section>("summary");
 const [compare,setCompare]=useState(false);
 const [hoverDay,setHoverDay]=useState<string|null>(null);
 const [toast,setToast]=useState("");
 const fromInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),1800);return()=>clearTimeout(timer)},[toast]);
 const [previous,setPrevious]=useState<CompareSnapshot|null>(null);
 const [compareLoading,setCompareLoading]=useState(false);
 const [compareError,setCompareError]=useState("");
 const [response,setResponse]=useState<ViewState|null>(seed?.data&&validateReport(seed.data)?{report:seed.data,filters:initialFilters}:null);
 const [loading,setLoading]=useState(!seed),[error,setError]=useState(seed?.error??""),[refresh,setRefresh]=useState(0);
 const [accounts,setAccounts]=useState<AccountOption[]>(accountSeed?.data?.receiving?.items??[]),[accountError,setAccountError]=useState(false);
 const [accountNumbers,setAccountNumbers]=useState<Record<string,string>>({});
 const root="/w/"+workspaceId+"/payments/";
 useEffect(()=>{
  if(!canReveal)return;
  const controller=new AbortController();
  void fetch("/api/go/workspaces/"+workspaceId+"/phones?environment="+encodeURIComponent(environment),{cache:"no-store",credentials:"same-origin",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error(String(response.status));return response.json()})
   .then(data=>{if(controller.signal.aborted||!Array.isArray(data?.accounts))return;const full:Record<string,string>={};for(const item of data.accounts){if(typeof item?.ID==="string"&&typeof item?.Number==="string"){const digits=item.Number.replace(/\\D/g,"");const local=digits.startsWith("880")?digits.slice(3):digits.startsWith("0")?digits.slice(1):digits;full[item.ID]=local.length===10?"+880 "+local.slice(0,4)+" "+local.slice(4):item.Number}}setAccountNumbers(full)})
   .catch(()=>{/* Receiving account detail is permission-gated; never invent a full number. */});
  return()=>controller.abort();
 },[canReveal,workspaceId,environment]);

 const applies=draft.from===applied.from&&draft.to===applied.to&&draft.account===applied.account;
 const pending=useMemo(()=>dateRange(draft),[draft]);
 const labels:Record<Section,string>={summary:t("Summary","সারাংশ"),payments:t("Payments","পেমেন্ট"),methods:t("Methods","মাধ্যম"),customers:t("Customers","গ্রাহক"),refunds:t("Refunds","রিফান্ড"),payouts:t("Payouts","পেআউট")};
 const refundLabels:Record<string,string>={requested:t("Requested","অনুরোধ"),reviewing:t("In review","পর্যালোচনায়"),approved:t("Approved","অনুমোদিত"),rejected:t("Rejected","প্রত্যাখ্যাত"),seller_reported_returned:t("Seller reported returned","বিক্রেতার ফেরত রিপোর্ট"),cancelled:t("Cancelled","বাতিল")};

 useEffect(()=>{
  if(accountSeed)return;
  const controller=new AbortController();
  void fetch("/api/go/workspaces/"+workspaceId+"/integrations?environment="+encodeURIComponent(environment),{cache:"no-store",signal:controller.signal,credentials:"same-origin"})
   .then(async r=>{if(!r.ok)throw Error(String(r.status));return r.json()})
   .then(data=>{if(controller.signal.aborted)return;const rows=data?.receiving?.items;if(!Array.isArray(rows))throw Error("INVALID_ACCOUNTS");setAccounts(rows.filter((x:unknown)=>isRow(x)&&typeof x.id==="string"&&typeof x.method==="string"&&typeof x.display_suffix==="string"));setAccountError(false)})
   .catch(()=>{if(!controller.signal.aborted)setAccountError(true)});
  return()=>controller.abort();
 },[workspaceId,environment,accountSeed]);

 useEffect(()=>{
  const controller=new AbortController();
  const range=dateRange(applied);
  if(initialLoad.current){initialLoad.current=false;return;}
  const run=async()=>{
   setLoading(true);setError("");
   if(!range){setError(t("Select a valid date range, up to 366 days.","সর্বোচ্চ ৩৬৬ দিনের সঠিক তারিখ দিন।"));setLoading(false);return}
   const params=new URLSearchParams({environment,from:range.start,to:range.end});
   if(applied.account)params.set("account",applied.account);
   try{
    const result=await fetch("/api/go/workspaces/"+workspaceId+"/reports?"+params,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
    if(!result.ok)throw Error(result.status===401?"AUTH":result.status===403?"DENIED":result.status===422?"FILTER":[502,503,504].includes(result.status)?"SOURCE":"HTTP "+result.status);
    const body:unknown=await result.json();
    if(!validateReport(body))throw Error("INVALID_DATA");
    if(controller.signal.aborted)return;
    setResponse({report:body,filters:applied});
   }catch(cause){
    if(controller.signal.aborted)return;
    const code=cause instanceof Error?cause.message:"";
    setError(code==="AUTH"?t("Session expired. Sign in again.","সেশন শেষ। আবার লগইন করুন।"):code==="DENIED"?t("You do not have access to this report.","এই রিপোর্টের অনুমতি নেই।"):code==="FILTER"?t("The selected filters are invalid.","নির্বাচিত ফিল্টার সঠিক নয়।"):code==="SOURCE"?t("Reporting service is temporarily unavailable. Try again shortly.","রিপোর্ট সার্ভিস সাময়িকভাবে পাওয়া যাচ্ছে না। কিছুক্ষণ পরে চেষ্টা করুন।"):t("Report could not be loaded. Try again.","রিপোর্ট লোড করা যায়নি। আবার চেষ্টা করুন।"));
   }finally{if(!controller.signal.aborted)setLoading(false)}
  };
  void run();return()=>controller.abort();
 },[workspaceId,environment,applied,refresh,locale,t]);

 useEffect(()=>{
  if(!compare||!response||loading||error)return;
  const period=previousPeriod(response.filters);
  if(!period)return;
  const dates=dateRange(period);
  if(!dates)return;
  const key=JSON.stringify([workspaceId,environment,response.filters.from,response.filters.to,response.filters.account,response.report.generated_at]);
  const controller=new AbortController();
  const run=async()=>{
   setCompareLoading(true);setCompareError("");
   const params=new URLSearchParams({environment,from:dates.start,to:dates.end});
   if(period.account)params.set("account",period.account);
   try{
    const result=await fetch("/api/go/workspaces/"+workspaceId+"/reports?"+params,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
    if(!result.ok)throw Error("HTTP "+result.status);
    const data:unknown=await result.json();
    if(!validateReport(data))throw Error("INVALID_DATA");
    if(!controller.signal.aborted)setPrevious({key,report:data,from:period.from,to:period.to});
   }catch{
    if(!controller.signal.aborted)setCompareError(locale==="bn"?"আগের সময়ের হিসাব আনা যাচ্ছে না।":"Previous-period comparison is unavailable.");
   }finally{if(!controller.signal.aborted)setCompareLoading(false)}
  };
  void run();
  return()=>controller.abort();
 },[compare,response,workspaceId,environment,loading,error,locale]);

 function apply(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!pending){setError(t("Select a valid date range, up to 366 days.","সর্বোচ্চ ৩৬৬ দিনের সঠিক তারিখ দিন।"));return}setError("");setApplied({...draft});setRefresh(n=>n+1)}
 function quick(days:7|30|90){const to=dhakaToday(),from=startDate(to,days);const next={...draft,from,to};setPreset(String(days) as Preset);setDraft(next);setApplied(next);setRefresh(n=>n+1)}
 const displayed=response?.report??null;
 const active=response?.filters??applied;
 const stale=Boolean(response&&(loading||error||!applies||active.from!==applied.from||active.to!==applied.to||active.account!==applied.account));
 const generated=displayed&&!Number.isNaN(Date.parse(displayed.generated_at))?new Intl.DateTimeFormat(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}).format(new Date(displayed.generated_at)):"";
 const compareKey=response?JSON.stringify([workspaceId,environment,response.filters.from,response.filters.to,response.filters.account,response.report.generated_at]):"";
 const matchedCompare=compare&&previous?.key===compareKey&&!stale?previous:null;
 const avg=displayed&&displayed.payment_count>0?Math.round(displayed.verified_gross_minor/displayed.payment_count):null;
 const delta=matchedCompare&&displayed?changePercent(displayed.verified_gross_minor,matchedCompare.report.verified_gross_minor):null;
 const countDelta=matchedCompare&&displayed?changePercent(displayed.payment_count,matchedCompare.report.payment_count):null;
 const barDays=useMemo(()=>{const from=Date.parse(active.from+"T00:00:00Z"),to=Date.parse(active.to+"T00:00:00Z");if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)return [] as string[];return Array.from({length:Math.min(400,Math.floor((to-from)/millis)+1)},(_,i)=>new Date(from+i*millis).toISOString().slice(0,10))},[active.from,active.to]);
 const byDay=Object.fromEntries((displayed?.daily??[]).map(day=>[day.day,day.amount_minor]));
 const dailyCounts=Object.fromEntries((displayed?.daily??[]).map(day=>[day.day,day.payment_count]));
 const peak=Math.max(1,...barDays.map(day=>byDay[day]??0));
 const niceDay=(day:string)=>new Date(day+"T00:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"short",day:"numeric"});
 const money=(minor:number)=>"BDT "+(minor/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
 const matching=[displayed?.allocated_minor??0,displayed?.unallocated_minor??0,displayed?.statement_links.amount_minor??0];
 const matchingTotal=matching.reduce((a,b)=>a+b,0);
 const percent=(part:number)=>matchingTotal?Math.round(part/matchingTotal*100):0;
 const icon=(name:string)=><DashboardIcon name={name as Parameters<typeof DashboardIcon>[0]["name"]} width={16} height={16}/>;
 const printReport=()=>{const root=document.documentElement,original=root.dataset.theme;root.dataset.theme="light";window.print();if(original===undefined)delete root.dataset.theme;else root.dataset.theme=original};
 return <div className="ek-page-scope er-reference">
  <div className="page">
   <header className="ph"><div><h1>{t("Reports","রিপোর্ট")}</h1><p>{t("Verified payments, matching and refunds for the period you choose.","নির্বাচিত সময়ের যাচাইকৃত পেমেন্ট, মিল ও রিফান্ড।")}</p></div>
    <div className="acts"><button className={"btn"+(loading?" spin":"")} disabled={loading} onClick={()=>{setRefresh(n=>n+1);setToast(t("Refreshed","রিফ্রেশ করা হয়েছে"))}}>{icon("refresh")}{t("Refresh","রিফ্রেশ")}</button>
     {canExport===false&&<ExportUpgradeLink locale={locale} workspaceId={workspaceId}/>}{canExport&&<button className="btn" disabled={!displayed||stale} onClick={()=>{if(displayed){exportReport(displayed,active);setToast(t("Export started","এক্সপোর্ট শুরু হয়েছে"))}}}>{icon("download")}{t("Export","এক্সপোর্ট")}</button>}
     <button className="btn" disabled={!displayed||stale} onClick={printReport}>{icon("printer")}{t("Print","প্রিন্ট")}</button></div></header>
   <section className="card fl" id="fl" aria-label={t("Report period","রিপোর্টের সময়সীমা")}>
    <div className="chips" role="group" aria-label={t("Period","সময়সীমা")}>{([["7",t("7 days","৭ দিন")],["30",t("30 days","৩০ দিন")],["90",t("90 days","৯০ দিন")],["custom",t("Custom","নিজের মতো")]] as const).map(([k,label])=><button key={k} type="button" className="chip" aria-pressed={preset===k} onClick={()=>{if(k==="custom"){setPreset("custom");fromInput.current?.focus()}else quick(Number(k) as 7|30|90)}}>{label}</button>)}</div>
    <form className="fgrid" onSubmit={e=>{apply(e);setToast(t("Report updated","রিপোর্ট আপডেট হয়েছে"))}}>
     <label className="fd"><span>{t("From","শুরু")}</span><input ref={fromInput} className="inp" type="date" value={draft.from} onChange={e=>{setPreset("custom");setDraft(v=>({...v,from:e.target.value}))}} required/></label>
     <label className="fd"><span>{t("To","শেষ")}</span><input className="inp" type="date" value={draft.to} onChange={e=>{setPreset("custom");setDraft(v=>({...v,to:e.target.value}))}} required/></label>
     <label className="fd"><span>{t("Account","অ্যাকাউন্ট")}</span><select className="inp" value={draft.account} disabled={accountError} onChange={e=>setDraft(v=>({...v,account:e.target.value}))}><option value="">{t("All accounts","সব অ্যাকাউন্ট")}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.method}{accountNumbers[a.id]?" · "+accountNumbers[a.id]:""}</option>)}</select></label>
     <button className="btn go2" type="submit" disabled={loading||!pending}>{t("Apply","প্রয়োগ করুন")}</button>
    </form>
   </section>
   {accountError&&<p className="financial-status">{t("Account filter unavailable. All-account reporting still works.","অ্যাকাউন্ট ফিল্টার পাওয়া যাচ্ছে না; সব অ্যাকাউন্টের রিপোর্ট দেখা যাবে।")}</p>}
   {loading&&<p className="financial-status" role="status">{t("Updating report…","রিপোর্ট আপডেট হচ্ছে…")}</p>}
   {error&&<div className="financial-error" role="alert">{error}<button onClick={()=>setRefresh(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
   {displayed?<><div className="meta"><span>{active.from} — {active.to}</span><span>{generated&&t("Updated: ","আপডেট: ")+generated}</span></div>
    <section className="card fin-volume-card" aria-label={t("Verified volume","যাচাইকৃত পরিমাণ")}>
     <div><span className="lbl">{t("Verified volume","যাচাইকৃত পরিমাণ")}</span><div className="num" dir="ltr">{money(displayed.verified_gross_minor)}</div><span className="lbl">{numeric(displayed.payment_count,locale)} {t("verified transactions","টি যাচাইকৃত লেনদেন")}</span>
      <div className="bars" role="group" aria-label={t("Verified volume by day","দৈনিক যাচাইকৃত পরিমাণ")} onMouseLeave={()=>setHoverDay(null)}>{barDays.map(day=>{const amount=byDay[day]??0;return <button type="button" key={day} aria-label={niceDay(day)+", "+money(amount)} onMouseEnter={()=>setHoverDay(day)} onFocus={()=>setHoverDay(day)} onBlur={()=>setHoverDay(null)}><i className={amount?"on":""} style={{height:amount?Math.max(8,amount/peak*100)+"%":"0%"}}/></button>})}</div>
      <div className="ro">{hoverDay?niceDay(hoverDay)+" · "+money(byDay[hoverDay]??0)+(typeof dailyCounts[hoverDay]==="number"?" · "+dailyCounts[hoverDay]+" "+t("transactions","লেনদেন"):""):t("Daily verified volume","দৈনিক যাচাইকৃত পরিমাণ")}</div></div>
     <div className="side2"><div><span className="lbl">{t("Average payment","গড় পেমেন্ট")}</span><div className="num md" dir="ltr">{money(avg??0)}</div></div>
      <div><span className="lbl">{t("Change","পরিবর্তন")}</span><div className={"num md "+(delta&&delta.startsWith("-")?"dn":delta?"up":"mu")}>{!compare?t("Not compared","তুলনা করা হয়নি"):compareLoading?t("Loading…","লোড হচ্ছে…"):compareError||!matchedCompare?t("No data","তথ্য নেই"):delta??t("No data","তথ্য নেই")}</div>{matchedCompare&&<span className="lbl">{t("vs","বনাম")} {money(matchedCompare.report.verified_gross_minor)} {t("in the previous period","আগের সময়সীমায়")}</span>}</div>
      <label className="sw"><input type="checkbox" checked={compare} onChange={e=>{setCompare(e.target.checked);setCompareError("")}}/><span>{t("Compare previous period","আগের সময়ের সঙ্গে তুলনা")}</span></label></div>
    </section>
    <section className="card pb"><div className="pbh"><h3>{t("Payment breakdown","পেমেন্টের হিসাব")}</h3><Link className="lk" href={root+"reconciliation"}>{t("Reconciliation","হিসাব মিল")} ↗</Link></div>
     <div className="split">{matching.map((value,i)=>value>0?<i key={i} style={{flex:value,background:["var(--ok)","var(--warn)","var(--ac)"][i]}}/>:null)}</div>
     <div className="leg">{([["Matched","মিলেছে"],["Not matched","মেলেনি"],["Statement matches","স্টেটমেন্টে মিলেছে"]] as const).map(([en,bd],i)=><div key={en} style={{"--c":["var(--ok)","var(--warn)","var(--ac)"][i]} as React.CSSProperties}><span>{t(en,bd)}</span><b dir="ltr">{money(matching[i])}</b><em>{percent(matching[i])}% {t("of total","মোটের")}</em></div>)}</div>
    </section></>:!loading&&<div className="empty"><b>{t("No report available yet","এখনো রিপোর্ট পাওয়া যায়নি")}</b></div>}
   <section className="card"><div className="bh"><h3>{t("Breakdown","বিভাগভিত্তিক হিসাব")}</h3></div><div className="tabs" role="tablist" aria-label={t("Report sections","রিপোর্টের বিভাগ")}>{sections.map(id=><button key={id} role="tab" type="button" className="tab" aria-selected={section===id} onClick={()=>setSection(id)}>{labels[id]}</button>)}</div>
    <div className="tw" role="tabpanel">
    {section==="payments"&&canReveal&&<PaymentReportLedger key={JSON.stringify([workspaceId,environment,applied.from,applied.to,applied.account])} locale={locale} workspaceId={workspaceId} environment={environment} period={applied} canReveal={canReveal}/>}
    {section==="payments"&&!canReveal&&<div className="empty">{t("You do not have access to payment details.","পেমেন্টের বিস্তারিত দেখার অনুমতি নেই।")}</div>}
    {displayed&&section==="summary"&&<table><thead><tr><th>{t("Day","দিন")}</th><th>{t("Payments","পেমেন্ট")}</th><th className="r">{t("Verified volume","যাচাইকৃত পরিমাণ")}</th></tr></thead><tbody>{displayed.daily.map(day=><tr key={day.day}><td><b>{day.day}</b></td><td>{day.payment_count??"—"}</td><td className="r amt">{money(day.amount_minor)}</td></tr>)}</tbody>{displayed.daily.length>1&&<tfoot><tr><td>{t("Total","মোট")}</td><td>{displayed.payment_count}</td><td className="r amt">{money(displayed.verified_gross_minor)}</td></tr></tfoot>}</table>}
    {displayed&&section==="methods"&&<table><thead><tr><th>{t("Method","মাধ্যম")}</th><th>{t("Payments","পেমেন্ট")}</th><th>{t("Share","অংশ")}</th><th className="r">{t("Verified volume","যাচাইকৃত পরিমাণ")}</th></tr></thead><tbody>{displayed.methods.map(row=>{const share=displayed.verified_gross_minor?Math.round(row.amount_minor/displayed.verified_gross_minor*100):0;return <tr key={row.method}><td>{row.method}</td><td>{row.payment_count}</td><td><span className="share"><i style={{width:share+"%"}}/></span>{share}%</td><td className="r amt">{money(row.amount_minor)}</td></tr>})}</tbody></table>}
    {displayed&&section==="customers"&&<table><thead><tr><th>{t("Customer","গ্রাহক")}</th><th>{t("Payments","পেমেন্ট")}</th><th className="r">{t("Verified volume","যাচাইকৃত পরিমাণ")}</th></tr></thead><tbody>{displayed.customers.map(row=><tr key={row.customer_id}><td>{row.name||row.reference||row.customer_id}</td><td>{row.payment_count}</td><td className="r amt">{money(row.amount_minor)}</td></tr>)}</tbody></table>}
    {displayed&&section==="refunds"&&<table><thead><tr><th>{t("Status","অবস্থা")}</th><th>{t("Requests","অনুরোধ")}</th><th className="r">{t("Amount","পরিমাণ")}</th></tr></thead><tbody>{displayed.refunds.map((row,i)=><tr key={row.status+i}><td><span className={"bd "+(row.status==="approved"?"approved":row.status==="cancelled"?"cancelled":row.status==="rejected"?"declined":"pending")}>{refundLabels[row.status]||row.status}</span></td><td>{row.request_count}</td><td className="r amt">{money(row.amount_minor)}</td></tr>)}</tbody></table>}
    {section==="payouts"&&<div className="empty"><b>{t("No payouts in this period","এই সময়ে কোনো পেআউট নেই")}</b>{t("Payouts will appear here once funds are paid out to you.","ফান্ড পাঠানো হলে পেআউট এখানে দেখা যাবে।")}</div>}
    {displayed&&section!=="payments"&&section!=="payouts"&&((section==="summary"&&!displayed.daily.length)||(section==="methods"&&!displayed.methods.length)||(section==="customers"&&!displayed.customers.length)||(section==="refunds"&&!displayed.refunds.length))&&<div className="empty"><b>{section==="refunds"?t("No refund requests in this period","এই সময়ে কোনো রিফান্ড অনুরোধ নেই"):t("No verified payments in this period","এই সময়ে কোনো যাচাইকৃত পেমেন্ট নেই")}</b>{t("Try a longer period or a different account.","আরও বড় সময়সীমা বা অন্য অ্যাকাউন্ট বেছে নিন।")}</div>}
    </div></section>
   </div>
   {toast&&<div className="toast on" role="status">{toast}</div>}
 </div>;
}
function BreakdownTable({headings,rows,empty,locale}:{locale:Locale;headings:string[];rows:string[][];empty:string}){
 if(rows.length===0)return <p className="er-card-empty">{empty}</p>;
 return <div className="er-table-scroll" role="region" tabIndex={0} aria-label={locale==="bn"?"রিপোর্টের টেবিল":"Report breakdown table"}>
  <table><thead><tr>{headings.map((x,i)=><th key={i} scope="col" className={i>0?"er-numeric":undefined}>{x}</th>)}</tr></thead>
   <tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i} className={i>0?"er-numeric":undefined}>{cell||"—"}</td>)}</tr>)}</tbody></table>
 </div>;
}
