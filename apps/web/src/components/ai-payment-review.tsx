"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./settings-page.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";

type Item={id:string;order:string;method:string;last4:string;sender_last3:string;reason:string;due_minor:number;claimed_minor:number|null;at:string};
type Queue={count:number;items:Item[]};

const reasons:Record<string,{en:string;bn:string}>={
 no_matching_sms:{en:"No matching payment SMS arrived in 15 minutes",bn:"১৫ মিনিটে মিল থাকা পেমেন্ট SMS আসেনি"},
 ai_only_never_verified:{en:"AI-only mode: payments are confirmed by you",bn:"শুধু-AI মোড: পেমেন্ট আপনি নিশ্চিত করবেন"},
 paid_after_expiry_or_change:{en:"Paid after the order expired or changed",bn:"অর্ডারের মেয়াদ শেষ বা বদলের পরে টাকা এসেছে"},
 short_payment:{en:"The received amount is less than the order total",bn:"পাওয়া টাকা অর্ডারের মোটের চেয়ে কম"},
 over_payment:{en:"The received amount is more than the order total",bn:"পাওয়া টাকা অর্ডারের মোটের চেয়ে বেশি"},
 wrong_receiving_account:{en:"Paid to a number not chosen for AI orders",bn:"AI অর্ডারের জন্য বাছাই না করা নম্বরে টাকা এসেছে"},
 payment_before_order:{en:"The SMS is older than the order",bn:"SMS-টি অর্ডারের আগের"},
 sender_mismatch:{en:"Sent from a different number than the buyer said",bn:"ক্রেতা যে নম্বর বলেছেন তার থেকে আসেনি"},
};
const methods:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
const money=(m:number|null)=>m==null?"—":"৳"+(m/100).toLocaleString("en-IN",{maximumFractionDigits:2});

export function AiPaymentReview({workspaceId,bn,environment,canManage}:{workspaceId:string;bn:boolean;environment:string;canManage:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [queue,setQueue]=useState<Queue|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(""),[confirm,setConfirm]=useState<{id:string;decision:"approve"|"reject"}|null>(null);
 const lock=useRef(false);
 const endpoint=`/api/go/workspaces/${workspaceId}/ai-payment-reviews?environment=${environment==="sandbox"?"sandbox":"live"}`;
 const read=useCallback(async(signal?:AbortSignal)=>{
  try{const r=await fetch(endpoint,{cache:"no-store",signal});if(!r.ok)throw Error(String(r.status));const v:Queue=await r.json();if(!signal?.aborted){setQueue(v);setError("");}}
  catch(e){if(!signal?.aborted)setError(e instanceof Error&&e.message==="403"?(bn?"শুধু মালিক বা অ্যাডমিন পেমেন্ট যাচাই দেখতে পারেন।":"Only the owner or an admin can review payments."):(bn?"তালিকা লোড হয়নি। আবার চেষ্টা করুন।":"Unable to load the list. Please retry."));}
 },[endpoint,bn]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>void read(c.signal),0);return()=>{clearTimeout(timer);c.abort();};},[read]);
 async function decide(id:string,decision:"approve"|"reject"){
  if(lock.current)return;lock.current=true;setBusy(id);setError("");
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({claim_id:id,decision})});
   if(!r.ok)throw Error(String(r.status));setQueue(await r.json());setConfirm(null);
  }catch(e){const code=e instanceof Error?e.message:"";
   setError(code==="409"?t("This order changed or was already decided (for example it expired and its stock was released). The list is refreshed.","অর্ডারটি বদলেছে বা আগেই সিদ্ধান্ত হয়েছে (যেমন মেয়াদ শেষে স্টক ছেড়ে দেওয়া হয়েছে)। তালিকা রিফ্রেশ হলো।")
    :t("The decision is unconfirmed. Please retry.","সিদ্ধান্ত নিশ্চিত হয়নি। আবার চেষ্টা করুন।"));
   setConfirm(null);if(code==="409")void read();
  }finally{setBusy("");lock.current=false;}
 }
 return <div className="ref-dashboard"><section className={`ref-page ${styles.page}`}>
  <div className="top"><h1>{t("Payment review","পেমেন্ট যাচাই")}</h1>
   <p>{t("Payments a buyer reported in an AI chat that could not be matched automatically. Check your account statement before you decide.","AI চ্যাটে ক্রেতার জানানো যে পেমেন্ট নিজে থেকে মেলানো যায়নি। সিদ্ধান্ত নেওয়ার আগে আপনার অ্যাকাউন্টের হিসাব দেখে নিন।")}</p></div>
  {error&&<div className="notice" role="alert">{error}{" "}<button type="button" className="ib" disabled={!!busy} onClick={()=>void read()}>{t("Retry","আবার")}</button></div>}
  {!queue&&!error&&<div className="notice" role="status">{t("Loading…","লোড হচ্ছে…")}</div>}
  {queue&&queue.items.length===0&&<div className="card"><div className={styles.body}><p className={styles.hint}>{t("Nothing to review.","যাচাই করার কিছু নেই।")}</p></div></div>}
  {queue&&queue.items.length>0&&<div className="card"><div className={styles.list}>{queue.items.map(item=>{
   const why=reasons[item.reason];
   return <div className={styles.row} key={item.id}>
    <div className={styles.mark}>{(methods[item.method]??item.method).slice(0,1).toUpperCase()}</div>
    <div className={styles.text}>
     <strong>{t("Order","অর্ডার")} {item.order} · {money(item.due_minor)}</strong>
     <small>{methods[item.method]??item.method} · TrxID …{item.last4}{item.sender_last3?` · ${t("from","যে নম্বর থেকে")} …${item.sender_last3}`:""}{item.claimed_minor!=null?` · ${t("buyer says","ক্রেতা বলছেন")} ${money(item.claimed_minor)}`:""}</small>
     <small>{why?(bn?why.bn:why.en):item.reason.startsWith("checkout_")?t("The same SMS is linked to a checkout payment","একই SMS একটা চেকআউট পেমেন্টের সঙ্গে যুক্ত"):item.reason} · {new Date(item.at).toLocaleString(bn?"bn-BD":"en-GB")}</small>
    </div>
    <div className={styles.end}>{!canManage?null:confirm?.id===item.id
     ?<><span className={styles.hint}>{confirm.decision==="approve"?t("Confirm the money arrived?","টাকা এসেছে নিশ্চিত?"):t("Reject this payment?","এই পেমেন্ট বাতিল?")}</span>
       <button type="button" className="ib pri" disabled={!!busy} onClick={()=>void decide(item.id,confirm.decision)}>{busy===item.id?t("Saving…","হচ্ছে…"):t("Yes","হ্যাঁ")}</button>
       <button type="button" className="ib" disabled={!!busy} onClick={()=>setConfirm(null)}>{t("Cancel","না")}</button></>
     :<><button type="button" className="ib pri" disabled={!!busy} onClick={()=>setConfirm({id:item.id,decision:"approve"})}>{t("Payment received","পেমেন্ট পেয়েছি")}</button>
       <button type="button" className="ib" disabled={!!busy} onClick={()=>setConfirm({id:item.id,decision:"reject"})}>{t("Not received","পাইনি")}</button></>}</div>
   </div>;})}</div></div>}
  <p className={styles.hint}>{t("Approving confirms the order and tells the buyer in the same chat (if the chat is still open for replies). Rejecting asks the order to be paid again.","অনুমোদন দিলে অর্ডার কনফার্ম হবে আর একই চ্যাটে ক্রেতাকে জানানো হবে (চ্যাটে উত্তর দেওয়ার সময় থাকলে)। বাতিল করলে অর্ডারে আবার পেমেন্ট চাওয়া হবে।")}</p>
 </section></div>;
}
