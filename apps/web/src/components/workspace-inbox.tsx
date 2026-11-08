"use client";

import Link from "next/link";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {InboxWorkflow} from "./inbox-workflow";
import {activeDrafts,registerDraft} from "../lib/client/draft-navigation";
import {inboxDraftKey,readInboxDraft,writeInboxDraft} from "../lib/client/inbox-drafts";
import {ChannelBadge,I} from "./inbox/icons";
import {MessageRow,Img,useMedia} from "./inbox/bubbles";
import {AvatarPhoto} from "./inbox/avatar";
import {Composer} from "./inbox/composer";
import {ProfileView} from "./inbox/profile";
import {Sheet} from "./inbox/sheets";
import {announceInboxUnread} from "./inbox-unread";
import {buildRows,channelMeta,clock,fullDate,listTime,num,type Cap,type Conversation,type Msg,type Profile,type Thread} from "./inbox/lib";
import legacy from "./workspace-messaging.module.css";
import s from "./inbox/inbox.module.css";

type Draft={text:string;saved:string;sendKey:string;savedKey:string};
const queues=[
 {id:"all",en:"All",bn:"সব"},{id:"unread",en:"Unread",bn:"অপঠিত"},{id:"attention",en:"Needs attention",bn:"জরুরি"},{id:"mine",en:"Assigned to me",bn:"আমার"},
 {id:"unassigned",en:"Unassigned",bn:"দায়িত্বহীন"},{id:"open",en:"Open",bn:"খোলা"},{id:"pending",en:"Pending",bn:"অপেক্ষমাণ"},{id:"waiting",en:"Waiting for reply",bn:"উত্তরের অপেক্ষায়"},
 {id:"resolved",en:"Resolved",bn:"সমাধান হয়েছে"},{id:"snoozed",en:"Snoozed",bn:"পরে দেখুন"}
] as const;
const channels=[{id:"",en:"All channels",bn:"সব চ্যানেল"},{id:"ms",en:"Messenger",bn:"Messenger"},{id:"ig",en:"Instagram",bn:"Instagram"},{id:"wa",en:"WhatsApp",bn:"WhatsApp"}];
const times=[{id:"",en:"Any time",bn:"যেকোনো সময়"},{id:"0",en:"Today",bn:"আজ"},{id:"7",en:"7 days",bn:"৭ দিন"},{id:"30",en:"30 days",bn:"৩০ দিন"}];
const dayStr=(back:number)=>new Date(Date.now()-back*86400000).toISOString().slice(0,10);

export function WorkspaceInbox({workspaceId,actorId,bn,initialThread,role="viewer"}:{workspaceId:string;actorId:string;bn:boolean;initialThread?:string;role?:"owner"|"admin"|"editor"|"viewer"}){
 const t=(en:string,be:string)=>bn?be:en;
 const [threads,setThreads]=useState<Thread[]>([]),[latest,setLatest]=useState<Msg[]>([]),[older,setOlder]=useState<Msg[]>([]),[olderDone,setOlderDone]=useState(false);
 const [selected,setSelected]=useState<string|null>(initialThread??null),[text,setText]=useState("");
 const [view,setView]=useState<"list"|"chat"|"profile">(initialThread?"chat":"list");
 const [error,setError]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[chatLoading,setChatLoading]=useState(!!initialThread);
 const [ai,setAi]=useState(true),[winRaw,setWindowOpen]=useState(false),[query,setQuery]=useState(""),[searchOpen,setSearchOpen]=useState(false);
 const [queue,setQueue]=useState("all"),[channel,setChannel]=useState(""),[range,setRange]=useState(""),[label,setLabel]=useState(""),[offset,setOffset]=useState(0);
 const [workflowBusy,setWorkflowBusy]=useState(false),[composeBusy,setComposeBusy]=useState(false);
 const [caps,setCaps]=useState<Cap>({}),[selectedName,setSelectedName]=useState("");
 const [sendAllowed,setSendAllowed]=useState(false),[manageAllowed,setManageAllowed]=useState(false),[draftError,setDraftError]=useState(false),[forbidden,setForbidden]=useState(false);
 const [online,setOnline]=useState(true),[syncing,setSyncing]=useState(false);
 const [divider,setDivider]=useState<{seq:number;count:number}|null>(null),[fresh,setFresh]=useState<Set<string>>(new Set()),[flash,setFlash]=useState("");
 const [sel,setSel]=useState<{id:string;left:number;top:number}|null>(null),[replyTo,setReplyTo]=useState<Msg|null>(null),[toastText,setToastText]=useState(""),[toastOn,setToastOn]=useState(false);
 const [sheet,setSheet]=useState<""|"filter"|"forward"|"info"|"tools">(""),[info,setInfo]=useState<(Msg&{channel?:string})|null>(null),[infoBusy,setInfoBusy]=useState(false);
 const [viewer,setViewer]=useState<{list:Msg[];i:number}|null>(null),[profile,setProfile]=useState<Profile|null>(null),[productsEnabled]=useState(true);
 const [newRows,setNewRows]=useState<Set<string>>(new Set()),[atBottom,setAtBottom]=useState(true),[missed,setMissed]=useState(0),[notice,setNotice]=useState<{id:string;name:string;channel:string;text:string}|null>(null),[ptr,setPtr]=useState(0);
 const canSend=["owner","admin","editor"].includes(role)&&sendAllowed;
 const canManage=(role==="owner"||role==="admin")&&manageAllowed;
 const pending=useRef<string|null>(null),drafts=useRef(new Map<string,Draft>()),activeThread=useRef<string|null>(initialThread??null);
 const generation=useRef(0),lastRead=useRef(new Map<string,number>()),cached=useRef(new Map<string,Conversation>());
 const viewport=useRef<HTMLDivElement>(null),stick=useRef(true),shown=useRef<string|null>(null),known=useRef(new Set<string>()),firstLoad=useRef(true),toastTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const everSeen=useRef(new Set<string>()),seenThreads=useRef(new Map<string,{unread:number;at?:string}>()),rowRefs=useRef(new Map<string,HTMLElement>()),prevTops=useRef(new Map<string,number>()),shell=useRef<HTMLDivElement>(null);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const toast=useCallback((x:string)=>{setToastText(x);setToastOn(true);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToastOn(false),1900);},[]);
 const messages=useMemo(()=>{const seen=new Set<string>();const out:Msg[]=[];for(const m of [...older,...latest]){if(seen.has(m.id))continue;seen.add(m.id);out.push(m);}return out;},[older,latest]);
 const byId=useMemo(()=>new Map(messages.map(m=>[m.id,m])),[messages]);

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
 useEffect(()=>{
  const up=()=>{setOnline(true);setSyncing(true);setTimeout(()=>setSyncing(false),1200);},down=()=>setOnline(false);
  const timer=setTimeout(()=>setOnline(navigator.onLine),0);window.addEventListener("online",up);window.addEventListener("offline",down);
  return()=>{clearTimeout(timer);window.removeEventListener("online",up);window.removeEventListener("offline",down);};
 },[]);
 useEffect(()=>{if(loaded&&!query&&queue==="all"&&!channel&&!range&&!label&&offset===0)announceInboxUnread(threads.reduce((n,x)=>n+(Number(x.unread)||0),0));},[threads,loaded,query,queue,channel,range,label,offset]);
 const windowOpen=winRaw||threads.find(x=>x.id===selected)?.channel==="tg";
 const offline=!online;

 const workGuard=()=>{
  const workflow=activeDrafts().filter(d=>d.id.startsWith(`inbox-work:${actorId}:${workspaceId}:`)||d.id.startsWith(`inbox-attachment:${actorId}:${workspaceId}:`));
  if(workflow.length){if(!window.confirm(t("Discard unsaved conversation tool changes?","কথোপকথনের অসংরক্ষিত পরিবর্তন বাদ দেবেন?")))return false;for(const d of workflow)d.discard();}
  return true;
 };
 function selectThread(id:string){
  if(busy||workflowBusy||composeBusy)return;
  if(selected===id){setView("chat");return;}
  if(!workGuard())return;
  let draft=drafts.current.get(id);
  if(!draft){try{const saved=readInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,id));draft={text:saved.text,saved:saved.text,sendKey:saved.sendKey,savedKey:saved.sendKey};drafts.current.set(id,draft);}catch{setDraftError(true);return;}}
  generation.current++;activeThread.current=id;setSelected(id);setOlder([]);setOlderDone(false);setDivider(null);setReplyTo(null);setSel(null);setProfile(null);setMissed(0);setAtBottom(true);
  const row=threads.find(x=>x.id===id);setSelectedName(row?.name??"");setSendAllowed(false);setManageAllowed(false);setCaps(row?.capabilities??{});setWindowOpen(row?.window_open??false);setAi(row?.ai_enabled??true);
  const hit=cached.current.get(id);setLatest(hit?.items??[]);setChatLoading(!hit);
  if(hit){setAi(hit.thread.ai_enabled);setWindowOpen(hit.thread.window_open);setSendAllowed(hit.thread.send_allowed!==false);setManageAllowed(hit.thread.manage_allowed!==false);setCaps(hit.thread.capabilities??{});}
  stick.current=true;shown.current=null;known.current=new Set(hit?.items.map(m=>m.id)??[]);pending.current=draft.sendKey||null;setText(draft.text);setView("chat");
  if(hit&&row&&row.unread>0)computeDivider(hit.items,row.unread);
 }
 function computeDivider(items:Msg[],unread:number){const c=items.filter(m=>m.sender==="customer"&&m.type!=="reaction");const first=c[Math.max(0,c.length-unread)];if(first)setDivider({seq:first.sequence,count:Math.min(unread,c.length)});}
 function backToList(){if(busy||workflowBusy||composeBusy)return;if(!workGuard())return;invalidate();setSel(null);setView("list");}
 function changeText(value:string){if(!selected)return;const d=drafts.current.get(selected);const key=value===d?.saved?d.savedKey:crypto.randomUUID();drafts.current.set(selected,{text:value,saved:d?.saved??"",sendKey:key,savedKey:d?.savedKey??""});setText(value);pending.current=key;}

 const filterRef=useRef({query,offset,queue,channel,range,label});
 useEffect(()=>{filterRef.current={query,offset,queue,channel,range,label};});
 const api=useCallback(async <T,>(action:string,thread?:string,body?:object,cursor?:number|null):Promise<T>=>{
  const f=filterRef.current;
  const response=await fetch(`https://api.briofold.tech/v1/workspaces/${workspaceId}/inbox?environment=live`,{
   method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},cache:"no-store",
   body:JSON.stringify({action,thread_id:thread,body,before:cursor,filters:{q:f.query,offset:f.offset,queue:f.queue,channel:f.channel,from_date:f.range?dayStr(Number(f.range)):"",through_date:"",label:f.label}})
  });
  if(!response.ok){if(response.status===401||response.status===403){setForbidden(true);setThreads([]);setLatest([]);setSelected(null);setView("list");setLoaded(false);cached.current.clear();}const code=await response.json().then((j:{code?:unknown;error?:{code?:unknown}|string})=>String(j?.code??(typeof j?.error==="object"?j.error?.code:j?.error)??"")).catch(()=>"");throw Object.assign(Error(String(response.status)),{code});}
  setForbidden(false);return response.json() as Promise<T>;
 },[workspaceId]);
 const call=useCallback(async <T,>(action:string,body?:object):Promise<T>=>{if(!selected)throw Error("no thread");return api<T>(action,selected,body);},[api,selected]);

 const refresh=useCallback(async()=>{
  const version=++generation.current;
  const listRequest=api<{items:Thread[]}>("list").then(result=>{if(version!==generation.current)return;
   const items=result.items;
   if(!firstLoad.current){
    // an unread bump on a conversation that isn't open becomes an in-app banner
    for(const th of items){const old=seenThreads.current.get(th.id);if(old&&th.unread>old.unread&&th.id!==activeThread.current&&th.preview_sender!=="seller"&&th.preview_sender!=="ai")setNotice({id:th.id,name:th.name,channel:th.channel,text:th.preview});}
   }
   if(everSeen.current.size){const add=items.filter(x=>!everSeen.current.has(x.id)).map(x=>x.id);if(add.length){setNewRows(new Set(add));setTimeout(()=>setNewRows(new Set()),700);}}
   items.forEach(x=>everSeen.current.add(x.id));
   firstLoad.current=false;seenThreads.current=new Map(items.map(x=>[x.id,{unread:x.unread,at:x.last_activity_at}]));
   const open=activeThread.current;if(open){const row=items.find(x=>x.id===open);if(row&&row.unread===0)setDivider(d=>d);}
   setThreads(items);setLoaded(true);});
  const messageRequest=selected?api<Conversation>("messages",selected,undefined,null).then(chat=>{
   if(version!==generation.current)return;
   setSendAllowed(chat.thread.send_allowed!==false);setManageAllowed(chat.thread.manage_allowed!==false);
   setLatest(previous=>{
    const prevMap=new Map(previous.map(m=>[m.id,m]));let same=previous.length===chat.items.length;
    const merged=chat.items.map(m=>{const o=prevMap.get(m.id);if(o&&JSON.stringify(o)===JSON.stringify(m))return o;same=false;return m;});
    if(same&&previous.every((m,i)=>m===merged[i]))return previous;
    if(shown.current===selected){const add=merged.filter(m=>!known.current.has(m.id));if(add.length){add.forEach(m=>known.current.add(m.id));setFresh(f=>new Set([...f,...add.map(m=>m.id)]));setTimeout(()=>setFresh(f=>{const n=new Set(f);add.forEach(m=>n.delete(m.id));return n;}),700);}}
    return merged;});
   setChatLoading(false);setSelectedName(chat.thread.name);if(chat.items.length<50)setOlderDone(true);
   setAi(chat.thread.ai_enabled);setWindowOpen(chat.thread.window_open);setCaps(chat.thread.capabilities??{});
   cached.current.delete(selected);cached.current.set(selected,chat);if(cached.current.size>12)cached.current.delete(cached.current.keys().next().value!);
   const last=chat.items.at(-1);
   if(last&&last.sequence>(lastRead.current.get(selected)??0)){void api("read",selected,{sequence:last.sequence}).then(()=>lastRead.current.set(selected,last.sequence)).catch(()=>{});}
  }):Promise.resolve();
  await Promise.all([listRequest,messageRequest]);
  if(version===generation.current){setError(false);setOnline(true);}
 },[api,selected]);
 const [realtime,setRealtime]=useState(false);
 const refreshRef=useRef(refresh);useLayoutEffect(()=>{refreshRef.current=refresh;},[refresh]);
 const realtimeReady=useRef(false);
 useEffect(()=>{
  let stopped=false,socket:WebSocket|null=null,attempt=0;
  let reconnect:ReturnType<typeof setTimeout>|undefined,flush:ReturnType<typeof setTimeout>|undefined;
  let running=false,pending=false;
  const sync=async()=>{if(stopped)return;if(document.visibilityState==="hidden"){pending=true;return;}if(running){pending=true;return;}running=true;try{await refreshRef.current();}catch{}finally{running=false;if(pending&&!stopped&&!document.hidden){pending=false;flush=setTimeout(()=>void sync(),150);}}};
  const connect=()=>{
   if(stopped)return;
   socket=new WebSocket(`wss://api.briofold.tech/v1/workspaces/${workspaceId}/inbox/realtime?environment=live`);
   socket.onopen=()=>{attempt=0;realtimeReady.current=true;setRealtime(true);void sync();};
   socket.onmessage=event=>{try{if(JSON.parse(event.data)?.type!=="inbox.changed")return;}catch{return;}if(!flush)flush=setTimeout(()=>{flush=undefined;void sync();},100);};
   socket.onerror=()=>socket?.close();
   socket.onclose=()=>{realtimeReady.current=false;setRealtime(false);if(!stopped)reconnect=setTimeout(connect,Math.min(15000,1000*2**Math.min(attempt++,4))+Math.random()*500);};
  };
  const visible=()=>{if(document.visibilityState==="visible")void sync();};
  document.addEventListener("visibilitychange",visible);connect();
  return()=>{stopped=true;realtimeReady.current=false;clearTimeout(reconnect);clearTimeout(flush);socket?.close();document.removeEventListener("visibilitychange",visible);};
 },[workspaceId]);
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  async function run(){try{if(document.visibilityState!=="hidden")await refresh();}catch{if(alive){setError(true);}}
   finally{if(alive)timer=setTimeout(()=>void run(),realtimeReady.current?30000:3000);}}
  timer=setTimeout(()=>void run(),query?250:0);
  return()=>{alive=false;invalidate();clearTimeout(timer);};
 },[invalidate,query,queue,channel,range,label,offset,refresh]);
 useEffect(()=>{if(!notice)return;const x=setTimeout(()=>setNotice(null),4200);return()=>clearTimeout(x);},[notice]);

 /* divider for first load of a conversation */
 useEffect(()=>{if(!selected||chatLoading||divider||shown.current===selected)return;const row=threads.find(x=>x.id===selected);if(!row||row.unread<=0)return;const tm=setTimeout(()=>computeDivider(latest,row.unread),0);return()=>clearTimeout(tm);},[selected,chatLoading,latest,threads,divider]);

 /* scroll handling */
 useLayoutEffect(()=>{
  const el=viewport.current;if(!el||!selected||chatLoading)return;
  if(shown.current!==selected){shown.current=selected;known.current=new Set(messages.map(m=>m.id));
   const target=divider?el.querySelector<HTMLElement>("[data-divider]"):null;
   if(target)el.scrollTop=Math.max(0,target.offsetTop-24);else el.scrollTop=el.scrollHeight;return;}
  if(stick.current)el.scrollTop=el.scrollHeight;
 },[messages,selected,chatLoading,divider]);
 const prevHeight=useRef(0);
 useLayoutEffect(()=>{const el=viewport.current;if(el&&prevHeight.current){el.scrollTop+=el.scrollHeight-prevHeight.current;prevHeight.current=0;}},[older]);
 const loadingOlder=useRef(false);
 async function loadOlder(){
  if(loadingOlder.current||olderDone||!selected||!messages.length)return;loadingOlder.current=true;
  try{const chat=await api<Conversation>("messages",selected,undefined,messages[0].sequence);const el=viewport.current;prevHeight.current=el?.scrollHeight??0;
   if(chat.items.length<50)setOlderDone(true);if(chat.items.length)setOlder(prev=>[...chat.items,...prev]);else prevHeight.current=0;}
  catch{toast(t("Couldn't load older messages","পুরোনো মেসেজ আনা যায়নি"));}finally{loadingOlder.current=false;}
 }
 function onScroll(){const el=viewport.current;if(!el)return;const dist=el.scrollHeight-el.scrollTop-el.clientHeight;stick.current=dist<72;setAtBottom(dist<240);if(dist<72)setMissed(0);if(el.scrollTop<60&&!chatLoading)void loadOlder();}
 const lastSeq=useRef(0);
 useEffect(()=>{const l=messages.at(-1);if(!l)return;if(lastSeq.current&&l.sequence>lastSeq.current&&l.sender==="customer"&&!stick.current)setMissed(c=>c+1);lastSeq.current=l.sequence;},[messages]);
 useEffect(()=>{lastSeq.current=0;},[selected]);
 function toBottom(){const el=viewport.current;if(!el)return;stick.current=true;el.scrollTo({top:el.scrollHeight,behavior:"smooth"});setMissed(0);}
 function jump(id:string){const el=viewport.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);if(!el){toast(t("Message is older than what's loaded","মেসেজটি লোড করা অংশের আগের"));return;}el.scrollIntoView({block:"center",behavior:"smooth"});setFlash(id);setTimeout(()=>setFlash(""),1200);}

 /* FLIP for list rows */
 useLayoutEffect(()=>{
  const tops=new Map<string,number>();rowRefs.current.forEach((el,id)=>tops.set(id,el.offsetTop));
  tops.forEach((top,id)=>{const prev=prevTops.current.get(id);const el=rowRefs.current.get(id);if(el&&prev!==undefined&&prev!==top&&!window.matchMedia("(prefers-reduced-motion:reduce)").matches)el.animate([{transform:`translateY(${prev-top}px)`},{transform:"none"}],{duration:300,easing:"cubic-bezier(.2,.8,.2,1)"});});
  prevTops.current=tops;
 },[threads]);

 /* profile */
 useEffect(()=>{if(view!=="profile"||!selected)return;let live=true;
  const tm=setTimeout(()=>{void api<Profile>("profile",selected).then(p=>{if(live)setProfile(p);}).catch(()=>{if(live)toast(t("Couldn't load customer details","তথ্য আনা যায়নি"));});},0);
  return()=>{live=false;clearTimeout(tm);};},[view,selected,api]);// eslint-disable-line react-hooks/exhaustive-deps

 /* actions */
 async function sendText(){
  if(!canSend||!selected||!text.trim()||busy||workflowBusy||composeBusy||offline)return;
  setBusy(true);pending.current??=crypto.randomUUID();
  try{const d=drafts.current.get(selected);try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),text,pending.current);setDraftError(false);}catch{setDraftError(true);return;}
   if(d){d.saved=text;d.savedKey=pending.current;}
   await api("send",selected,{text,idempotency_key:pending.current,...(replyTo?{reply_to:replyTo.id}:{})});
   pending.current=null;drafts.current.set(selected,{text:"",saved:"",sendKey:"",savedKey:""});setText("");setReplyTo(null);stick.current=true;
   try{writeInboxDraft(window.sessionStorage,inboxDraftKey(actorId,workspaceId,selected),"");setDraftError(false);}catch{setDraftError(true);}
   await refresh();
  }catch{toast(t("Couldn't send. Try again.","পাঠানো যায়নি। আবার চেষ্টা করুন।"));}finally{setBusy(false);}
 }
 async function retry(m:Msg){try{await call("retry",{message_id:m.id});await refresh();}catch{toast(t("Can't retry this message","এই মেসেজ আবার পাঠানো যাবে না"));}}
 async function toggleAi(){if(!selected||!canManage||busy)return;setBusy(true);try{await api("ai",selected,{enabled:!ai});toast(!ai?t("AI will reply again","AI আবার রিপ্লাই দিবে"):t("You're replying now","আপনি এখন রিপ্লাই দিচ্ছেন"));await refresh();}catch{toast(t("Couldn't change AI","AI বদলানো যায়নি"));}finally{setBusy(false);}}
 async function react(emoji:string){const m=sel&&byId.get(sel.id);setSel(null);if(!m||!selected)return;try{await call("react",{message_id:m.id,emoji:m.reaction===emoji?"":emoji,idempotency_key:crypto.randomUUID()});await refresh();}catch{toast(t("Can't react to this message","এই মেসেজে রিঅ্যাক্ট করা যাবে না"));}}
 async function openInfo(){const m=sel&&byId.get(sel.id);if(!m||!selected)return;setSheet("info");setInfo(m);setInfoBusy(true);try{const r=await call<Msg&{channel?:string}>("info",{message_id:m.id});setInfo({...m,...r});}catch{}finally{setInfoBusy(false);}}
 async function forwardTo(target:Thread){
  const m=sel&&byId.get(sel.id);if(!m)return;setSheet("");setSel(null);
  try{const album=m.batch_id?messages.filter(x=>x.batch_id===m.batch_id).length>1:false;await api("forward",target.id,{message_id:m.id,idempotency_key:crypto.randomUUID(),...(album?{album:true}:{})});toast(t("Forwarded to ","ফরওয়ার্ড হয়েছে: ")+target.name);}
  catch{toast(t("Couldn't forward","ফরওয়ার্ড হয়নি"));}
 }
 function copyMsg(){const m=sel&&byId.get(sel.id);setSel(null);if(!m?.body)return;try{void navigator.clipboard.writeText(m.body);toast(t("Copied","কপি হয়েছে"));}catch{}}
 function startReply(m:Msg){setSel(null);setReplyTo(m);}

 const chosen=threads.find(x=>x.id===selected),selMsg=sel?byId.get(sel.id):undefined;
 const rows=useMemo(()=>buildRows(messages,divider?.seq??null,divider?.count??0,bn),[messages,divider,bn]);
 const filterCount=Number(queue!=="all"&&queue!=="unread")+Number(!!range)+Number(!!label.trim())+Number(false);
 const chip=queue==="unread"?"unread":channel||"all";
 const chipSet=(id:string)=>{invalidate();setOffset(0);if(id==="all"){setQueue("all");setChannel("");}else if(id==="unread"){setQueue("unread");setChannel("");}else{setQueue(queue==="unread"?"all":queue);setChannel(id);}};
 const totalUnread=threads.reduce((a,x)=>a+(x.unread>0?1:0),0);
 const customerName=selectedName||chosen?.name||"";
 const replyWho=replyTo?(replyTo.sender==="customer"?customerName:replyTo.sender==="ai"?"AI":t("You","আপনি")):"";
 const reactions=caps.reactions??[];
 const canReact=!!selMsg&&selMsg.sender==="customer"&&reactions.length>0&&canSend&&windowOpen;
 const canForward=!!selMsg&&selMsg.sender!=="customer"&&caps.forward!==false&&canSend&&["text","image","audio","document","product"].includes(selMsg.type??"text");
 const justSel=useRef(0),swipeY=useRef<{y:number;t:number}|null>(null);

 const pageRef=useRef<HTMLElement>(null),wrapRef=useRef<HTMLDivElement>(null),[full,setFull]=useState<""|"side"|"wide">(""),[fullGap,setFullGap]=useState(0),[fullH,setFullH]=useState(0),animFrom=useRef<DOMRect|null>(null);
 const clipFrom=(r:DOMRect,el:HTMLElement)=>{const b=el.getBoundingClientRect(),c=(v:number)=>`${Math.max(0,Math.round(v))}px`;return `inset(${c(r.top-b.top)} ${c(b.right-r.right)} ${c(b.bottom-r.bottom)} ${c(r.left-b.left)} round 16px)`;};
 const enterFull=()=>{const w=wrapRef.current;if(!w)return;const r=w.getBoundingClientRect();animFrom.current=r;setFullH(Math.round(r.height));setFullGap(Math.round(document.querySelector(".ds-sidebar")?.getBoundingClientRect().width??0));setFull("side");};
 const exitFull=useCallback(()=>{const el=pageRef.current,w=wrapRef.current;if(!el||!w){setFull("");return;}const done=()=>setFull("");
  if(window.matchMedia("(prefers-reduced-motion:reduce)").matches||!el.animate){done();return;}
  el.animate([{clipPath:"inset(0px round 0px)"},{clipPath:clipFrom(w.getBoundingClientRect(),el)}],{duration:260,easing:"cubic-bezier(.2,.8,.2,1)",fill:"forwards"}).finished.then(done,done);},[]);
 useLayoutEffect(()=>{const el=pageRef.current,from=animFrom.current;if(full!=="side"||!el||!from)return;animFrom.current=null;
  if(window.matchMedia("(prefers-reduced-motion:reduce)").matches||!el.animate)return;
  el.animate([{clipPath:clipFrom(from,el)},{clipPath:"inset(0px round 0px)"}],{duration:300,easing:"cubic-bezier(.2,.8,.2,1)"});},[full]);
 useEffect(()=>{if(!full)return;const k=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!document.querySelector('[role="dialog"]'))exitFull();};window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[full,exitFull]);
 return <div ref={wrapRef} style={full?{minHeight:fullH}:undefined}><section ref={pageRef} className={`${s.page} ${full?s.full:""}`} style={full?{"--fl":full==="wide"?"0px":`${fullGap}px`} as React.CSSProperties:undefined}>
  <div ref={shell} className={s.shell} data-view={view} data-open={selected?"1":"0"}>
   {forbidden&&<p className={s.alert} role="alert">{t("You no longer have access to this Inbox. Retrying when access is restored.","এই ইনবক্স দেখার অনুমতি নেই। অনুমতি ফিরলে আবার চেষ্টা হবে।")}</p>}
   {/* ============ list ============ */}
   <div className={`${s.scr} ${s.sInbox}`}>
    <div className={s.top}><div className={s.ttl}>{t("Inbox","ইনবক্স")}</div>
     <div className={`${s.chip} ${offline?s.off:syncing||error?s.sync:""}`} role="status" style={{marginLeft:"auto"}}><i className={s.dot}/>{offline?t("Offline","অফলাইন"):error?t("Reconnecting","আবার সংযোগ হচ্ছে"):syncing?t("Syncing","সিঙ্ক হচ্ছে"):realtime?t("Live","লাইভ"):t("Auto sync","অটো সিঙ্ক")}</div>
     <button type="button" className={s.fb} aria-label={t("Search","খুঁজুন")} onClick={()=>setSearchOpen(v=>!v)}><I n="search"/></button>
     <button type="button" className={s.fb} aria-label={t("Filters","ফিল্টার")} onClick={()=>setSheet("filter")}><I n="flt"/>{filterCount>0&&<u>{num(filterCount,bn)}</u>}</button>{full&&<button type="button" className={`${s.fb} ${s.fsOnly}`} aria-label={full==="wide"?t("Show sidebar","সাইডবার দেখান"):t("Hide sidebar","সাইডবার লুকান")} aria-pressed={full==="wide"} onClick={()=>setFull(v=>v==="wide"?"side":"wide")}><I n="side"/></button>}<button type="button" className={`${s.fb} ${s.fsOnly}`} aria-label={full?t("Exit full screen","ফুল স্ক্রিন বন্ধ"):t("Full screen","ফুল স্ক্রিন")} onClick={()=>full?exitFull():enterFull()}><I n={full?"shrink":"full"}/></button></div>
    {searchOpen&&<div className={s.search}><I n="search" size={16}/><input autoFocus data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" autoComplete="off" value={query} maxLength={200} placeholder={t("Search name, phone or message","নাম, ফোন বা মেসেজ খুঁজুন")} aria-label={t("Search conversations","কথোপকথন খুঁজুন")} onChange={e=>{invalidate();setOffset(0);setQuery(e.target.value);}}/>{query&&<button type="button" className={s.ib} aria-label={t("Clear","মুছুন")} onClick={()=>{invalidate();setQuery("");}}><I n="x" size={16}/></button>}</div>}
    <div className={s.fl}>{[{id:"all",l:t("All","সব")},{id:"unread",l:t("Unread","অপঠিত")+(totalUnread&&chip!=="unread"?` ${num(totalUnread,bn)}`:"")},{id:"ms",l:"Messenger"},{id:"ig",l:"Instagram"},{id:"wa",l:"WhatsApp"}].map(c=><button key={c.id} type="button" className={chip===c.id?s.on:undefined} aria-pressed={chip===c.id} onClick={()=>chipSet(c.id)}>{c.l}</button>)}</div>
    {offline&&<div className={`${s.ban} ${s.show}`} role="alert"><I n="alt"/><div><b>{t("No internet","ইন্টারনেট নেই")}</b><span>{t("New messages will arrive when you're back online. Replies can't be sent now.","নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।")}</span></div></div>}
    <div className={s.list} onTouchStart={e=>{const el=e.currentTarget;swipeY.current=el.scrollTop<=0?{y:e.touches[0].clientY,t:Date.now()}:null;}} onTouchMove={e=>{if(!swipeY.current)return;const d=e.touches[0].clientY-swipeY.current.y;if(d>0)setPtr(Math.min(60,d*.5));}} onTouchEnd={()=>{if(swipeY.current&&ptr>40){setPtr(40);void refresh().catch(()=>{}).finally(()=>setTimeout(()=>setPtr(0),500));}else setPtr(0);swipeY.current=null;}}>
     <div className={s.ptr} style={{height:ptr}}><div className={s.spin}/></div>
     {threads.map(item=>{const sender=item.preview_sender;const pv=(sender==="seller"?t("You: ","আপনি: "):sender==="ai"?"AI: ":"")+(item.preview||t("Attachment","সংযুক্তি"));
      return <div key={item.id} ref={el=>{if(el)rowRefs.current.set(item.id,el);else rowRefs.current.delete(item.id);}} role="button" tabIndex={0} data-thread-id={item.id} aria-current={selected===item.id} className={`${s.cv} ${selected===item.id?s.cur:""} ${newRows.has(item.id)?s.rowin:""}`}
       onClick={()=>selectThread(item.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectThread(item.id);}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();(e.currentTarget[e.key==="ArrowDown"?"nextElementSibling":"previousElementSibling"] as HTMLElement|null)?.focus();}}}>
       <div className={s.av}>{<AvatarPhoto workspaceId={workspaceId} threadId={item.id} name={item.name}/>}<ChannelBadge channel={item.channel} size={18}/></div>
       <div className={s.cm}><b>{item.name}</b><span className={item.unread>0?s.strong:undefined}>{pv}</span></div>
       <div className={s.cr}><span>{listTime(item.last_activity_at,bn)}</span>{item.unread>0?<span className={s.un} aria-label={t(`${item.unread} unread`,`${item.unread}টি অপঠিত`)}>{item.unread>99?"99+":num(item.unread,bn)}</span>:item.overdue?<span className={s.od}>{t("Overdue","দেরি")}</span>:null}</div>
      </div>;})}
     {!loaded&&!error&&<p className={s.empty} role="status">{t("Loading conversations…","কথোপকথন আসছে…")}</p>}
     {loaded&&!threads.length&&<div className={s.empty}>{t("No conversations match these filters.","এই ফিল্টারে কোনো কথোপকথন নেই।")}{(queue!=="all"||channel||range||label||query)&&<div><button type="button" onClick={()=>{invalidate();setQueue("all");setChannel("");setRange("");setLabel("");setQuery("");setOffset(0);}}>{t("Clear filters","ফিল্টার মুছুন")}</button></div>}</div>}
     {loaded&&(offset>0||threads.length>=50)&&<div className={s.pager}><button type="button" disabled={offset===0} onClick={()=>{invalidate();setOffset(Math.max(0,offset-50));}}>{t("Previous","আগের")}</button><span>{num(offset+1,bn)}–{num(offset+threads.length,bn)}</span><button type="button" disabled={threads.length<50||offset>=10000} onClick={()=>{invalidate();setOffset(offset+50);}}>{t("Next","পরের")}</button></div>}
    </div>
    <nav className={s.foot} aria-label={t("Inbox settings","ইনবক্স সেটিংস")}><Link href="/settings/channels"><I n="set" size={16}/>{t("Channels","চ্যানেল")}</Link><Link href="/settings/devices"><I n="act" size={16}/>{t("Devices","ডিভাইস")}</Link></nav>
    <div className={s.dim}/>
   </div>

   {/* ============ chat ============ */}
   <div className={`${s.scr} ${s.sChat}`}>
    {!selected?<div className={s.none}><span><I n="msg" size={28}/></span><h2>{t("Select a conversation","একটি কথোপকথন বেছে নিন")}</h2><p>{t("Choose a customer from the list to read and reply.","গ্রাহকের মেসেজ দেখতে ও উত্তর দিতে তালিকা থেকে বেছে নিন।")}</p></div>:<>
    <div className={s.chh}>
     <button type="button" className={`${s.ib} ${s.backBtn}`} onClick={backToList} aria-label={t("Back to conversations","কথোপকথনের তালিকায় ফিরুন")}><I n="back"/></button>
     <button type="button" className={s.chi} onClick={()=>setView(v=>v==="profile"&&window.matchMedia("(min-width:900px)").matches?"chat":"profile")} aria-label={t("Customer details","কাস্টমারের তথ্য")}>
      <div className={s.av} style={{width:34,height:34,fontSize:13}}>{<AvatarPhoto workspaceId={workspaceId} threadId={selected??""} name={customerName}/>}{chosen&&<ChannelBadge channel={chosen.channel} size={16}/>}</div>
      <div className={s.nm}><b>{customerName}</b><span>{channelMeta[chosen?.channel??""]?.name??""}{!windowOpen&&chosen?" · "+t("Reply window closed","উত্তরের সময় শেষ"):""}</span></div></button>
     {canManage?<button type="button" className={`${s.aic} ${ai?"":s.offai}`} aria-pressed={ai} disabled={busy} onClick={()=>void toggleAi()}><i/><span>{ai?t("AI on","AI চালু"):t("AI off","AI বন্ধ")}</span></button>:<span className={s.aic}><i style={{background:ai?"var(--ok)":"var(--mu)"}}/>{ai?t("AI on","AI চালু"):t("AI off","AI বন্ধ")}</span>}
     {canManage&&<button type="button" className={s.ib} onClick={()=>setSheet("tools")} aria-label={t("Conversation tools","কথোপকথনের কাজ")}><I n="more"/></button>}
     <div className={`${s.selbar} ${sel?s.show:""}`} aria-hidden={!sel}>
      <button type="button" className={s.ib} onClick={()=>setSel(null)} aria-label={t("Close","বন্ধ")}><I n="x"/></button><span className={s.spc}/>
      <button type="button" className={s.ib} disabled={!canSend||!windowOpen} onClick={()=>selMsg&&startReply(selMsg)} aria-label={t("Reply","রিপ্লাই")}><I n="rep"/></button>
      <button type="button" className={s.ib} disabled={!canForward} onClick={()=>setSheet("forward")} aria-label={t("Forward","ফরওয়ার্ড")}><I n="fwd"/></button>
      <button type="button" className={s.ib} disabled={!selMsg?.body} onClick={copyMsg} aria-label={t("Copy","কপি")}><I n="copy"/></button>
      <button type="button" className={s.ib} onClick={()=>void openInfo()} aria-label={t("Info","তথ্য")}><I n="info"/></button>
     </div>
    </div>
    {offline&&<div className={`${s.ban} ${s.show}`} role="alert"><I n="alt"/><div><b>{t("No internet","ইন্টারনেট নেই")}</b><span>{t("New messages will arrive when you're back online. Replies can't be sent now.","নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।")}</span></div></div>}
    <div className={s.mwrap}>
     <div ref={viewport} className={s.msgs} onScroll={onScroll} aria-label={t("Message history","মেসেজের ইতিহাস")} onClick={()=>{if(sel&&Date.now()-justSel.current>450)setSel(null);}}>
      {chatLoading?<p className={s.empty} role="status">{t("Opening conversation…","কথোপকথন আসছে…")}</p>:rows.length===0?<p className={s.empty}>{t("No messages in this conversation.","এই কথোপকথনে কোনো মেসেজ নেই।")}</p>:<>
       {!olderDone&&<button type="button" className={s.olderBtn} onClick={()=>void loadOlder()}>{t("Load older messages","পুরোনো মেসেজ")}</button>}
       {rows.map(r=>r.kind==="day"?<div key={r.key} className={s.sday}>{r.label}</div>
        :r.kind==="unread"?<div key={r.key} data-divider className={s.udiv}>{bn?`${num(r.count,true)}টি অপঠিত মেসেজ`:`${r.count} unread message${r.count>1?"s":""}`}</div>
        :<MessageRow key={r.key} msg={r.msg} album={r.album} first={r.first} last={r.last} bn={bn} workspaceId={workspaceId} threadId={selected} customerName={customerName} byId={byId} selected={sel?.id===r.msg.id||(!!r.album&&r.album.some(a=>a.id===sel?.id))} fresh={fresh.has(r.msg.id)} flash={flash===r.msg.id}
         onSelect={(id,x,y)=>{justSel.current=Date.now();const sr=shell.current?.getBoundingClientRect();const w=Math.min((sr?.width??360)-16,reactions.length*38+20);setSel({id,left:sr?Math.max(8,Math.min(sr.width-w-8,x-sr.left-w/2)):8,top:sr?Math.max(70,y-sr.top-58):70});}} onReply={startReply} onOpenImages={(list,i)=>setViewer({list,i})} onRetry={m=>void retry(m)} onJump={jump}/>)}
      </>}
     </div>
     <button type="button" className={`${s.fab} ${!atBottom?s.show:""} ${missed?s.has:""}`} onClick={toBottom} aria-label={t("Scroll to latest","নিচে যান")}><I n="back"/>{missed>0&&<u>{num(missed,bn)}</u>}</button>
    </div>
    <Composer key={selected} workspaceId={workspaceId} threadId={selected} bn={bn} call={call} caps={caps} channel={chosen?.channel??""} canSend={canSend} windowOpen={windowOpen} offline={offline} busy={busy}
     text={text} onText={changeText} onSendText={()=>void sendText()} replyTo={replyTo} replyWho={replyWho} onCancelReply={()=>setReplyTo(null)} onSent={async()=>{stick.current=true;await refresh();}} toast={toast} onBusy={setComposeBusy} productsEnabled={productsEnabled}/>
    </>}
   </div>

   {/* ============ customer profile ============ */}
   <div className={`${s.scr} ${s.sProf}`}>
    {selected&&view==="profile"||profile?<ProfileView workspaceId={workspaceId} p={profile?.id===selected?profile:null} bn={bn} aiEnabled={ai} canManage={canManage} canNote={canSend} onBack={()=>setView("chat")} onClose={()=>setView("chat")} onChat={()=>setView("chat")} onToggleAi={()=>void toggleAi()} toast={toast}
     onSaveNote={async(v,version)=>{try{const r=await call<{version:number}>("note",{text:v,version});setProfile(p=>p?{...p,note:v,note_version:r.version}:p);return true;}catch{return false;}}}/>:null}
   </div>

   {/* ============ overlays ============ */}
   {sel&&canReact&&<div className={`${s.rxbar} ${s.show}`} style={{left:sel.left,top:sel.top}} role="toolbar" aria-label={t("React","রিঅ্যাকশন")}>{reactions.map((e,i)=><button key={e} type="button" style={{animationDelay:`${i*30}ms`}} className={selMsg?.reaction===e?s.rxon:undefined} onClick={()=>void react(e)}>{e}</button>)}</div>}
   <div className={`${s.toast} ${toastOn?s.show:""}`} role="status">{toastText}</div>
   <div className={`${s.notif} ${notice?s.show:""}`} role="status" onClick={()=>{if(notice){selectThread(notice.id);setNotice(null);}}}>{notice&&<><div className={s.av} style={{width:34,height:34,fontSize:13}}>{<AvatarPhoto workspaceId={workspaceId} threadId={notice.id} name={notice.name}/>}<ChannelBadge channel={notice.channel} size={16}/></div><div><b>{notice.name} · {channelMeta[notice.channel]?.name}</b><span>{notice.text}</span></div></>}</div>

   {viewer&&<Viewer list={viewer.list} start={viewer.i} bn={bn} workspaceId={workspaceId} threadId={selected??""} who={customerName} onClose={()=>setViewer(null)}/>}

   <Sheet open={sheet==="filter"} onClose={()=>setSheet("")} label={t("Filters","ফিল্টার")}>
    <h4>{t("Filters","ফিল্টার")}<button type="button" onClick={()=>{invalidate();setQueue("all");setChannel("");setRange("");setLabel("");setOffset(0);}}>{t("Reset","রিসেট")}</button></h4>
    <div className={s.sl}>{t("Channel","চ্যানেল")}</div><div className={s.pills}>{channels.map(c=><button key={c.id} type="button" className={channel===c.id?s.on:undefined} onClick={()=>{invalidate();setChannel(c.id);setOffset(0);}}>{bn?c.bn:c.en}</button>)}</div>
    <div className={s.sl}>{t("Status","অবস্থা")}</div><div className={s.pills}>{queues.map(c=><button key={c.id} type="button" className={queue===c.id?s.on:undefined} onClick={()=>{invalidate();setQueue(c.id);setOffset(0);}}>{bn?c.bn:c.en}</button>)}</div>
    <div className={s.sl}>{t("Time","সময়")}</div><div className={s.pills}>{times.map(c=><button key={c.id} type="button" className={range===c.id?s.on:undefined} onClick={()=>{invalidate();setRange(c.id);setOffset(0);}}>{bn?c.bn:c.en}</button>)}</div>
    <div className={s.sl}>{t("Exact label","নির্দিষ্ট লেবেল")}</div><input className={s.field} data-gramm="false" data-enable-grammarly="false" autoComplete="off" value={label} maxLength={40} placeholder={t("e.g. vip","যেমন: vip")} onChange={e=>{invalidate();setLabel(e.target.value);setOffset(0);}}/>
    <button type="button" className={s.btn} onClick={()=>setSheet("")}>{t("Show conversations","কথোপকথন দেখুন")}</button>
   </Sheet>
   <Sheet open={sheet==="forward"} onClose={()=>setSheet("")} label={t("Forward","ফরওয়ার্ড")}>
    <h4>{t("Forward to","ফরওয়ার্ড করুন")}<button type="button" onClick={()=>setSheet("")}>{t("Close","বন্ধ")}</button></h4>
    <p className={s.sheetNote}>{t("A copy is sent as a new message. Only conversations with an open 24-hour window are available.","নতুন মেসেজ হিসেবে কপি যাবে। শুধু যেসব কথোপকথনে ২৪ ঘণ্টার সময় খোলা।")}</p>
    {threads.filter(x=>x.id!==selected).map(x=>{const blocked=(x.window_open===false&&x.channel!=="tg")||(selMsg?.type==="document"&&x.channel==="ig");return <button key={x.id} type="button" className={s.lr} disabled={blocked} onClick={()=>void forwardTo(x)}><div className={s.av} style={{width:36,height:36,fontSize:13}}>{<AvatarPhoto workspaceId={workspaceId} threadId={x.id} name={x.name}/>}<ChannelBadge channel={x.channel} size={16}/></div><span className={s.lbody}><b>{x.name}</b><small>{blocked?(x.window_open===false?t("Reply window closed","২৪ ঘণ্টা পার"):t("Files aren't supported on Instagram","Instagram এ ফাইল যায় না")):channelMeta[x.channel]?.name}</small></span></button>;})}
   </Sheet>
   <Sheet open={sheet==="info"} onClose={()=>setSheet("")} label={t("Message info","মেসেজের তথ্য")}>
    <h4>{t("Message info","মেসেজের তথ্য")}<button type="button" onClick={()=>setSheet("")}>{t("Close","বন্ধ")}</button></h4>
    {info&&<>
     <div className={s.ir}><span>{t("Sent by","কে পাঠিয়েছে")}</span><span className={s.v}>{info.sender==="customer"?customerName:info.sender==="ai"?"AI":t("You","আপনি")}</span></div>
     <div className={s.ir}><span>{t("Channel","চ্যানেল")}</span><span className={s.v}>{channelMeta[info.channel??chosen?.channel??""]?.name??"—"}</span></div>
     <div className={s.ir}><span>{info.sender==="customer"?t("Received","এসেছে"):t("Sent","পাঠানো হয়েছে")}</span><span className={s.v}>{fullDate(info.sender==="customer"?info.created_at:(info.sent_at??info.created_at),bn)}</span></div>
     {info.sender!=="customer"&&caps.delivered!==false&&<div className={s.ir}><span>{t("Delivered","পৌঁছেছে")}</span><span className={s.v}>{infoBusy?"…":info.delivered_at?fullDate(info.delivered_at,bn):"—"}</span></div>}
     {info.sender!=="customer"&&<div className={s.ir}><span>{t("Seen","দেখেছে")}</span><span className={s.v}>{infoBusy?"…":info.seen_at?fullDate(info.seen_at,bn):"—"}</span></div>}
    </>}
   </Sheet>
   <Sheet open={sheet==="tools"} onClose={()=>setSheet("")} label={t("Conversation tools","কথোপকথনের কাজ")}>
    <h4>{t("Conversation tools","কথোপকথনের কাজ")}<button type="button" onClick={()=>setSheet("")}>{t("Close","বন্ধ")}</button></h4>
    {selected&&<div className={`${legacy.root} ${s.tools}`} inert={composeBusy}><InboxWorkflow key={selected} workspaceId={workspaceId} actorId={actorId} threadId={selected} customerName={customerName} bn={bn} onInsert={v=>{changeText(v);setSheet("");}} onChange={refresh} onBusy={setWorkflowBusy}/></div>}
   </Sheet>
   {draftError&&<p className={s.alert} role="alert">{t("Could not save your draft. Keep your text and retry.","খসড়া সংরক্ষণ করা যায়নি। লেখা রেখে আবার চেষ্টা করুন।")}</p>}
  </div>
 </section></div>;
}

function Viewer({list,start,bn,workspaceId,threadId,who,onClose}:{list:Msg[];start:number;bn:boolean;workspaceId:string;threadId:string;who:string;onClose:()=>void}){
 const [i,setI]=useState(start),x0=useRef(0),m=list[i];const {media}=useMedia(workspaceId,threadId,m?.content?.media_id);
 const go=useCallback((d:number)=>setI(v=>Math.max(0,Math.min(list.length-1,v+d))),[list.length]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();else if(e.key==="ArrowLeft")go(-1);else if(e.key==="ArrowRight")go(1);};window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[go,onClose]);
 if(!m)return null;
 return <div className={`${s.viewer} ${s.vshow}`} role="dialog" aria-modal="true" aria-label={bn?"ছবি":"Photo"}>
  <div className={s.vt}><button type="button" className={s.ib} style={{color:"#fff"}} onClick={onClose} aria-label={bn?"বন্ধ":"Close"}><I n="back"/></button><b>{m.sender==="customer"?who:bn?"আপনি":"You"} · {clock(m.created_at,bn)}{list.length>1?` · ${num(i+1,bn)}/${num(list.length,bn)}`:""}</b>
   {media&&<a className={s.ib} style={{color:"#fff",marginLeft:"auto"}} href={media.url} download={m.content?.name||"photo"} aria-label={bn?"ডাউনলোড":"Download"}><I n="download"/></a>}</div>
  <div className={s.vbody} onPointerDown={e=>{x0.current=e.clientX;}} onPointerUp={e=>{const d=e.clientX-x0.current;if(Math.abs(d)>50)go(d<0?1:-1);}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
   <Img key={m.id} m={m} workspaceId={workspaceId} threadId={threadId} bn={bn} className={s.vimg}/></div>
  {i>0&&<button type="button" className={`${s.vnav} ${s.vprev}`} onClick={()=>go(-1)} aria-label={bn?"আগের":"Previous"}><I n="back"/></button>}
  {i<list.length-1&&<button type="button" className={`${s.vnav} ${s.vnext}`} onClick={()=>go(1)} aria-label={bn?"পরের":"Next"}><I n="back"/></button>}
 </div>;
}
