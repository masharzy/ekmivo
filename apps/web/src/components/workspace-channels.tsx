"use client";
import Link from "next/link";
import styles from "./workspace-channels.module.css";
import { Camera, MessageCircle, Phone, Send } from "lucide-react";
import {useCallback,useEffect,useState} from "react";
type Connection={id:string;provider:string;enabled:boolean;display_name?:string;external_id?:string};
export function WorkspaceChannels({workspaceId,bn,detailsEnabled=false}:{workspaceId:string;bn:boolean;detailsEnabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[items,setItems]=useState<Connection[]>([]),[loaded,setLoaded]=useState(false),[ready,setReady]=useState<Record<string,string[]>|null>(null),[botToken,setBotToken]=useState("");
 const base=`/api/go/workspaces/${workspaceId}`;
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const [r,s]=await Promise.all([fetch(base+'/inbox-connections?environment=live',{cache:'no-store',signal}),fetch(base+'/inbox-channel-status?environment=live',{cache:'no-store',signal})]);if(!r.ok)throw Error();const data=await r.json();if(!signal?.aborted){setItems(data.items);setLoaded(true);if(s.ok)setReady((await s.json()).channels);else setReady(null);}}catch{if(!signal?.aborted)setError(bn?"চ্যানেলের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।":"Unable to load channels. Retry.");}},[base,bn]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>void refresh(c.signal),0);return()=>{clearTimeout(timer);c.abort();};},[refresh]);
 async function disconnect(id:string){setBusy(true);setError("");try{const r=await fetch(base+`/inbox-connections/${id}/disconnect?environment=live`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();await refresh()}catch{setError(bn?"বিচ্ছিন্ন করা যায়নি। আবার চেষ্টা করুন।":"Unable to disconnect. Retry.");}finally{setBusy(false)}}
 async function connect(provider:string){setBusy(true);setError("");try{const r=await fetch(base+(provider==='tg'?'/inbox-telegram':'/inbox-connect')+'?environment=live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(provider==='tg'?{token:botToken}:{provider})});const data=await r.json();if(!r.ok)throw Error(data.error?.code??data.code??'');if(provider==='tg'){setBotToken("");await refresh();return;}const u=new URL(data.url);if(u.protocol!=='https:'||u.hostname!=='www.facebook.com')throw Error();window.location.assign(u.href)}catch(e){const code=e instanceof Error?e.message:'';setError(code==='CHANNEL_NOT_CONFIGURED'?(bn?"প্ল্যাটফর্মের চ্যানেল সেটআপ বাকি। অ্যাডমিনকে কনফিগার করতে বলুন।":"Platform channel setup is incomplete. Ask the administrator to configure it."):code==='BOT_AUTHORIZATION_REJECTED'?(bn?"Bot token যাচাই হয়নি। BotFather থেকে সঠিক token দিন।":"Bot token was rejected. Check the token from BotFather."):(bn?"সংযোগ নিশ্চিত হয়নি। তথ্য দেখে আবার চেষ্টা করুন।":"Connection unconfirmed. Check the details and retry."));}finally{setBusy(false)}}
 const providers = [
  { id: "ms", name: "Messenger", Icon: MessageCircle },
  { id: "ig", name: "Instagram", Icon: Camera },
  { id: "wa", name: "WhatsApp", Icon: Phone },
  { id: "tg", name: "Telegram", Icon: Send },
 ];
 const fixture = (item: Connection) => item.external_id?.startsWith("ui-fixture-");
 function account(item: Connection) {
  return <li key={item.id} className={styles.account}>
   <div className={styles.identity}>
    <strong>{item.display_name || item.external_id || (bn ? "সংযুক্ত অ্যাকাউন্ট" : "Linked account")}</strong>
    {item.display_name && item.external_id && <small dir="ltr">ID {item.external_id}</small>}
   </div>
   <div className={styles.actions}>
    <span className={styles.status} data-connected={item.enabled}>{item.enabled ? (bn ? "সংযুক্ত" : "Connected") : (bn ? "বিচ্ছিন্ন" : "Disconnected")}</span>
    {detailsEnabled && <Link href={`/settings/channels/${item.id}`}>{bn ? "সেটিংস" : "Settings"}</Link>}
    {item.enabled && <button type="button" disabled={busy} onClick={() => void disconnect(item.id)}>{bn ? "বিচ্ছিন্ন করুন" : "Disconnect"}</button>}
   </div>
  </li>;
 }
 return <section className={styles.root}>
  <header className={styles.heading}>
   <div><h1>{bn ? "চ্যানেল" : "Channels"}</h1><p>{bn ? "আপনার ব্যবসার মেসেজিং অ্যাকাউন্ট সংযুক্ত ও পরিচালনা করুন।" : "Connect and manage your business messaging accounts."}</p></div>
   <button type="button" disabled={busy} onClick={() => { setError(""); void refresh(); }}>{bn ? "রিফ্রেশ" : "Refresh"}</button>
  </header>
  {error && <div className={styles.notice} role="alert">{error}<button type="button" onClick={() => setError("")} aria-label={bn ? "বার্তা বন্ধ করুন" : "Dismiss error"}>×</button></div>}
  <div className={styles.grid}>
   {providers.map(({ id, name, Icon }) => {
    const accounts = items.filter(item => item.provider === id && !fixture(item));
    const canConnect = ready?.[id]?.length === 0;
    return <section className={styles.card} key={id} aria-label={name}>
     <header className={styles.provider}>
      <span className={styles.icon} data-provider={id}><Icon size={18} aria-hidden="true" /></span>
      <h2>{name}</h2>
      {loaded && (canConnect ? id === "tg" ? null : <button className={styles.primary} type="button" disabled={busy} onClick={() => void connect(id)}>{bn ? "সংযুক্ত করুন" : "Connect"}</button> : <small>{ready ? (bn ? "সেটআপ প্রয়োজন" : "Setup required") : (bn ? "সেটআপ যাচাই হয়নি" : "Setup unavailable")}</small>)}
     </header>
     {accounts.length ? <ul className={styles.accounts}>{accounts.map(account)}</ul> : <p className={styles.empty}>{loaded ? (bn ? "কোনো অ্যাকাউন্ট সংযুক্ত নেই" : "No accounts linked") : (bn ? "লোড হচ্ছে…" : "Loading…")}</p>}
     {id === "tg" && canConnect && <details className={styles.telegram}>
      <summary>{bn ? "Telegram bot যুক্ত করুন" : "Connect a Telegram bot"}</summary>
      <form onSubmit={event => { event.preventDefault(); void connect("tg"); }}>
       <p>{bn ? "BotFather থেকে token নিন। সংযোগ করলে bot-এর বর্তমান webhook বদলাবে। শুধু private text chat সমর্থিত।" : "Get a token from BotFather. Connecting replaces the bot’s existing webhook. Private text chats are supported."} <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather ↗</a></p>
       <label>Bot token<input type="password" autoComplete="off" maxLength={200} required value={botToken} onChange={event => setBotToken(event.target.value)} disabled={busy} /></label>
       <button className={styles.primary} type="submit" disabled={busy || !botToken.trim()}>{bn ? "সংযুক্ত করুন" : "Connect"}</button>
      </form>
     </details>}
    </section>;
   })}
  </div>
  {items.some(fixture) && <details className={styles.fixtures}><summary>{bn ? "পুরোনো পরীক্ষার সংযোগ" : "Legacy test connections"}</summary><ul className={styles.accounts}>{items.filter(fixture).map(account)}</ul></details>}
 </section>;
}
