"use client";
// Receipts customers uploaded on a checkout (owner decision 2026-11-23): a
// separate list under Payments, with a badge for new ones. The shop opens the
// photos and can reject a receipt (the customer can then upload again).
// Approving (paid + transaction) is a separate step and not offered here yet.
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./settings-page.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";
import "./payment-receipts.css";

type Receipt={intent_id:string;reference:string;amount_minor:number;checkout_state:string;state:string;
 image_count:number;submitted_at:string;updated_at:string;seen:boolean;decision_reason?:string|null};
type List={new:number;items:Receipt[]};

const money=(m:number)=>"৳"+(m/100).toLocaleString("en-IN",{maximumFractionDigits:2});

export function PaymentReceipts({workspaceId,bn,environment,canManage}:{workspaceId:string;bn:boolean;environment:string;canManage:boolean}){
 const t=(en:string,b:string)=>bn?b:en;
 const env=environment==="sandbox"?"sandbox":"live";
 const base=`/api/go/workspaces/${workspaceId}/payment-proofs`;
 const [list,setList]=useState<List|null>(null),[error,setError]=useState(""),[off,setOff]=useState(false);
 const [busy,setBusy]=useState(""),[confirm,setConfirm]=useState(""),[view,setView]=useState<{id:string;n:number;count:number}|null>(null);
 const lock=useRef(false);
 const read=useCallback(async(signal?:AbortSignal)=>{
  try{
   const r=await fetch(base+"?environment="+env,{cache:"no-store",signal});
   if(r.status===404){setOff(true);return}
   if(!r.ok)throw Error(String(r.status));
   const v:List=await r.json();if(!signal?.aborted){setList(v);setError("")}
  }catch(e){if(!signal?.aborted)setError(e instanceof Error&&e.message==="403"
   ?t("You do not have access to payments.","পেমেন্ট দেখার অনুমতি নেই।"):t("Could not load. Please retry.","লোড হয়নি। আবার চেষ্টা করুন।"))}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,env,bn]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>void read(c.signal),0);return()=>{clearTimeout(timer);c.abort()}},[read]);

 const post=async(id:string,action:"seen"|"reject")=>fetch(`${base}/${id}/${action}?environment=${env}`,
  {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});

 function open(r:Receipt,n:number){
  setView({id:r.intent_id,n,count:r.image_count});
  if(!r.seen){setList(l=>l&&{new:Math.max(0,l.new-1),items:l.items.map(x=>x.intent_id===r.intent_id?{...x,seen:true}:x)});void post(r.intent_id,"seen")}
 }
 async function reject(id:string){
  if(lock.current)return;lock.current=true;setBusy(id);setError("");
  try{const r=await post(id,"reject");if(!r.ok)throw Error(String(r.status));setConfirm("");await read()}
  catch{setError(t("Not saved. The payment may already be verified; the list is refreshed.","সেভ হয়নি। পেমেন্ট হয়তো আগেই যাচাই হয়েছে; তালিকা নতুন করে আনা হল।"));setConfirm("");void read()}
  finally{setBusy("");lock.current=false}
 }
 const img=(id:string,n:number)=>`/api/payment-proofs/${workspaceId}/${id}/${n}?environment=${env}`;
 const status=(r:Receipt)=>r.checkout_state==="completed"?{c:"ok",l:t("Verified","যাচাই হয়েছে")}
  :r.state==="rejected"?{c:"bad",l:t("Rejected","বাতিল")}
  :r.state==="approved"?{c:"ok",l:t("Approved","অনুমোদিত")}
  :!r.seen?{c:"new",l:t("New","নতুন")}:{c:"wait",l:t("To check","যাচাই বাকি")};

 return <div className="ref-dashboard"><section className={`ref-page ${styles.page}`}>
  <div className="top"><h1>{t("Receipts","রসিদ")}</h1>
   <p>{t("Receipts customers uploaded on a checkout. Check the money in your account before you decide.","চেকআউটে কাস্টমারের আপলোড করা রসিদ। সিদ্ধান্তের আগে আপনার অ্যাকাউন্টে টাকা এসেছে কি না দেখে নিন।")}</p></div>
  {off&&<div className="card"><div className={styles.body}><p className={styles.hint}>{t("Receipt upload is not turned on.","রসিদ আপলোড চালু নেই।")}</p></div></div>}
  {error&&<div className="notice" role="alert">{error}{" "}<button type="button" className="ib" disabled={!!busy} onClick={()=>void read()}>{t("Retry","আবার")}</button></div>}
  {!list&&!error&&!off&&<div className="notice" role="status">{t("Loading…","লোড হচ্ছে…")}</div>}
  {list&&list.items.length===0&&<div className="card"><div className={styles.body}><p className={styles.hint}>{t("No receipts yet.","এখনো কোনো রসিদ আসেনি।")}</p></div></div>}
  {list&&list.items.length>0&&<div className="card"><div className={styles.list}>{list.items.map(r=>{const s=status(r);
   const open_=r.checkout_state!=="completed"&&r.state!=="rejected"&&r.state!=="approved";
   return <div className={`${styles.row} rc-row`} key={r.intent_id}>
    <div className="rc-thumbs">{Array.from({length:Math.min(r.image_count,5)},(_,n)=>
     <button type="button" key={n} className="rc-th" onClick={()=>open(r,n)} aria-label={t("Open photo "+(n+1),"ছবি "+(n+1)+" খুলুন")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(r.intent_id,n)} alt="" loading="lazy"/></button>)}</div>
    <div className={styles.text}>
     <strong>{money(r.amount_minor)} · {r.reference}</strong>
     <small>{new Date(r.updated_at).toLocaleString(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short"})} · {r.image_count} {t("photo(s)","টা ছবি")}</small>
     {r.state==="rejected"&&r.decision_reason&&<small>{r.decision_reason}</small>}
    </div>
    <div className={styles.end}>
     <span className={`rc-tag rc-${s.c}`}>{s.l}</span>
     {canManage&&open_&&(confirm===r.intent_id
      ?<><span className={styles.hint}>{t("Reject this receipt?","রসিদটা বাতিল করবেন?")}</span>
        <button type="button" className="ib pri" disabled={!!busy} onClick={()=>void reject(r.intent_id)}>{busy===r.intent_id?t("Saving…","হচ্ছে…"):t("Yes","হ্যাঁ")}</button>
        <button type="button" className="ib" disabled={!!busy} onClick={()=>setConfirm("")}>{t("No","না")}</button></>
      :<button type="button" className="ib" disabled={!!busy} onClick={()=>setConfirm(r.intent_id)}>{t("Reject","বাতিল")}</button>)}
    </div>
   </div>})}</div></div>}
  {view&&<div className="rc-view" role="dialog" aria-modal="true" aria-label={t("Receipt photo","রসিদের ছবি")} onClick={()=>setView(null)}>
   {/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(view.id,view.n)} alt="" onClick={e=>e.stopPropagation()}/>
   <div className="rc-nav" onClick={e=>e.stopPropagation()}>
    <button type="button" disabled={view.n<=0} onClick={()=>setView({...view,n:view.n-1})} aria-label={t("Previous","আগের")}>‹</button>
    <span>{view.n+1}/{view.count}</span>
    <button type="button" disabled={view.n>=view.count-1} onClick={()=>setView({...view,n:view.n+1})} aria-label={t("Next","পরের")}>›</button>
    <button type="button" onClick={()=>setView(null)} aria-label={t("Close","বন্ধ")}>×</button>
   </div>
  </div>}
 </section></div>;
}
