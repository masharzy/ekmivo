"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import {safeIntegrationPayload} from "../lib/integration-safe-payload";
import {CopyValue,IntegrationRequestError,IntegrationFeedback,IntegrationStatus,IntegrationSkeleton,integrationDate,integrationHref,setIntegrationTab,useIntegrationTransport,type ActivityRow,type IntegrationScope} from "./integration-ui";
import "./activity-logs.css";

const tabs={events:["Payment events","পেমেন্ট ইভেন্ট"],api:["API logs","API লগ"],audit:["Audit history","পরিবর্তনের ইতিহাস"],exports:["Exports","এক্সপোর্ট"]} as const;
type Tab=keyof typeof tabs;
const isTab=(value:string):value is Tab=>Object.prototype.hasOwnProperty.call(tabs,value);
const value=(row:ActivityRow,key:string)=>String(row[key]??"—");

export function PaymentEvents(scope:IntegrationScope&{detailId?:string}){
 return <ActivityLogs key={[scope.workspaceId,scope.environment,scope.detailId||""].join(":")} {...scope}/>;
}
function ActivityLogs(scope:IntegrationScope&{detailId?:string}){
 const {locale,canManage,detailId}=scope;
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const {request,online}=useIntegrationTransport(scope);
 const params=useSearchParams(),requested=params.get("tab")||"events";
 const tab:Tab=detailId?"events":isTab(requested)?requested:"events";
 const restricted=tab!=="events"&&!canManage;
 const [rows,setRows]=useState<ActivityRow[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false),[search,setSearch]=useState(""),[query,setQuery]=useState("");
 const [refresh,setRefresh]=useState(0),seq=useRef(0);
 const [now,setNow]=useState(0);
 useEffect(()=>{const handler=()=>setNow(Date.now());handler();const timer=setInterval(handler,30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer)},[search]);
 const load=useCallback(async(next?:string,signal?:AbortSignal)=>{
  const id=++seq.current;
  if(restricted){setRows([]);setCursor(null);setLoading(false);return;}
  setLoading(true);setError("");
  const params=new URLSearchParams();
  if(query)params.set("q",query);
  if(next)params.set("cursor",next);
  const endpoint=tab==="events"?"operations/events"+(detailId?"/"+encodeURIComponent(detailId):""):"activity/"+tab;
  try{
   const response=await request(endpoint+"?"+params.toString(),undefined,signal);
   if(id!==seq.current||signal?.aborted)return;
   setRows(current=>next?[...current,...response.items.filter((item:ActivityRow)=>!current.some(previous=>previous.id===item.id))]:response.items);
   setCursor(typeof response.next_cursor==="string"?response.next_cursor:null);
  }catch(cause){
   if(id!==seq.current||signal?.aborted)return;
   if(cause instanceof IntegrationRequestError&&[401,403].includes(cause.status))setRows([]);
   setError(cause instanceof Error?cause.message:t("Activity could not be loaded. Try again.","কার্যক্রম লোড হয়নি। আবার চেষ্টা করুন।"));
  }finally{if(id===seq.current&&!signal?.aborted)setLoading(false)}
 },[tab,query,detailId,restricted,request,locale]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)void load(undefined,controller.signal)});return()=>controller.abort()},[load,refresh]);
 function selectTab(selected:Tab){if(selected===tab)return;setSearch("");setQuery("");setRows([]);setCursor(null);setIntegrationTab(selected)}
 const reload=()=>setRefresh(x=>x+1);
 const resourceHref=(resource:unknown,id:unknown)=>{
  const map:Record<string,string>={payments:"transactions",refunds:"refunds",devices:"devices",incoming:"incoming",integrations:"integrations",gateways:"gateways",invoices:"invoices"};
  const section=map[String(resource)];
  if(!section)return null;
  return integrationHref(scope,section,["transactions","refunds","devices","incoming","invoices"].includes(section)?String(id):undefined);
 };
 async function download(id:string){
  if(busy||!online||!canManage)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/go/workspaces/"+scope.workspaceId+"/exports/"+encodeURIComponent(id)+"/download?environment="+encodeURIComponent(scope.environment),{cache:"no-store",signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error(response.status===410?t("This export expired.","এই এক্সপোর্টের মেয়াদ শেষ।"):t("Download failed. Try again.","ডাউনলোড হয়নি। আবার চেষ্টা করুন।"));
   if(!response.headers.get("content-type")?.startsWith("text/csv"))throw Error(t("Invalid export response.","এক্সপোর্টের উত্তর সঠিক নয়।"));
   const url=URL.createObjectURL(await response.blob()),a=document.createElement("a");
   a.href=url;a.download="ekmivo-export.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice(t("Download started.","ডাউনলোড শুরু হয়েছে।"));
  }catch(cause){setError(cause instanceof Error?cause.message:t("Download failed.","ডাউনলোড হয়নি।"))}
  finally{setBusy(false)}
 }
 function exportLoaded(){
  const items=rows.map(row=>tab==="events"?{id:row.id,event_type:row.event_type,payment_id:row.payment_id,created_at:row.created_at,payload:safeIntegrationPayload(row.payload)}:
   tab==="api"?{id:row.id,method:row.method,route:row.route,http_status:row.http_status,duration_ms:row.duration_ms,correlation_id:row.correlation_id,created_at:row.created_at}:
   tab==="audit"?{id:row.id,resource:row.resource,resource_id:row.resource_id,action:row.action,created_at:row.created_at}:
   {id:row.id,resource:row.resource,created_at:row.created_at,expires_at:row.expires_at});
  const blob=new Blob([JSON.stringify({workspace_id:scope.workspaceId,environment:scope.environment,view:tab,loaded_records_only:true,items},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ekmivo-"+tab+"-"+scope.environment+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setNotice(t("Loaded records exported. This is not the full history.","লোড হওয়া রেকর্ড এক্সপোর্ট হয়েছে; এটি সম্পূর্ণ ইতিহাস নয়।"));
 }
 const title=detailId?t("Event details","ইভেন্টের বিস্তারিত"):t("Activity logs","কার্যক্রমের ইতিহাস");
 return <section className="activity-logs" lang={locale}>
  <header className="al-heading"><div><h1>{title}</h1><p>{detailId?t("Details of a single payment event.","একটি পেমেন্ট ইভেন্টের বিস্তারিত।"):t("Payment events, API requests and account changes.","পেমেন্ট, API ও অনুমোদিত পরিবর্তনের ইতিহাস।")}</p></div>
   <div className="al-top-actions">{detailId&&<Link className="al-button" href={integrationHref(scope,"events")}>{t("All activity","সব কার্যক্রম")}</Link>}<button type="button" className="al-button" disabled={loading||!online} onClick={reload}>{t("Refresh","রিফ্রেশ")}</button></div>
  </header>
  {!detailId&&<div className="al-tabs" role="group" aria-label={t("Activity category","কার্যক্রমের ধরন")}>{(Object.keys(tabs) as Tab[]).map(id=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>selectTab(id)}>{tabs[id][bn?1:0]}</button>)}</div>}
  <IntegrationFeedback error={error} notice={notice} online={online} locale={locale}/>
  <div className="al-panel">
   <div className="al-toolbar">
    <div className="al-count"><strong>{tabs[tab][bn?1:0]}</strong><span>{!loading?rows.length+" "+t("loaded","লোড হয়েছে"):"…"}</span></div>
    <div className="al-controls">
     {!detailId&&<label className="al-search"><span className="sr-only">{t("Search activity","কার্যক্রম খুঁজুন")}</span><input type="search" maxLength={96} value={search} onChange={event=>setSearch(event.target.value)} placeholder={t("Search activity…","কার্যক্রম খুঁজুন…")}/></label>}
     <button type="button" className="al-button" disabled={!rows.length||loading||!!error} onClick={exportLoaded}>{t("Export loaded","লোড হওয়া তথ্য এক্সপোর্ট")}</button>
    </div>
   </div>
   {restricted?<div className="al-empty"><strong>{t("Restricted to owners and admins","শুধু মালিক ও অ্যাডমিনের জন্য")}</strong><p>{t("You don't have permission to view these diagnostic records.","এই লগ দেখার অনুমতি নেই।")}</p></div>:
    loading&&!rows.length?<div className="al-loading"><IntegrationSkeleton locale={locale} kind="events"/></div>:
    !rows.length&&!error?<div className="al-empty"><strong>{query?t("No matching activity","মিলে এমন কার্যক্রম নেই"):t("No activity yet","এখনও কোনো কার্যক্রম নেই")}</strong><p>{t("Try another search or refresh.","অন্য কিছু খুঁজুন অথবা রিফ্রেশ করুন।")}</p></div>:
    <div className="al-list">{rows.map(row=>{
     const heading=tab==="events"?value(row,"event_type"):tab==="api"?value(row,"method")+" · HTTP "+value(row,"http_status"):tab==="audit"?value(row,"action"):value(row,"resource");
     const href=tab==="audit"?resourceHref(row.resource,row.resource_id):null;
     const failed=tab==="api"&&Number(row.http_status)>=400;
     return <article className="al-record" key={row.id}>
      <span className={"al-event-icon "+(failed?"al-failed":"")} aria-hidden="true">{tab==="events"?"↗":tab==="api"?"⌁":tab==="audit"?"✓":"↓"}</span>
      <div className="al-main">
       <div className="al-record-head"><strong>{heading}</strong>{failed&&<span className="al-error-state">{t("Error","ত্রুটি")}</span>}</div>
       <time>{integrationDate(row.created_at,locale)}</time>
       {tab==="events"&&<div className="al-meta"><span>{t("Event ID","ইভেন্ট আইডি")}</span><CopyValue value={row.id} locale={locale}/></div>}
       {tab==="events"&&<div className="al-row-actions">{!detailId&&<Link href={integrationHref(scope,"events",row.id)}>{t("View event","ইভেন্ট দেখুন")}</Link>}{row.payment_id&&<Link href={integrationHref(scope,"transactions",String(row.payment_id))}>{t("Open payment","পেমেন্ট দেখুন")}</Link>}</div>}
       {tab==="events"&&<details className="al-payload" open={!!detailId}><summary>{t("Event details","ইভেন্টের তথ্য")}</summary><pre>{JSON.stringify(safeIntegrationPayload(row.payload),null,2)}</pre></details>}
       {tab==="api"&&<div className="al-facts"><span>{value(row,"route")}</span><span>{value(row,"duration_ms")} ms</span><CopyValue value={value(row,"correlation_id")} locale={locale}/></div>}
       {tab==="audit"&&<div className="al-facts"><span>{t("Resource","বিষয়")}: {value(row,"resource")}</span><CopyValue value={value(row,"resource_id")} locale={locale}/>{href&&<Link href={href}>{t("Open record","রেকর্ড দেখুন")}</Link>}</div>}
       {tab==="exports"&&<div className="al-facts"><span>{t("Expires","মেয়াদ")}: {integrationDate(row.expires_at,locale)}</span><CopyValue value={row.id} locale={locale}/>{Date.parse(String(row.expires_at))>now?<button disabled={busy||!online||!canManage} onClick={()=>void download(row.id)}>{t("Download CSV","CSV ডাউনলোড")}</button>:<IntegrationStatus value="expired" locale={locale}/>}</div>}
      </div>
     </article>
    })}</div>}
   {cursor&&!restricted&&<footer className="al-footer"><button type="button" className="al-button" disabled={loading||!online} onClick={()=>void load(cursor)}>{loading?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button></footer>}
  </div>
 </section>;
}
