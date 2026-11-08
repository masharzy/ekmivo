"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import ui from "./inbox-pages.module.css";
type Rule={id:string;revision:number;connection_id:string;enabled:boolean;name:string;posts:string;selected:string[];excluded:string[];match:string;keywords:string[];intent:string;threshold:number;mode:string;reply:string;action:string};
type Comment={id:string;revision:number;post_id:string;body:string;state:string;reason:string;decision:{reply?:string};created_at:string};
type Data={rules:Rule[];connections:{id:string;provider:string;external_id:string}[];items:Comment[];audit:{id:number;action:string;created_at:string}[];can_manage:boolean;delivery_enabled:boolean};
const blank:Rule={id:"",revision:0,connection_id:"",enabled:false,name:"",posts:"all",selected:[],excluded:[],match:"keyword",keywords:[],intent:"question",threshold:.9,mode:"human",reply:"",action:"review"};
const csv=(s:string)=>s===""?[]:s.split(",").map(v=>v.trim());
const clean=(r:Rule)=>({...r,selected:r.selected.filter(Boolean),excluded:r.excluded.filter(Boolean),keywords:r.keywords.filter(Boolean)});
export function CommentAutomation({workspaceId,actorId,bn}:{workspaceId:string;actorId:string;bn:boolean}){
 const [data,setData]=useState<Data|null>(null),[rule,setRule]=useState<Rule>(blank),[query,setQuery]=useState(""),[status,setStatus]=useState(""),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[previewText,setPreviewText]=useState(""),[previewPost,setPreviewPost]=useState(""),[preview,setPreview]=useState(""),[review,setReview]=useState<Comment|null>(null),[reviewAction,setReviewAction]=useState("reply"),[reviewReply,setReviewReply]=useState("");
 const lock=useRef(false),pending=useRef<{fp:string;key:string}|null>(null),newId=useRef("");const endpoint=`/api/go/workspaces/${workspaceId}/comments`,dirty=JSON.stringify(rule)!==JSON.stringify(blank),t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const load=useCallback(async(signal?:AbortSignal)=>{const response=await fetch(`${endpoint}?${new URLSearchParams({cursor:String(offset),q:query,status})}`,{cache:"no-store",signal});if(!response.ok){if([401,403].includes(response.status))setData(null);throw Error(String(response.status));}return response.json() as Promise<Data>;},[endpoint,offset,query,status]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>{void load(c.signal).then(value=>{if(!c.signal.aborted){setData(value);setError("");}}).catch(()=>{if(!c.signal.aborted)setError(t("Comments unavailable. Refresh to retry.","কমেন্ট পাওয়া যাচ্ছে না। রিফ্রেশ করে আবার চেষ্টা করুন।"));});},250);return()=>{c.abort();clearTimeout(timer);};},[load,t]);
 const command=useCallback(async(action:string,body:object)=>{if(lock.current)return false;lock.current=true;setBusy(true);setError("");setMessage("");const fp=JSON.stringify([action,body]);if(pending.current?.fp!==fp)pending.current={fp,key:crypto.randomUUID()};
  try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,operation_key:pending.current.key,body})});if(!response.ok){if([401,403].includes(response.status))setData(null);throw Error(String(response.status));}setData(await load());pending.current=null;setMessage(t("Saved.","সংরক্ষিত হয়েছে।"));return true;}catch(e){const code=e instanceof Error?e.message:"";setError(code==="409"?t("This record changed. Refresh and review your edits.","তথ্য বদলেছে। রিফ্রেশ করে লেখা যাচাই করুন।"):code==="422"?t("Check required fields, post IDs and the confirmation.","প্রয়োজনীয় তথ্য, পোস্ট ID ও সম্মতি যাচাই করুন।"):t("Save is unconfirmed. Keep your edits and retry.","সংরক্ষণ নিশ্চিত হয়নি। লেখা রেখে আবার চেষ্টা করুন।"));return false;}finally{lock.current=false;setBusy(false);}
 },[endpoint,load,t]);
 const save=useCallback(async()=>{newId.current||=crypto.randomUUID();if(await command("rule",{...clean(rule),id:rule.id||newId.current})){setRule(blank);newId.current="";return true;}return false;},[command,rule]);
 useEffect(()=>registerDraft({id:`comments:${actorId}:${workspaceId}`,isDirty:()=>dirty,save,discard:()=>{setRule(blank);newId.current="";}}),[actorId,workspaceId,dirty,save]);
 async function dryRun(){if(lock.current)return;lock.current=true;setBusy(true);try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"dry-run",body:clean(rule),post_id:previewPost,text:previewText})});if(!response.ok)throw Error();const value=await response.json();setPreview(JSON.stringify(value.decision,null,2));setError("");}catch{setError(t("Check the rule and sample comment.","নিয়ম ও নমুনা কমেন্ট যাচাই করুন।"));}finally{lock.current=false;setBusy(false);}}
 async function connect(provider:string){setBusy(true);try{const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox-connect?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,comments:true})});if(!response.ok)throw Error();const value=await response.json(),url=new URL(value.url);if(url.protocol!=="https:"||url.hostname!=="www.facebook.com")throw Error();window.location.assign(url.href);}catch{setError(t("Comment permissions could not be requested.","কমেন্টের অনুমতি চাওয়া যায়নি।"));setBusy(false);}}
 const [tab,setTab]=useState<"queue"|"rules"|"history">("queue");
 const locked=dirty||busy,stateLabel=(v:string)=>v[0].toUpperCase()+v.slice(1);
 const seg=(value:string,set:(v:string)=>void,options:[string,string][])=><div className={ui.seg} role="group">{options.map(([v,l])=><button key={v||"all"} type="button" aria-pressed={value===v} disabled={locked} onClick={()=>set(v)}>{l}</button>)}</div>;
 const sel=(key:"match"|"intent"|"mode"|"action",en:string,be:string,options:readonly string[])=><label>{t(en,be)}<select value={rule[key]} onChange={e=>setRule({...rule,[key]:e.target.value,...(key==="mode"&&e.target.value==="ai"?{action:"reply"}:{})})}>{options.map(v=><option key={v} value={v}>{stateLabel(v)}</option>)}</select></label>;
 return <section className={ui.page}>
  <header className={ui.head}><div><h1>{t("Comment automation","কমেন্ট অটোমেশন")}</h1><p>{t("Review public comments on your posts and set rules that reply, hide or flag them.","পোস্টের প্রকাশ্য কমেন্ট দেখুন এবং কোনটায় উত্তর, লুকানো বা পর্যালোচনা হবে তার নিয়ম ঠিক করুন।")}</p></div>
   <button type="button" disabled={locked} onClick={()=>void load().then(value=>{setData(value);setError("");}).catch(()=>setError(t("Unavailable.","পাওয়া যাচ্ছে না।")))}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<p className={ui.alert} role="alert">{error}</p>}{message&&<p className={ui.ok} role="status">{message}</p>}{!data&&!error&&<p className={ui.status} role="status">{t("Loading…","লোড হচ্ছে…")}</p>}
  {data&&<>
   <p className={`${ui.banner} ${data.delivery_enabled?ui.on:""}`}><i/>{data.delivery_enabled?t("Delivery is enabled for authorized connected accounts.","অনুমোদিত সংযুক্ত অ্যাকাউন্টে পাঠানো চালু আছে।"):t("Provider delivery is paused. Rules, dry-run and review remain available.","চ্যানেলে পাঠানো বন্ধ আছে। নিয়ম, প্রিভিউ ও পর্যালোচনা ব্যবহার করা যাবে।")}</p>
   <nav className={ui.tabs} aria-label={t("Comment sections","কমেন্ট অংশ")}>{([["queue",t("Comments","কমেন্ট")],["rules",t("Rules","নিয়ম")],["history",t("History","ইতিহাস")]] as const).map(([v,l])=><button key={v} type="button" aria-current={tab===v?"page":undefined} onClick={()=>setTab(v)}>{l}{v==="rules"&&<span>{data.rules.length}</span>}</button>)}</nav>

   {tab==="queue"&&<>
    <div className={ui.bar}>
     <label className={ui.search}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"/></svg><input aria-label={t("Search comments or post ID","কমেন্ট বা পোস্ট ID খুঁজুন")} placeholder={t("Search comments or post ID…","কমেন্ট বা পোস্ট ID খুঁজুন…")} maxLength={100} value={query} disabled={locked} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
     <div className={ui.scroll}>{seg(status,v=>{setStatus(v);setOffset(0);},[["",t("All","সব")],...["review","pending","queued","sent","failed","uncertain","dismissed"].map(v=>[v,stateLabel(v)] as [string,string])])}</div>
    </div>
    {review&&data.can_manage&&<form className={ui.editor} onSubmit={e=>{e.preventDefault();if(window.confirm(t("Confirm this public reply or moderation action?","এই প্রকাশ্য উত্তর বা moderation নিশ্চিত করবেন?")))void command("review",{id:review.id,revision:review.revision,action:reviewAction,reply:reviewReply,confirmed:true,acknowledge_unknown:review.state==="uncertain"}).then(ok=>{if(ok)setReview(null);});}}><fieldset disabled={busy} style={{display:"grid",gap:12,border:0,padding:0,margin:0,minWidth:0}}>
      <h2>{t("Human review","মানব পর্যালোচনা")}</h2><p className={ui.quote}>{review.body}</p>
      {review.state==="uncertain"&&<p className={ui.alert} role="alert">{t("The previous action may already have happened. Check the platform before confirming a repeat.","আগের কাজটি হয়ে থাকতে পারে। আবার নিশ্চিত করার আগে প্ল্যাটফর্মে যাচাই করুন।")}</p>}
      <label>{t("Action","কাজ")}<select value={reviewAction} onChange={e=>setReviewAction(e.target.value)}>{["reply","hide","delete","dismiss"].map(v=><option key={v} value={v}>{stateLabel(v)}</option>)}</select></label>
      {reviewAction==="reply"&&<label>{t("Public reply","প্রকাশ্য উত্তর")}<textarea aria-label={t("Public reply","প্রকাশ্য উত্তর")} required maxLength={2000} value={reviewReply} onChange={e=>setReviewReply(e.target.value)}/></label>}
      <div className={ui.row2}><button type="submit" className={ui.primary}>{t("Confirm action","কাজ নিশ্চিত করুন")}</button><button type="button" onClick={()=>setReview(null)}>{t("Cancel","বাতিল")}</button></div></fieldset></form>}
    <div className={ui.list}>{data.items.length?data.items.slice(0,50).map(item=><article key={item.id} className={ui.card}>
      <div className={ui.top}><div className={ui.chips}><span className={`${ui.chip} ${ui.key}`}>{item.post_id}</span></div><span className={`${ui.chip} ${ui["st_"+item.state]??""}`}>{stateLabel(item.state)}</span></div>
      <p className={ui.body}>{item.body}</p>{item.reason&&<p className={ui.meta}>{item.reason}</p>}
      {item.decision.reply&&<p className={ui.quote}>{item.decision.reply}</p>}
      {data.can_manage&&["review","failed","uncertain"].includes(item.state)&&<div className={ui.actions}><button type="button" disabled={locked} onClick={()=>{setReview(item);setReviewReply(item.decision.reply??"");setReviewAction("reply");}}>{t("Review","পর্যালোচনা")}</button></div>}</article>):<p className={ui.empty}>{t("No comments match.","কোনো কমেন্ট পাওয়া যায়নি।")}</p>}
     {(offset>0||data.items.length>=51)&&<div className={ui.pager}><button type="button" disabled={locked||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>{t("Previous","আগের")}</button><button type="button" disabled={locked||offset>=10000||data.items.length<51} onClick={()=>setOffset(offset+50)}>{t("Next","পরের")}</button></div>}
    </div></>}

   {tab==="rules"&&<div className={data.can_manage?ui.split:undefined}>
    <div className={ui.list}>
     <p className={ui.help}>{t("Phone numbers, email and complaint signals always enter human review. Rules run in the displayed order; confidence is a model estimate.","ফোন নম্বর, ইমেইল ও অভিযোগ সবসময় মানব পর্যালোচনায় যাবে। নিয়ম দেখানো ক্রমে চলবে; confidence মডেলের অনুমান।")}</p>
     {data.rules.length?data.rules.map(item=><article key={item.id} className={ui.card}><div className={ui.top}><h3>{item.name}</h3><span className={`${ui.chip} ${item.enabled?ui.st_sent:""}`}>{item.enabled?t("Enabled","চালু"):t("Disabled","বন্ধ")}</span></div>
       <div className={ui.chips}><span className={ui.chip}>{stateLabel(item.mode)}</span><span className={ui.chip}>{stateLabel(item.action)}</span><span className={ui.chip}>{item.posts==="all"?t("All posts","সব পোস্ট"):t("Selected posts","নির্বাচিত পোস্ট")}</span></div>
       {data.can_manage&&<div className={ui.actions}><button type="button" disabled={locked} onClick={()=>setRule(item)}>{t("Edit","সম্পাদনা")}</button></div>}</article>):<p className={ui.empty}>{t("No rules yet.","এখনো কোনো নিয়ম নেই।")}</p>}
     {data.can_manage&&<div className={ui.actions}><button type="button" disabled={locked} onClick={()=>void connect("ms")}>{t("Authorize Facebook comments","Facebook কমেন্ট অনুমোদন")}</button><button type="button" disabled={locked} onClick={()=>void connect("ig")}>{t("Authorize Instagram comments","Instagram কমেন্ট অনুমোদন")}</button></div>}
    </div>
    {data.can_manage&&<form className={ui.editor} onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} style={{display:"grid",gap:12,border:0,padding:0,margin:0,minWidth:0}}>
     <h2>{rule.id?t("Edit rule","নিয়ম সম্পাদনা"):t("New rule","নতুন নিয়ম")}</h2>
     <label>{t("Name","নাম")}<input required maxLength={120} value={rule.name} onChange={e=>setRule({...rule,name:e.target.value})}/></label>
     <label>{t("Channel","চ্যানেল")}<select required value={rule.connection_id} onChange={e=>setRule({...rule,connection_id:e.target.value})}><option value="">{t("Select channel","চ্যানেল বাছুন")}</option>{data.connections.map(item=><option key={item.id} value={item.id}>{item.provider} · {item.external_id}</option>)}</select></label>
     <label className={ui.check}><input type="checkbox" checked={rule.enabled} onChange={e=>setRule({...rule,enabled:e.target.checked})}/>{t("Enable rule","নিয়ম চালু")}</label>
     <label>{t("Posts","পোস্ট")}<select value={rule.posts} onChange={e=>setRule({...rule,posts:e.target.value})}><option value="all">{t("All posts","সব পোস্ট")}</option><option value="selected">{t("Selected posts","নির্বাচিত পোস্ট")}</option></select></label>
     {([['selected','Selected post IDs (comma separated)','নির্বাচিত পোস্ট ID (কমা দিয়ে)'],['excluded','Excluded post IDs','বাদ দেওয়া পোস্ট ID'],['keywords','Keywords (comma separated)','কিওয়ার্ড (কমা দিয়ে)']] as const).map(([key,en,be])=><label key={key}>{t(en,be)}<input maxLength={key==="keywords"?2019:10099} value={rule[key].join(",")} onChange={e=>setRule({...rule,[key]:csv(e.target.value)})}/></label>)}
     <div className={ui.grid2}>{sel("match","Match","মিল",["all","keyword","intent"])}{sel("intent","Intent","উদ্দেশ্য",["question","purchase","complaint","other"])}{sel("mode","Reply mode","উত্তরের ধরন",["human","fixed","ai"])}{sel("action","Action","কাজ",rule.mode==="ai"?["reply"]:["reply","hide","delete","review"])}</div>
     <label>{t("Minimum confidence","ন্যূনতম confidence")}<input type="number" min="0.5" max="1" step="0.01" value={rule.threshold} onChange={e=>setRule({...rule,threshold:Number(e.target.value)})}/></label>
     <label>{t("Fixed reply","নির্দিষ্ট উত্তর")}<textarea maxLength={2000} value={rule.reply} onChange={e=>setRule({...rule,reply:e.target.value})}/></label>
     <div className={ui.row2}><button type="submit" className={ui.primary}>{t("Save rule","নিয়ম সংরক্ষণ")}</button><button type="button" onClick={()=>{setRule(blank);newId.current="";}}>{t("Discard edits","লেখা বাতিল")}</button></div>
     <h3 className={ui.sub}>{t("Test this rule","নিয়মটি পরীক্ষা করুন")}</h3>
     <label>{t("Preview post ID","নমুনা পোস্ট ID")}<input maxLength={100} value={previewPost} onChange={e=>setPreviewPost(e.target.value)}/></label>
     <label>{t("Sample comment","নমুনা কমেন্ট")}<textarea maxLength={8000} value={previewText} onChange={e=>setPreviewText(e.target.value)}/></label>
     <div className={ui.row2}><button type="button" onClick={()=>void dryRun()}>{t("Dry-run without sending","না পাঠিয়ে প্রিভিউ")}</button></div>
     <p className={ui.help}>{t("Intent dry-run reports classification required. It never calls a model or platform. Live intent and AI replies use your credit wallet.","Intent প্রিভিউতে classification দরকার দেখাবে। মডেল বা প্ল্যাটফর্মে কিছু পাঠাবে না। চালু অবস্থায় intent ও AI উত্তর ক্রেডিট ব্যবহার করবে।")}</p>
     {preview&&<pre className={ui.pre} role="status">{preview}</pre>}
    </fieldset></form>}
   </div>}

   {tab==="history"&&<div className={ui.list}>{data.audit.length?data.audit.slice(0,50).map(item=><article key={item.id} className={ui.card}><div className={ui.top}><strong>{item.action}</strong><span className={ui.meta}>{item.created_at}</span></div></article>):<p className={ui.empty}>{t("No history yet.","এখনো কোনো ইতিহাস নেই।")}</p>}</div>}
  </>}
 </section>;
}
