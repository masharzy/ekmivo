"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import {inboxDraftKey,readInboxDraft,writeInboxDraft} from "../lib/client/inbox-drafts";
import styles from "./workspace-messaging.module.css";
type Thread={id:string;name:string;channel:string;preview:string;unread:number};
type Message={id:string;sequence:number;sender:string;body:string;state:string;created_at:string};
export function WorkspaceInbox({workspaceId,actorId,bn,role="viewer"}:{workspaceId:string;actorId:string;bn:boolean;role?:"owner"|"admin"|"editor"|"viewer"}){
 const [threads,setThreads]=useState<Thread[]>([]),[messages,setMessages]=useState<Message[]>([]),[selected,setSelected]=useState<string|null>(null),[text,setText]=useState(""),[error,setError]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[ai,setAi]=useState(true),[windowOpen,setWindowOpen]=useState(false),[query,setQuery]=useState("");
 const canSend=["owner","admin","editor"].includes(role),canManage=role==="owner"||role==="admin";
 const pending=useRef<string|null>(null),drafts=useRef(new Map<string,{text:string;saved:string;sendKey:string;savedKey:string}>()),activeThread=useRef<string|null>(null);
 const generation=useRef(0);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const [draftError,setDraftError]=useState(false),[forbidden,setForbidden]=useState(false);
 useEffect(()=>registerDraft({id:`inbox:${actorId}:${workspaceId}`,isDirty:()=>[...drafts.current.values()].some(d=>d.text!==d.saved),
  save:async()=>{try{for(const [id,d] of drafts.current){writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id),d.text,d.sendKey);d.saved=d.text;d.savedKey=d.sendKey;}setDraftError(false);return true;}catch{setDraftError(true);return false;}},
  discard:()=>{for(const d of drafts.current.values()){d.text=d.saved;d.sendKey=d.savedKey;}const d=drafts.current.get(activeThread.current??"");pending.current=d?.sendKey||null;setText(d?.text??"");}
 }),[actorId,workspaceId]);
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if([...drafts.current.values()].some(d=>d.text!==d.saved)){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[]);
 function selectThread(id:string){
  if(busy)return;
  let draft=drafts.current.get(id);
  if(!draft){try{const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id));draft={text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey};drafts.current.set(id,draft);}catch{setDraftError(true);return;}}
  generation.current++;activeThread.current=id;setMessages([]);setWindowOpen(false);setSelected(id);pending.current=draft.sendKey||null;setText(draft.text);
 }
 function changeText(value:string){if(!selected)return;const d=drafts.current.get(selected);const key=value===d?.saved?d.savedKey:crypto.randomUUID();drafts.current.set(selected,{text:value,saved:d?.saved??"",sendKey:key,savedKey:d?.savedKey??""});setText(value);pending.current=key;}

 const api=useCallback(async(action:string,thread?:string,body?:object)=>{const r=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,thread_id:thread,body,filters:{q:query}})});if(!r.ok){if(r.status===401||r.status===403){setForbidden(true);setThreads([]);setMessages([]);setSelected(null);setLoaded(false);}throw Error();}setForbidden(false);return r.json()},[workspaceId,query]);
 const refresh=useCallback(async()=>{
  const version=++generation.current;
  const list=await api("list");if(version!==generation.current)return;
  setThreads(list.items);setLoaded(true);
  if(selected){
   const chat=await api("messages",selected);if(version!==generation.current)return;
   setMessages(chat.items);setAi(chat.thread.ai_enabled);setWindowOpen(chat.thread.window_open);
   const last=chat.items.at(-1);if(last)await api("read",selected,{sequence:last.sequence});
  }
  if(version===generation.current)setError(false);
 },[api,selected]);
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  async function run(){
   try{if(document.visibilityState!=="hidden")await refresh();}catch{if(alive)setError(true);}
   finally{if(alive)timer=setTimeout(()=>void run(),2000);}
  }
  timer=setTimeout(()=>void run(),query?250:0);
  return()=>{alive=false;invalidate();clearTimeout(timer);};
 },[invalidate,query,refresh]);
 async function send(){if(!canSend||!selected||!text.trim()||busy)return;setBusy(true);pending.current??=crypto.randomUUID();try{const d=drafts.current.get(selected);try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),text,pending.current);setDraftError(false);}catch{setDraftError(true);return;}if(d){d.saved=text;d.savedKey=pending.current;}await api("send",selected,{text,idempotency_key:pending.current});pending.current=null;drafts.current.set(selected,{text:"",saved:"",sendKey:"",savedKey:""});setText("");try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),"");setDraftError(false);}catch{setDraftError(true);}await refresh()}catch{setError(true)}finally{setBusy(false)}}
 return <section className={styles.root}><header><h1>{bn?"ইনবক্স":"Inbox"}</h1><div className={styles.links}><Link href="/settings/channels">{bn?"চ্যানেল":"Channels"}</Link><Link href="/settings/devices">{bn?"ডিভাইস":"Devices"}</Link></div></header>{forbidden?<p className={styles.alert} role="alert">{bn?"এই ইনবক্স দেখার অনুমতি নেই। অনুমতি ফিরলে আবার চেষ্টা হবে।":"You no longer have access to this Inbox. Retrying when access is restored."}</p>:null}{draftError?<p className={styles.alert} role="alert">{bn?"Draft পড়া বা সংরক্ষণ করা যায়নি। লেখা রেখে আবার চেষ্টা করুন।":"Could not read or save the draft. Keep your text and retry."}</p>:null}{error?<p className={styles.alert} role="alert">{bn?"সিঙ্ক করা যায়নি। আবার চেষ্টা হচ্ছে।":"Unable to sync. Retrying."}</p>:null}<div className={`${styles.card} ${styles.grid}`}><aside className={styles.threads}><input aria-label={bn?"কনভারসেশন খুঁজুন":"Search conversations"} placeholder={bn?"খুঁজুন":"Search"} value={query} onChange={e=>{generation.current++;setQuery(e.target.value)}}/>{threads.map(t=><button className={styles.thread} type="button" key={t.id} aria-pressed={selected===t.id} disabled={busy} onClick={()=>selectThread(t.id)}><span>{t.name}{t.unread?` · ${t.unread}`:""}</span><span className={styles.muted}>{t.preview}</span></button>)}{loaded&&!threads.length?<p className={styles.row}>{bn?"কোনো কনভারসেশন পাওয়া যায়নি।":"No conversations found."}</p>:null}</aside><div className={styles.chat}>{selected?<><header><span>{threads.find(t=>t.id===selected)?.name}</span>{canManage?<button type="button" disabled={busy} onClick={()=>{setBusy(true);void api("ai",selected,{enabled:!ai}).then(refresh).catch(()=>setError(true)).finally(()=>setBusy(false))}}>{ai?(bn?"AI চালু":"AI on"):(bn?"AI বন্ধ":"AI off")}</button>:<span>{ai?(bn?"AI চালু":"AI on"):(bn?"AI বন্ধ":"AI off")}</span>}</header><div className={styles.messages}>{messages.map(m=><div key={m.id} className={`${styles.bubble} ${m.sender!=="customer"?styles.own:""}`}><div>{m.body}</div><small>{m.sender!=="customer"?m.state:""}</small></div>)}</div>{!canSend?<p className={styles.row}>{bn?"আপনি এই ইনবক্স শুধু দেখতে পারবেন।":"You have read-only access to this Inbox."}</p>:windowOpen?<form className={styles.compose} onSubmit={e=>{e.preventDefault();void send()}}><textarea aria-label={bn?"মেসেজ":"Message"} value={text} maxLength={8000} disabled={busy} aria-keyshortcuts="Control+Enter Meta+Enter" onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} onChange={e=>changeText(e.target.value)}/><button type="submit" disabled={busy||!text.trim()}>{bn?"পাঠান":"Send"}</button></form>:<p className={styles.row}>{bn?"কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।":"You can reply when the customer sends a new message."}</p>}</>:<p className={styles.row}>{bn?"কথোপকথন বেছে নিন":"Select a conversation"}</p>}</div></div></section>
}
