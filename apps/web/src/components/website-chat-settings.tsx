"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./settings-page.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";
type Site={id:string;origin:string;enabled:boolean;revision:number};type Data={site:Site|null;can_manage:boolean;api_origin?:string};
export function WebsiteChatSettings({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const [data,setData]=useState<Data|null>(null),[origin,setOrigin]=useState(""),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(false),[pending,setPending]=useState<{origin:string;enabled:boolean;revision:number;operation_key:string}|null>(null);const lock=useRef(false);
 const endpoint=`/api/go/workspaces/${workspaceId}/website-chat`;
 const read=useCallback(async(signal?:AbortSignal)=>{try{const response=await fetch(endpoint,{cache:"no-store",signal});if(!response.ok)throw Error();const value:Data=await response.json();if(!signal?.aborted){setData(value);setOrigin(value.site?.origin??"");setEnabled(value.site?.enabled??false);setError("");}}catch{if(!signal?.aborted)setError(bn?"সেটিংস লোড হয়নি। আবার চেষ্টা করুন।":"Unable to load settings. Please retry.");}},[endpoint,bn]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>void read(c.signal),0);return()=>{clearTimeout(timer);c.abort();};},[read]);
 async function save(){if(!data||lock.current)return;lock.current=true;setBusy(true);setError("");setSuccess(false);const request=pending??{origin,enabled,revision:data.site?.revision??0,operation_key:crypto.randomUUID()};setPending(request);
  try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});if(!response.ok){if(![502,503,504].includes(response.status))setPending(null);throw Error(String(response.status));}const value:Data=await response.json();setData(value);setOrigin(value.site?.origin??"");setEnabled(value.site?.enabled??false);setPending(null);setSuccess(true);}catch(e){setError(e instanceof Error&&e.message==="409"?(bn?"সেটিংস বদলেছে। রিফ্রেশ করে আবার দেখুন।":"Settings changed. Refresh and review before saving."):(bn?"সংরক্ষণ নিশ্চিত হয়নি। আবার চেষ্টা করুন।":"Save is unconfirmed. Please retry."));}finally{setBusy(false);lock.current=false;}}
 const t=(en:string,be:string)=>bn?be:en;const locked=!data?.can_manage||busy||!!pending;
 const script=data?.site&&data.api_origin?`<script async src="${data.api_origin}/v1/channels/website/widget.js" data-site="${data.site.id}"></script>`:"";
 return <div className="ref-dashboard"><section className={`ref-page ${styles.page}`}>
  <div className="top"><h1>{t("Website chat","ওয়েবসাইট চ্যাট")}</h1><p>{t("Add a chat bubble to your website. Visitors' messages arrive in your Inbox, answered by your AI assistant or your team.","আপনার ওয়েবসাইটে চ্যাট বাবল যোগ করুন। ভিজিটরের মেসেজ ইনবক্সে আসবে — AI সহকারী বা আপনার টিম উত্তর দেবে।")}</p></div>
  {error&&<div className="notice" role="alert">{error}{" "}<button type="button" className="ib" disabled={busy||!!pending} onClick={()=>void read()}>{t("Retry","আবার")}</button></div>}
  {success&&<div className="notice" role="status">{t("Saved.","সংরক্ষিত হয়েছে।")}</div>}
  {!data&&!error&&<div className="notice" role="status">{t("Loading…","লোড হচ্ছে…")}</div>}
  {data&&<form className="card" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className={styles.body}>
    <label className={styles.field}>{t("Your website address","আপনার ওয়েবসাইটের ঠিকানা")}<input type="url" required maxLength={255} placeholder="https://example.com" value={origin} disabled={locked} onChange={e=>{setOrigin(e.target.value);setSuccess(false);}}/></label>
    <p className={styles.hint}>{t("Use the https:// address with no path or trailing slash. Changing it signs out existing visitors.","https:// ঠিকানা দিন — শেষে path বা slash নয়। ঠিকানা বদলালে আগের ভিজিটর সেশন বন্ধ হবে।")}</p>
    <label className={styles.toggle}><input type="checkbox" checked={enabled} disabled={locked} onChange={e=>setEnabled(e.target.checked)}/>{t("Chat is on","চ্যাট চালু")}</label>
    <div className={styles.foot}>{data.can_manage?<button type="submit" className="ib pri" disabled={busy}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):pending?t("Retry save","আবার পাঠান"):t("Save","সংরক্ষণ")}</button>:<span className={styles.hint}>{t("View-only access.","শুধু দেখার অনুমতি।")}</span>}</div>
   </div>
  </form>}
  {data?.site&&<div className="card"><div className={styles.body}>
   <h2>{t("Install on your site","সাইটে বসান")}</h2>
   {script?<><textarea readOnly className={styles.code} aria-label={t("Chat script","চ্যাট script")} value={script}/><div className={styles.foot}><button type="button" className="ib" onClick={()=>void navigator.clipboard?.writeText(script)}>{t("Copy code","কোড কপি")}</button></div><p className={styles.hint}>{t("Paste before the closing </body> tag. Limits: 20 messages per visitor and 200 per site each minute.","</body> ট্যাগের ঠিক আগে বসান। সীমা: প্রতি মিনিটে ভিজিটর প্রতি ২০ ও সাইট প্রতি ২০০ মেসেজ।")}</p></>:<p className={styles.hint} role="status">{t("The public chat address is unavailable. Contact support before installing.","চ্যাটের পাবলিক ঠিকানা পাওয়া যাচ্ছে না। বসানোর আগে সাপোর্টে জানান।")}</p>}
  <p className={styles.hint}>{t("Voice calling is currently unavailable.","ভয়েস কল এখন পাওয়া যাচ্ছে না।")}</p></div></div>}
 </section></div>;
}
