"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import {IntegrationIntro,IntegrationEmpty} from "./integration-ui";
import {SavedReplySequenceEditor,SavedReplyPreview,type SavedReply as Reply,type ReplyMedia} from "./saved-reply-editor";
type Ticket={id:string;thread_id:string;title:string;detail:string;status:string;priority:string;customer_name:string;created_at:string};
type Data={reply_sequences_enabled?:boolean;reply_media?:ReplyMedia[];saved_replies:Reply[];tickets:Ticket[];can_manage:boolean;more_replies:boolean;more_tickets:boolean};
const blank:Reply={id:"",revision:0,title:"",category:"",body:""};
export function InboxLibrary({workspaceId,actorId,bn,kind}:{workspaceId:string;actorId:string;bn:boolean;kind:"replies"|"tickets"}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[status,setStatus]=useState(""),[category,setCategory]=useState(""),[offset,setOffset]=useState(0),[reply,setReply]=useState(blank),[replyState,setReplyState]=useState("active");
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
 const dlg=useRef<HTMLDialogElement>(null);
 const openEditor=(r:Reply)=>{setReply(r);if(!r.id)newId.current="";dlg.current?.showModal();};
 const closeEditor=()=>{setReply(blank);newId.current="";dlg.current?.close();};
 const tabs=["","open","pending","resolved"],tabLabel=(v:string)=>v===""?t("All","সব"):bn?({open:"খোলা",pending:"অপেক্ষায়",resolved:"সমাধান"} as Record<string,string>)[v]:v[0].toUpperCase()+v.slice(1),statusLabel=(v:string)=>bn?({open:"খোলা",pending:"অপেক্ষায়",resolved:"সমাধান হয়েছে"} as Record<string,string>)[v]??v:v[0].toUpperCase()+v.slice(1);
 const more=kind==="tickets"?data?.more_tickets:data?.more_replies;
 const isT=kind==="tickets";
 const title=isT?t("Tickets","টিকিট"):t("Saved replies","সংরক্ষিত উত্তর");
 const desc=isT?t("Customer issues raised from conversations. Open one to continue in the chat.","কথোপকথন থেকে তৈরি গ্রাহকের সমস্যা। চ্যাটে ফিরে কাজ চালিয়ে যান।"):t("Ready-made answers your team can insert into a chat. Type / in the message box to find them.","দলের জন্য তৈরি উত্তর। চ্যাটের মেসেজ বক্সে / লিখে খুঁজে নিন।");
 const editing=!!reply.id;
 return <section className="int-workspace">
  <IntegrationIntro icon={isT?"activity":"hook"} title={title} description={desc}>{!isT&&data?.can_manage&&<button type="button" className="int-primary" disabled={busy} onClick={()=>openEditor(blank)}>{t("New reply","নতুন উত্তর")}</button>}</IntegrationIntro>
  {error&&<p className="int-feedback int-error" role="alert">{error}</p>}
  {(isT||data?.reply_sequences_enabled)&&<div className="int-tabs-wrap">
   {isT?<div className="int-tabs" role="group" aria-label={t("Status","অবস্থা")}>{tabs.map(v=><button key={v||"all"} type="button" aria-pressed={status===v} onClick={()=>{setStatus(v);setOffset(0);}}>{tabLabel(v)}</button>)}</div>
   :<div className="int-tabs" role="group" aria-label={t("Reply status","উত্তরের অবস্থা")}>{[["active",t("Active","সক্রিয়")],["archived",t("Archived","আর্কাইভ")]].map(([v,l])=><button key={v} type="button" aria-pressed={replyState===v} onClick={()=>{setReplyState(v);setOffset(0);}}>{l}</button>)}</div>}
  </div>}
  <div className="int-form-grid" style={{maxWidth:720}}>
   <label>{t("Search","খুঁজুন")}<input aria-label={t("Search","খুঁজুন")} placeholder={isT?t("Title or customer","শিরোনাম বা গ্রাহক"):t("Title or text","শিরোনাম বা লেখা")} maxLength={100} value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
   {!isT&&<label>{t("Category","বিভাগ")}<input aria-label={t("Category","বিভাগ")} placeholder={t("Any category","যেকোনো বিভাগ")} maxLength={80} value={category} onChange={e=>{setCategory(e.target.value);setOffset(0);}}/></label>}
  </div>
  {!data&&!error&&<p className="int-feedback" role="status">{t("Loading…","লোড হচ্ছে…")}</p>}
  {data&&(isT?data.tickets.length:data.saved_replies.length)===0&&!error&&(isT
   ?<IntegrationEmpty title={t("No tickets here","কোনো টিকিট নেই")} description={t("Create a ticket from a conversation and it will appear here.","কথোপকথন থেকে টিকিট বানালে এখানে দেখা যাবে।")}/>
   :<IntegrationEmpty title={t("No saved replies yet","এখনো কোনো উত্তর নেই")} description={t("Save the answers you give most often so the team can reuse them.","যে উত্তর বারবার দেন তা সংরক্ষণ করুন, দল আবার ব্যবহার করতে পারবে।")}>{data.can_manage&&<button type="button" className="int-primary" onClick={()=>openEditor(blank)}>{t("Create first reply","প্রথম উত্তর তৈরি করুন")}</button>}</IntegrationEmpty>)}
  {data&&(isT?data.tickets.length:data.saved_replies.length)>0&&<div className="int-card-grid">
   {isT?data.tickets.map(x=><article className="int-panel" key={x.id}>
     <div className="int-card-head"><h3>{x.title}</h3><span className={`int-status int-status-${x.status==="resolved"?"active":x.status==="open"?"pending":"configured"}`}>{statusLabel(x.status)}</span></div>
     <p style={{color:"var(--color-text-secondary)"}}>{x.customer_name} · {statusLabel(x.priority)}</p>{x.detail&&<p>{x.detail}</p>}
     <div className="int-actions"><Link href={`/inbox?thread=${x.thread_id}`}>{t("Open conversation →","কথোপকথন খুলুন →")}</Link></div></article>)
   :data.saved_replies.map(x=><article className="int-panel" key={x.id}>
     <div className="int-card-head"><h3>{x.title}</h3><span className="int-status">{x.visibility==="private"?t("Only me","শুধু আমি"):t("Team","টিম")}</span></div>
     {(x.shortcut||x.category)&&<p style={{color:"var(--color-text-secondary)"}}>{x.shortcut&&<code>/{x.shortcut}</code>}{x.shortcut&&x.category&&" · "}{x.category}</p>}
     <SavedReplyPreview reply={x} customerName={t("Customer","গ্রাহক")} bn={bn}/>
     {data.can_manage&&<div className="int-actions"><button type="button" disabled={busy} onClick={()=>openEditor(x)}>{t("Edit","সম্পাদনা")}</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm(t("Archive this reply?","এই উত্তর আর্কাইভ করবেন?")))void mutate("archive-reply",{id:x.id,revision:x.revision});}}>{t("Archive","আর্কাইভ")}</button></div>}</article>)}
  </div>}
  {(offset>0||more)&&<div className="int-actions"><button type="button" disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>{t("Previous","আগের")}</button><button type="button" disabled={busy||offset>=10000||!more} onClick={()=>setOffset(offset+50)}>{t("Next","পরের")}</button></div>}
  {!isT&&data?.can_manage&&<dialog ref={dlg} className="int-dialog" style={{width:"min(640px,calc(100% - 32px))"}} aria-labelledby="reply-dlg-title" onCancel={e=>{e.preventDefault();closeEditor();}}>
   <form onSubmit={e=>{e.preventDefault();void save().then(ok=>{if(ok)dlg.current?.close();});}} style={{display:"grid",gap:16}}>
    <h2 id="reply-dlg-title">{editing?t("Edit reply","উত্তর সম্পাদনা"):t("New reply","নতুন উত্তর")}</h2>
    <label>{t("Title","শিরোনাম")}<input required maxLength={120} placeholder={t("e.g. Delivery charge","যেমন: ডেলিভারি চার্জ")} value={reply.title} onChange={e=>setReply({...reply,title:e.target.value})}/></label>
    <label>{t("Reply text","উত্তরের লেখা")}<textarea required rows={5} maxLength={8000} value={reply.body} onChange={e=>setReply({...reply,body:e.target.value})}/></label>
    <p style={{margin:0,color:"var(--color-text-secondary)",fontSize:13}}>{t("Use {{customer_name}} to insert the customer's name. Replies go into the message box as a draft; you still press Send.","গ্রাহকের নামের জন্য {{customer_name}} লিখুন। উত্তর ড্রাফট হিসেবে বসে; পাঠাতে আপনাকেই Send চাপতে হয়।")}</p>
    <div className="int-form-grid">
     <label>{t("Category (optional)","বিভাগ (ঐচ্ছিক)")}<input maxLength={80} value={reply.category} onChange={e=>setReply({...reply,category:e.target.value})}/></label>
     {!data?.reply_sequences_enabled&&<><label>{t("Shortcut (optional)","শর্টকাট (ঐচ্ছিক)")}<input maxLength={40} placeholder="charge" value={reply.shortcut??""} onChange={e=>setReply({...reply,shortcut:e.target.value.replace(/[^a-z0-9_-]/gi,"").toLowerCase()})}/></label>
     <label>{t("Who can use it","কারা ব্যবহার করবে")}<select value={reply.visibility??"team"} onChange={e=>setReply({...reply,visibility:e.target.value as "team"|"private"})}><option value="team">{t("Whole team","পুরো টিম")}</option><option value="private">{t("Only me","শুধু আমি")}</option></select></label></>}
    </div>
    {data?.reply_sequences_enabled&&<details><summary>{t("Multiple messages, shortcut and sharing","একাধিক মেসেজ, শর্টকাট ও শেয়ারিং")}</summary><SavedReplySequenceEditor reply={reply} onChange={setReply} media={data.reply_media??[]} bn={bn}/></details>}
    <div className="int-actions"><button type="submit" className="int-primary" disabled={busy||!dirty}>{t("Save reply","উত্তর সংরক্ষণ করুন")}</button><button type="button" onClick={closeEditor}>{t("Cancel","বাতিল")}</button></div>
   </form></dialog>}
 </section>;
}
