"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";
type Item={id:string;merchant_reference?:string;verified_amount_minor?:number;amount_minor?:number;method?:string;payer_suffix?:string;status?:string;reason?:string;parse_reason?:string;device_source?:string;original_transaction_at?:string;verified_at?:string;received_at?:string;webhook_status?:string;source_kind?:string;payment_id?:string};
type Filters={q:string;status:string;method:string;from:string;to:string};
const initial:Filters={q:"",status:"",method:"",from:"",to:""};
const statusLabels:Record<string,[string,string]>={verified:["Verified","যাচাইকৃত"],matched:["Matched","মিলেছে"],pending:["Pending","অপেক্ষমাণ"],unmatched:["Unmatched","মেলেনি"],ambiguous:["Ambiguous","একাধিক match"],invalid:["Invalid","অবৈধ"],duplicate:["Duplicate","ডুপ্লিকেট"],cancelled:["Cancelled","বাতিল"]};
const dt=(v:string|undefined,locale:Locale)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—";
const money=(v:number|undefined,locale:Locale)=>typeof v==="number"&&Number.isFinite(v)?new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(v/100):"—";
const nowUTC=(value:string)=>{if(!value)return "";const d=new Date(value);return Number.isFinite(d.valueOf())?d.toISOString():""};
function statusName(v:string|undefined,bn:boolean){return statusLabels[v||""]?.[bn?1:0]||v||"—"}
export function PaymentTransactionWorkspace({locale,workspaceId,environment,resource,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;resource:"payments"|"incoming";canManage:boolean}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const incoming=resource==="incoming",base="/api/go/workspaces/"+workspaceId+"/operations/";
 const [draft,setDraft]=useState<Filters>(initial),[filters,setFilters]=useState<Filters>(initial);
 const [rows,setRows]=useState<Item[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[nonce,setNonce]=useState(0);
 const [online,setOnline]=useState(true);
 useEffect(()=>{const fn=()=>setOnline(navigator.onLine);fn();window.addEventListener("online",fn);window.addEventListener("offline",fn);return()=>{window.removeEventListener("online",fn);window.removeEventListener("offline",fn)}},[]);
 const url=useCallback((next?:string)=>{
  const q=new URLSearchParams({environment});
  for(const key of ["status","method"] as const)if(filters[key])q.set(key,filters[key]);
  if(filters.q.trim())q.set("q",filters.q.trim());
  if(filters.from)q.set("from",nowUTC(filters.from));
  if(filters.to)q.set("to",nowUTC(filters.to));
  if(next)q.set("cursor",next);
  return base+resource+"?"+q.toString();
 },[base,resource,environment,filters]);
 useEffect(()=>{
  const ctl=new AbortController();
  void Promise.resolve().then(async()=>{setLoading(true);setError("");setRows([]);setCursor(null);
   try{
    const r=await fetch(url(),{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(20000)])});
    if(!r.ok)throw Error(String(r.status));
    const d:unknown=await r.json();
    if(!d||typeof d!=="object"||!("items" in d)||!Array.isArray(d.items))throw Error("INVALID_RESPONSE");
    if(!ctl.signal.aborted){const page=d as {items:Item[];next_cursor?:string};setRows(page.items);setCursor(page.next_cursor||null)}
   }catch(e){if(!ctl.signal.aborted)setError(String(e instanceof Error?e.message:"FAILED"))}
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
 const hasFilter=Boolean(filters.q||filters.status||filters.method||filters.from||filters.to);
 const title=incoming?t("Incoming receipts","আসা রসিদ"):t("Transactions","লেনদেন");
 const statuses=incoming?["matched","unmatched","ambiguous","pending","invalid","duplicate","cancelled"]:["verified"];
 return <div className="opw-workbench">
  <header className="opw-header"><div><h1>{title}</h1><p>{incoming?t("Review matched and unmatched provider receipts.","পাওয়া রসিদ ও অমিলগুলো পর্যালোচনা করুন।"):t("Verified payments, source details and delivery status.","যাচাইকৃত লেনদেন, উৎস ও webhook অবস্থা।")}</p></div>
   <button onClick={()=>setNonce(n=>n+1)} disabled={loading} className="opw-refresh" type="button">{t("Refresh","রিফ্রেশ")}</button></header>
  <form className="opw-filters" onSubmit={e=>{e.preventDefault();setFilters({...draft})}}>
   <label className="opw-search"><span>{t("Search","খুঁজুন")}</span><input value={draft.q} maxLength={96} onChange={e=>setDraft(v=>({...v,q:e.target.value}))} placeholder={incoming?t("Source or reason","উৎস বা কারণ"):t("Payment reference or payer suffix","রেফারেন্স বা নম্বরের শেষ অংশ")}/></label>
   <label><span>{t("Status","অবস্থা")}</span><select value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="">{t("All statuses","সব অবস্থা")}</option>{statuses.map(x=><option key={x} value={x}>{statusName(x,bn)}</option>)}</select></label>
   <label><span>{t("Method","মাধ্যম")}</span><select value={draft.method} onChange={e=>setDraft(v=>({...v,method:e.target.value}))}><option value="">{t("All methods","সব মাধ্যম")}</option>{["bkash","nagad","rocket"].map(x=><option key={x} value={x}>{x==="bkash"?"bKash":x==="nagad"?"Nagad":"Rocket"}</option>)}</select></label>
   <div className="opw-filter-actions"><button type="submit" disabled={loading}>{t("Apply","প্রয়োগ")}</button><button type="button" onClick={()=>{setDraft(initial);setFilters(initial)}}>{t("Reset","রিসেট")}</button></div>
   <details className="opw-dates"><summary>{t("Date range","তারিখ অনুযায়ী")}</summary><div><label><span>{t("From","শুরু")}</span><input type="datetime-local" value={draft.from} onChange={e=>setDraft(v=>({...v,from:e.target.value}))}/></label><label><span>{t("Until","শেষ")}</span><input type="datetime-local" value={draft.to} onChange={e=>setDraft(v=>({...v,to:e.target.value}))}/></label></div></details>
  </form>
  {!online&&<p className="opw-notice">{t("You are offline. Data may be outdated.","ইন্টারনেট সংযোগ নেই; তথ্য পুরোনো হতে পারে।")}</p>}
  {error&&<div className="opw-error" role="alert">{t("Unable to load records.","রেকর্ড পাওয়া যাচ্ছে না।")} ({error}) <button type="button" onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p className="opw-notice" role="status">{notice}</p>}
  <div className="opw-list-head"><div><strong>{title}</strong><span>{rows.length}{cursor?"+":""} {t("records loaded","টি রেকর্ড")}{cursor?" · "+t("More available","আরও আছে"):""}</span></div>{!incoming&&rows.length>0&&<span>{t("Loaded verified value","লোড হওয়া মোট")}: <strong>{money(amountTotal,locale)}</strong></span>}</div>
  {loading?<div className="opw-empty" role="status">{t("Loading records…","রেকর্ড লোড হচ্ছে…")}</div>:!error&&rows.length===0?<div className="opw-empty"><strong>{hasFilter?t("No matching records","মিল পাওয়া যায়নি"):incoming?t("No receipts yet","এখনও রসিদ নেই"):t("No verified transactions yet","এখনও যাচাইকৃত লেনদেন নেই")}</strong><p>{incoming?t("Forwarded provider SMS appears here after server receipt.","সার্ভারে রসিদ পৌঁছালে এখানে দেখা যাবে।"):t("Completed, server-verified payments appear here.","সার্ভারে যাচাই হওয়া পেমেন্ট এখানে দেখা যাবে।")}</p></div>:<div className="opw-scroll" role="region" tabIndex={0} aria-label={title}>
   <table><thead><tr><th scope="col">{incoming?t("Receipt / Source","রসিদ / উৎস"):t("Reference","রেফারেন্স")}</th><th scope="col">{t("Method","মাধ্যম")}</th><th scope="col">{t("Amount","পরিমাণ")}</th><th scope="col">{t("Status","অবস্থা")}</th><th scope="col">{t("Transaction time","লেনদেনের সময়")}</th><th scope="col">{incoming?t("Received","প্রাপ্তির সময়"):t("Verified at","যাচাইয়ের সময়")}</th><th scope="col">{t("Action","অ্যাকশন")}</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
    <td><Link className="opw-reference" href={"/w/"+workspaceId+"/payments/"+(incoming?"incoming":"transactions")+"/"+r.id}>{r.merchant_reference||r.device_source||r.id.slice(0,12)}</Link>{r.reason&&incoming&&<small>{r.reason}</small>}</td>
    <td>{r.method||"—"}</td><td className="opw-num">{money(r.verified_amount_minor??r.amount_minor,locale)}</td>
    <td><span className="opw-status" data-status={r.status||"verified"}>{statusName(r.status||(incoming?"pending":"verified"),bn)}</span></td>
    <td>{dt(r.original_transaction_at,locale)}</td><td>{dt(incoming?r.received_at:r.verified_at,locale)}</td>
    <td>{incoming&&canManage&&["unmatched","ambiguous"].includes(r.status||"")?<button type="button" disabled={busy===r.id||!online} onClick={()=>void reprocess(r.id)}>{busy===r.id?t("Checking…","যাচাই হচ্ছে…"):t("Recheck","যাচাই করুন")}</button>:<Link href={"/w/"+workspaceId+"/payments/"+(incoming?"incoming":"transactions")+"/"+r.id}>{t("Details","বিস্তারিত")} ↗</Link>}</td>
   </tr>)}</tbody></table>
  </div>}
  {cursor&&<div className="opw-pagination"><span>{rows.length} {t("loaded","লোড হয়েছে")}</span><button type="button" disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button></div>}
 </div>;
}
