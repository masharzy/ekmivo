"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {DashboardIcon as Icon} from "./dashboard-icon";
import {InboxChannelIcon,inboxChannelName} from "./inbox-channel-icon";
import {InboxAttachment} from "./inbox-attachment";
import {InboxAttachmentComposer} from "./inbox-attachment-composer";
import {InboxWorkflow} from "./inbox-workflow";
import {activeDrafts,registerDraft} from "../lib/client/draft-navigation";
import {inboxDraftKey,readInboxDraft,writeInboxDraft} from "../lib/client/inbox-drafts";
import styles from "./workspace-messaging.module.css";

type Thread={id:string;name:string;channel:string;preview:string;unread:number;status?:string;priority?:string;overdue?:boolean;last_activity_at?:string};
type Message={id:string;sequence:number;sender:string;body:string;state:string;created_at:string;type?:string;content?:{media_id?:string;name?:string;mime?:string}};
type Conversation={items:Message[];thread:{name:string;send_allowed?:boolean;manage_allowed?:boolean;ai_enabled:boolean;window_open:boolean;capabilities?:{document?:boolean;image?:boolean;audio?:boolean}}};
type Draft={text:string;saved:string;sendKey:string;savedKey:string};
const queues=[
 {id:"all",en:"All",bn:"সব"},{id:"unread",en:"Unread",bn:"অপঠিত"},
 {id:"mine",en:"Assigned to me",bn:"আমার"},{id:"attention",en:"Needs attention",bn:"জরুরি"},
 {id:"unassigned",en:"Unassigned",bn:"দায়িত্বহীন"},{id:"open",en:"Open",bn:"খোলা"},
 {id:"pending",en:"Pending",bn:"অপেক্ষমাণ"},{id:"waiting",en:"Waiting for reply",bn:"উত্তরের অপেক্ষায়"},
 {id:"resolved",en:"Resolved",bn:"সমাধান হয়েছে"},{id:"snoozed",en:"Snoozed",bn:"পরে দেখুন"}
] as const;

export function WorkspaceInbox({workspaceId,actorId,bn,initialThread,role="viewer"}:{workspaceId:string;actorId:string;bn:boolean;initialThread?:string;role?:"owner"|"admin"|"editor"|"viewer"}){
 const [threads,setThreads]=useState<Thread[]>([]),[messages,setMessages]=useState<Message[]>([]);
 const [selected,setSelected]=useState<string|null>(initialThread??null),[text,setText]=useState("");
 const [error,setError]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[chatLoading,setChatLoading]=useState(!!initialThread);
 const [ai,setAi]=useState(true),[windowOpen,setWindowOpen]=useState(false),[query,setQuery]=useState("");
 const [queue,setQueue]=useState("all"),[channel,setChannel]=useState(""),[fromDate,setFromDate]=useState(""),[throughDate,setThroughDate]=useState(""),[label,setLabel]=useState("");
 const [workflowBusy,setWorkflowBusy]=useState(false),[attachmentBusy,setAttachmentBusy]=useState(false);
 const [mediaCapabilities,setMediaCapabilities]=useState({image:false,audio:false,document:false});
 const [before,setBefore]=useState<number|null>(null),[hasOlder,setHasOlder]=useState(false),[offset,setOffset]=useState(0),[selectedName,setSelectedName]=useState("");
 const [threadSendAllowed,setThreadSendAllowed]=useState(false),[threadManageAllowed,setThreadManageAllowed]=useState(false);
 const [draftError,setDraftError]=useState(false),[forbidden,setForbidden]=useState(false);
 const canSend=["owner","admin","editor"].includes(role)&&threadSendAllowed;
 const canManage=(role==="owner"||role==="admin")&&threadManageAllowed;
 const pending=useRef<string|null>(null),drafts=useRef(new Map<string,Draft>()),activeThread=useRef<string|null>(initialThread??null);
 const generation=useRef(0),lastRead=useRef(new Map<string,number>());
 // Brief, component-scoped memory: revisiting a conversation paints immediately,
 // then every access and message is revalidated against the server.
 const cached=useRef(new Map<string,Conversation>());
 const messageViewport=useRef<HTMLDivElement>(null),stickToLatest=useRef(true),shownThread=useRef<string|null>(null);
 const invalidate=useCallback(()=>{generation.current++;},[]);

 useEffect(()=>{if(!initialThread)return;const timer=setTimeout(()=>{try{
  const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,initialThread));
  drafts.current.set(initialThread,{text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey});
  pending.current=saved.sendKey||null;setText(saved.text);
 }catch{setDraftError(true);}},0);return()=>clearTimeout(timer);},[actorId,initialThread,workspaceId]);
 useEffect(()=>registerDraft({id:`inbox:${actorId}:${workspaceId}`,
  isDirty:()=>[...drafts.current.values()].some(d=>d.text!==d.saved),
  save:async()=>{try{for(const [id,d] of drafts.current){writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id),d.text,d.sendKey);d.saved=d.text;d.savedKey=d.sendKey;}setDraftError(false);return true;}catch{setDraftError(true);return false;}},
  discard:()=>{for(const d of drafts.current.values()){d.text=d.saved;d.sendKey=d.savedKey;}const d=drafts.current.get(activeThread.current??"");pending.current=d?.sendKey||null;setText(d?.text??"");}
 }),[actorId,workspaceId]);
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if([...drafts.current.values()].some(d=>d.text!==d.saved)){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[]);

 function selectThread(id:string){
  if(busy||workflowBusy||attachmentBusy||selected===id)return;
  const workflow=activeDrafts().filter(d=>d.id.startsWith(`inbox-work:${actorId}:${workspaceId}:`)||d.id.startsWith(`inbox-attachment:${actorId}:${workspaceId}:`));
  if(workflow.length){if(!window.confirm(bn?"কথোপকথনের অসংরক্ষিত পরিবর্তন বাদ দেবেন?":"Discard unsaved conversation tool changes?"))return;for(const d of workflow)d.discard();}
  let draft=drafts.current.get(id);
  if(!draft){try{const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id));draft={text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey};drafts.current.set(id,draft);}catch{setDraftError(true);return;}}
  generation.current++;activeThread.current=id;setSelected(id);setBefore(null);setHasOlder(false);
  setSelectedName(threads.find(t=>t.id===id)?.name??"");setThreadSendAllowed(false);setThreadManageAllowed(false);
  setMediaCapabilities({image:false,audio:false,document:false});
  const hit=cached.current.get(id);setMessages(hit?.items??[]);setChatLoading(!hit);
  if(hit){setAi(hit.thread.ai_enabled);setWindowOpen(hit.thread.window_open);setThreadSendAllowed(hit.thread.send_allowed!==false);setThreadManageAllowed(hit.thread.manage_allowed!==false);setMediaCapabilities({image:hit.thread.capabilities?.image===true,audio:hit.thread.capabilities?.audio===true,document:hit.thread.capabilities?.document===true});}
  stickToLatest.current=true;shownThread.current=null;pending.current=draft.sendKey||null;setText(draft.text);
 }
 function backToList(){
  if(busy||workflowBusy||attachmentBusy)return;
  const work=activeDrafts().filter(d=>d.id.startsWith(`inbox-work:${actorId}:${workspaceId}:`)||d.id.startsWith(`inbox-attachment:${actorId}:${workspaceId}:`));
  if(work.length){if(!window.confirm(bn?"কথোপকথনের অসংরক্ষিত পরিবর্তন বাদ দেবেন?":"Discard unsaved conversation tool changes?"))return;for(const d of work)d.discard();}
  invalidate();setSelected(null);setBefore(null);
 }
 function changeText(value:string){if(!selected)return;const d=drafts.current.get(selected);const key=value===d?.saved?d.savedKey:crypto.randomUUID();drafts.current.set(selected,{text:value,saved:d?.saved??"",sendKey:key,savedKey:d?.savedKey??""});setText(value);pending.current=key;}

 const api=useCallback(async <T,>(action:string,thread?:string,body?:object,cursor?:number|null):Promise<T>=>{
  const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{
   method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
   body:JSON.stringify({action,thread_id:thread,body,before:cursor,filters:{q:query,offset,queue,channel,from_date:fromDate,through_date:throughDate,label}})
  });
  if(!response.ok){if(response.status===401||response.status===403){setForbidden(true);setThreads([]);setMessages([]);setSelected(null);setLoaded(false);cached.current.clear();}throw Error(String(response.status));}
  setForbidden(false);return response.json() as Promise<T>;
 },[workspaceId,query,offset,queue,channel,fromDate,throughDate,label]);

 const refresh=useCallback(async()=>{
  const version=++generation.current;
  const listRequest=api<{items:Thread[]}>("list").then(result=>{if(version===generation.current){setThreads(result.items);setLoaded(true);}});
  const messageRequest=selected?api<Conversation>("messages",selected,undefined,before).then(chat=>{
   if(version!==generation.current)return;
   setThreadSendAllowed(chat.thread.send_allowed!==false);setThreadManageAllowed(chat.thread.manage_allowed!==false);
   setMessages(previous=>JSON.stringify(previous)===JSON.stringify(chat.items)?previous:chat.items);
   setChatLoading(false);setSelectedName(chat.thread.name);setHasOlder(chat.items.length===50);
   setAi(chat.thread.ai_enabled);setWindowOpen(chat.thread.window_open);
   setMediaCapabilities({image:chat.thread.capabilities?.image===true,audio:chat.thread.capabilities?.audio===true,document:chat.thread.capabilities?.document===true});
   if(before===null){cached.current.delete(selected);cached.current.set(selected,chat);if(cached.current.size>12)cached.current.delete(cached.current.keys().next().value!);}
   const last=before===null?chat.items.at(-1):undefined;
   if(last&&last.sequence>(lastRead.current.get(selected)??0)){
    // Read receipt must not delay rendering the conversation.
    void api("read",selected,{sequence:last.sequence}).then(()=>lastRead.current.set(selected,last.sequence)).catch(()=>{});
   }
  }):Promise.resolve();
  await Promise.all([listRequest,messageRequest]);
  if(version===generation.current)setError(false);
 },[api,before,selected]);
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  async function run(){try{if(document.visibilityState!=="hidden")await refresh();}catch{if(alive)setError(true);}
   finally{if(alive)timer=setTimeout(()=>void run(),2000);}}
  timer=setTimeout(()=>void run(),query?250:0);
  return()=>{alive=false;invalidate();clearTimeout(timer);};
 },[invalidate,query,refresh]);

 // New conversations open at their latest message. Polling only follows new
 // messages while the operator is already near the bottom, preserving reading.
 useEffect(()=>{
  if(!selected||before!==null)return;
  const changed=shownThread.current!==selected;
  if(changed)shownThread.current=selected;
  if(!changed&&!stickToLatest.current)return;
  const frame=requestAnimationFrame(()=>{const el=messageViewport.current;if(el)el.scrollTop=el.scrollHeight;});
  return()=>cancelAnimationFrame(frame);
 },[before,messages,selected]);
 function onHistoryScroll(){const el=messageViewport.current;if(el)stickToLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<72;}
 async function send(){
  if(!canSend||!selected||!text.trim()||busy||workflowBusy||attachmentBusy)return;
  setBusy(true);pending.current??=crypto.randomUUID();
  try{const d=drafts.current.get(selected);try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),text,pending.current);setDraftError(false);}catch{setDraftError(true);return;}
   if(d){d.saved=text;d.savedKey=pending.current;}await api("send",selected,{text,idempotency_key:pending.current});
   pending.current=null;drafts.current.set(selected,{text:"",saved:"",sendKey:"",savedKey:""});setText("");setBefore(null);stickToLatest.current=true;
   try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),"");setDraftError(false);}catch{setDraftError(true);}
   await refresh();
  }catch{setError(true);}finally{setBusy(false);}
 }

 const chosen=threads.find(t=>t.id===selected);
 const t=(en:string,be:string)=>bn?be:en;
 const extraFilterCount=Number(Boolean(fromDate))+Number(Boolean(throughDate))+Number(Boolean(label.trim()));
 return <section className={`${styles.root} ${styles.inbox}`}>
  <header className={styles.pageHeading}><div><p className={styles.eyebrow}>{t("CUSTOMER COMMUNICATION","গ্রাহক যোগাযোগ")}</p><h1>{t("Inbox","ইনবক্স")}</h1><p>{t("Keep every customer conversation in one place.","সব চ্যানেলের গ্রাহক কথোপকথন এক জায়গায়।")}</p></div>
   <div className={styles.links}>
    <Link href="/settings/channels"><Icon name="settings"/>{t("Channels","চ্যানেল")}</Link>
    <Link href="/settings/devices"><Icon name="smartphone"/>{t("Devices","ডিভাইস")}</Link>
   </div>
  </header>
  {forbidden&&<p className={styles.alert} role="alert">{t("You no longer have access to this Inbox. Retrying when access is restored.","এই ইনবক্স দেখার অনুমতি নেই। অনুমতি ফিরলে আবার চেষ্টা হবে।")}</p>}
  {draftError&&<p className={styles.alert} role="alert">{t("Could not save your draft. Keep your text and retry.","খসড়া সংরক্ষণ করা যায়নি। লেখা রেখে আবার চেষ্টা করুন।")}</p>}
  {error&&<p className={styles.alert} role="alert">{t("Connection interrupted. Retrying automatically.","সংযোগে সমস্যা হয়েছে। স্বয়ংক্রিয়ভাবে আবার চেষ্টা চলছে।")}</p>}
  <div className={`${styles.card} ${styles.grid} ${selected?styles.hasSelection:""}`}>
   <aside className={styles.threads} aria-label={t("Conversation list and filters","কথোপকথনের তালিকা ও ফিল্টার")}>
    <div className={styles.listHeader}><h2>{t("Conversations","কথোপকথন")}</h2><span>{loaded?threads.length:t("Loading…","লোড হচ্ছে…")}</span></div>
    <div className={styles.listFilters}>
     <label className={styles.searchField}><Icon name="search"/><span className="sr-only">{t("Search conversations","কথোপকথন খুঁজুন")}</span>
      <input placeholder={t("Search name, phone or message","নাম, ফোন বা মেসেজ খুঁজুন")} value={query} maxLength={200} onChange={e=>{invalidate();setOffset(0);setQuery(e.target.value);}}/></label>
     <div className={styles.quickFilters} role="group" aria-label={t("Quick conversation filters","দ্রুত ফিল্টার")}>
      {queues.slice(0,4).map(item=><button key={item.id} type="button" className={queue===item.id?styles.filterActive:undefined} aria-pressed={queue===item.id} onClick={()=>{invalidate();setQueue(item.id);setOffset(0);}}>{bn?item.bn:item.en}</button>)}
     </div>
     <div className={styles.filterRow}><label><span>{t("Queue","তালিকা")}</span><select value={queue} aria-label={t("Conversation queue","কথোপকথনের তালিকা")} onChange={e=>{invalidate();setQueue(e.target.value);setOffset(0);}}>{queues.map(item=><option key={item.id} value={item.id}>{bn?item.bn:item.en}</option>)}</select></label>
      <label><span>{t("Channel","চ্যানেল")}</span><select value={channel} aria-label={t("Channel filter","চ্যানেল ফিল্টার")} onChange={e=>{invalidate();setChannel(e.target.value);setOffset(0);}}><option value="">{t("All channels","সব চ্যানেল")}</option><option value="ms">Messenger</option><option value="ig">Instagram</option><option value="wa">WhatsApp</option><option value="web">{t("Website","ওয়েবসাইট")}</option></select></label></div>
     <details className={styles.advancedFilters}><summary><Icon name="sliders"/>{t("More filters","আরও ফিল্টার")}{extraFilterCount>0&&<span className={styles.filterCount}>{extraFilterCount}</span>}</summary><div>
      <label>{t("From (UTC)","শুরু (UTC)")}<input type="date" value={fromDate} max={throughDate||undefined} disabled={busy||workflowBusy||attachmentBusy} onChange={e=>{invalidate();setFromDate(e.target.value);setOffset(0);}}/></label>
      <label>{t("Through (UTC)","শেষ (UTC)")}<input type="date" value={throughDate} min={fromDate||undefined} disabled={busy||workflowBusy||attachmentBusy} onChange={e=>{invalidate();setThroughDate(e.target.value);setOffset(0);}}/></label>
      <label>{t("Exact label","নির্দিষ্ট লেবেল")}<input value={label} maxLength={40} disabled={busy||workflowBusy||attachmentBusy} onChange={e=>{invalidate();setLabel(e.target.value);setOffset(0);}}/></label>
      <button type="button" disabled={busy||workflowBusy||attachmentBusy} onClick={()=>{invalidate();setFromDate("");setThroughDate("");setLabel("");setOffset(0);}}>{t("Clear filters","ফিল্টার মুছুন")}</button>
     </div></details>
    </div>
    <div className={styles.threadList}>
     {threads.map(item=><button className={styles.thread} data-thread-id={item.id} type="button" key={item.id} aria-pressed={selected===item.id} disabled={busy||workflowBusy||attachmentBusy} onClick={()=>selectThread(item.id)} onKeyDown={event=>{
      if(event.target!==event.currentTarget||!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
      event.preventDefault();const i=threads.findIndex(row=>row.id===item.id),next=event.key==="Home"?0:event.key==="End"?threads.length-1:Math.max(0,Math.min(threads.length-1,i+(event.key==="ArrowDown"?1:-1)));
      const id=threads[next]?.id;if(id){selectThread(id);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-thread-id="${id}"]`)?.focus();}
     }}><span className={styles.threadAvatar} aria-hidden="true">{item.name?.slice(0,1).toLocaleUpperCase()||"?"}</span><span className={styles.threadBody}>
      <span className={styles.threadTop}><strong>{item.name}</strong><small>{item.last_activity_at?new Date(item.last_activity_at).toLocaleDateString(bn?"bn-BD":"en-BD",{month:"short",day:"numeric"}):""}</small></span>
      <span className={styles.threadPreview}>{item.preview||t("Attachment or activity","সংযুক্তি বা কার্যক্রম")}</span>
      <span className={styles.threadMeta}><span className={styles.channelBadge} data-channel={item.channel}><InboxChannelIcon channel={item.channel}/>{inboxChannelName(item.channel)}</span>{item.overdue&&<span className={styles.overdue}>{t("Overdue","সময় পেরিয়েছে")}</span>}</span>
     </span>{item.unread>0&&<span className={styles.unreadBadge} aria-label={t(`${item.unread} unread messages`,`${item.unread}টি অপঠিত মেসেজ`)}>{item.unread>99?"99+":item.unread}</span>}</button>)}
     {!loaded&&!error&&<p className={styles.listEmpty} role="status">{t("Loading conversations…","কথোপকথন আসছে…")}</p>}
     {loaded&&!threads.length&&<p className={styles.listEmpty}>{t("No conversations match your filters.","এই ফিল্টারে কোনো কথোপকথন নেই।")}</p>}
    </div>
    {loaded&&<div className={styles.pager}><button type="button" disabled={busy||offset===0} onClick={()=>{invalidate();setOffset(Math.max(0,offset-50));}}>{t("Previous","আগের")}</button><span>{offset+1}–{offset+threads.length}</span><button type="button" disabled={busy||threads.length<50||offset>=10000} onClick={()=>{invalidate();setOffset(offset+50);}}>{t("Next","পরের")}</button></div>}
   </aside>
   <div className={styles.chat}>
    {selected?<>
     <header className={styles.chatHeader}><button type="button" className={styles.backToList} aria-label={t("Back to conversations","কথোপকথনের তালিকায় ফিরুন")} onClick={backToList}><Icon name="chevron"/></button><div className={styles.chatIdentity}><span className={styles.chatAvatar} aria-hidden="true">{selectedName?.slice(0,1).toLocaleUpperCase()||"?"}</span><div><h2>{selectedName||t("Conversation","কথোপকথন")}</h2><p className={styles.headerChannel}><InboxChannelIcon channel={chosen?.channel}/>{inboxChannelName(chosen?.channel)}{chosen?.status?` · ${chosen.status}`:""}</p></div></div>
      {canManage?<button type="button" className={styles.aiControl} aria-pressed={ai} disabled={busy||workflowBusy||attachmentBusy} onClick={()=>{setBusy(true);void api("ai",selected,{enabled:!ai}).then(refresh).catch(()=>setError(true)).finally(()=>setBusy(false));}}><span className={ai?styles.statusDot:styles.statusOff}/>{ai?t("AI on","AI চালু"):t("AI off","AI বন্ধ")}</button>:<span className={styles.aiReadOnly}>{ai?t("AI on","AI চালু"):t("AI off","AI বন্ধ")}</span>}
     </header>
     <div className={styles.chatBody}>
      <div className={styles.conversation}>
       <div className={styles.historyActions}>{before!==null&&<button type="button" disabled={busy||workflowBusy||attachmentBusy} onClick={()=>{stickToLatest.current=true;shownThread.current=null;invalidate();setBefore(null);}}>{t("Latest messages","সর্বশেষ মেসেজ")}</button>}
        <button type="button" disabled={busy||workflowBusy||attachmentBusy||!hasOlder||!messages.length} onClick={()=>{stickToLatest.current=false;invalidate();setBefore(messages[0].sequence);}}>{t("Older messages","পুরোনো মেসেজ")}</button></div>
       <div ref={messageViewport} className={styles.messages} onScroll={onHistoryScroll} aria-label={t("Message history","মেসেজের ইতিহাস")}>
        {chatLoading?<p className={styles.chatEmpty} role="status">{t("Opening conversation…","কথোপকথন আসছে…")}</p>:messages.length===0?<p className={styles.chatEmpty}>{t("No messages in this conversation.","এই কথোপকথনে কোনো মেসেজ নেই।")}</p>:messages.map(message=><div key={message.id} className={`${styles.bubble} ${message.sender!=="customer"?styles.own:""}`}>
         {message.body&&<p>{message.body}</p>}{message.content?.media_id&&<InboxAttachment key={message.id} workspaceId={workspaceId} threadId={selected} mediaId={message.content.media_id} name={message.content.name??""} bn={bn}/>}
         <small><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(bn?"bn-BD":"en-BD",{hour:"numeric",minute:"2-digit"})}</time>{message.sender!=="customer"&&message.state?` · ${message.state}`:""}</small>
        </div>)}
       </div>
       <div className={styles.composerPanel}>
        {!canSend?<p className={styles.composeNotice}>{t("You have read-only access to this conversation.","এই কথোপকথনে আপনার শুধু দেখার অনুমতি আছে।")}</p>:windowOpen?<form className={styles.compose} onSubmit={e=>{e.preventDefault();void send();}}>
         <textarea aria-label={t("Message","মেসেজ")} id="inbox-message" value={text} maxLength={8000} rows={2} placeholder={t("Write a message…","মেসেজ লিখুন…")} disabled={busy||workflowBusy||attachmentBusy} aria-keyshortcuts="Enter Shift+Enter Control+Enter Meta+Enter" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} onChange={e=>changeText(e.target.value)}/>
         <div className={styles.composeToolbar}>
          <InboxAttachmentComposer key={selected} workspaceId={workspaceId} actorId={actorId} threadId={selected} bn={bn} disabled={busy||workflowBusy||attachmentBusy} capabilities={mediaCapabilities} onBusy={setAttachmentBusy} onSent={refresh}/>
          <span className={styles.composeHint}>{t("Enter to send · Shift+Enter for a new line","Enter-এ পাঠান · নতুন লাইনে Shift+Enter")}</span>
          <button className={styles.sendButton} type="submit" disabled={busy||workflowBusy||attachmentBusy||!text.trim()}>{busy?t("Sending…","পাঠানো হচ্ছে…"):t("Send","পাঠান")}<Icon name="send"/></button>
         </div>
        </form>:<p className={styles.composeNotice}>{t("Reply window is closed. You can respond after the customer sends a new message.","উত্তর দেওয়ার সময়সীমা শেষ। গ্রাহক নতুন মেসেজ দিলে উত্তর দিতে পারবেন।")}</p>}
       </div>
      </div>
      <aside className={styles.inspector} aria-label={t("Conversation tools","কথোপকথনের কাজ")}>
       <div className={styles.inspectorIntro}><h3>{t("Conversation details","কথোপকথনের তথ্য")}</h3><p>{t("Assign, take over, add notes, use saved replies or manage tickets.","দায়িত্ব, নোট, সংরক্ষিত উত্তর ও টিকিট পরিচালনা করুন।")}</p></div>
       <div inert={attachmentBusy}><InboxWorkflow key={selected} workspaceId={workspaceId} actorId={actorId} threadId={selected} customerName={selectedName} bn={bn} onInsert={changeText} onChange={refresh} onBusy={setWorkflowBusy}/></div>
      </aside>
     </div>
    </>:<div className={styles.unselected}><span className={styles.unselectedIcon}><Icon name="inbox"/></span><h2>{t("Select a conversation","একটি কথোপকথন বেছে নিন")}</h2><p>{t("Choose a customer from the left to read and reply.","গ্রাহকের মেসেজ দেখতে ও উত্তর দিতে পাশের তালিকা থেকে বেছে নিন।")}</p></div>}
   </div>
  </div>
 </section>;
}
