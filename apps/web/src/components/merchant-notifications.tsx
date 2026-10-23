"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {InboxAlerts} from "./inbox-alerts";
import {PaymentNotificationCenter} from "./payment-notification-center";
import styles from "./merchant-notifications.module.css";

type Kind="all"|"inbox"|"reminders"|"bookings"|"payments"|"calls";
type Lead={id:string;name:string;due?:boolean};
type Booking={id:string;summary:string;starts_at:string;status:string};
type State<T>={items:T[];more:boolean;error:boolean;loaded:boolean};
const blank=<T,>():State<T>=>({items:[],more:false,error:false,loaded:false});

export function MerchantNotifications({workspaceId,locale,environment,aiEnabled,paymentsEnabled,growthEnabled}:{workspaceId:string;locale:"en"|"bn";environment:"live"|"sandbox";aiEnabled:boolean;paymentsEnabled:boolean;growthEnabled:boolean}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const [kind,setKind]=useState<Kind>("all"),[refresh,setRefresh]=useState(0);
 const [reminders,setReminders]=useState<State<Lead>>(()=>blank()),[bookings,setBookings]=useState<State<Booking>>(()=>blank());
 const showReminders=aiEnabled&&(kind==="all"||kind==="reminders");
 const showBookings=aiEnabled&&growthEnabled&&(kind==="all"||kind==="bookings");
 const load=useCallback(async(signal:AbortSignal)=>{
  const tasks:Promise<void>[]=[];
  if(showReminders)tasks.push((async()=>{
   try{
    const response=await fetch(`/api/go/workspaces/${workspaceId}/crm?environment=${environment}&filter=due&cursor=0`,{cache:"no-store",signal});
    if(!response.ok)throw Error(String(response.status));
    const data=await response.json() as {items?:Lead[]};
    if(!Array.isArray(data.items))throw Error("INVALID_CRM_SOURCE");
    if(!signal.aborted)setReminders({items:data.items.slice(0,50).filter(item=>item.due===true),more:data.items.length>50,error:false,loaded:true});
   }catch{if(!signal.aborted)setReminders({items:[],more:false,error:true,loaded:true});}
  })());
  if(showBookings)tasks.push((async()=>{
   try{
    const response=await fetch(`/api/go/workspaces/${workspaceId}/growth?environment=${environment}&kind=booking`,{cache:"no-store",signal});
    if(!response.ok)throw Error(String(response.status));
    const data=await response.json() as {items?:Booking[]};
    if(!Array.isArray(data.items))throw Error("INVALID_BOOKING_SOURCE");
    const now=Date.now();
    if(!signal.aborted)setBookings({items:data.items.filter(item=>["requested","confirmed"].includes(item.status)&&Date.parse(item.starts_at)>=now),more:false,error:false,loaded:true});
   }catch{if(!signal.aborted)setBookings({items:[],more:false,error:true,loaded:true});}
  })());
  await Promise.all(tasks);
 },[environment,showBookings,showReminders,workspaceId]);
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void load(controller.signal);});return()=>controller.abort();},[load,refresh]);
 const options:[Kind,string][]=[["all",t("All sources","সব উৎস")],...(aiEnabled?[["inbox",t("Inbox & AI","ইনবক্স ও AI")],["reminders",t("Reminders","অনুস্মারক")],["bookings",t("Bookings","বুকিং")],["calls",t("Calls","কল")]] as [Kind,string][]:[]),...(paymentsEnabled?[["payments",t("Payments","পেমেন্ট")]] as [Kind,string][]:[])];
 const time=(v:string)=>new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
 return <div className={styles.root}>
  <div className={styles.top}><div><h1>{t("Store notifications","স্টোর নোটিফিকেশন")}</h1><p>{t("Inbox, team reminders, internal bookings and authoritative payment notices have separate sources and read states.","ইনবক্স, টিম অনুস্মারক, অভ্যন্তরীণ বুকিং ও যাচাইকৃত পেমেন্টের নোটিফিকেশনের উৎস ও পড়ার অবস্থা আলাদা।")}</p></div><button type="button" onClick={()=>setRefresh(n=>n+1)}>{t("Refresh operational alerts","কাজের সতর্কতা রিফ্রেশ")}</button></div>
  <nav className={styles.tabs} aria-label={t("Notification source filter","নোটিফিকেশনের উৎস ফিল্টার")}>{options.map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</nav>
  {showReminders&&<section className={styles.panel} aria-label={t("Due CRM reminders","বাকি CRM অনুস্মারক")}><h2>{t("Due team reminders","টিমের বাকি অনুস্মারক")}</h2><p>{t("Source: CRM follow-ups. Internal work only; this does not send messages to customers.","উৎস: CRM ফলো-আপ। শুধু টিমের কাজ; এতে গ্রাহককে মেসেজ পাঠানো হয় না।")}</p>{!reminders.loaded?<p role="status">{t("Checking CRM…","CRM দেখা হচ্ছে…")}</p>:reminders.error?<p role="alert">{t("CRM reminders unavailable; no empty-list claim.","CRM অনুস্মারক পাওয়া যাচ্ছে না; তালিকা ফাঁকা বলে ধরে নেওয়া হচ্ছে না।")}</p>:reminders.items.length?<ul>{reminders.items.map(item=><li key={item.id}><strong>{item.name}</strong><Link href="/customers/follow-ups">{t("Review due follow-up","বাকি ফলো-আপ দেখুন")}</Link></li>)}</ul>:<p>{t("No due CRM leads on this page.","এই পৃষ্ঠায় বাকি CRM লিড নেই।")}</p>}{reminders.more&&<Link href="/customers/follow-ups">{t("More results are available in CRM","CRM-এ আরও ফলাফল আছে")}</Link>}</section>}
  {showBookings&&<section className={styles.panel} aria-label={t("Upcoming internal bookings","আসন্ন অভ্যন্তরীণ বুকিং")}><h2>{t("Upcoming internal bookings","আসন্ন অভ্যন্তরীণ বুকিং")}</h2><p>{t("Source: saved Store appointments. No external calendar, call or customer reminder has been sent.","উৎস: স্টোরের সংরক্ষিত অ্যাপয়েন্টমেন্ট। বাইরের ক্যালেন্ডার, কল বা গ্রাহক অনুস্মারক পাঠানো হয়নি।")}</p>{!bookings.loaded?<p role="status">{t("Checking bookings…","বুকিং দেখা হচ্ছে…")}</p>:bookings.error?<p role="alert">{t("Booking source unavailable; check setup and permissions.","বুকিং উৎস পাওয়া যায়নি; সেটআপ ও অনুমতি দেখুন।")}</p>:bookings.items.length?<ul>{bookings.items.map(item=><li key={item.id}><strong>{item.summary}</strong><span>{time(item.starts_at)} · {item.status}</span><Link href="/customers/bookings">{t("Manage booking","বুকিং পরিচালনা")}</Link></li>)}</ul>:<p>{t("No upcoming internal bookings.","আসন্ন অভ্যন্তরীণ বুকিং নেই।")}</p>}</section>}
  {kind==="bookings"&&!growthEnabled&&<p role="alert" className={styles.panel}>{t("Booking notifications are unavailable until the growth service is enabled; no delivery is implied.","গ্রোথ সেবা চালু না হওয়া পর্যন্ত বুকিং নোটিফিকেশন পাওয়া যাবে না; কোনো মেসেজ পাঠানো হয়েছে বলে ধরে নেবেন না।")}</p>}
  {kind==="calls"&&<p role="status" className={styles.panel}>{t("No call event provider is connected. Incoming or missed calls cannot be verified here.","কোনো কল ইভেন্ট প্রোভাইডার সংযুক্ত নেই। আসা বা মিসড কল এখানে যাচাই করা যাচ্ছে না।")}</p>}
  {aiEnabled&&(kind==="all"||kind==="inbox")&&<InboxAlerts key={workspaceId+refresh} workspaceId={workspaceId} bn={bn}/>}
  {paymentsEnabled&&(kind==="all"||kind==="payments")&&<PaymentNotificationCenter key={workspaceId+environment+refresh} locale={locale} workspaceId={workspaceId} environment={environment}/>}
 </div>;
}
