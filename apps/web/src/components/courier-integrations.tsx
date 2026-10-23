"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import styles from "./channel-settings.module.css";
type Data={can_admin:boolean;items:{provider:string;enabled:boolean;updated_at:string}[]};
export function CourierIntegrations({workspaceId,actorId,bn}:{workspaceId:string;actorId:string;bn:boolean}){
 const t=useCallback((en:string,be:string)=>bn?be:en,[bn]),endpoint=`/api/go/workspaces/${workspaceId}/commerce?environment=live`;
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[key,setKey]=useState(""),[secret,setSecret]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false),operation=useRef<{fp:string;id:string}|null>(null),dirty=!!key||!!secret;
 const refresh=useCallback(async(signal?:AbortSignal)=>{setLoading(true);try{const response=await fetch(endpoint+"&resource=integrations",{cache:"no-store",signal});if(!response.ok)throw Error();const next:Data=await response.json();if(!Array.isArray(next.items))throw Error();if(!signal?.aborted){setData(next);setError("");}}catch{if(!signal?.aborted){setData(null);setKey("");setSecret("");setError(t("Courier settings are unavailable. Retry refresh.","কুরিয়ারের তথ্য পাওয়া যাচ্ছে না। আবার রিফ্রেশ করুন।"));}}finally{if(!signal?.aborted)setLoading(false);}},[endpoint,t]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>void refresh(c.signal),0);return()=>{c.abort();clearTimeout(timer);};},[refresh]);
 const mutate=useCallback(async(disable=false)=>{
  if(lock.current||!data?.can_admin)return false;
  lock.current=true;setBusy(true);setError("");setNotice("");
  try{const body=disable?{provider:"steadfast"}:{provider:"steadfast",api_key:key,secret};const fp=JSON.stringify([disable,body]);if(operation.current?.fp!==fp)operation.current={fp,id:crypto.randomUUID()};
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:disable?"integration-disable":"integration-save",operation_key:operation.current.id,body})});
   if(!response.ok){if([401,403].includes(response.status)){setData(null);setKey("");setSecret("");}throw Error();}
   operation.current=null;setKey("");setSecret("");await refresh();setNotice(t("Courier credentials saved.","কুরিয়ারের তথ্য সংরক্ষিত হয়েছে।"));return true;
  }catch{setError(t("Save unconfirmed. Check your access and retry.","সংরক্ষণ নিশ্চিত হয়নি। অনুমতি দেখে আবার চেষ্টা করুন।"));return false;}finally{setBusy(false);lock.current=false;}
 },[data,endpoint,key,secret,refresh,t]);
 useEffect(()=>registerDraft({id:`courier:${actorId}:${workspaceId}`,isDirty:()=>dirty,save:()=>mutate(),discard:()=>{setKey("");setSecret("");operation.current=null;}}),[actorId,workspaceId,dirty,mutate]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 const configured=data?.items.find(x=>x.provider==="steadfast");
 return <section className={styles.root}><header><div><h1>{t("Courier integrations","কুরিয়ার সংযোগ")}</h1><p>{t("Manage credentials separately from shipment and cash records.","শিপমেন্ট ও নগদ জমার রেকর্ড থেকে সংযোগের তথ্য আলাদাভাবে পরিচালনা করুন।")}</p></div><Link href="/orders/courier">{t("Open shipments","শিপমেন্ট দেখুন")}</Link></header>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">{t("Loading…","লোড হচ্ছে…")}</p>:data?<>
   <h2>Steadfast</h2><p role="status">{configured?.enabled?t("Credentials stored. Provider booking has not been verified by this status.","তথ্য সংরক্ষিত আছে। এই অবস্থা কুরিয়ার বুকিং যাচাইয়ের প্রমাণ নয়।"):t("No enabled credentials.","সক্রিয় সংযোগের তথ্য নেই।")}</p>
   {data.can_admin?<form onSubmit={e=>{e.preventDefault();void mutate();}} autoComplete="off"><fieldset disabled={busy}><legend>{t("Steadfast credentials","Steadfast-এর তথ্য")}</legend><label>{t("API key","API key")}<input type="password" required minLength={8} maxLength={500} autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)}/></label><label>{t("Secret key","Secret key")}<input type="password" required minLength={8} maxLength={500} autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)}/></label><p>{t("Credentials are encrypted by the server and are never returned, exported or saved in browser drafts. Re-enter them to replace a connection.","সার্ভারে তথ্য এনক্রিপ্ট করা হয়। এগুলো ফেরত আসে না, এক্সপোর্ট বা ব্রাউজারের খসড়ায় জমা হয় না। সংযোগ বদলাতে আবার লিখুন।")}</p><button disabled={!dirty} type="submit">{t("Save courier credentials","কুরিয়ারের তথ্য সংরক্ষণ")}</button>{configured?.enabled&&<button type="button" disabled={dirty} onClick={()=>{if(window.confirm(t("Disable future Steadfast requests? Existing shipments and cash records remain.","পরবর্তী Steadfast অনুরোধ বন্ধ করবেন? আগের শিপমেন্ট ও নগদ জমার রেকর্ড থাকবে।")))void mutate(true);}}>{t("Disable courier connection","কুরিয়ার সংযোগ বন্ধ করুন")}</button>}</fieldset></form>:<p>{t("Only an owner or administrator can change courier credentials.","শুধু মালিক বা অ্যাডমিন কুরিয়ারের তথ্য বদলাতে পারেন।")}</p>}
   <h2>Pathao</h2><p>{t("Pathao API booking is unavailable. Use manual shipment records for externally booked consignments.","Pathao API বুকিং চালু নেই। বাইরে বুক করা কনসাইনমেন্টের তথ্য ম্যানুয়াল শিপমেন্টে রাখুন।")}</p>
  </>:<button type="button" onClick={()=>void refresh()}>{t("Retry refresh","আবার রিফ্রেশ")}</button>}
 </section>;
}
