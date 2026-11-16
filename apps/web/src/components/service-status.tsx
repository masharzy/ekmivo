"use client";
import {useCallback,useEffect,useState} from "react";
import {SERVICE_KEYS,overallState,type ServiceKey,type ServiceState} from "../lib/service-status";

type Locale="en"|"bn";
const COPY={
 bn:{
  overall:{ok:["সব সার্ভিস চালু আছে","সবকিছু স্বাভাবিকভাবে চলছে।"],issue:["কিছু সার্ভিসে সমস্যা চলছে","কোনটায় সমস্যা, নিচের তালিকায় দেখুন।"],unknown:["কিছু সার্ভিসের অবস্থা জানা যাচ্ছে না","যেগুলোর অবস্থা জানা আছে, নিচে দেখুন।"],loading:["অবস্থা দেখা হচ্ছে…",""]},
  chip:{operational:"চালু",degraded:"ধীর চলছে",down:"বন্ধ",unknown:"জানা নেই"},
  svc:{web:["ওয়েবসাইট ও ড্যাশবোর্ড","লগইন, ড্যাশবোর্ড আর চেকআউট পেজ"],payments:["পেমেন্ট API","পেমেন্ট তৈরি আর যাচাই"],sms:["SMS দিয়ে পেমেন্ট মেলানো","ফোন থেকে আসা পেমেন্ট SMS মেলানো"],ai:["এআই বট","কাস্টমারকে এআই-এর উত্তর"],chat:["Facebook, Instagram ও WhatsApp চ্যাট","মেসেজ আসা আর পাঠানো"],webhooks:["Webhook","আপনার সার্ভারে ইভেন্ট পাঠানো"]},
  list:"সার্ভিসের তালিকা",checked:"শেষবার দেখা হয়েছে",refresh:"আবার দেখুন",checking:"দেখা হচ্ছে…",never:"এখনো দেখা হয়নি"
 },
 en:{
  overall:{ok:["All services are up","Everything is running normally."],issue:["Some services have problems","See which ones below."],unknown:["Some service states are unknown","The ones we can check are below."],loading:["Checking status…",""]},
  chip:{operational:"Up",degraded:"Slow",down:"Down",unknown:"Unknown"},
  svc:{web:["Website and dashboard","Sign-in, dashboard and checkout pages"],payments:["Payment API","Creating and verifying payments"],sms:["SMS payment matching","Matching payment SMS from your phone"],ai:["AI bot","AI replies to your customers"],chat:["Facebook, Instagram and WhatsApp chat","Receiving and sending messages"],webhooks:["Webhooks","Sending events to your server"]},
  list:"Services",checked:"Last checked",refresh:"Check again",checking:"Checking…",never:"Not checked yet"
 }
} as const;
const ICON:Record<ServiceKey,string>={
 web:"M3 5h18v12H3zM8 21h8M12 17v4",
 payments:"M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM3 10h18M7 15h4",
 sms:"M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
 ai:"M7 7h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM12 3v4M9 12h.01M15 12h.01M9.5 16h5",
 chat:"M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
 webhooks:"M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
};
const BIG={
 ok:"M5 12l5 5L20 7",
 issue:"M12 7v6M12 17h.01",
 unknown:"M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
 loading:"M12 3a9 9 0 1 0 9 9"
};
const UNKNOWN:Record<ServiceKey,ServiceState>={web:"unknown",payments:"unknown",sms:"unknown",ai:"unknown",chat:"unknown",webhooks:"unknown"};

export function ServiceStatus({locale}:{locale:Locale}){
 const c=COPY[locale];
 const [services,setServices]=useState<Record<ServiceKey,ServiceState>>(UNKNOWN);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [time,setTime]=useState<string|null>(null);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  setBusy(true);
  try{
   const r=await fetch("/api/service-status",{signal,cache:"no-store"});
   if(!r.ok)throw Error("status");
   const d=await r.json() as {services?:Partial<Record<ServiceKey,ServiceState>>;observed_at?:string};
   if(signal?.aborted)return;
   setServices({...UNKNOWN,...(d.services||{})});
   setTime(typeof d.observed_at==="string"?d.observed_at:null);
  }catch{
   if(!signal?.aborted)setServices(UNKNOWN);
  }finally{
   if(!signal?.aborted){setBusy(false);setLoaded(true)}
  }
 },[]);
 useEffect(()=>{const ctl=new AbortController();void Promise.resolve().then(()=>{if(!ctl.signal.aborted)return refresh(ctl.signal)});return()=>ctl.abort()},[refresh]);
 const overall=loaded?overallState(services):"loading";
 const tone=overall==="loading"?"unknown":overall;
 const when=time?new Date(time).toLocaleString(locale==="bn"?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short"}):c.never;
 return <div className="bf-status">
  <section className={`bf-status-card is-${tone}`} aria-labelledby="bf-status-title" aria-busy={busy}>
   <div className="bf-status-top">
    <span className="bf-status-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={BIG[overall]}/></svg></span>
    <div><h2 id="bf-status-title" role="status">{c.overall[overall][0]}</h2>{c.overall[overall][1]&&<p>{c.overall[overall][1]}</p>}</div>
   </div>
   <div className="bf-status-meta">
    <div><small>{c.checked}</small><b>{when}</b></div>
    <button type="button" className="bf-btn" disabled={busy} onClick={()=>void refresh()}>{busy&&<span className="bf-spin" aria-hidden="true"/>}{busy?c.checking:c.refresh}</button>
   </div>
  </section>
  <ul className="bf-status-list" aria-label={c.list}>
   {SERVICE_KEYS.map(k=>{const s=services[k];return <li key={k}>
    <div className="bf-status-name"><span className="bf-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={ICON[k]}/></svg></span><div><b>{c.svc[k][0]}</b><span>{c.svc[k][1]}</span></div></div>
    <span className={`bf-chip is-${s}`}><i aria-hidden="true"/>{c.chip[s]}</span>
   </li>})}
  </ul>
 </div>;
}
