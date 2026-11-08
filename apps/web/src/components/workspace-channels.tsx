"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {RefIcon} from "./reference-ui";
import "./dashboard-reference.css";
import "./reference-adapters.css";
import styles from "./settings-page.module.css";
type Connection={id:string;provider:string;enabled:boolean};
const providers=[["ms","Messenger","M"],["ig","Instagram","IG"],["wa","WhatsApp","WA"],["tg","Telegram","TG"]] as const;
export function WorkspaceChannels({workspaceId,bn,detailsEnabled=false}:{workspaceId:string;bn:boolean;detailsEnabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[items,setItems]=useState<Connection[]>([]),[loaded,setLoaded]=useState(false),[ready,setReady]=useState<Record<string,string[]>|null>(null),[botToken,setBotToken]=useState(""),[tgOpen,setTgOpen]=useState(false);
 const t=(en:string,be:string)=>bn?be:en;
 const base=`/api/go/workspaces/${workspaceId}`;
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const [r,s]=await Promise.all([fetch(base+'/inbox-connections?environment=live',{cache:'no-store',signal}),fetch(base+'/inbox-channel-status?environment=live',{cache:'no-store',signal})]);if(!r.ok)throw Error();const data=await r.json();if(!signal?.aborted){setItems(data.items);setLoaded(true);if(s.ok)setReady((await s.json()).channels);else setReady(null);}}catch{if(!signal?.aborted)setError(bn?"চ্যানেলের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।":"Unable to load channels. Retry.");}},[base,bn]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>void refresh(c.signal),0);return()=>{clearTimeout(timer);c.abort();};},[refresh]);
 async function disconnect(id:string){setBusy(true);setError("");try{const r=await fetch(base+`/inbox-connections/${id}/disconnect?environment=live`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();await refresh()}catch{setError(bn?"বিচ্ছিন্ন করা যায়নি। আবার চেষ্টা করুন।":"Unable to disconnect. Retry.");}finally{setBusy(false)}}
 async function connect(provider:string){setBusy(true);setError("");try{const r=await fetch(base+(provider==='tg'?'/inbox-telegram':'/inbox-connect')+'?environment=live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(provider==='tg'?{token:botToken}:{provider})});const data=await r.json();if(!r.ok)throw Error(data.error?.code??data.code??'');if(provider==='tg'){setBotToken("");setTgOpen(false);await refresh();return;}const u=new URL(data.url);if(u.protocol!=='https:'||u.hostname!=='www.facebook.com')throw Error();window.location.assign(u.href)}catch(e){const code=e instanceof Error?e.message:'';setError(code==='CHANNEL_NOT_CONFIGURED'?(bn?"প্ল্যাটফর্মের চ্যানেল সেটআপ বাকি। অ্যাডমিনকে কনফিগার করতে বলুন।":"Platform channel setup is incomplete. Ask the administrator to configure it."):code==='BOT_AUTHORIZATION_REJECTED'?(bn?"Bot token যাচাই হয়নি। BotFather থেকে সঠিক token দিন।":"Bot token was rejected. Check the token from BotFather."):(bn?"সংযোগ নিশ্চিত হয়নি। তথ্য দেখে আবার চেষ্টা করুন।":"Connection unconfirmed. Check the details and retry."));}finally{setBusy(false)}}
 return <div className="ref-dashboard"><section className={`ref-page ${styles.page}`} aria-label={t("Channels","চ্যানেল")}>
  <div className="top"><h1>{t("Channels","চ্যানেল")}</h1><div className="acts"><button type="button" className="ib i" aria-label={t("Refresh","রিফ্রেশ")} disabled={busy} onClick={()=>{setError('');void refresh();}}><RefIcon name="refresh"/></button></div><p>{t("Connect the places your customers message you. Everything lands in one Inbox.","যেখানে গ্রাহক মেসেজ করে সেগুলো যুক্ত করুন। সব মেসেজ এক ইনবক্সে আসবে।")}</p></div>
  {error&&<div className="notice" role="alert">{error}</div>}
  <div className={`card ${styles.list}`}>{providers.map(([id,name,mark])=>{
   const conns=items.filter(i=>i.provider===id&&i.enabled);
   const connected=conns.length>0,configured=ready?.[id]?.length===0;
   return <div key={id}>
    <div className={styles.row}>
     <span className={styles.mark}>{mark}</span>
     <span className={styles.text}><strong>{name}</strong><small>{connected?t("Connected — messages arrive in your Inbox","যুক্ত আছে — মেসেজ ইনবক্সে আসছে"):configured||ready===null?t("Not connected","যুক্ত নেই"):t("Not available yet — platform setup pending","এখনো চালু হয়নি — প্ল্যাটফর্ম সেটআপ বাকি")}</small></span>
     <span className={styles.end}>
      <span className={`pill ${connected?"green":configured?"":"orange"}`}>{!loaded?"…":connected?t("Connected","যুক্ত"):configured?t("Off","বন্ধ"):t("Setup pending","সেটআপ বাকি")}</span>
      {!connected&&configured&&(id==="tg"?<button type="button" className="ib pri" disabled={busy} onClick={()=>setTgOpen(v=>!v)}>{t("Connect","যুক্ত করুন")}</button>:<button type="button" className="ib pri" disabled={busy} onClick={()=>void connect(id)}>{t("Connect","যুক্ত করুন")}</button>)}
      {connected&&detailsEnabled&&<Link className="ib" href={'/settings/channels/'+conns[0].id}>{t("Settings","সেটিংস")}</Link>}
      {connected&&<button type="button" className="ib" disabled={busy} onClick={()=>void disconnect(conns[0].id)}>{t("Disconnect","বিচ্ছিন্ন")}</button>}
     </span>
    </div>
    {id==="tg"&&tgOpen&&!connected&&<form className={styles.body} onSubmit={e=>{e.preventDefault();void connect('tg');}}>
     <p className={styles.hint}>{t("Create a bot with BotFather and paste its token. Private text chats only; groups and media are not supported yet. Connecting replaces the bot's existing webhook.","BotFather থেকে বট বানিয়ে token দিন। শুধু প্রাইভেট টেক্সট চ্যাট; গ্রুপ ও মিডিয়া এখনো নেই। এটি বটের আগের webhook বদলে দেবে।")} <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather ↗</a></p>
     <label className={styles.field}>{t("Bot token","Bot token")}<input type="password" autoComplete="off" maxLength={200} required value={botToken} onChange={e=>setBotToken(e.target.value)} disabled={busy}/></label>
     <div className={styles.foot}><button type="submit" className="ib pri" disabled={busy||!botToken.trim()}>{t("Connect Telegram","Telegram যুক্ত করুন")}</button><button type="button" className="ib" onClick={()=>setTgOpen(false)}>{t("Cancel","বাতিল")}</button></div>
    </form>}
   </div>;
  })}</div>
  <p className={styles.hint}>{t("Facebook personal inboxes are not supported — only Pages.","ফেসবুকের ব্যক্তিগত ইনবক্স সমর্থিত নয় — শুধু পেজ।")}</p>
 </section></div>;
}
