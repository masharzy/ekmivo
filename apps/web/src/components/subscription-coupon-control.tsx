"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {couponErrorCode,couponErrorMessage,parseCouponQuote,type CouponQuoteSnapshot} from "../lib/subscription-coupon-quote";

/** Mount only with a server-issued, authenticated Phase 4 purchase intent.
 * The older Billing preview quote is not interchangeable with this contract. */
export function SubscriptionCouponControl({intentId,locale,onQuote}:{
 intentId:string;locale:"bn"|"en";onQuote:(quote:CouponQuoteSnapshot|null)=>void;
}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [draft,setDraft]=useState("");const [snapshot,setSnapshot]=useState<CouponQuoteSnapshot|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const pending=useRef<{revision:number;code:string;key:string}|null>(null);
 const sequence=useRef(0);
 const onQuoteRef=useRef(onQuote);
 useEffect(()=>{onQuoteRef.current=onQuote;},[onQuote]);
 const endpoint=`/api/go/platform/purchase-intents/${intentId}/quote`;
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const seq=++sequence.current;
  try{
   const response=await fetch(endpoint,{cache:"no-store",signal});
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error(couponErrorCode(body));
   const q=parseCouponQuote(body);if(!q)throw Error("QUOTE_REQUIRED");
   if(seq!==sequence.current||signal?.aborted)return;
   setSnapshot(q);setDraft(q.coupon_code);onQuoteRef.current(q);setMessage("");
  }catch(e){if(seq!==sequence.current||signal?.aborted)return;
   setSnapshot(null);onQuoteRef.current(null);setMessage(couponErrorMessage(e instanceof Error?e.message:"UNKNOWN",locale));
  }finally{if(seq===sequence.current&&!signal?.aborted)setLoading(false);}
 },[endpoint,locale]);
 useEffect(()=>{const controller=new AbortController();const seqRef=sequence;queueMicrotask(()=>{if(controller.signal.aborted)return;setLoading(true);setSnapshot(null);pending.current=null;onQuoteRef.current(null);void refresh(controller.signal);});return ()=>{controller.abort();seqRef.current++;};},[refresh]);

 async function mutate(code:string){
  if(!snapshot||busy||loading||Date.parse(snapshot.expires_at)<=Date.now()){
   setMessage(couponErrorMessage("QUOTE_REQUIRED",locale));return;
  }
  const normalized=code.trim().toUpperCase();
  if(normalized&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalized)){
   setMessage(t("Enter a valid coupon code.","সঠিক কুপন কোড লিখুন।"));return;
  }
  const retry=pending.current;
  const operation=retry&&retry.revision===snapshot.intent_revision&&retry.code===normalized?retry:{revision:snapshot.intent_revision,code:normalized,key:crypto.randomUUID()};
  pending.current=operation;setBusy(true);setMessage("");
  try{
   const response=await fetch(endpoint,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:operation.revision,operation_key:operation.key,coupon_code:normalized})});
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error(couponErrorCode(body));
   const q=parseCouponQuote(body);if(!q)throw Error("UNKNOWN");
   pending.current=null;setSnapshot(q);setDraft(q.coupon_code);onQuoteRef.current(q);
   setMessage(normalized?t("Coupon applied to the verified total.","যাচাইকৃত মোটে কুপন প্রয়োগ হয়েছে।"):t("Coupon removed; amount re-quoted.","কুপন সরিয়ে নতুন হিসাব হয়েছে।"));
  }catch(e){
   // A transport exception's free-form message (including TypeError from a
   // lost response after commit) is NEVER an API code. Recover by GET, not
   // by submitting a fresh mutation/idempotency key.
   const raw=e instanceof Error?e.message:"UNKNOWN";
   const code=["COUPON_INELIGIBLE","ZERO_DUE_POLICY_REQUIRED","TAX_REQUOTE_REQUIRED","TAX_POLICY_REQUIRED",
    "QUOTE_CHANGED","QUOTE_REQUIRED","OFFER_CHANGED","FORBIDDEN"].includes(raw)?raw:"UNKNOWN";
   setMessage(couponErrorMessage(code,locale));
   // GET is authoritative after unknown writes and revision conflicts. Retain
   // the same idempotency key if retry remains necessary.
   if(code==="QUOTE_CHANGED"||code==="QUOTE_REQUIRED"||code==="UNKNOWN")await refresh();
  }finally{setBusy(false);}
 }

 const minor=(n:number)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(n/100);
 return <section className="ek-order-coupon" aria-label={t("Platform subscription coupon","প্ল্যাটফর্ম সাবস্ক্রিপশন কুপন")}>
  <label htmlFor="ek-order-verified-coupon">{t("Coupon code","কুপন কোড")}</label>
  <div><input id="ek-order-verified-coupon" autoComplete="off" maxLength={32} value={draft} onChange={e=>setDraft(e.target.value)} disabled={loading||busy||!snapshot} aria-describedby="ek-order-verified-coupon-status"/>
   <button type="button" disabled={loading||busy||!snapshot} onClick={()=>void mutate(draft)}>{busy?t("Checking…","যাচাই হচ্ছে…"):t("Apply","প্রয়োগ")}</button>
   {snapshot?.coupon_id&&<button type="button" disabled={busy||loading} onClick={()=>void mutate("")}>{t("Remove","সরান")}</button>}
  </div>
  <p id="ek-order-verified-coupon-status" role={message&&snapshot===null?"alert":"status"} aria-live="polite">{loading?t("Loading verified quote…","যাচাইকৃত হিসাব লোড হচ্ছে…"):message}</p>
  {snapshot&&<div aria-live="polite"><small>{t("Coupon discount","কুপন ছাড়")}: {minor(snapshot.coupon_discount_minor)} · {t("Tax","কর")}: {minor(snapshot.tax_minor)} · {t("Verified total","যাচাইকৃত মোট")}: {minor(snapshot.total_minor)}</small></div>}
 </section>;
}
