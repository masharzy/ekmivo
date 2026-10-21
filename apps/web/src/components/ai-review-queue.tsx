"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
type Item={id:string;thread_id:string;reason:string;question:string;customer_name:string};
type Data={items:Item[];can_send:boolean};
const reasons:Record<string,[string,string]>={NO_GROUNDED_SOURCE:["No matching knowledge","মিল থাকা নলেজ নেই"],AI_CREDITS_REQUIRED:["AI credits required","AI ক্রেডিট প্রয়োজন"],WORKER_OUTCOME_UNKNOWN:["Generation outcome needs recovery","উত্তরের ফলাফল যাচাই প্রয়োজন"],AI_REQUEST_UNKNOWN:["Generation outcome needs recovery","উত্তরের ফলাফল যাচাই প্রয়োজন"],PUBLISHER_ACCESS_REVOKED:["Assistant publisher access changed","সহকারী প্রকাশকারীর অনুমতি বদলেছে"],CONVERSATION_OR_SOURCE_CHANGED:["Conversation or facts changed","কথোপকথন বা তথ্য বদলেছে"]};
export function AiReviewQueue({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState<Data|null>(null),[query,setQuery]=useState(""),[offset,setOffset]=useState(0),[error,setError]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const lock=useRef(false),operation=useRef<{id:string;key:string}|null>(null);
 const read=useCallback(async(signal?:AbortSignal)=>{
  const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},signal,body:JSON.stringify({action:"ai-review-read",filters:{q:query,offset}})});
  if(!response.ok){if(response.status===401||response.status===403)setData(null);throw Error();}return response.json() as Promise<Data>;
 },[offset,query,workspaceId]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>void read(c.signal).then(x=>{if(!c.signal.aborted){setData(x);setError(false);}}).catch(()=>{if(!c.signal.aborted)setError(true);}),250);return()=>{c.abort();clearTimeout(timer);};},[read,refresh]);
 async function done(id:string){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{
   if(operation.current?.id!==id)operation.current={id,key:crypto.randomUUID()};
   const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"ai-review-done",body:{job_id:id,operation_key:operation.current.key}})});
   if(!response.ok)throw Error();setData(await read());operation.current=null;setError(false);
  }catch{setError(true);}finally{lock.current=false;setBusy(false);}
 }
 return <section className="ss-panel"><div className="ss-section"><h2>{t("Questions needing a human","মানুষের সহায়তা প্রয়োজন")}</h2><p>{t("These questions were held for review. Open the conversation to reply or add the missing knowledge. Marking reviewed does not send a message or retry paid AI.","এই প্রশ্নগুলো পর্যালোচনার জন্য রাখা হয়েছে। কথোপকথন খুলে উত্তর দিন অথবা প্রয়োজনীয় নলেজ যোগ করুন। পর্যালোচিত করলে মেসেজ বা পেইড AI অনুরোধ যাবে না।")}</p>
  <label className="ss-field"><span>{t("Search review questions","অপেক্ষায় থাকা প্রশ্ন খুঁজুন")}</span><input aria-label={t("Search review questions","অপেক্ষায় থাকা প্রশ্ন খুঁজুন")} maxLength={100} value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
  {error&&<p className="ss-error" role="alert">{t("Review queue unavailable. Retry.","প্রশ্নের তালিকা পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।")}</p>}
  {!data&&!error&&<p role="status">{t("Loading…","লোড হচ্ছে…")}</p>}
  {data?.items.map(x=><article key={x.id}><h3>{x.customer_name}</h3><p>{x.question}</p><p>{reasons[x.reason]?.[bn?1:0]??t("Human review required","মানুষের পর্যালোচনা প্রয়োজন")}</p><Link href={`/inbox?thread=${x.thread_id}`}>{t("Open conversation","কথোপকথন খুলুন")}</Link>{data.can_send&&<button className="ss-btn" type="button" disabled={busy} onClick={()=>{if(window.confirm(t("Mark this question reviewed?","এই প্রশ্ন পর্যালোচিত করবেন?")))void done(x.id);}}>{t("Mark reviewed","পর্যালোচিত")}</button>}</article>)}
  {data&&!data.items.length&&<p>{t("No questions match these filters.","এই filter-এ কোনো প্রশ্ন নেই।")}</p>}
  <div className="ss-actions"><button className="ss-btn" type="button" disabled={busy} onClick={()=>setRefresh(x=>x+1)}>{t("Refresh","রিফ্রেশ")}</button><button className="ss-btn" type="button" disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>{t("Previous","আগের")}</button><button className="ss-btn" type="button" disabled={busy||offset>=10000||data?.items.length!==50} onClick={()=>setOffset(offset+50)}>{t("Next","পরের")}</button></div>
 </div></section>;
}
