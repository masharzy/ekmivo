"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {RefIcon} from "./reference-ui";
import {noticeAmount,noticeCategory,noticeHeading,noticeHref,type PaymentNotice} from "../lib/payment-notice";
import "./notification-center.css";
type Result={items:PaymentNotice[];total:number;unread:number;page:number;page_size:number};
const initial:Result={items:[],total:0,unread:0,page:1,page_size:20};
const categories=["all","payments","refunds","alerts"] as const;
type Category=typeof categories[number];
type Status="all"|"unread"|"read";
const fmt=(v:string,bn:boolean,dateOnly=false)=>new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka",...(dateOnly?{dateStyle:"medium" as const}:{dateStyle:"medium" as const,timeStyle:"short" as const})}).format(new Date(v));
export function PaymentNotificationCenter({locale,workspaceId,environment}:{locale:"en"|"bn";workspaceId:string;environment:string}){
 const bn=locale==="bn",router=useRouter();
 const t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const base=`/api/go/workspaces/${workspaceId}/notifications`;
 const [data,setData]=useState<Result>(initial),[search,setSearch]=useState(""),[query,setQuery]=useState("");
 const [category,setCategory]=useState<Category>("all"),[status,setStatus]=useState<Status>("all");
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(20);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(""),[refresh,setRefresh]=useState(0);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{const handle=window.setTimeout(()=>{setQuery(search.trim());setPage(1)},300);return()=>clearTimeout(handle)},[search]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const params=new URLSearchParams({environment,page:String(page),page_size:String(pageSize),filter:category,status,q:query});
   const r=await fetch(`${base}?${params}`,{cache:"no-store",credentials:"same-origin",signal});
   if(!r.ok)throw Error("HTTP_"+r.status);
   const json=await r.json() as Result;
   if(!Array.isArray(json.items)||!Number.isFinite(json.total)||!Number.isFinite(json.unread)||json.page!==page)throw Error("INVALID_NOTICE_RESPONSE");
   if(!signal?.aborted)setData(json);
  }catch(e){
   if(!signal?.aborted){setError(t("Notifications couldn't be loaded. Please retry.","নোটিফিকেশন লোড হয়নি। আবার চেষ্টা করুন।"));setData(initial);console.error("NOTIFICATION_LIST_UNAVAILABLE",e instanceof Error?e.message:"UNKNOWN")}
  }finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,page,pageSize,category,status,query,refresh,t]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)return load(controller.signal)});return()=>controller.abort()},[load]);
 const reload=()=>setRefresh(x=>x+1);
 async function mark(id:string){
  if(busy)return false;
  setBusy(id);setError("");
  try{
   const r=await fetch(`${base}/${id}/read?environment=${encodeURIComponent(environment)}`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
   if(!r.ok)throw Error("READ_"+r.status);
   const now=new Date().toISOString();
   setData(cur=>({...cur,unread:id==="all"?0:Math.max(0,cur.unread-(cur.items.some(x=>x.id===id&&!x.read_at)?1:0)),items:cur.items.map(x=>(id==="all"||x.id===id)?{...x,read_at:now}:x)}));
   if(status==="unread")reload();
   return true;
  }catch{setError(t("Couldn't update read status. Try again.","পড়া হয়েছে হিসেবে সংরক্ষণ হয়নি। আবার চেষ্টা করুন।"));return false}
  finally{setBusy("")}
 }
 const pages=Math.max(1,Math.ceil(data.total/pageSize)),first=data.total?(page-1)*pageSize+1:0,last=Math.min(data.total,page*pageSize);
 const dates=new Map<string,PaymentNotice[]>();for(const item of data.items){const date=fmt(item.created_at,bn,true);dates.set(date,[...(dates.get(date)||[]),item])}
 const filterLabel=(key:Category)=>key==="all"?t("All","সব"):key==="payments"?t("Payments","পেমেন্ট"):key==="refunds"?t("Refunds","রিফান্ড"):t("Alerts","সতর্কতা");
 return <div className="pn-center" lang={locale}>
  <header className="pn-header"><div><h1>{t("Notifications","নোটিফিকেশন")}</h1><p>{t("Updates and activity for your payments.","আপনার পেমেন্টের সব নোটিফিকেশন ও কার্যক্রম।")}</p></div>
   <div className="pn-header-actions"><button type="button" className="pn-outline" disabled={loading} onClick={reload}><RefIcon className="pn-icon" name="refresh"/>{t("Refresh","রিফ্রেশ")}</button><button type="button" className="pn-primary" disabled={loading||!!busy||data.unread===0} onClick={()=>void mark("all")}>{t("Mark all read","সব পড়া হয়েছে")}</button></div>
  </header>
  <section className="pn-panel">
   <div className="pn-toolbar">
    <label className="pn-search"><RefIcon className="pn-icon" name="search"/><input ref={input} type="search" value={search} maxLength={80} placeholder={t("Search notifications","নোটিফিকেশন খুঁজুন")} aria-label={t("Search notifications","নোটিফিকেশন খুঁজুন")} onChange={e=>setSearch(e.target.value)}/></label>
    <label className="pn-status"><span>{t("Status","অবস্থা")}</span><select value={status} onChange={e=>{setStatus(e.target.value as Status);setPage(1)}}><option value="all">{t("All statuses","সব অবস্থা")}</option><option value="unread">{t("Unread","অপঠিত")}</option><option value="read">{t("Read","পঠিত")}</option></select></label>
   </div>
   <div className="pn-categories"><div className="pn-tabs" role="group" aria-label={t("Notification type","নোটিফিকেশনের ধরন")}>{categories.map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);setPage(1)}}>{filterLabel(value)}</button>)}</div>
    <span className="pn-unread"><span className="pn-unread-dot"/>{data.unread} {t("unread","অপঠিত")}</span>
   </div>
   <div className="pn-results" aria-busy={loading}>
    {error&&<div className="pn-empty" role="alert">{error}<button className="pn-outline" onClick={reload}>{t("Retry","আবার চেষ্টা")}</button></div>}
    {!error&&loading&&<div className="pn-empty" role="status">{t("Loading notifications…","নোটিফিকেশন লোড হচ্ছে…")}</div>}
    {!error&&!loading&&data.items.length===0&&<div className="pn-empty"><RefIcon className="pn-empty-icon" name="bell"/><strong>{t("No notifications found","কোনো নোটিফিকেশন পাওয়া যায়নি")}</strong><span>{t("Try a different search or filter.","অন্য শব্দ বা ফিল্টার দিয়ে খুঁজুন।")}</span>{(query||category!=="all"||status!=="all")&&<button className="pn-outline" onClick={()=>{setSearch("");setQuery("");setCategory("all");setStatus("all");setPage(1);input.current?.focus()}}>{t("Clear filters","ফিল্টার মুছুন")}</button>}</div>}
    {!error&&!loading&&[...dates].map(([day,items])=><div className="pn-group" key={day}><div className="pn-day">{day}</div>{items.map(item=>{
     const kind=noticeCategory(item.type),unread=!item.read_at,url=noticeHref(workspaceId,item);
     return <div className={`pn-notice ${unread?"pn-new":""}`} key={item.id}>
      <span className={`pn-symbol pn-${kind}`}><RefIcon className="pn-icon" name={kind==="payments"?"check":kind==="refunds"?"undo":"alert"}/></span>
      <div className="pn-message"><Link href={url} onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.defaultPrevented)return;if(!unread)return;event.preventDefault();void mark(item.id).finally(()=>router.push(url))}}><strong>{noticeHeading(item.type,bn)}</strong></Link><div className="pn-meta"><span>{fmt(item.created_at,bn)}</span>{item.resource_id&&<span className="pn-reference">{item.resource_id.slice(0,8)}</span>}</div></div>
      {typeof item.body?.amount_minor==="number"&&<span className="pn-amount">{noticeAmount(item.body.amount_minor,bn)}</span>}
      {unread?<button type="button" className="pn-read" disabled={!!busy} onClick={()=>void mark(item.id)} aria-label={t("Mark notification as read","পড়া হয়েছে হিসেবে চিহ্নিত করুন")}>{t("Mark read","পড়া হয়েছে")}</button>:<span className="pn-read-label">{t("Read","পঠিত")}</span>}
     </div>})}</div>)}
   </div>
   <footer className="pn-footer"><div>{loading?"…":t(`Showing ${first}–${last} of ${data.total}`,`মোট ${data.total}টির মধ্যে ${first}–${last}টি`)}</div>
    <div className="pn-page-tools"><label>{t("Per page","প্রতি পেজে")}<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
     <button className="pn-outline" disabled={loading||page<=1} onClick={()=>setPage(x=>x-1)}>{t("Previous","আগের")}</button><span>{page} / {pages}</span><button className="pn-outline" disabled={loading||page>=pages} onClick={()=>setPage(x=>x+1)}>{t("Next","পরের")}</button>
    </div>
   </footer>
  </section>
 </div>;
}
