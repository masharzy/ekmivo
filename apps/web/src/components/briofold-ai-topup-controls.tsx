"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import type {AiWalletView} from "../lib/server/briofold-ai-wallet";
import styles from "./briofold-ai-topup-controls.module.css";
export function BriofoldAiTopupControls({workspaceId,locale,enabled,topups}:{
 workspaceId:string;locale:"en"|"bn";enabled:boolean;topups:AiWalletView["topups"];
}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const router=useRouter();
 const [amount,setAmount]=useState(100),[pending,startTransition]=useTransition(),[error,setError]=useState("");
 const key=useRef("");
 const money=(minor:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
 async function purchase(){
  setError("");
  if(!enabled){setError(t("AI credit purchases are not available yet.","AI ক্রেডিট কেনা এখনো চালু হয়নি।"));return}
  if(amount<10||amount>100000||!Number.isInteger(amount)){setError(t("Choose ৳10–৳100,000.","১০–১,০০,০০০ টাকা বাছুন।"));return}
  if(!key.current)key.current=crypto.randomUUID();
  startTransition(async()=>{
   try{
    const r=await fetch(`/api/go/workspaces/${workspaceId}/ai-credits/purchase`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Idempotency-Key":key.current},body:JSON.stringify({amount_minor:amount*100})});
    const data=await r.json();
    if(!r.ok)throw Error(data?.error?.code||data?.code||String(r.status));
    if(!/^[a-zA-Z0-9_-]{10,256}$/.test(String(data.checkout_token)))throw Error("CHECKOUT_TOKEN_MISSING");
    key.current="";
    router.push("/pay/"+encodeURIComponent(data.checkout_token));
   }catch(e){setError(t("Could not start your top-up. Retry safely.","ক্রেডিট কেনা শুরু হয়নি। একই অনুরোধ আবার চেষ্টা করুন।")+" "+(e instanceof Error?e.message:""))}
  });
 }
 async function verify(id:string){
  setError("");
  startTransition(async()=>{
   try{
    const r=await fetch(`/api/go/workspaces/${workspaceId}/ai-credits/${id}/reconcile`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
    const data=await r.json();
    if(!r.ok)throw Error(data?.error?.code||data?.code||String(r.status));
    if(data.payment_status!=="paid"){setError(t("Payment is not verified yet: ","পেমেন্ট এখনো যাচাই হয়নি: ")+String(data.payment_status));return}
    router.refresh();
   }catch(e){setError(t("Could not confirm credits. Retry.","ক্রেডিট নিশ্চিত করা যায়নি। আবার চেষ্টা করুন।")+" "+(e instanceof Error?e.message:""))}
  });
 }
 return <div className={styles.root}>
  <h3>{t("Add AI credits","AI ক্রেডিট যোগ করুন")}</h3>
  {enabled?<div className={styles.buy}>
   <label>{t("Amount in BDT","টাকা")}<input type="number" min="10" max="100000" step="1" value={amount} disabled={pending} onChange={e=>{key.current="";setAmount(Number(e.target.value));setError("")}}/></label>
   <button type="button" disabled={pending} onClick={()=>void purchase()}>{t("Continue to payment","পেমেন্টে যান")}</button>
  </div>:<p>{t("AI top-ups are disabled until the credit purchase and metering checks have been approved.","ক্রেডিট কেনা ও AI usage-এর verification শেষ না হওয়া পর্যন্ত top-up বন্ধ থাকবে।")}</p>}
  {topups.length>0&&<section><h3>{t("Your top-ups","ক্রেডিট যোগ করার ইতিহাস")}</h3><div className={styles.history}>
   {topups.map(x=><div key={x.id} className={styles.row}>
    <span>{money(x.amount_minor)}</span><span>{x.status==="credited"?t("Credited","যোগ হয়েছে"):t("Awaiting verification","যাচাই বাকি")}</span>
    {x.status==="pending"&&enabled&&<button type="button" disabled={pending} onClick={()=>void verify(x.id)}>{t("Verify payment","পেমেন্ট যাচাই")}</button>}
   </div>)}
  </div></section>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </div>;
}
