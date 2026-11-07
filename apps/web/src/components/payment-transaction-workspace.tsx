"use client";
import {RefModal,RefIcon,RefStatus} from "./reference-ui";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {useSearchParams} from "next/navigation";
import {PaymentLoadingSkeleton} from "./payment-loading-skeleton";
import {DashboardDateTimePicker,DashboardSwitch} from "./dashboard-date-controls";
import {DashboardIcon} from "./dashboard-icon";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";
type Item={id:string;device_name?:string;sms_text?:string;payer_number?:string;transaction_id?:string;balance_minor?:number;merchant_reference?:string;verified_amount_minor?:number;amount_minor?:number;method?:string;payer_suffix?:string;status?:string;reason?:string;parse_reason?:string;device_source?:string;original_transaction_at?:string;verified_at?:string;received_at?:string;webhook_status?:string;source_kind?:string;payment_id?:string};
type Filters={q:string;status:string;method:string;account:string;from:string;to:string};
const initial:Filters={q:"",status:"",method:"",account:"",from:"",to:""};
const statusLabels:Record<string,[string,string]>={verified:["Verified","যাচাইকৃত"],matched:["Matched","মিলেছে"],pending:["Pending","অপেক্ষমাণ"],unmatched:["Unmatched","মেলেনি"],ambiguous:["Ambiguous","একাধিক match"],invalid:["Invalid","অবৈধ"],duplicate:["Duplicate","ডুপ্লিকেট"],cancelled:["Cancelled","বাতিল"]};
const dt=(v:string|undefined,locale:Locale)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—";
const money=(v:number|undefined,locale:Locale)=>typeof v==="number"&&Number.isFinite(v)?"BDT "+new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v/100):"—";
const dhakaUTC=(value:string)=>{if(!value)return "";const d=new Date(value+":00+06:00");return Number.isFinite(d.valueOf())?d.toISOString():""};
function statusName(v:string|undefined,bn:boolean){return statusLabels[v||""]?.[bn?1:0]||v||"—"}
export function PaymentTransactionWorkspace({locale,workspaceId,environment,resource,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;resource:"payments"|"incoming";canManage:boolean}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const incoming=resource==="incoming",base="/api/go/workspaces/"+workspaceId+"/operations/";
 const searchParams=useSearchParams(),queryString=searchParams.toString();
 const queryFilters=useMemo(()=>{const q=new URLSearchParams(queryString);return Object.fromEntries(Object.keys(initial).map(k=>[k,q.get(k)||""])) as Filters},[queryString]);
 const [draft,setDraft]=useState<Filters>(queryFilters),[filters,setFilters]=useState<Filters>(queryFilters);
 useEffect(()=>{void Promise.resolve().then(()=>{setDraft(queryFilters);setFilters(old=>JSON.stringify(old)===JSON.stringify(queryFilters)?old:queryFilters)})},[queryFilters]);
 const rememberFilters=(next:Filters)=>{const u=new URL(window.location.href);for(const key of Object.keys(initial) as (keyof Filters)[]){if(next[key])u.searchParams.set(key,next[key]);else u.searchParams.delete(key)}u.searchParams.delete("cursor");window.history.pushState(null,"",u.pathname+u.search+u.hash)};
 const seed=useDashboardInitialData<{items:Item[];next_cursor?:string}>("transactions");
 const initialLoad=useRef(Boolean(seed));
 const accountSeed=useDashboardInitialData<{items:{id:string;method?:string;display_suffix?:string}[]}>("accounts");
 const [rows,setRows]=useState<Item[]>(seed?.data?.items??[]),[cursor,setCursor]=useState<string|null>(seed?.data?.next_cursor??null);
 const [loading,setLoading]=useState(!seed),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(seed?.error??""),[notice,setNotice]=useState(""),[nonce,setNonce]=useState(0);
 const [filterError,setFilterError]=useState("");
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [columns,setColumns]=useState([true,true,true,true,true,true]);
 const [hideNumbers,setHideNumbers]=useState(true);
 useEffect(()=>{if(!incoming)return;const timer=setTimeout(()=>{try{const s=localStorage.getItem("briofold-hide-numbers:"+workspaceId);setHideNumbers(!canManage||s==="1")}catch{setHideNumbers(true)}},0);return()=>clearTimeout(timer)},[incoming,workspaceId,canManage]);
 const displayPhone=(value?:string)=>{if(!value)return "—";const digits=value.replace(/\D/g,"");const local=digits.startsWith("880")?digits.slice(3):digits.startsWith("0")?digits.slice(1):digits;return (!canManage||incoming&&hideNumbers)?"+880 1••• ••"+local.slice(-4):local.length===10?"+880 "+local.slice(0,4)+" "+local.slice(4):value};
 const columnLabels=[incoming?t("Received device","প্রাপ্তির ডিভাইস"):t("Reference","রেফারেন্স"),t("Payer number","প্রেরকের নম্বর"),t("TrxID","ট্রানজেকশন আইডি"),t("Method","মাধ্যম"),t("Status","অবস্থা"),t("Amount","পরিমাণ")];
 const [accounts,setAccounts]=useState<{id:string;method?:string;display_suffix?:string}[]>(accountSeed?.data?.items??[]);

 const [selected,setSelected]=useState<Item|null>(null);
 const openDetail=(item:Item)=>setSelected(item);
 const [accountError,setAccountError]=useState(false);
 const [online,setOnline]=useState(true);
 useEffect(()=>{const fn=()=>setOnline(navigator.onLine);fn();window.addEventListener("online",fn);window.addEventListener("offline",fn);return()=>{window.removeEventListener("online",fn);window.removeEventListener("offline",fn)}},[]);
 useEffect(()=>{
  if(accountSeed)return;
  const controller=new AbortController();
  void fetch(base+"gateways?environment="+encodeURIComponent(environment),{cache:"no-store",credentials:"same-origin",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error(String(response.status));return response.json()})
   .then(data=>{if(controller.signal.aborted)return;if(!Array.isArray(data.items))throw Error("INVALID_ACCOUNT_SOURCE");setAccounts(data.items.filter((a:unknown)=>!!a&&typeof a==="object"&&"id" in a&&typeof a.id==="string"));setAccountError(false)})
   .catch(()=>{if(!controller.signal.aborted)setAccountError(true)});
  return()=>controller.abort();
 },[base,environment,accountSeed]);
 const url=useCallback((next?:string)=>{
  const q=new URLSearchParams({environment});
  for(const key of ["status","method"] as const)if(filters[key])q.set(key,filters[key]);
  if(filters.q.trim())q.set("q",filters.q.trim());
  if(filters.account)q.set("account",filters.account);
  if(filters.from)q.set("from",dhakaUTC(filters.from));
  if(filters.to)q.set("to",dhakaUTC(filters.to));
  if(next)q.set("cursor",next);
  return base+resource+"?"+q.toString();
 },[base,resource,environment,filters]);
 useEffect(()=>{
  if(initialLoad.current){initialLoad.current=false;return;}
  const ctl=new AbortController();
  void Promise.resolve().then(async()=>{setLoading(true);setError("");
   try{
    const r=await fetch(url(),{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(20000)])});
    if(!r.ok)throw Error(String(r.status));
    const d:unknown=await r.json();
    if(!d||typeof d!=="object"||!("items" in d)||!Array.isArray(d.items))throw Error("INVALID_RESPONSE");
    if(!ctl.signal.aborted){const page=d as {items:Item[];next_cursor?:string};setRows(page.items);setCursor(page.next_cursor||null)}
   }catch(e){if(!ctl.signal.aborted){const code=String(e instanceof Error?e.message:"FAILED");setError(code);if(code==="403"||code==="401"){setRows([]);setCursor(null)}}}
   finally{if(!ctl.signal.aborted)setLoading(false)}
  });
  return()=>ctl.abort();
 },[url,nonce]);
 const [moreLoading,setMoreLoading]=useState(false);
 const loadMore=async()=>{if(!cursor||moreLoading)return;setMoreLoading(true);setError("");try{
  const r=await fetch(url(cursor),{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(String(r.status));
  const d=await r.json() as {items:Item[];next_cursor?:string};
  if(!Array.isArray(d.items))throw Error("INVALID_RESPONSE");
  setRows(prev=>[...prev,...d.items.filter(x=>!prev.some(y=>y.id===x.id))]);setCursor(d.next_cursor||null);
 }catch(e){setError(String(e instanceof Error?e.message:"FAILED"))}finally{setMoreLoading(false)}};
 const reprocess=async(id:string):Promise<boolean>=>{if(!canManage||busy||!online)return false;setBusy(id);setNotice("");setError("");
  try{const r=await fetch(base+"incoming/"+id+"/reprocess?environment="+encodeURIComponent(environment),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
   if(!r.ok)throw Error(String(r.status));
   setNotice(t("Receipt queued for recheck.","রসিদটি পুনরায় যাচাইয়ের জন্য পাঠানো হয়েছে।"));setNonce(n=>n+1);return true;
  }catch{setError(t("Recheck could not be confirmed.","পুনরায় যাচাই নিশ্চিত হয়নি।"));return false}finally{setBusy(null)}
 };
 const amountTotal=useMemo(()=>rows.reduce((sum,r)=>sum+(r.verified_amount_minor??r.amount_minor??0),0),[rows]);
 const hasFilter=Boolean(filters.q||filters.status||filters.method||filters.account||filters.from||filters.to);
 const apply=(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();
  const next={...draft};
  const submitted=new FormData(e.currentTarget);
  for(const key of Object.keys(initial) as (keyof Filters)[]){const value=submitted.get(key);if(typeof value==="string")next[key]=value}
  const from=dhakaUTC(next.from),to=dhakaUTC(next.to);
  if((next.from&&!from)||(next.to&&!to)||(from&&to&&Date.parse(to)<=Date.parse(from))){
   setFilterError(t("Choose a valid date range (Bangladesh time).","বাংলাদেশ সময় অনুযায়ী সঠিক তারিখ বেছে নিন।"));return;
  }
  setFilterError("");
  setDraft(next);setFilters(next);rememberFilters(next);
  setFiltersOpen(false);
  setNonce(n=>n+1);
 };
 const title=incoming?t("SMS Data","SMS ডাটা"):t("Payments","পেমেন্ট");
 const statuses=incoming?["matched","unmatched","ambiguous","pending","invalid","duplicate","cancelled"]:["verified"];
 const details=(
  <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={Boolean(selected)} title={incoming?t("SMS details","SMS বিবরণ"):t("Details","বিস্তারিত")} drawer onClose={()=>setSelected(null)} footer={<><button className="ib" onClick={()=>setSelected(null)}>{t("Close","বন্ধ করুন")}</button>{selected&&<button className="ib" disabled={incoming&&(hideNumbers||!canManage)} onClick={()=>void navigator.clipboard.writeText(incoming&&selected.sms_text?selected.sms_text:selected.id).then(()=>setNotice(t("Copied","কপি হয়েছে"))).catch(()=>setNotice(t("Copy failed","কপি হয়নি")))}><RefIcon name="copy"/>{incoming?t("Copy SMS","SMS কপি"):t("Copy ID","আইডি কপি")}</button>}{selected&&incoming&&canManage&&["unmatched","ambiguous"].includes(selected.status||"")&&<button className="ib pri" disabled={Boolean(busy)||!online} onClick={()=>void reprocess(selected.id).then(ok=>{if(ok)setSelected(null)})}>{t("Recheck","আবার যাচাই করুন")}</button>}</>}>
   {selected&&<><div className="detail-intro">{money(selected.verified_amount_minor??selected.amount_minor,locale)}</div><div className="drawer-group">
    {[[t("Status","অবস্থা"),<RefStatus key="state" status={selected.status||"verified"} label={statusName(selected.status||"verified",bn)}/>],[t("Payment ID","পেমেন্ট আইডি"),selected.id],[t("Reference","রেফারেন্স"),selected.merchant_reference||"—"],[t("Payer number","প্রেরকের নম্বর"),displayPhone(selected.payer_number)],[t("Transaction ID","ট্রানজেকশন আইডি"),selected.transaction_id||"—"],[t("Method","মাধ্যম"),selected.method||"—"],[t("Transaction time","লেনদেনের সময়"),dt(selected.original_transaction_at,locale)],[incoming?t("Received","প্রাপ্তির সময়"):t("Verified","যাচাইয়ের সময়"),dt(incoming?selected.received_at:selected.verified_at,locale)],...(selected.reason?[[t("Reason","কারণ"),selected.reason]]:[])].map(([key,value],i)=><div className="kv" key={i}><span>{key}</span><span>{value}</span></div>)}{selected.sms_text&&<div className="drawer-group"><h4>{t("Original SMS","মূল SMS")}</h4><p>{incoming&&(hideNumbers||!canManage)?t("Original SMS is hidden while numbers are masked.","নম্বর লুকানো থাকলে মূল SMS দেখানো হয় না।"):selected.sms_text}</p></div>}
   </div></>}
  </RefModal>
 );
 if(incoming)return <div className="ref-dashboard"><div className="ref-page" aria-busy={loading}>
  <div className="top"><h1>{title}</h1><div className="acts"><label className="ey mut" style={{fontSize:12,whiteSpace:'nowrap'}}><DashboardSwitch checked={hideNumbers} label={t("Hide numbers","নম্বর লুকান")} onChange={value=>{setHideNumbers(!canManage||value);try{localStorage.setItem("briofold-hide-numbers:"+workspaceId,value?"1":"0")}catch{}}}/>{t("Hide numbers","নম্বর লুকান")}</label><button className="ib i" type="button" disabled={loading} aria-label={t("Refresh","রিফ্রেশ")} onClick={()=>setNonce(n=>n+1)}><RefIcon name="refresh"/></button></div><p>{t("Incoming payment messages and matching results.","আসা পেমেন্ট মেসেজ ও ম্যাচিংয়ের অবস্থা।")}</p></div>
  {!online&&<p className="notice" role="status">{t("You are offline. Data may be outdated.","ইন্টারনেট সংযোগ নেই; তথ্য পুরোনো হতে পারে।")}</p>}
  {error&&<div className="notice ref-errors" role="alert">{t("Unable to load records.","রেকর্ড পাওয়া যাচ্ছে না।")} <button className="ib" onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  <div className="card"><div className="toolbar"><form onSubmit={apply} className="ref-sms-search"><input className="in searchbox" name="q" aria-label={t("Search receipts","রিসিপ্ট খুঁজুন")} placeholder={t("Search receipts…","রিসিপ্ট খুঁজুন…")} value={draft.q} maxLength={96} onChange={e=>setDraft(v=>({...v,q:e.target.value}))}/><button type="submit" className="ib">{t("Search","খুঁজুন")}</button></form><div className="seg">{['','matched','unmatched'].map(value=><button key={value} type="button" className={filters.status===value?'on':''} onClick={()=>{const next={...filters,status:value};setDraft(next);setFilters(next);rememberFilters(next)}}>{value?statusName(value,bn):t("All","সব")}</button>)}</div><div className="sp"/><button className="ib" type="button" aria-expanded={filtersOpen} aria-controls="payment-filters" onClick={()=>setFiltersOpen(v=>!v)}>{t("Filters","ফিল্টার")}</button></div>
  <form id="payment-filters" className="opw-filters ref-sms-filters" onSubmit={apply} hidden={!filtersOpen}>

   <label><span>{t("Status","অবস্থা")}</span><select name="status" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{t("All statuses","সব অবস্থা")}</option>{statuses.map(x=><option key={x} value={x}>{statusName(x,bn)}</option>)}</select></label>
   <label><span>{t("Method","মাধ্যম")}</span><select name="method" value={draft.method} onChange={e=>setDraft(v=>({...v,method:e.target.value}))}><option value="">{t("All methods","সব মাধ্যম")}</option>{["bkash","nagad","rocket"].map(x=><option key={x} value={x}>{x==="bkash"?"bKash":x==="nagad"?"Nagad":"Rocket"}</option>)}</select></label>
   <label><span>{t("Receiving account","অ্যাকাউন্ট")}</span><select name="account" value={draft.account} disabled={accountError} onChange={e=>setDraft(v=>({...v,account:e.target.value}))}><option value="">{t("All accounts","সব অ্যাকাউন্ট")}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.method||t("Account","অ্যাকাউন্ট")} · ••••{a.display_suffix||""}</option>)}</select></label>
   <div className="opw-filter-actions"><button type="submit" disabled={loading}>{t("Apply","প্রয়োগ")}</button><button type="button" onClick={()=>{setDraft(initial);setFilters(initial);rememberFilters(initial);setFilterError("");setNonce(n=>n+1)}}>{t("Reset","রিসেট")}</button></div>
   <details className="opw-dates" open><summary>{t("Date range","তারিখ অনুযায়ী")}</summary><div><label><span>{t("From","শুরু")}</span><DashboardDateTimePicker locale={locale} value={draft.from} label={t("From","শুরু")} onChange={from=>setDraft(v=>({...v,from}))}/></label><label><span>{t("Until","শেষ")}</span><DashboardDateTimePicker locale={locale} value={draft.to} label={t("Until","শেষ")} onChange={to=>setDraft(v=>({...v,to}))}/></label></div></details>
  </form>
  {filterError&&<p className="notice ref-errors" role="alert">{filterError}</p>}
  <div className="tw" role="region" tabIndex={0} aria-label={title}><table><thead><tr><th>{t("Receipt","রিসিপ্ট")}</th><th>{t("Sender number","প্রেরকের নম্বর")}</th><th className="num">{t("Amount","পরিমাণ")}</th><th>{t("Match","ম্যাচ")}</th><th>{t("Received","প্রাপ্ত")}</th><th/></tr></thead><tbody>{rows.map(row=><tr className="rowclick" key={row.id} tabIndex={0} onClick={()=>openDetail(row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(row)}}}><td><span className="itemtitle mono">{row.id}</span><span className="rmeta">{row.method==='bkash'?'bKash':row.method==='nagad'?'Nagad':row.method==='rocket'?'Rocket':row.method||'—'}</span></td><td className="mono">{displayPhone(row.payer_number)}</td><td className="num">{money(row.amount_minor,locale)}</td><td><RefStatus status={row.status||'pending'} label={statusName(row.status||'pending',bn)}/></td><td className="mut">{dt(row.received_at,locale)}</td><td className="num"><RefIcon name="chevron"/></td></tr>)}</tbody></table></div>
  {loading&&rows.length===0?<div className="empty" role="status">{t("Loading receipts…","রিসিপ্ট লোড হচ্ছে…")}</div>:!error&&rows.length===0?<div className="empty"><b>{t("No receipts found","রিসিপ্ট পাওয়া যায়নি")}</b><p>{t("Try another search.","অন্যভাবে খুঁজুন।")}</p></div>:null}
  {cursor&&<div className="pager"><span>{rows.length} {t("loaded","লোড হয়েছে")}</span><button className="ib" type="button" disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button></div>}
  </div>{details}</div></div>;
 return <div className="opw-workbench">
  <header className="opw-header"><div><h1>{title}</h1><p>{incoming?t("Review matched and unmatched provider receipts.","পাওয়া রসিদ ও অমিলগুলো পর্যালোচনা করুন।"):t("Verified payments, source details and delivery status.","যাচাইকৃত লেনদেন, উৎস ও webhook অবস্থা।")}</p></div>
   <div className="opw-heading-actions">{incoming&&<label className="doc-hide-numbers"><DashboardSwitch checked={hideNumbers} label={t("Hide numbers","নম্বর লুকান")} onChange={value=>{setHideNumbers(!canManage||value);try{localStorage.setItem("briofold-hide-numbers:"+workspaceId,value?"1":"0")}catch{}}}/>{t("Hide numbers","নম্বর লুকান")}</label>}<button onClick={()=>setNonce(n=>n+1)} disabled={loading} className="opw-refresh" type="button" aria-label={t("Refresh","রিফ্রেশ")}><DashboardIcon name="refresh" width={16} height={16}/></button></div></header>
  <div className="opw-record-card"><div className="ref-table-tools">
   <form onSubmit={apply}><label className="sr-only" htmlFor="payment-search">{t("Search records","রেকর্ড খুঁজুন")}</label><input id="payment-search" name="q" value={draft.q} maxLength={96} onChange={e=>setDraft(v=>({...v,q:e.target.value}))} placeholder={incoming?t("Search device or reason…","ডিভাইস বা কারণ খুঁজুন…"):t("Search reference or payer…","রেফারেন্স বা প্রেরক খুঁজুন…")}/><button type="submit">{t("Search","খুঁজুন")}</button></form>
   <button type="button" onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen} aria-controls="payment-filters">{t("Filters","ফিল্টার")}{hasFilter?" · "+Object.values(filters).filter(Boolean).length:""}</button>
   <details className="ref-columns"><summary>{t("Columns","কলাম")}</summary><div>{columnLabels.map((label,i)=><label key={label}><input type="checkbox" checked={columns[i]} disabled={i===0} onChange={e=>setColumns(v=>v.map((x,n)=>n===i?e.target.checked:x))}/>{label}</label>)}</div></details>
  </div>
  <form id="payment-filters" className="opw-filters" onSubmit={apply} hidden={!filtersOpen}>

   <label><span>{t("Status","অবস্থা")}</span><select name="status" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{t("All statuses","সব অবস্থা")}</option>{statuses.map(x=><option key={x} value={x}>{statusName(x,bn)}</option>)}</select></label>
   <label><span>{t("Method","মাধ্যম")}</span><select name="method" value={draft.method} onChange={e=>setDraft(v=>({...v,method:e.target.value}))}><option value="">{t("All methods","সব মাধ্যম")}</option>{["bkash","nagad","rocket"].map(x=><option key={x} value={x}>{x==="bkash"?"bKash":x==="nagad"?"Nagad":"Rocket"}</option>)}</select></label>
   <label><span>{t("Receiving account","অ্যাকাউন্ট")}</span><select name="account" value={draft.account} disabled={accountError} onChange={e=>setDraft(v=>({...v,account:e.target.value}))}><option value="">{t("All accounts","সব অ্যাকাউন্ট")}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.method||t("Account","অ্যাকাউন্ট")} · ••••{a.display_suffix||""}</option>)}</select></label>
   <div className="opw-filter-actions"><button type="submit" disabled={loading}>{t("Apply","প্রয়োগ")}</button><button type="button" onClick={()=>{setDraft(initial);setFilters(initial);rememberFilters(initial);setFilterError("");setNonce(n=>n+1)}}>{t("Reset","রিসেট")}</button></div>
   <details className="opw-dates" open><summary>{t("Date range","তারিখ অনুযায়ী")}</summary><div><label><span>{t("From","শুরু")}</span><DashboardDateTimePicker locale={locale} value={draft.from} label={t("From","শুরু")} onChange={from=>setDraft(v=>({...v,from}))}/></label><label><span>{t("Until","শেষ")}</span><DashboardDateTimePicker locale={locale} value={draft.to} label={t("Until","শেষ")} onChange={to=>setDraft(v=>({...v,to}))}/></label></div></details>
  </form>
  {filterError&&<p id="payment-filter-error" className="opw-error" role="alert">{filterError}</p>}
  {!online&&<p className="opw-notice">{t("You are offline. Data may be outdated.","ইন্টারনেট সংযোগ নেই; তথ্য পুরোনো হতে পারে।")}</p>}
  {error&&<div className="opw-error" role="alert">{t("Unable to load records.","রেকর্ড পাওয়া যাচ্ছে না।")} <button type="button" onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p data-feedback="success" className="opw-notice" role="status">{notice}</p>}
  <div className="opw-list-head"><div>{!incoming&&<span>{new Intl.NumberFormat(locale).format(rows.length)} {t("records","রেকর্ড")}</span>}</div>{!incoming&&rows.length>0&&<span>{t("Loaded verified value","লোড হওয়া মোট")}: <strong>{money(amountTotal,locale)}</strong></span>}</div>
  {loading&&rows.length===0?<PaymentLoadingSkeleton locale={locale} layout="document"/>:!error&&rows.length===0?<div className="opw-empty"><strong>{hasFilter?t("No matching records","মিল পাওয়া যায়নি"):incoming?t("No receipts yet","এখনও রসিদ নেই"):t("No verified transactions yet","এখনও যাচাইকৃত লেনদেন নেই")}</strong><p>{incoming?t("Forwarded provider SMS appears here after server receipt.","সার্ভারে রসিদ পৌঁছালে এখানে দেখা যাবে।"):t("Completed, server-verified payments appear here.","সার্ভারে যাচাই হওয়া পেমেন্ট এখানে দেখা যাবে।")}</p></div>:<div className="opw-scroll" role="region" tabIndex={0} aria-label={title}>
   <table><thead><tr>{columnLabels.map((label,i)=><th key={label} hidden={!columns[i]} scope="col" className={i===5?"opw-num":undefined}>{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} tabIndex={0} onClick={()=>openDetail(r)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(r)}}} aria-label={t("View payment","পেমেন্ট দেখুন")+" "+(r.merchant_reference||r.id)} className="ekv2-clickable-row">
    <td><span className="opw-reference">{incoming?(r.device_name||r.device_source||r.id.slice(0,12)):(r.merchant_reference||r.id.slice(0,12))}</span></td>
    <td hidden={!columns[1]} className="opw-phone">{displayPhone(r.payer_number)}</td>
    <td hidden={!columns[2]} className="opw-trx">{r.transaction_id||"—"}{r.transaction_id&&<button type="button" className="ekv3-copy" title={t("Copy TrxID","TrxID কপি")} aria-label={t("Copy TrxID","TrxID কপি")} onClick={e=>{e.stopPropagation();void navigator.clipboard.writeText(r.transaction_id||"")}}><DashboardIcon name="copy" width={15} height={15}/></button>}</td>
    <td hidden={!columns[3]}>{r.method==="bkash"?"bKash":r.method==="nagad"?"Nagad":r.method==="rocket"?"Rocket":r.method||"—"}</td>
    <td hidden={!columns[4]}><span className="opw-status ekv3-status" data-tone={r.status==="verified"||r.status==="matched"?"success":r.status==="pending"||r.status==="unmatched"?"warning":r.status==="invalid"?"danger":"neutral"} data-status={r.status||"verified"}>{statusName(r.status||(incoming?"pending":"verified"),bn)}</span></td>
    <td hidden={!columns[5]} className="opw-num">{money(r.verified_amount_minor??r.amount_minor,locale)}</td>
   </tr>)}</tbody></table>
  </div>}
  {details}
  {incoming&&<div className="opw-table-count">{new Intl.NumberFormat(locale).format(rows.length)}{cursor?"+":""} {t("records loaded","টি রেকর্ড")}</div>}
  {cursor&&<div className="opw-pagination"><span>{rows.length} {t("loaded","লোড হয়েছে")}</span><button type="button" disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button></div>}
 </div></div>;
}
