"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import ui from "./inbox-pages.module.css";
import {SavedReplySequenceEditor,SavedReplyPreview,type SavedReply as Reply,type ReplyMedia} from "./saved-reply-editor";
type Ticket={id:string;thread_id:string;title:string;detail:string;status:string;priority:string;customer_name:string;created_at:string};
type Data={reply_sequences_enabled?:boolean;reply_media?:ReplyMedia[];saved_replies:Reply[];tickets:Ticket[];can_manage:boolean;more_replies:boolean;more_tickets:boolean};
const blank:Reply={id:"",revision:0,title:"",category:"",body:""};
export function InboxLibrary({workspaceId,actorId,bn,kind}:{workspaceId:string;actorId:string;bn:boolean;kind:"replies"|"tickets"}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[status,setStatus]=useState(""),[category,setCategory]=useState(""),[offset,setOffset]=useState(0),[reply,setReply]=useState(blank),[customer,setCustomer]=useState(""),[replyState,setReplyState]=useState("active");
 const operation=useRef<{fp:string;key:string}|null>(null),newId=useRef(""),lock=useRef(false);
 const dirty=JSON.stringify(reply)!==JSON.stringify(blank),t=(en:string,be:string)=>bn?be:en;
 const read=useCallback(async(signal?:AbortSignal)=>{
  const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},signal,body:JSON.stringify({action:"work-read",filters:{q:query,category,reply_state:replyState,ticket_status:status,reply_offset:kind==="replies"?offset:0,ticket_offset:kind==="tickets"?offset:0}})});
  if(!response.ok){if(response.status===401||response.status===403)setData(null);throw Error(String(response.status));}return response.json() as Promise<Data>;
 },[category,kind,offset,query,replyState,status,workspaceId]);
 const failure=useCallback((e:unknown)=>setError(e instanceof Error&&e.message==="409"?(bn?"তথ্য বদলেছে। লেখা রেখে রিফ্রেশ করুন।":"This record changed. Keep your edits and refresh."):e instanceof Error&&(e.message==="401"||e.message==="403")?(bn?"এই কাজের অনুমতি নেই।":"You no longer have permission."):(bn?"পাওয়া যাচ্ছে না। লেখা রেখে আবার চেষ্টা করুন।":"Unavailable. Keep your edits and retry.")),[bn]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>{void read(c.signal).then(next=>{if(!c.signal.aborted){setData(next);setError("");}}).catch(e=>{if(!c.signal.aborted)failure(e);});},250);return()=>{c.abort();clearTimeout(timer);};},[failure,read]);
 const mutate=useCallback(async(action:string,payload:object)=>{
  if(lock.current)return false;lock.current=true;setBusy(true);
  try{const fp=JSON.stringify([action,payload]);if(operation.current?.fp!==fp)operation.current={fp,key:crypto.randomUUID()};
   const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,body:{...payload,operation_key:operation.current.key}})});
   if(!response.ok){if(response.status===401||response.status===403)setData(null);throw Error(String(response.status));}
   setData(await read());operation.current=null;setError("");return true;
  }catch(e){failure(e);return false;}finally{lock.current=false;setBusy(false);}
 },[failure,read,workspaceId]);
 const save=useCallback(async()=>{newId.current||=crypto.randomUUID();const ok=await mutate("saved-reply",{...reply,id:reply.id||newId.current});if(ok){setReply(blank);newId.current="";}return ok;},[mutate,reply]);
 useEffect(()=>registerDraft({id:`inbox-library:${actorId}:${workspaceId}`,isDirty:()=>dirty,save,discard:()=>{setReply(blank);newId.current="";}}),[actorId,dirty,save,workspaceId]);
 const refresh=async()=>{if(dirty||busy)return;setBusy(true);try{setData(await read());setError("");}catch(e){failure(e);}finally{setBusy(false);}};
 const tabs=["","open","pending","resolved"],tabLabel=(v:string)=>v===""?t("All","সব"):bn?({open:"খোলা",pending:"অপেক্ষায়",resolved:"সমাধান"} as Record<string,string>)[v]:v[0].toUpperCase()+v.slice(1),statusLabel=(v:string)=>bn?({open:"খোলা",pending:"অপেক্ষায়",resolved:"সমাধান হয়েছে"} as Record<string,string>)[v]??v:v[0].toUpperCase()+v.slice(1);
 const locked=busy||dirty,more=kind==="tickets"?data?.more_tickets:data?.more_replies;
 return <section className={ui.page}>
  <header className={ui.head}><div><h1>{kind==="tickets"?t("Tickets","টিকিট"):t("Saved replies","সংরক্ষিত উত্তর")}</h1><p>{kind==="tickets"?t("Customer issues raised from conversations. Open one to continue in the chat.","কথোপকথন থেকে তৈরি গ্রাহকের সমস্যা। চ্যাটে ফিরে কাজ চালিয়ে যেতে খুলুন।"):t("Ready-made answers your team can insert into a chat as a draft. Sending always needs confirmation.","চ্যাটে draft হিসেবে বসানোর তৈরি উত্তর। পাঠাতে সবসময় আলাদা সম্মতি লাগে।")}</p></div>
   <button type="button" disabled={locked} onClick={()=>void refresh()}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<p className={ui.alert} role="alert">{error}</p>}
  <div className={ui.bar}>
   <label className={ui.search}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"/></svg><input aria-label={t("Search","খুঁজুন")} placeholder={t("Search…","খুঁজুন…")} maxLength={100} value={query} disabled={locked} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
   {kind==="tickets"?<div className={ui.seg} role="group" aria-label={t("Status","অবস্থা")}>{tabs.map(v=><button key={v||"all"} type="button" aria-pressed={status===v} disabled={locked} onClick={()=>{setStatus(v);setOffset(0);}}>{tabLabel(v)}</button>)}</div>
   :<><label className={ui.cat}><input aria-label={t("Category","বিভাগ")} placeholder={t("Category","বিভাগ")} maxLength={80} value={category} disabled={locked} onChange={e=>{setCategory(e.target.value);setOffset(0);}}/></label>
    {data?.reply_sequences_enabled&&<div className={ui.seg} role="group" aria-label={t("Reply status","উত্তরের অবস্থা")}>{[["active",t("Active","সক্রিয়")],["archived",t("Archived","আর্কাইভ")]].map(([v,l])=><button key={v} type="button" aria-pressed={replyState===v} disabled={locked} onClick={()=>{setReplyState(v);setOffset(0);}}>{l}</button>)}</div>}</>}
  </div>
  {!data&&!error&&<p className={ui.status} role="status">{t("Loading…","লোড হচ্ছে…")}</p>}
  {data&&<div className={kind==="replies"&&data.can_manage?ui.split:undefined}>
   <div className={ui.list}>
    {kind==="tickets"?(data.tickets.length?data.tickets.map(x=><article className={ui.card} key={x.id}>
      <div className={ui.top}><h3>{x.title}</h3><div className={ui.chips}><span className={`${ui.chip} ${ui[x.status]??""}`}>{statusLabel(x.status)}</span><span className={`${ui.chip} ${ui[x.priority]??""}`}>{statusLabel(x.priority)}</span></div></div>
      <p className={ui.meta}>{x.customer_name}</p>{x.detail&&<p className={ui.body}>{x.detail}</p>}
      <div className={ui.actions}><Link href={`/inbox?thread=${x.thread_id}`}>{t("Open conversation and ticket","কথোপকথন ও টিকিট খুলুন")}</Link></div></article>):<p className={ui.empty}>{t("No tickets match these filters.","এই filter-এ টিকিট নেই।")}</p>)
    :(data.saved_replies.length?data.saved_replies.map(x=><article className={ui.card} key={x.id}>
      <div className={ui.top}><h3>{x.title}</h3><div className={ui.chips}>{x.shortcut&&<span className={`${ui.chip} ${ui.key}`}>/{x.shortcut}</span>}{x.category&&<span className={ui.chip}>{x.category}</span>}<span className={ui.chip}>{x.visibility==="private"?t("Only me","শুধু আমি"):t("Team","টিম")}</span></div></div>
      <SavedReplyPreview reply={x} customerName={customer||t("Customer","গ্রাহক")} bn={bn}/>
      {data.can_manage&&<div className={ui.actions}><button type="button" disabled={locked} onClick={()=>setReply(x)}>{t("Edit","সম্পাদনা")}</button><button type="button" disabled={locked} onClick={()=>{if(window.confirm(t("Archive this reply?","এই উত্তর আর্কাইভ করবেন?")))void mutate("archive-reply",{id:x.id,revision:x.revision});}}>{t("Archive","আর্কাইভ")}</button></div>}</article>):<p className={ui.empty}>{t("No saved replies match these filters.","এই filter-এ সংরক্ষিত উত্তর নেই।")}</p>)}
    {(offset>0||more)&&<div className={ui.pager}><button type="button" disabled={locked||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>{t("Previous","আগের")}</button><button type="button" disabled={locked||offset>=10000||!more} onClick={()=>setOffset(offset+50)}>{t("Next","পরের")}</button></div>}
   </div>
   {kind==="replies"&&data.can_manage&&<form className={ui.editor} onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} style={{display:"grid",gap:12,border:0,padding:0,margin:0,minWidth:0}}>
     <h2>{reply.id?t("Edit reply","উত্তর সম্পাদনা"):t("New reply","নতুন উত্তর")}</h2>
     <label>{t("Title","শিরোনাম")}<input aria-label={t("Reply title","উত্তরের শিরোনাম")} required maxLength={120} value={reply.title} onChange={e=>setReply({...reply,title:e.target.value})}/></label>
     <label>{t("Category","বিভাগ")}<input aria-label={t("Reply category","উত্তরের বিভাগ")} maxLength={80} value={reply.category} onChange={e=>setReply({...reply,category:e.target.value})}/></label>
     <label>{t("Reply text","উত্তরের লেখা")}<textarea aria-label={t("Reply text","উত্তরের লেখা")} required maxLength={8000} value={reply.body} onChange={e=>setReply({...reply,body:e.target.value})}/></label>
     {data.reply_sequences_enabled&&<SavedReplySequenceEditor reply={reply} onChange={setReply} media={data.reply_media??[]} bn={bn}/>}
     <label>{t("Preview customer name","নাম দিয়ে preview")}<input value={customer} maxLength={200} onChange={e=>setCustomer(e.target.value)}/></label>
     <p className={ui.prev} aria-label={t("Reply preview","উত্তরের preview")}>{reply.body.replace(/{{\s*customer_name\s*}}/g,()=>customer||t("Customer","গ্রাহক"))||t("Preview appears here","preview এখানে দেখা যাবে")}</p>
     <p className={ui.help}>{t("Use {{customer_name}} for the customer name. Replies are inserted as drafts; sending needs confirmation.","গ্রাহকের নামের জন্য {{customer_name}} ব্যবহার করুন। উত্তর draft হিসেবে বসবে; পাঠাতে আলাদা সম্মতি লাগে।")}</p>
     <div className={ui.row2}><button type="submit" className={ui.primary} disabled={!dirty}>{t("Save reply","উত্তর সংরক্ষণ")}</button><button type="button" onClick={()=>{setReply(blank);newId.current="";}}>{t("Discard","বাতিল")}</button></div>
    </fieldset></form>}
  </div>}
 </section>;
}
