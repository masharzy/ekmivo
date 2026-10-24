"use client";
import {useCallback,useEffect,useId,useRef,useState} from "react";
import Link from "next/link";
import {registerDraft} from "../lib/client/draft-navigation";
import styles from "./admin-channel-setup.module.css";

type Field={key:string;secret:boolean;configured:boolean;value:string};
type Setup={revision:string;fields:Field[];storage_ready:boolean;channels:Record<string,string[]>;meta_webhook_url:string};
const endpoint="/api/go/platform/channel-config";
const isDirect=(model:string)=>model==="qwen3.5-omni-flash"||model.startsWith("qwen3.5-omni-flash-");

export function AdminChannelSetup({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn",id=useId(),t=(en:string,native:string)=>bn?native:en;
 const [data,setData]=useState<Setup|null>(null),[tab,setTab]=useState("ai"),[provider,setProvider]=useState("openrouter");
 const [draft,setDraft]=useState<Record<string,string>>({}),[reason,setReason]=useState(""),[reveal,setReveal]=useState<Record<string,boolean>>({});
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[toast,setToast]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[online,setOnline]=useState(true);
 const dirty=Object.keys(draft).length>0||reason.length>0;
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const saving=useRef(false);
 const field=(key:string)=>data?.fields.find(f=>f.key===key);
 const value=(key:string)=>draft[key]??field(key)?.value??"";
 const locked=busy||loading||!online||!data?.storage_ready;
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try{const response=await fetch(endpoint,{cache:"no-store",signal});if(!response.ok)throw Error();const next:Setup=await response.json();
   if(!signal?.aborted){setData(next);setError("");setProvider(isDirect(next.fields.find(f=>f.key==="AI_DEFAULT_MODEL")?.value??"")?"qwen":"openrouter");}
  }catch{if(!signal?.aborted){const message=bn?"সংযোগের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।":"Could not load connections. Try again.";setError(message);setToast(message);}}
  finally{if(!signal?.aborted)setLoading(false);}
 },[bn]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine);sync();window.addEventListener("online",sync);window.addEventListener("offline",sync);return()=>{window.removeEventListener("online",sync);window.removeEventListener("offline",sync);};},[]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[]);
 function change(key:string,next:string){setDraft(previous=>{const result={...previous};if(next===(field(key)?.value??""))delete result[key];else result[key]=next;return result;});setNotice("");}
 function chooseProvider(next:string){setProvider(next);const model=value("AI_DEFAULT_MODEL");if(next==="qwen"&&!isDirect(model))change("AI_DEFAULT_MODEL","qwen3.5-omni-flash");if(next==="openrouter"&&isDirect(model))change("AI_DEFAULT_MODEL","qwen/qwen3.8-omni-flash");}
 function discard(){setDraft({});setReason("");setReveal({});setError("");setProvider(isDirect(field("AI_DEFAULT_MODEL")?.value??"")?"qwen":"openrouter");}
 async function save():Promise<boolean>{
  if(saving.current||locked||!data)return false;
  const values=Object.fromEntries(Object.entries(draft).map(([key,input])=>[key,input.trim()]).filter(([,input])=>input));
  const model=values.AI_DEFAULT_MODEL??field("AI_DEFAULT_MODEL")?.value??"";
  const key=provider==="openrouter"?"OPENROUTER_API_KEY":"QWEN_API_KEY";
  const aiChanged=Object.keys(values).some(k=>["AI_DEFAULT_MODEL","OPENROUTER_API_KEY","QWEN_API_KEY"].includes(k));
  const invalid=reason.trim().length<10||reason.trim().length>500||!Object.keys(values).length||Object.entries(draft).some(([k,v])=>!v.trim()&&!field(k)?.secret&&!!field(k)?.value)||Object.entries(values).some(([k,v])=>v.length>4096||/[\r\n\x00]/.test(v)||(field(k)?.secret&&v.length<16))||
   (aiChanged&&(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)||isDirect(model)!==(provider==="qwen")||(!values[key]&&!field(key)?.configured)));
  if(invalid){const message=t("Check your connection details and add a reason of at least 10 characters.","সংযোগের তথ্য যাচাই করে পরিবর্তনের কারণ অন্তত ১০ অক্ষরে লিখুন।");setError(message);setToast(message);return false;}
  saving.current=true;setBusy(true);setError("");setNotice("");
  try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values,reason:reason.trim(),revision:data.revision})});
   if(!response.ok)throw Error(response.status===409?"conflict":[401,403].includes(response.status)?"auth":"save");
   const next:Setup=await response.json();setData(next);setDraft({});setReason("");setReveal({});dirtyRef.current=false;
   const message=t("Settings saved. Provider testing is still required.","তথ্য সংরক্ষিত হয়েছে। প্রোভাইডারের সঙ্গে পরীক্ষা করা বাকি।");setNotice(message);setToast(message);return true;
  }catch(caught){const kind=caught instanceof Error?caught.message:"save";const message=kind==="conflict"?t("Settings changed in another session. Keep a private copy of your changes, then discard and refresh.","অন্য সেশন থেকে সেটিংস বদলেছে। লেখা তথ্য নিজের কাছে রেখে খসড়া বাদ দিয়ে রিফ্রেশ করুন।"):kind==="auth"?t("Verify your administrator session again. Unsaved details remain on this page.","অ্যাডমিন সেশন আবার যাচাই করুন। লেখা তথ্য এই পেজে রাখা আছে।"):t("Save could not be confirmed. Your changes are still here; please retry.","সংরক্ষণ নিশ্চিত হয়নি। লেখা তথ্য রাখা আছে; আবার চেষ্টা করুন।");setError(message);setToast(message);return false;
  }finally{saving.current=false;setBusy(false);}
 }
 const saveRef=useRef(save);saveRef.current=save;
 const discardRef=useRef(discard);discardRef.current=discard;
 useEffect(()=>registerDraft({id:"admin-channel-setup",isDirty:()=>dirtyRef.current,save:()=>saveRef.current(),discard:()=>discardRef.current()}),[]);
 function input(key:string,label:string,help?:string,placeholder?:string){
  const current=field(key);if(!current)return null;const inputId=`${id}-${key}`;
  return <div className={styles.field} key={key}><div className={styles.labelRow}><label htmlFor={inputId}>{label}</label>{current.configured&&<span className={styles.saved}>{t("Saved","দেওয়া আছে")}</span>}</div><div className={styles.inputWrap}>
   <input id={inputId} name={key} type={current.secret&&!reveal[key]?"password":"text"} value={value(key)} onChange={event=>change(key,event.target.value)} disabled={locked} autoComplete="off" spellCheck={false} maxLength={key==="AI_DEFAULT_MODEL"?200:4096} aria-describedby={help?`${inputId}-help`:undefined} placeholder={current.secret&&current.configured?t("Leave blank to keep saved key","আগের key রাখতে খালি রাখুন"):placeholder} list={key==="AI_DEFAULT_MODEL"?`${id}-models`:undefined}/>
   {current.secret&&<button type="button" className={styles.reveal} disabled={locked} aria-controls={inputId} aria-pressed={!!reveal[key]} aria-label={`${reveal[key]?t("Hide","লুকান"):t("Show","দেখুন")} ${label}`} onClick={()=>setReveal(previous=>({...previous,[key]:!previous[key]}))}>{reveal[key]?t("Hide","লুকান"):t("Show","দেখুন")}</button>}</div>{help&&<p id={`${inputId}-help`} className={styles.help}>{help}</p>}</div>;
 }
 const selectedKey=field(provider==="openrouter"?"OPENROUTER_API_KEY":"QWEN_API_KEY");
 return <section className={`pa-surface ${styles.root}`} aria-labelledby={`${id}-title`} aria-busy={loading||busy}>
  <header className={styles.header}><div><h2 id={`${id}-title`}>{t("AI & messaging connections","AI ও মেসেজিং সংযোগ")}</h2><p>{t("Choose your AI model and connect your messaging platforms.","AI মডেল বেছে নিন ও মেসেজিং প্ল্যাটফর্ম যুক্ত করুন।")}</p></div><button type="button" className={styles.refresh} disabled={busy||loading||dirty||!online} onClick={()=>void load()} aria-label={t("Refresh connections","সংযোগের তথ্য রিফ্রেশ করুন")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.8 6.5A6.5 6.5 0 1 0 16.4 12M16 3v4.5h-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>{t("Refresh","রিফ্রেশ")}</button></header>
  <nav className={styles.tabs} aria-label={t("Connection settings","সংযোগের সেটিংস")}><button type="button" aria-pressed={tab==="ai"} onClick={()=>setTab("ai")}>{t("AI provider","AI প্রোভাইডার")}</button><button type="button" aria-pressed={tab==="messaging"} onClick={()=>setTab("messaging")}>{t("Messaging channels","মেসেজিং চ্যানেল")}</button></nav>
  <div className={styles.body}>
   {!online&&<p className={styles.warning} role="status">{t("You are offline. Unsaved details stay on this page.","ইন্টারনেট সংযোগ নেই। লেখা তথ্য এই পেজে রাখা আছে।")}</p>}
   {loading&&!data&&<div className={styles.loading} role="status">{t("Loading connections…","সংযোগের তথ্য আসছে…")}</div>}
   {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.success} role="status">{notice}</p>}
   {data&&!data.storage_ready&&<div className={styles.warning}><strong>{t("Saving is not available yet","এখনো সংরক্ষণ চালু হয়নি")}</strong><p>{t("Server setup is incomplete. You can review the fields, but connections cannot be saved yet.","সার্ভারের সেটআপ অসম্পূর্ণ। ফিল্ডগুলো দেখতে পারবেন, তবে এখনই সংরক্ষণ করা যাবে না।")}</p></div>}
   {data&&<form onSubmit={event=>{event.preventDefault();void save();}}>
    {tab==="ai"?<>
     <div className={styles.sectionHead}><div><h3>{t("AI provider","AI প্রোভাইডার")}</h3><p>{t("One model for your platform’s AI requests.","প্ল্যাটফর্মের AI অনুরোধের জন্য একটি মডেল।")}</p></div><span className={styles.status}>{selectedKey?.configured?t("Key saved · not tested","Key দেওয়া আছে · পরীক্ষা বাকি"):t("Not configured","সেটআপ করা হয়নি")}</span></div>
     <fieldset className={styles.providers} disabled={locked}><legend className={styles.srOnly}>{t("Select AI provider","AI প্রোভাইডার বেছে নিন")}</legend>{["openrouter","qwen"].map(p=><label key={p} data-selected={provider===p}><input type="radio" name="provider" checked={provider===p} onChange={()=>chooseProvider(p)}/><span><strong>{p==="openrouter"?"OpenRouter":"Qwen Direct"}</strong><small>{p==="openrouter"?t("Qwen and other supported models","Qwen ও অন্যান্য মডেল"):"Alibaba Cloud · Singapore"}</small></span></label>)}</fieldset>
     <div className={styles.aiLayout}><div className={styles.fields}>
      {input(provider==="openrouter"?"OPENROUTER_API_KEY":"QWEN_API_KEY","API key",t("Keys are encrypted on the server. Saved keys are never displayed.","Key সার্ভারে এনক্রিপ্ট করা থাকে। সংরক্ষিত key ফেরত দেখানো হয় না।"),provider==="openrouter"?"sk-or-v1-…":"Singapore API key")}
      {input("AI_DEFAULT_MODEL",t("Model ID","মডেল ID"),provider==="openrouter"?t("Use the exact model ID from OpenRouter.","OpenRouter-এ দেওয়া সম্পূর্ণ model ID লিখুন।"):t("Direct Qwen supports the Qwen 3.5 Omni Flash family.","সরাসরি Qwen সংযোগে Qwen 3.5 Omni Flash সমর্থিত।"),provider==="openrouter"?"qwen/qwen3.8-omni-flash":"qwen3.5-omni-flash")}
      <datalist id={`${id}-models`}>{provider==="openrouter"?<option value="qwen/qwen3.8-omni-flash"/>:<><option value="qwen3.5-omni-flash"/><option value="qwen3.5-omni-flash-2026-03-15"/></>}</datalist>
     </div><aside className={styles.guide}><span className={styles.eyebrow}>{t("Before you start","শুরু করার আগে")}</span><h4>{provider==="openrouter"?"Qwen 3.8 Omni Flash":"Qwen 3.5 Omni Flash"}</h4><p>{provider==="openrouter"?t("Use an OpenRouter key for this model. No separate Alibaba Cloud key is needed.","এই মডেলের জন্য OpenRouter key দিন। আলাদা Alibaba Cloud key লাগবে না।"):t("Use a Singapore-region Alibaba Cloud key for the direct connection.","সরাসরি সংযোগের জন্য Alibaba Cloud-এর Singapore অঞ্চলের key দিন।")}</p><a href={provider==="openrouter"?"https://openrouter.ai/settings/keys":"https://bailian.console.alibabacloud.com/"} target="_blank" rel="noreferrer">{t("Get an API key","API key নিন")} ↗</a><div className={styles.guideFooter}><p>{t("The selected model also needs published rates and request limits.","নির্বাচিত মডেলের চার্জ ও অনুরোধের সীমাও নির্ধারিত থাকতে হবে।")}</p><Link href="/admin/credits">{t("Manage model rates","মডেলের চার্জ নির্ধারণ")} →</Link></div></aside></div>
    </>:<>
     <div className={styles.sectionHead}><div><h3>Meta app</h3><p>{t("Shared credentials for Messenger, Instagram and WhatsApp.","Messenger, Instagram ও WhatsApp-এর জন্য একই app-এর তথ্য।")}</p></div><a className={styles.external} href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Meta Developer Apps ↗</a></div>
     <div className={styles.metaFields}>{input("META_APP_ID","App ID",undefined,"123456789012345")}{input("META_APP_SECRET","App secret")}{input("META_GRAPH_VERSION","Graph API version",undefined,"v24.0")}{input("META_WHATSAPP_CONFIG_ID","WhatsApp configuration ID",t("Only needed for WhatsApp.","শুধু WhatsApp-এর জন্য প্রয়োজন।"))}</div>
     <details className={styles.advanced}><summary>{t("Webhook & redirect settings","Webhook ও redirect সেটিংস")}</summary><div className={styles.metaFields}>{input("CHANNEL_PUBLIC_ORIGIN",t("Public API origin","সার্ভারের public API ঠিকানা"),undefined,"https://api.example.com")}{input("META_WEBHOOK_VERIFY_TOKEN","Webhook verify token")}{input("META_OAUTH_REDIRECT_URI","OAuth redirect URL",undefined,"https://api.example.com/v1/channels/meta/callback")}</div>{data.meta_webhook_url.startsWith("https://")&&<div className={styles.callback}><span>Webhook callback URL</span><code>{data.meta_webhook_url}</code></div>}<p className={styles.help}>{t("Register these URLs and permissions in Meta. Saved credentials do not confirm App Review or message delivery.","Meta app-এ এই ঠিকানা ও প্রয়োজনীয় অনুমতি যুক্ত করুন। তথ্য সংরক্ষণ মানেই App Review বা মেসেজ পৌঁছানো যাচাই নয়।")}</p></details>
     <div className={styles.telegram}><span className={styles.telegramMark} aria-hidden="true">↗</span><div><h4>Telegram</h4><p>{t("Each business adds its own bot token from Channels.","প্রতিটি ব্যবসা নিজের Channels পেজ থেকে bot token যুক্ত করবে।")}</p></div><a href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather ↗</a></div>
    </>}
    <footer className={styles.footer}><div className={styles.reason}><label htmlFor={`${id}-reason`}>{t("Reason for change","পরিবর্তনের কারণ")}</label><input id={`${id}-reason`} name="reason" value={reason} onChange={event=>setReason(event.target.value)} disabled={locked} minLength={10} maxLength={500} placeholder={t("e.g. Connect our OpenRouter account","যেমন: OpenRouter account যুক্ত করছি")} aria-describedby={`${id}-audit`}/><p id={`${id}-audit`}>{t("Recorded in the admin audit log. Never include a key here.","অ্যাডমিনের পরিবর্তনের ইতিহাসে থাকবে। এখানে key লিখবেন না।")}</p></div><div className={styles.actions}><span>{dirty?t("Unsaved changes","সংরক্ষণ করা হয়নি"):t("No unsaved changes","কোনো পরিবর্তন নেই")}</span><div>{dirty&&<button type="button" className={styles.discard} disabled={busy} onClick={discard}>{t("Discard","বাদ দিন")}</button>}<button type="submit" className={styles.save} disabled={locked||!Object.keys(draft).length||reason.trim().length<10}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save changes","সংরক্ষণ করুন")}</button></div></div></footer>
   </form>}
  </div>{toast&&<div className={styles.toast} role="status"><span>{toast}</span><button type="button" aria-label={t("Dismiss notification","বার্তা বন্ধ করুন")} onClick={()=>setToast("")}>×</button></div>}
 </section>;
}
