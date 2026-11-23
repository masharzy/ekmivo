"use client";
// Receipts customers uploaded on a checkout (owner decisions 2026-11-23): a
// separate list under Payments, laid out like Transactions, with a badge for
// new ones. The shop opens the photos, then accepts or rejects. Accepting is
// recorded as "confirmed by the shop" (0271), never as an SMS-verified payment.
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {DashboardIcon} from "./dashboard-icon";
import "./payment-receipts.css";

type Receipt={intent_id:string;reference:string;amount_minor:number;checkout_state:string;state:string;
 image_count:number;submitted_at:string;updated_at:string;seen:boolean;decision_reason?:string|null};
type List={new:number;items:Receipt[]};
type Tone="success"|"warning"|"danger"|"neutral";
type Filter=""|"open"|"accepted"|"rejected";

export function PaymentReceipts({workspaceId,bn,environment,canManage}:{workspaceId:string;bn:boolean;environment:string;canManage:boolean}){
 const t=(en:string,b:string)=>bn?b:en;
 const locale=bn?"bn-BD":"en-GB";
 const env=environment==="sandbox"?"sandbox":"live";
 const base=`/api/go/workspaces/${workspaceId}/payment-proofs`;
 const [list,setList]=useState<List|null>(null),[error,setError]=useState(""),[off,setOff]=useState(false),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(""),[confirm,setConfirm]=useState<{id:string;action:"approve"|"reject"}|null>(null);
 const [view,setView]=useState<{id:string;n:number;count:number}|null>(null);
 const [q,setQ]=useState(""),[filter,setFilter]=useState<Filter>("");
 const lock=useRef(false);
 const money=(m:number)=>"BDT "+new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(m/100);

 const read=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try{
   const r=await fetch(base+"?environment="+env,{cache:"no-store",signal});
   if(r.status===404){setOff(true);return}
   if(!r.ok)throw Error(String(r.status));
   const v:List=await r.json();if(!signal?.aborted){setList(v);setError("")}
  }catch(e){if(!signal?.aborted)setError(e instanceof Error&&e.message==="403"
   ?t("You do not have access to payments.","পেমেন্ট দেখার অনুমতি নেই।"):t("Unable to load receipts.","রসিদ লোড হয়নি।"))}
  finally{if(!signal?.aborted)setLoading(false)}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,env,bn]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>void read(c.signal),0);return()=>{clearTimeout(timer);c.abort()}},[read]);

 const post=(id:string,action:"seen"|"reject"|"approve")=>fetch(`${base}/${id}/${action}?environment=${env}`,
  {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
 function open(r:Receipt,n:number){
  setView({id:r.intent_id,n,count:r.image_count});
  if(!r.seen){setList(l=>l&&{new:Math.max(0,l.new-1),items:l.items.map(x=>x.intent_id===r.intent_id?{...x,seen:true}:x)});void post(r.intent_id,"seen")}
 }
 async function decide(id:string,action:"approve"|"reject"){
  if(lock.current)return;lock.current=true;setBusy(id);setError("");
  try{const r=await post(id,action);if(!r.ok)throw Error(String(r.status));setConfirm(null);await read()}
  catch{setError(t("Not saved. The payment may already be settled; the list was refreshed.","সেভ হয়নি। পেমেন্ট হয়তো আগেই নিষ্পত্তি হয়েছে; তালিকা নতুন করে আনা হল।"));setConfirm(null);void read()}
  finally{setBusy("");lock.current=false}
 }
 const img=(id:string,n:number)=>`/api/payment-proofs/${workspaceId}/${id}/${n}?environment=${env}`;
 const status=(r:Receipt):{tone:Tone;label:string;open:boolean}=>
  r.state==="approved"?{tone:"success",label:t("Accepted","গ্রহণ করা হয়েছে"),open:false}
  :r.checkout_state==="completed"?{tone:"success",label:t("Verified by SMS","SMS-এ যাচাই হয়েছে"),open:false}
  :r.state==="rejected"?{tone:"danger",label:t("Rejected","বাতিল"),open:false}
  :!r.seen?{tone:"warning",label:t("New","নতুন"),open:true}
  :{tone:"neutral",label:t("To check","যাচাই বাকি"),open:true};
 const rows=useMemo(()=>(list?.items??[]).filter(r=>{
  const s=status(r);
  if(filter==="open"&&!s.open)return false;
  if(filter==="accepted"&&!(r.state==="approved"||r.checkout_state==="completed"))return false;
  if(filter==="rejected"&&r.state!=="rejected")return false;
  return !q.trim()||r.reference.toLowerCase().includes(q.trim().toLowerCase());
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }),[list,filter,q,bn]);
 const when=(s:string)=>new Date(s).toLocaleString(locale,{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});

 return <div className="opw-workbench rc-page">
  <header className="opw-header"><div><h1>{t("Receipts","রসিদ")}</h1>
   <p>{t("Receipts customers uploaded at checkout. Check your account before accepting.","চেকআউটে কাস্টমারের আপলোড করা রসিদ। গ্রহণের আগে অ্যাকাউন্টে টাকা এসেছে কি না দেখে নিন।")}</p></div>
   <div className="opw-heading-actions"><button onClick={()=>void read()} disabled={loading} className="opw-refresh" type="button" aria-label={t("Refresh","রিফ্রেশ")}><DashboardIcon name="refresh" width={16} height={16}/></button></div></header>
  <div className="opw-record-card">
   <div className="ref-table-tools">
    <form onSubmit={e=>e.preventDefault()}><label className="sr-only" htmlFor="receipt-search">{t("Search reference","রেফারেন্স খুঁজুন")}</label>
     <input id="receipt-search" value={q} maxLength={96} onChange={e=>setQ(e.target.value)} placeholder={t("Search reference…","রেফারেন্স খুঁজুন…")}/></form>
    <label className="sr-only" htmlFor="receipt-filter">{t("Status","অবস্থা")}</label>
    <select id="receipt-filter" className="rc-filter" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>
     <option value="">{t("All","সব")}</option><option value="open">{t("To check","যাচাই বাকি")}</option>
     <option value="accepted">{t("Accepted","গ্রহণ করা")}</option><option value="rejected">{t("Rejected","বাতিল")}</option></select>
   </div>
   {off&&<div className="opw-empty"><strong>{t("Receipt upload is off","রসিদ আপলোড চালু নেই")}</strong></div>}
   {error&&<div className="opw-error" role="alert">{error} <button type="button" onClick={()=>void read()}>{t("Retry","আবার চেষ্টা")}</button></div>}
   {!off&&<div className="opw-list-head"><div><span>{new Intl.NumberFormat(locale).format(rows.length)} {t("receipts","টা রসিদ")}</span></div>
    {list&&list.new>0&&<span className="rc-newcount">{new Intl.NumberFormat(locale).format(list.new)} {t("new","টা নতুন")}</span>}</div>}
   {!off&&(loading&&!list?<div className="opw-empty" role="status"><strong>{t("Loading…","লোড হচ্ছে…")}</strong></div>
   :list&&rows.length===0?<div className="opw-empty"><strong>{q||filter?t("No matching receipts","মিল পাওয়া যায়নি"):t("No receipts yet","এখনো কোনো রসিদ আসেনি")}</strong><p>{t("Receipts appear here when a customer uploads one at checkout.","কাস্টমার চেকআউটে রসিদ দিলে এখানে দেখা যাবে।")}</p></div>
   :list&&<div className="opw-scroll rc-scroll"><table>
    <thead><tr><th scope="col">{t("Reference","রেফারেন্স")}</th><th scope="col">{t("Photos","ছবি")}</th><th scope="col">{t("Received","এসেছে")}</th>
     <th scope="col">{t("Status","অবস্থা")}</th><th scope="col" className="opw-num">{t("Amount","পরিমাণ")}</th>{canManage&&<th scope="col" className="rc-actcol"><span className="sr-only">{t("Actions","কাজ")}</span></th>}</tr></thead>
    <tbody>{rows.map(r=>{const s=status(r);return <tr key={r.intent_id} className={!r.seen&&s.open?"rc-unseen":undefined}>
     <td><span className="opw-reference">{r.reference}</span>{r.state==="rejected"&&r.decision_reason&&<small className="rc-why">{r.decision_reason}</small>}</td>
     <td><div className="rc-thumbs">{r.image_count===0?"—":Array.from({length:Math.min(r.image_count,5)},(_,n)=>
      <button type="button" key={n} className="rc-th" onClick={()=>open(r,n)} aria-label={t("Open photo "+(n+1),"ছবি "+(n+1)+" খুলুন")}>
       {/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(r.intent_id,n)} alt="" loading="lazy"/></button>)}</div></td>
     <td className="rc-when">{when(r.updated_at)}</td>
     <td><span className="opw-status ekv3-status" data-tone={s.tone}>{s.label}</span></td>
     <td className="opw-num">{money(r.amount_minor)}</td>
     {canManage&&<td className="rc-act">{!s.open?null:confirm?.id===r.intent_id
      ?<><span className="rc-ask">{confirm.action==="approve"?t("Money received?","টাকা পেয়েছেন?"):t("Reject?","বাতিল করবেন?")}</span>
        <button type="button" className="rc-btn pri" disabled={!!busy} onClick={()=>void decide(r.intent_id,confirm.action)}>{busy===r.intent_id?t("Saving…","হচ্ছে…"):t("Yes","হ্যাঁ")}</button>
        <button type="button" className="rc-btn" disabled={!!busy} onClick={()=>setConfirm(null)}>{t("No","না")}</button></>
      :<><button type="button" className="rc-btn pri" disabled={!!busy} onClick={()=>setConfirm({id:r.intent_id,action:"approve"})}>{t("Accept","গ্রহণ")}</button>
        <button type="button" className="rc-btn" disabled={!!busy} onClick={()=>setConfirm({id:r.intent_id,action:"reject"})}>{t("Reject","বাতিল")}</button></>}</td>}
    </tr>})}</tbody></table></div>)}
  </div>
  {view&&<div className="rc-view" role="dialog" aria-modal="true" aria-label={t("Receipt photo","রসিদের ছবি")} onClick={()=>setView(null)}>
   {/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(view.id,view.n)} alt="" onClick={e=>e.stopPropagation()}/>
   <div className="rc-nav" onClick={e=>e.stopPropagation()}>
    <button type="button" disabled={view.n<=0} onClick={()=>setView({...view,n:view.n-1})} aria-label={t("Previous","আগের")}>‹</button>
    <span>{view.n+1}/{view.count}</span>
    <button type="button" disabled={view.n>=view.count-1} onClick={()=>setView({...view,n:view.n+1})} aria-label={t("Next","পরের")}>›</button>
    <button type="button" onClick={()=>setView(null)} aria-label={t("Close","বন্ধ")}>×</button>
   </div>
  </div>}
 </div>;
}
