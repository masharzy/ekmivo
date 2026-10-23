"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import styles from "./channel-settings.module.css";
type Policy={mode:"ai"|"human";sla_minutes:number;return_after_minutes:number;review_guidance:string;upsell_guidance:string};
type Channel={id:string;provider:string;external_id:string;enabled:boolean;revision:number;policy:Policy;waiting:number;overdue:number};
type Pending={key:string;body:{id:string;revision:number;policy:Policy}};
export function ChannelSettings({workspaceId,actorId,connectionId,bn}:{workspaceId:string;actorId:string;connectionId:string;bn:boolean}){
 const t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const base=`/api/go/workspaces/${workspaceId}/workspace-tools/channel-settings`;
 const [channel,setChannel]=useState<Channel|null>(null),[draft,setDraft]=useState<Policy|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[unconfirmed,setUnconfirmed]=useState(false);
 const pending=useRef<Pending|null>(null),lock=useRef(false);
 const dirty=!!channel&&!!draft&&JSON.stringify(channel.policy)!==JSON.stringify(draft);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try{
   const response=await fetch(base+"/"+connectionId+"?environment=live",{cache:"no-store",signal});
   if(!response.ok)throw Error(String(response.status));
   const data=await response.json();const item=data.items?.find((x:Channel)=>x.id===connectionId);
   if(!item)throw Error("404");
   if(!signal?.aborted){setChannel(item);setDraft(item.policy);setError("");}
  }catch(e){if(!signal?.aborted){setChannel(null);setDraft(null);setError(e instanceof Error&&e.message==="403"?t("You cannot manage this channel.","এই চ্যানেল পরিচালনার অনুমতি নেই।"):t("Channel settings are unavailable. Retry refresh.","চ্যানেলের তথ্য পাওয়া যাচ্ছে না। আবার রিফ্রেশ করুন।"));}}
  finally{if(!signal?.aborted)setLoading(false);}
 },[base,connectionId,t]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>void load(c.signal),0);return()=>{c.abort();clearTimeout(timer);};},[load]);
 const save=useCallback(async()=>{
  if(lock.current||!channel||!draft)return false;
  lock.current=true;setBusy(true);setError("");setNotice("");
  pending.current??={key:crypto.randomUUID(),body:{id:connectionId,revision:channel.revision,policy:draft}};
  setUnconfirmed(true);
  try{
   const response=await fetch(base+"?environment=live",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...pending.current.body,operation_key:pending.current.key})});
   if(!response.ok){
    if([401,403].includes(response.status)){setChannel(null);setDraft(null);}
    if(response.status<500){pending.current=null;setUnconfirmed(false);}
    throw Error(String(response.status));
   }
   pending.current=null;setUnconfirmed(false);await load();setNotice(t("Channel settings saved.","চ্যানেলের সেটিংস সংরক্ষিত হয়েছে।"));return true;
  }catch(e){setError(e instanceof Error&&e.message==="409"?t("This channel changed. Discard edits and refresh.","চ্যানেলের তথ্য বদলেছে। লেখা বাতিল করে রিফ্রেশ করুন।"):t("Save unconfirmed. Your edits are preserved; retry the same operation.","সংরক্ষণ নিশ্চিত হয়নি। লেখা রাখা আছে; একই কাজ আবার চেষ্টা করুন।"));return false;}
  finally{lock.current=false;setBusy(false);}
 },[base,channel,connectionId,draft,load,t]);
 useEffect(()=>registerDraft({id:`channel-policy:${actorId}:${workspaceId}:${connectionId}`,isDirty:()=>dirty||unconfirmed,save,discard:()=>{pending.current=null;setUnconfirmed(false);setDraft(channel?.policy??null);setError("");}}),[actorId,workspaceId,connectionId,channel,dirty,unconfirmed,save]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty||pending.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 const patch=<K extends keyof Policy>(key:K,value:Policy[K])=>{if(!busy&&!unconfirmed)setDraft(x=>x?{...x,[key]:value}:x);};
 return <section className={styles.root}><header><div><h1>{t("Channel settings","চ্যানেলের সেটিংস")}</h1><p>{t("Response rules apply to this connected account.","উত্তরের এই নিয়মগুলো শুধু এই সংযুক্ত অ্যাকাউন্টে প্রযোজ্য।")}</p></div><Link href="/settings/channels">{t("All channels","সব চ্যানেল")}</Link></header>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">{t("Loading channel…","চ্যানেলের তথ্য আসছে…")}</p>:channel&&draft?<>
   <dl className={styles.facts}><div><dt>{t("Provider / account","মাধ্যম / অ্যাকাউন্ট")}</dt><dd>{channel.provider.toUpperCase()} · {channel.external_id}</dd></div><div><dt>{t("Connection","সংযোগ")}</dt><dd>{channel.enabled?t("Connected","সংযুক্ত"):t("Disconnected","বিচ্ছিন্ন")}</dd></div><div><dt>{t("Waiting / over SLA","উত্তর বাকি / সময় পেরিয়েছে")}</dt><dd>{channel.waiting} / {channel.overdue}</dd></div></dl>
   <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||unconfirmed}><legend>{t("Response policy","উত্তরের নিয়ম")}</legend>
    <label>{t("Response mode","উত্তরের ধরন")}<select aria-label={t("Response mode","উত্তরের ধরন")} value={draft.mode} onChange={e=>patch("mode",e.target.value as Policy["mode"])}><option value="ai">{t("AI-assisted","AI সহায়তা")}</option><option value="human">{t("Human only","শুধু মানুষ")}</option></select></label>
    <p>{t("Human-only cancels stale automatic work. AI-assisted still requires published instructions, credits, an open messaging window and each conversation's handover state. Switching back does not send old messages.","শুধু মানুষ বেছে নিলে পুরোনো স্বয়ংক্রিয় কাজ বাতিল হবে। AI সহায়তায়ও প্রকাশিত নির্দেশনা, ক্রেডিট, মেসেজের খোলা সময়সীমা ও কথোপকথনের দায়িত্বের নিয়ম লাগবে। আবার AI চালু করলে পুরোনো মেসেজ পাঠাবে না।")}</p>
    <div className={styles.fields}><label>{t("Reply SLA (minutes)","উত্তরের সময়সীমা (মিনিট)")}<input type="number" required min={1} max={10080} value={draft.sla_minutes} onChange={e=>patch("sla_minutes",Number(e.target.value))}/></label><label>{t("Handover auto-return (minutes, 0 disables)","দায়িত্ব থেকে স্বয়ংক্রিয় ফেরা (মিনিট, ০ দিলে বন্ধ)")}<input type="number" required min={0} max={10080} value={draft.return_after_minutes} onChange={e=>patch("return_after_minutes",Number(e.target.value))}/></label></div>
    <label>{t("Review request guidance","রিভিউ চাওয়ার নির্দেশনা")}<textarea maxLength={1000} value={draft.review_guidance} onChange={e=>patch("review_guidance",e.target.value)}/></label>
    <label>{t("Product suggestion guidance","পণ্য প্রস্তাবের নির্দেশনা")}<textarea maxLength={1000} value={draft.upsell_guidance} onChange={e=>patch("upsell_guidance",e.target.value)}/></label>
    <p>{t("Guidance is used only in a grounded reply to the current customer request. It does not schedule marketing, establish consent or verify a purchase.","এই নির্দেশনা কেবল বর্তমান গ্রাহকের প্রশ্নের তথ্যভিত্তিক উত্তরে ব্যবহৃত হবে। এটি প্রচারণা নির্ধারণ, সম্মতি তৈরি বা কেনাকাটা যাচাই করে না।")}</p>
    <button type="submit" disabled={!dirty}>{t("Save channel settings","চ্যানেলের সেটিংস সংরক্ষণ")}</button>
   </fieldset></form>
   {unconfirmed&&<button type="button" disabled={busy} onClick={()=>void save()}>{t("Retry unconfirmed save","অসম্পূর্ণ সংরক্ষণ আবার চেষ্টা করুন")}</button>}
   <button type="button" disabled={busy} onClick={()=>{pending.current=null;setUnconfirmed(false);void load();}}>{t("Discard edits and refresh","লেখা বাতিল করে রিফ্রেশ")}</button>
  </>:<button type="button" disabled={busy} onClick={()=>void load()}>{t("Retry refresh","আবার রিফ্রেশ")}</button>}
 </section>;
}
