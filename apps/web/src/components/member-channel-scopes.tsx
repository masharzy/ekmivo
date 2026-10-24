"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import styles from "./team-groups.module.css";
type Scope={user_id:string;connection_id:string;deny_read:boolean;deny_send:boolean;revision:number};
type Data={members:{id:string;name:string;role:string}[];channels:{id:string;provider:string;external_id:string;enabled:boolean}[];scopes:Scope[]};
export function MemberChannelScopes({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState<Data|null>(null),[member,setMember]=useState(""),[channel,setChannel]=useState(""),[denyRead,setDenyRead]=useState(false),[denySend,setDenySend]=useState(false),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false),endpoint=`/api/go/workspaces/${workspaceId}/workspace-tools/channel-scopes?environment=live`;
 const load=useCallback(async(signal?:AbortSignal)=>{const r=await fetch(endpoint,{cache:"no-store",signal});if(!r.ok)throw Error("HTTP "+r.status);const result=await r.json() as Data;if(!signal?.aborted)setData(result);},[endpoint]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError(bn?"চ্যানেলের অনুমতি পাওয়া যাচ্ছে না। মালিকের অ্যাক্সেস প্রয়োজন।":"Channel permission source unavailable. Owner access is required.");}),0);return()=>{clearTimeout(timer);controller.abort();};},[bn,load]);
 function select(user:string,conn:string){setMember(user);setChannel(conn);const row=data?.scopes.find(s=>s.user_id===user&&s.connection_id===conn);setDenyRead(row?.deny_read??false);setDenySend(row?.deny_send??false);setPassword("");setNotice("");}
 async function save(event:React.FormEvent){event.preventDefault();if(lock.current||!member||!channel||!password)return;lock.current=true;setBusy(true);setError("");setNotice("");
  const revision=data?.scopes.find(s=>s.user_id===member&&s.connection_id===channel)?.revision??0;
  try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:member,connection_id:channel,revision,deny_read:denyRead,deny_send:denySend,current_password:password})});if(!r.ok)throw Error("HTTP "+r.status);await load();setNotice(t("Channel restrictions saved and audited. Current role and other restrictions still apply.","চ্যানেলের সীমা ও অডিট সংরক্ষিত হয়েছে। বর্তমান role ও অন্য সীমাগুলোও কার্যকর থাকবে।"));}
  catch(e){setError(t("Change not confirmed. Refresh current permissions before retrying a conflict or timeout.","পরিবর্তন নিশ্চিত হয়নি। দ্বন্দ্ব বা টাইমআউট হলে আবার চেষ্টা করার আগে বর্তমান অনুমতি রিফ্রেশ করুন।")+" "+String(e));}
  finally{setPassword("");setBusy(false);lock.current=false;}
 }
 return <section className={styles.root} aria-busy={busy}><header><h1>{t("Team channel access","টিমের চ্যানেল অ্যাক্সেস")}</h1><p>{t("Restrict a member on one connected channel or page. Restrictions only reduce existing permissions; they never grant a higher role. Owner access cannot be restricted.","নির্দিষ্ট সংযুক্ত চ্যানেল বা পেজে সদস্যের অ্যাক্সেস সীমিত করুন। এগুলো বর্তমান অনুমতি কমায়; বাড়তি role দেয় না। মালিকের অ্যাক্সেস সীমিত করা যাবে না।")}</p><Link href="/settings/team">{t("Back to team","টিমে ফিরুন")}</Link></header>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <button type="button" disabled={busy} onClick={()=>void load().then(()=>{select("","");setError("");}).catch(()=>setError(t("Unable to reload permissions.","অনুমতি রিফ্রেশ হয়নি।")))}>{t("Refresh channel permissions","চ্যানেলের অনুমতি রিফ্রেশ")}</button>
 {data&&<form className={`${styles.panel} ${styles.scopeForm}`} onSubmit={e=>void save(e)}><label>{t("Team member","টিমের সদস্য")}<select required disabled={busy} value={member} onChange={e=>select(e.target.value,channel)}><option value="">{t("Choose member","সদস্য বেছে নিন")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name||m.id.slice(0,8)} · {m.role}</option>)}</select></label>
 <label>{t("Channel or page","চ্যানেল বা পেজ")}<select required disabled={busy} value={channel} onChange={e=>select(member,e.target.value)}><option value="">{t("Choose channel","চ্যানেল বেছে নিন")}</option>{data.channels.map(c=><option key={c.id} value={c.id}>{c.provider.toUpperCase()} · {c.external_id} · {c.enabled?t("Connected","সংযুক্ত"):t("Disconnected","বিচ্ছিন্ন")}</option>)}</select></label>
 <label><input type="checkbox" disabled={busy||!member||!channel} checked={denyRead} onChange={e=>setDenyRead(e.target.checked)}/>{t("Hide conversations and linked CRM identities on this channel","এই চ্যানেলের কথোপকথন ও সংযুক্ত CRM পরিচয় আড়াল করুন")}</label>
 <label><input type="checkbox" disabled={busy||!member||!channel} checked={denySend} onChange={e=>setDenySend(e.target.checked)}/>{t("Block sending and conversation changes on this channel","এই চ্যানেলে পাঠানো ও কথোপকথনের পরিবর্তন বন্ধ করুন")}</label>
 <p>{t("Hiding conversations also blocks sends. A customer merged with an unreadable channel is hidden as a whole. Members with any channel restriction cannot manage global Inbox/AI configuration. Store-owned paired devices and independent payment permissions remain separate.","কথোপকথন আড়াল করলে পাঠানোও বন্ধ হয়। নিষিদ্ধ চ্যানেলের পরিচয়ের সঙ্গে merged গ্রাহক সম্পূর্ণ আড়াল থাকবে। কোনো চ্যানেলে সীমা থাকলে global Inbox/AI configuration পরিচালনা করা যাবে না। স্টোরের নিজস্ব paired device ও আলাদা payment permission পৃথক।")}</p>
 <label>{t("Current owner password","মালিকের বর্তমান পাসওয়ার্ড")}<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
 <button disabled={busy||!member||!channel||!password}>{t("Save channel restrictions","চ্যানেলের সীমা সংরক্ষণ")}</button></form>}
 {data?.channels.length===0&&<p>{t("No connected channel records in this Store.","এই স্টোরে কোনো সংযুক্ত চ্যানেলের রেকর্ড নেই।")}</p>}
 </section>;
}
