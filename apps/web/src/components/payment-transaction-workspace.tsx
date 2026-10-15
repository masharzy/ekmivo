"use client";
import {useSearchParams} from "next/navigation";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";
type Item={id:string;device_name?:string;sms_text?:string;payer_number?:string;transaction_id?:string;balance_minor?:number;merchant_reference?:string;verified_amount_minor?:number;amount_minor?:number;method?:string;payer_suffix?:string;status?:string;reason?:string;parse_reason?:string;device_source?:string;original_transaction_at?:string;verified_at?:string;received_at?:string;webhook_status?:string;source_kind?:string;payment_id?:string};
type Filters={q:string;status:string;method:string;account:string;from:string;to:string};
const initial:Filters={q:"",status:"",method:"",account:"",from:"",to:""};
const statusLabels:Record<string,[string,string]>={verified:["Verified","যাচাইকৃত"],matched:["Matched","মিলেছে"],pending:["Pending","অপেক্ষমাণ"],unmatched:["Unmatched","মেলেনি"],ambiguous:["Ambiguous","একাধিক match"],invalid:["Invalid","অবৈধ"],duplicate:["Duplicate","ডুপ্লিকেট"],cancelled:["Cancelled","বাতিল"]};
const dt=(v:string|undefined,locale:Locale)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—";
const money=(v:number|undefined,locale:Locale)=>typeof v==="number"&&Number.isFinite(v)?new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(v/100):"—";
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
 const [rows,setRows]=useState<Item[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[nonce,setNonce]=useState(0);
 const [filterError,setFilterError]=useState("");
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [columns,setColumns]=useState([true,true,true,true,true,true]);
 const columnLabels=[incoming?t("Received device","প্রাপ্তির ডিভাইস"):t("Reference","রেফারেন্স"),t("Payer number","প্রেরকের নম্বর"),t("TrxID","ট্রানজেকশন আইডি"),t("Method","মাধ্যম"),t("Status","অবস্থা"),t("Amount","পরিমাণ")];
 const [accounts,setAccounts]=useState<{id:string;method?:string;display_suffix?:string}[]>([]);
 const detailDialog=useRef<HTMLDialogElement|null>(null);
 const [selected,setSelected]=useState<Item|null>(null);
 const openDetail=(item:Item)=>{setSelected(item);detailDialog.current?.showModal()};
 const [accountError,setAccountError]=useState(false);
 const [online,setOnline]=useState(true);
 useEffect(()=>{const fn=()=>setOnline(navigator.onLine);fn();window.addEventListener("online",fn);window.addEventListener("offline",fn);return()=>{window.removeEventListener("online",fn);window.removeEventListener("offline",fn)}},[]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(base+"gateways?environment="+encodeURIComponent(environment),{cache:"no-store",credentials:"same-origin",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error(String(response.status));return response.json()})
   .then(data=>{if(controller.signal.aborted)return;if(!Array.isArray(data.items))throw Error("INVALID_ACCOUNT_SOURCE");setAccounts(data.items.filter((a:unknown)=>!!a&&typeof a==="object"&&"id" in a&&typeof a.id==="string"));setAccountError(false)})
   .catch(()=>{if(!controller.signal.aborted)setAccountError(true)});
  return()=>controller.abort();
 },[base,environment]);
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
 const reprocess=async(id:string)=>{if(!canManage||busy||!online)return;setBusy(id);setNotice("");setError("");
  try{const r=await fetch(base+"incoming/"+id+"/reprocess?environment="+encodeURIComponent(environment),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
   if(!r.ok)throw Error(String(r.status));
   setNotice(t("Receipt queued for recheck.","রসিদটি পুনরায় যাচাইয়ের জন্য পাঠানো হয়েছে।"));setNonce(n=>n+1);
  }catch{setError(t("Recheck could not be confirmed.","পুনরায় যাচাই নিশ্চিত হয়নি।"))}finally{setBusy(null)}
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
 return <div className="opw-workbench">
  <header className="opw-header"><div><h1>{title}</h1><p>{incoming?t("Review matched and unmatched provider receipts.","পাওয়া রসিদ ও অমিলগুলো পর্যালোচনা করুন।"):t("Verified payments, source details and delivery status.","যাচাইকৃত লেনদেন, উৎস ও webhook অবস্থা।")}</p></div>
   <button onClick={()=>setNonce(n=>n+1)} disabled={loading} className="opw-refresh" type="button">{t("Refresh","রিফ্রেশ")}</button></header>
  <div className="ref-table-tools">
   <form onSubmit={apply}><label className="sr-only" htmlFor="payment-search">{t("Search records","রেকর্ড খুঁজুন")}</label><input id="payment-search" name="q" value={draft.q} maxLength={96} onChange={e=>setDraft(v=>({...v,q:e.target.value}))} placeholder={incoming?t("Search device or reason…","ডিভাইস বা কারণ খুঁজুন…"):t("Search reference or payer…","রেফারেন্স বা প্রেরক খুঁজুন…")}/><button type="submit">{t("Search","খুঁজুন")}</button></form>
   <button type="button" onClick={()=>setFiltersOpen(v=>!v)} aria-expanded={filtersOpen} aria-controls="payment-filters">{t("Filters","ফিল্টার")}{hasFilter?" · "+Object.values(filters).filter(Boolean).length:""}</button>
   <details className="ref-columns"><summary>{t("Columns","কলাম")}</summary><div>{columnLabels.map((label,i)=><label key={label}><input type="checkbox" checked={columns[i]} disabled={i===0} onChange={e=>setColumns(v=>v.map((x,n)=>n===i?e.target.checked:x))}/>{label}</label>)}</div></details>
  </div>
  <form id="payment-filters" className="opw-filters" onSubmit={apply} hidden={!filtersOpen}>

   <label><span>{t("Status","অবস্থা")}</span><select name="status" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{t("All statuses","সব অবস্থা")}</option>{statuses.map(x=><option key={x} value={x}>{statusName(x,bn)}</option>)}</select></label>
   <label><span>{t("Method","মাধ্যম")}</span><select name="method" value={draft.method} onChange={e=>setDraft(v=>({...v,method:e.target.value}))}><option value="">{t("All methods","সব মাধ্যম")}</option>{["bkash","nagad","rocket"].map(x=><option key={x} value={x}>{x==="bkash"?"bKash":x==="nagad"?"Nagad":"Rocket"}</option>)}</select></label>
   <label><span>{t("Receiving account","অ্যাকাউন্ট")}</span><select name="account" value={draft.account} disabled={accountError} onChange={e=>setDraft(v=>({...v,account:e.target.value}))}><option value="">{t("All accounts","সব অ্যাকাউন্ট")}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.method||t("Account","অ্যাকাউন্ট")} · ••••{a.display_suffix||""}</option>)}</select></label>
   <div className="opw-filter-actions"><button type="submit" disabled={loading}>{t("Apply","প্রয়োগ")}</button><button type="button" onClick={()=>{setDraft(initial);setFilters(initial);rememberFilters(initial);setFilterError("");setNonce(n=>n+1)}}>{t("Reset","রিসেট")}</button></div>
   <details className="opw-dates" open><summary>{t("Date range","তারিখ অনুযায়ী")}</summary><div><label><span>{t("From","শুরু")}</span><input type="datetime-local" name="from" aria-invalid={!!filterError} aria-describedby={filterError?"payment-filter-error":undefined} value={draft.from} onChange={e=>setDraft(v=>({...v,from:e.target.value}))}/></label><label><span>{t("Until","শেষ")}</span><input type="datetime-local" name="to" aria-invalid={!!filterError} aria-describedby={filterError?"payment-filter-error":undefined} value={draft.to} onChange={e=>setDraft(v=>({...v,to:e.target.value}))}/></label></div></details>
  </form>
  {filterError&&<p id="payment-filter-error" className="opw-error" role="alert">{filterError}</p>}
  {!online&&<p className="opw-notice">{t("You are offline. Data may be outdated.","ইন্টারনেট সংযোগ নেই; তথ্য পুরোনো হতে পারে।")}</p>}
  {error&&<div className="opw-error" role="alert">{t("Unable to load records.","রেকর্ড পাওয়া যাচ্ছে না।")} ({error}) <button type="button" onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p data-feedback="success" className="opw-notice" role="status">{notice}</p>}
  <div className="opw-list-head"><div><strong>{title}</strong><span>{new Intl.NumberFormat(locale).format(rows.length)}{cursor?"+":""} {t("records loaded","টি রেকর্ড")}{cursor?" · "+t("More available","আরও আছে"):""}</span></div>{!incoming&&rows.length>0&&<span>{t("Loaded verified value","লোড হওয়া মোট")}: <strong>{money(amountTotal,locale)}</strong></span>}</div>
  {loading&&rows.length===0?<div className="opw-empty" role="status">{t("Loading records…","রেকর্ড লোড হচ্ছে…")}</div>:!error&&rows.length===0?<div className="opw-empty"><strong>{hasFilter?t("No matching records","মিল পাওয়া যায়নি"):incoming?t("No receipts yet","এখনও রসিদ নেই"):t("No verified transactions yet","এখনও যাচাইকৃত লেনদেন নেই")}</strong><p>{incoming?t("Forwarded provider SMS appears here after server receipt.","সার্ভারে রসিদ পৌঁছালে এখানে দেখা যাবে।"):t("Completed, server-verified payments appear here.","সার্ভারে যাচাই হওয়া পেমেন্ট এখানে দেখা যাবে।")}</p></div>:<div className="opw-scroll" role="region" tabIndex={0} aria-label={title}>
   <table><thead><tr>{columnLabels.map((label,i)=><th key={label} hidden={!columns[i]} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} tabIndex={0} onClick={()=>openDetail(r)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(r)}}} aria-label={t("View payment","পেমেন্ট দেখুন")+" "+(r.merchant_reference||r.id)} className="ekv2-clickable-row">
    <td><span className="opw-reference">{incoming?(r.device_name||r.device_source||r.id.slice(0,12)):(r.merchant_reference||r.id.slice(0,12))}</span></td>
    <td hidden={!columns[1]} className="opw-phone">{r.payer_number||"—"}</td>
    <td hidden={!columns[2]} className="opw-trx">{r.transaction_id||"—"}</td>
    <td hidden={!columns[3]}>{r.method==="bkash"?"bKash":r.method==="nagad"?"Nagad":r.method==="rocket"?"Rocket":r.method||"—"}</td>
    <td hidden={!columns[4]}><span className="opw-status" data-status={r.status||"verified"}>{statusName(r.status||(incoming?"pending":"verified"),bn)}</span></td>
    <td hidden={!columns[5]} className="opw-num">{money(r.verified_amount_minor??r.amount_minor,locale)}</td>
   </tr>)}</tbody></table>
  </div>}
  <dialog className="ekv2-record-dialog" ref={detailDialog} aria-label={t("Payment details","পেমেন্টের বিস্তারিত")} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)detailDialog.current?.close()}}>
   {selected&&<div className="ekv2-detail">
    <div className="ekv2-detail-head"><h2>{incoming?t("SMS details","SMS বিবরণ"):t("Payment details","পেমেন্টের বিস্তারিত")}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={()=>detailDialog.current?.close()}>×</button></div>
    <div className="ekv2-detail-amount">{money(selected.verified_amount_minor??selected.amount_minor,locale)}</div>
    <span className="opw-status" data-status={selected.status||"verified"}>{statusName(selected.status||(incoming?"pending":"verified"),bn)}</span>
    <dl className="ekv2-detail-list">
      <div><dt>{t("Reference","রেফারেন্স")}</dt><dd>{selected.merchant_reference||selected.id}</dd></div>
      <div><dt>{t("Payer number","প্রেরকের নম্বর")}</dt><dd>{selected.payer_number||"—"}</dd></div>
      <div><dt>{t("Transaction ID","ট্রানজেকশন আইডি")}</dt><dd>{selected.transaction_id||"—"}</dd></div>
      <div><dt>{t("Method","মাধ্যম")}</dt><dd>{selected.method||"—"}</dd></div>
      <div><dt>{t("Transaction time","লেনদেনের সময়")}</dt><dd>{dt(selected.original_transaction_at,locale)}</dd></div>
      <div><dt>{incoming?t("Received","প্রাপ্তির সময়"):t("Verified","যাচাইয়ের সময়")}</dt><dd>{dt(incoming?selected.received_at:selected.verified_at,locale)}</dd></div>
      {selected.reason&&<div><dt>{t("Reason","কারণ")}</dt><dd>{selected.reason}</dd></div>}
      {selected.sms_text&&<div className="ekv2-sms"><dt>{t("SMS","SMS")}</dt><dd>{selected.sms_text}</dd></div>}
    </dl>
    <div className="ekv2-detail-actions"><button type="button" onClick={()=>detailDialog.current?.close()}>{t("Close","বন্ধ করুন")}</button>
      {incoming&&canManage&&["unmatched","ambiguous"].includes(selected.status||"")&&<button type="button" className="ekv2-primary" disabled={Boolean(busy)||!online} onClick={()=>void reprocess(selected.id).then(()=>detailDialog.current?.close())}>{t("Recheck","আবার যাচাই করুন")}</button>}
    </div>
   </div>}
  </dialog>
  {cursor&&<div className="opw-pagination"><span>{rows.length} {t("loaded","লোড হয়েছে")}</span><button type="button" disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button></div>}
 </div>;
}
