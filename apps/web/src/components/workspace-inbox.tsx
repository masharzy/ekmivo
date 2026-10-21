"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {InboxWorkflow} from "./inbox-workflow";
import {activeDrafts,registerDraft} from "../lib/client/draft-navigation";
import {inboxDraftKey,readInboxDraft,writeInboxDraft} from "../lib/client/inbox-drafts";
import styles from "./workspace-messaging.module.css";
type Thread={id:string;name:string;channel:string;preview:string;unread:number;status?:string;priority?:string;overdue?:boolean};
type Message={id:string;sequence:number;sender:string;body:string;state:string;created_at:string};
export function WorkspaceInbox({workspaceId,actorId,bn,initialThread,role="viewer"}:{workspaceId:string;actorId:string;bn:boolean;initialThread?:string;role?:"owner"|"admin"|"editor"|"viewer"}){
 const [threads,setThreads]=useState<Thread[]>([]),[messages,setMessages]=useState<Message[]>([]),[selected,setSelected]=useState<string|null>(initialThread??null),[text,setText]=useState(""),[error,setError]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[ai,setAi]=useState(true),[windowOpen,setWindowOpen]=useState(false),[query,setQuery]=useState("");
 const [queue,setQueue]=useState("all"),[channel,setChannel]=useState("");
 const [workflowBusy,setWorkflowBusy]=useState(false);
 const [before,setBefore]=useState<number|null>(null),[hasOlder,setHasOlder]=useState(false),[offset,setOffset]=useState(0),[selectedName,setSelectedName]=useState("");

 const canSend=["owner","admin","editor"].includes(role),canManage=role==="owner"||role==="admin";
 const pending=useRef<string|null>(null),drafts=useRef(new Map<string,{text:string;saved:string;sendKey:string;savedKey:string}>()),activeThread=useRef<string|null>(null);
 const generation=useRef(0);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const [draftError,setDraftError]=useState(false),[forbidden,setForbidden]=useState(false);
 useEffect(()=>{if(!initialThread)return;const timer=setTimeout(()=>{try{const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,initialThread));drafts.current.set(initialThread,{text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey});activeThread.current=initialThread;pending.current=saved.sendKey||null;setText(saved.text);}catch{setDraftError(true);}},0);return()=>clearTimeout(timer);},[actorId,initialThread,workspaceId]);
 useEffect(()=>registerDraft({id:`inbox:${actorId}:${workspaceId}`,isDirty:()=>[...drafts.current.values()].some(d=>d.text!==d.saved),
  save:async()=>{try{for(const [id,d] of drafts.current){writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id),d.text,d.sendKey);d.saved=d.text;d.savedKey=d.sendKey;}setDraftError(false);return true;}catch{setDraftError(true);return false;}},
  discard:()=>{for(const d of drafts.current.values()){d.text=d.saved;d.sendKey=d.savedKey;}const d=drafts.current.get(activeThread.current??"");pending.current=d?.sendKey||null;setText(d?.text??"");}
 }),[actorId,workspaceId]);
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if([...drafts.current.values()].some(d=>d.text!==d.saved)){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[]);
 function selectThread(id:string){
  if(busy||workflowBusy)return;
  const workflow=activeDrafts().filter(d=>d.id.startsWith(`inbox-work:${actorId}:${workspaceId}:`));
  if(workflow.length){if(!window.confirm(bn?"কথোপকথনের অসংরক্ষিত পরিবর্তন বাদ দেবেন?":"Discard unsaved conversation tool changes?"))return;for(const d of workflow)d.discard();}
  let draft=drafts.current.get(id);
  if(!draft){try{const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id));draft={text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey};drafts.current.set(id,draft);}catch{setDraftError(true);return;}}
  generation.current++;activeThread.current=id;setMessages([]);setWindowOpen(false);setBefore(null);setHasOlder(false);setSelectedName(threads.find(t=>t.id===id)?.name??"");setSelected(id);pending.current=draft.sendKey||null;setText(draft.text);
 }
 function changeText(value:string){if(!selected)return;const d=drafts.current.get(selected);const key=value===d?.saved?d.savedKey:crypto.randomUUID();drafts.current.set(selected,{text:value,saved:d?.saved??"",sendKey:key,savedKey:d?.savedKey??""});setText(value);pending.current=key;}

 const api=useCallback(async(action:string,thread?:string,body?:object,cursor?:number|null)=>{const r=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,thread_id:thread,body,before:cursor,filters:{q:query,offset,queue,channel}})});if(!r.ok){if(r.status===401||r.status===403){setForbidden(true);setThreads([]);setMessages([]);setSelected(null);setLoaded(false);}throw Error();}setForbidden(false);return r.json()},[workspaceId,query,offset,queue,channel]);
 const refresh=useCallback(async()=>{
  const version=++generation.current;
  const list=await api("list");if(version!==generation.current)return;
  setThreads(list.items);setLoaded(true);
  if(selected){
   const chat=await api("messages",selected,undefined,before);if(version!==generation.current)return;
   setMessages(chat.items);setSelectedName(chat.thread.name);setHasOlder(chat.items.length===50);setAi(chat.thread.ai_enabled);setWindowOpen(chat.thread.window_open);
   const last=chat.items.at(-1);if(last)await api("read",selected,{sequence:last.sequence});
  }
  if(version===generation.current)setError(false);
 },[api,before,selected]);
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  async function run(){
   try{if(document.visibilityState!=="hidden")await refresh();}catch{if(alive)setError(true);}
   finally{if(alive)timer=setTimeout(()=>void run(),2000);}
  }
  timer=setTimeout(()=>void run(),query?250:0);
  return()=>{alive=false;invalidate();clearTimeout(timer);};
 },[invalidate,query,refresh]);
 async function send(){if(!canSend||!selected||!text.trim()||busy||workflowBusy)return;setBusy(true);pending.current??=crypto.randomUUID();try{const d=drafts.current.get(selected);try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),text,pending.current);setDraftError(false);}catch{setDraftError(true);return;}if(d){d.saved=text;d.savedKey=pending.current;}await api("send",selected,{text,idempotency_key:pending.current});pending.current=null;drafts.current.set(selected,{text:"",saved:"",sendKey:"",savedKey:""});setText("");setBefore(null);try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),"");setDraftError(false);}catch{setDraftError(true);}await refresh()}catch{setError(true)}finally{setBusy(false)}}
 return <section className={styles.root}><header><h1>{bn?"ইনবক্স":"Inbox"}</h1><div className={styles.links}><Link href="/settings/channels">{bn?"চ্যানেল":"Channels"}</Link><Link href="/settings/devices">{bn?"ডিভাইস":"Devices"}</Link></div></header>{forbidden?<p className={styles.alert} role="alert">{bn?"এই ইনবক্স দেখার অনুমতি নেই। অনুমতি ফিরলে আবার চেষ্টা হবে।":"You no longer have access to this Inbox. Retrying when access is restored."}</p>:null}{draftError?<p className={styles.alert} role="alert">{bn?"Draft পড়া বা সংরক্ষণ করা যায়নি। লেখা রেখে আবার চেষ্টা করুন।":"Could not read or save the draft. Keep your text and retry."}</p>:null}{error?<p className={styles.alert} role="alert">{bn?"সিঙ্ক করা যায়নি। আবার চেষ্টা হচ্ছে।":"Unable to sync. Retrying."}</p>:null}<div className={`${styles.card} ${styles.grid}`}><aside className={styles.threads}><label className={styles.row}><span>{bn?"তালিকা":"Queue"}</span><select aria-label={bn?"কথোপকথনের তালিকা":"Conversation queue"} value={queue} onChange={e=>{invalidate();setQueue(e.target.value);setOffset(0);}}>{["all","unread","mine","unassigned","attention","resolved","snoozed"].map((v,i)=><option key={v} value={v}>{bn?["সব","অপঠিত","আমার","দায়িত্বহীন","মনোযোগ প্রয়োজন","সমাধান হয়েছে","পরে দেখুন"][i]:v}</option>)}</select></label><label className={styles.row}><span>{bn?"চ্যানেল":"Channel"}</span><select aria-label={bn?"চ্যানেল filter":"Channel filter"} value={channel} onChange={e=>{invalidate();setChannel(e.target.value);setOffset(0);}}><option value="">{bn?"সব চ্যানেল":"All channels"}</option><option value="ms">Messenger</option><option value="ig">Instagram</option><option value="wa">WhatsApp</option></select></label><input aria-label={bn?"কনভারসেশন খুঁজুন":"Search conversations"} placeholder={bn?"খুঁজুন":"Search"} value={query} onChange={e=>{generation.current++;setOffset(0);setQuery(e.target.value)}}/>{threads.map(t=><button className={styles.thread} type="button" key={t.id} aria-pressed={selected===t.id} disabled={busy||workflowBusy} onClick={()=>selectThread(t.id)}><span>{t.name}{t.unread?` · ${t.unread}`:""}</span><span className={styles.muted}>{t.preview}</span>{t.overdue&&<span>{bn?"সময় পেরিয়েছে":"Overdue"}</span>}</button>)}{loaded&&<div className={styles.row}><button type="button" disabled={busy||offset===0} onClick={()=>{invalidate();setOffset(Math.max(0,offset-50));}}>{bn?"আগের তালিকা":"Previous conversations"}</button><button type="button" disabled={busy||threads.length<50||offset>=10000} onClick={()=>{invalidate();setOffset(offset+50);}}>{bn?"পরের তালিকা":"Next conversations"}</button></div>}{loaded&&!threads.length?<p className={styles.row}>{bn?"কোনো কনভারসেশন পাওয়া যায়নি।":"No conversations found."}</p>:null}</aside><div className={styles.chat}>{selected?<><header><span>{selectedName}</span>{canManage?<button type="button" disabled={busy||workflowBusy} onClick={()=>{setBusy(true);void api("ai",selected,{enabled:!ai}).then(refresh).catch(()=>setError(true)).finally(()=>setBusy(false))}}>{ai?(bn?"AI চালু":"AI on"):(bn?"AI বন্ধ":"AI off")}</button>:<span>{ai?(bn?"AI চালু":"AI on"):(bn?"AI বন্ধ":"AI off")}</span>}</header><div className={styles.row}>{before!==null&&<button type="button" disabled={busy||workflowBusy} onClick={()=>{invalidate();setBefore(null);}}>{bn?"সর্বশেষ মেসেজ":"Latest messages"}</button>}<button type="button" disabled={busy||workflowBusy||!hasOlder||!messages.length} onClick={()=>{invalidate();setBefore(messages[0].sequence);}}>{bn?"পুরোনো মেসেজ":"Older messages"}</button></div><InboxWorkflow key={selected} workspaceId={workspaceId} actorId={actorId} threadId={selected} customerName={selectedName} bn={bn} onInsert={changeText} onChange={refresh} onBusy={setWorkflowBusy} initialOpen={selected===initialThread}/><div className={styles.messages}>{messages.map(m=><div key={m.id} className={`${styles.bubble} ${m.sender!=="customer"?styles.own:""}`}><div>{m.body}</div><small>{m.sender!=="customer"?m.state:""}</small></div>)}</div>{!canSend?<p className={styles.row}>{bn?"আপনি এই ইনবক্স শুধু দেখতে পারবেন।":"You have read-only access to this Inbox."}</p>:windowOpen?<form className={styles.compose} onSubmit={e=>{e.preventDefault();void send()}}><textarea aria-label={bn?"মেসেজ":"Message"} value={text} maxLength={8000} disabled={busy||workflowBusy} aria-keyshortcuts="Control+Enter Meta+Enter" onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} onChange={e=>changeText(e.target.value)}/><button type="submit" disabled={busy||workflowBusy||!text.trim()}>{bn?"পাঠান":"Send"}</button></form>:<p className={styles.row}>{bn?"কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।":"You can reply when the customer sends a new message."}</p>}</>:<p className={styles.row}>{bn?"কথোপকথন বেছে নিন":"Select a conversation"}</p>}</div></div></section>
}
