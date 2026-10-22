"use client";

import {useCallback,useEffect,useState} from "react";
import {readSubscriptionPayment,type SubscriptionPaymentResult} from "../lib/subscription-payment-client";

export function SubscriptionPaymentStatus({workspace,intent,locale}:{workspace:string;intent:string;locale:"bn"|"en"}){
 const bn=locale==="bn";
 const [data,setData]=useState<SubscriptionPaymentResult|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const t=(en:string,be:string)=>bn?be:en;
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  try{
   const next=await readSubscriptionPayment(workspace,intent,signal);
   if(!signal?.aborted){setData(next);setError("")}
  }catch(e){
   if(!signal?.aborted)setError(e instanceof Error&&e.message==="NOT_FOUND"?"NOT_FOUND":"SOURCE_UNAVAILABLE");
  }finally{if(!signal?.aborted)setLoading(false)}
 },[workspace,intent]);
 useEffect(()=>{
  const ac=new AbortController();
  void refresh(ac.signal);
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh(ac.signal)},6000);
  return()=>{ac.abort();window.clearInterval(timer)};
 },[refresh]);
 const label=loading?t("Checking payment…","পেমেন্ট যাচাই হচ্ছে…"):data?.status==="completed"&&data.verified?
  t("Subscription active — verified payment","সাবস্ক্রিপশন সক্রিয় — যাচাইকৃত পেমেন্ট"):
  data?.status==="verifying"?t("Verifying independent payment evidence","স্বতন্ত্র পেমেন্ট প্রমাণ যাচাই চলছে"):
  data?.status==="recovery_required"?t("Payment recovery needs review","পেমেন্ট পুনরুদ্ধারে পর্যালোচনা প্রয়োজন"):
  data?.status==="expired"?t("Checkout expired","চেকআউটের মেয়াদ শেষ"):
  data?.status==="cancelled"?t("Checkout cancelled","চেকআউট বাতিল"):
  t("Payment pending","পেমেন্ট অপেক্ষমাণ");
 return <main className="mx-auto max-w-xl px-5 py-12" lang={locale} aria-live="polite">
  <h1 className="text-2xl font-semibold">{t("Subscription payment status","সাবস্ক্রিপশন পেমেন্ট স্ট্যাটাস")}</h1>
  <p className="mt-4" role="status">{label}</p>
  {error&&<p role="alert" className="mt-3">{error==="NOT_FOUND"?t("This order is unavailable for your Store.","এই অর্ডারটি আপনার স্টোরের জন্য উপলব্ধ নয়।"):
    t("Status temporarily unavailable. Do not send a second payment.","স্ট্যাটাস সাময়িকভাবে পাওয়া যাচ্ছে না। আবার টাকা পাঠাবেন না।")}</p>}
  {data&&<section className="mt-6 space-y-2" aria-label={t("Invoice","ইনভয়েস")}>
   <p>{t("Invoice: ","ইনভয়েস: ")}<code>{data.invoice_id}</code></p>
   <p>{t("Exact amount: ","সঠিক পরিমাণ: ")}৳{(data.amount_minor/100).toFixed(2)}</p>
   {!data.verified&&<p>{t("Closing this tab will not stop automatic verification. If you already paid, do not pay again.","ট্যাব বন্ধ করলেও স্বয়ংক্রিয় যাচাই চলবে। টাকা পাঠিয়ে থাকলে আবার পাঠাবেন না।")}</p>}
   {data.status==="recovery_required"&&<p>{t("Contact Ekmivo support for operator-led recovery; no automatic refund has been sent.","অপারেটর-পরিচালিত সমাধানের জন্য Ekmivo সাপোর্টে যোগাযোগ করুন; স্বয়ংক্রিয় রিফান্ড পাঠানো হয়নি।")}</p>}
   <a className="underline" href={`/api/workspaces/${workspace}/billing-invoices/${data.invoice_id}/pdf`}>{t("Real invoice (PDF)","আসল ইনভয়েস (PDF)")}</a>
  </section>}
  <nav className="mt-8 flex flex-wrap gap-4">
   <button type="button" className="underline" onClick={()=>void refresh()}>{t("Refresh status","স্ট্যাটাস রিফ্রেশ")}</button>
   <a className="underline" href={`/w/${workspace}/billing`}>{t("Store Billing","স্টোর বিলিং")}</a>
  </nav>
 </main>;
}
