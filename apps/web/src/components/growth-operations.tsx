"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./growth-operations.module.css";

type Campaign={id:string;kind:"broadcast"|"post";title:string;body:string;audience:"all"|"qualified"|"won";status:"draft"|"planned"|"archived";planned_at:string|null;time_zone:string;revision:number};
type Resource={id:string;title:string;active:boolean;revision:number};
type Booking={id:string;resource_id:string;customer_id:string|null;starts_at:string;ends_at:string;time_zone:string;summary:string;status:"requested"|"confirmed"|"cancelled"|"completed";revision:number};
export type GrowthOperationsData={items:(Campaign|Booking)[];resources?:Resource[];can_manage:boolean;potential_audience?:number;send_ready?:boolean;provider_status:string;note?:string};
type ConsentPreview={channel:string;audience:string;candidate_profiles:number;profile_permission_blocked:number;identity_unverified:number;channel_proof_missing:number;suppressed:number;potentially_eligible_with_proof:number;send_ready:false;provider_status:string};
type Pending={action:string;body:Record<string,unknown>;key:string;time:number};
type CampaignDraft=Pick<Campaign,"title"|"body"|"audience"|"time_zone"|"status">&{planned_at:string};
const emptyCampaign:CampaignDraft={title:"",body:"",audience:"all",time_zone:"Asia/Dhaka",status:"draft",planned_at:""};
function localInputDate(iso:string){const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);}
export function GrowthOperations({workspaceId,actorId,bn,environment,kind,initial,consentEnabled}:{workspaceId:string;actorId:string;bn:boolean;environment:"live"|"sandbox";kind:"broadcast"|"post"|"booking";initial:GrowthOperationsData|null;consentEnabled:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState(initial),[error,setError]=useState(initial?"":t("This feature is unavailable until the growth migration is deployed.","গ্রোথ মাইগ্রেশন চালু না হওয়া পর্যন্ত এই ফিচার পাওয়া যাবে না।")),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<Campaign|null>(null),[campaign,setCampaign]=useState(emptyCampaign),[resourceName,setResourceName]=useState(""),[resource,setResource]=useState(""),[customer,setCustomer]=useState(""),[summary,setSummary]=useState(""),[starts,setStarts]=useState(""),[ends,setEnds]=useState("");
 const [consentChannel,setConsentChannel]=useState("email"),[consentSegment,setConsentSegment]=useState("all"),[consentPreview,setConsentPreview]=useState<ConsentPreview|null>(null),[suppressCustomer,setSuppressCustomer]=useState(""),[reviewing,setReviewing]=useState(false);
 const [uncertain,setUncertain]=useState<Pending|null>(null),lock=useRef(false);
 const endpoint=`/api/go/workspaces/${workspaceId}/growth?environment=${environment}`;
 const pendingKey=`growth-pending:${actorId}:${workspaceId}:${environment}:${kind}`;
 useEffect(()=>{
  const timer=setTimeout(()=>{
   try{
    const raw=sessionStorage.getItem(pendingKey);if(!raw)return;
    const old=JSON.parse(raw) as Pending;
    if(typeof old.key!=="string"||!/^[0-9a-f-]{36}$/i.test(old.key)||!Number.isFinite(old.time)
     ||Date.now()-old.time>30*60_000||typeof old.action!=="string"||old.body===null||typeof old.body!=="object"){
     sessionStorage.removeItem(pendingKey);return;
    }
    setUncertain(old);
   }catch{try{sessionStorage.removeItem(pendingKey);}catch{/* Storage unavailable. */}}
  },0);
  return()=>clearTimeout(timer);
 },[pendingKey]);
 const refresh=useCallback(async()=>{
  const response=await fetch(endpoint+"&kind="+kind,{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const next=await response.json() as GrowthOperationsData;
  setData(next);setError("");return next;
 },[endpoint,kind]);
 async function run(action:string,body:Record<string,unknown>,retry=false){
  if(lock.current||(!retry&&uncertain))return false;
  lock.current=true;setBusy(true);setError("");setMessage("");
  const operation=retry?uncertain!:{action,body,key:crypto.randomUUID(),time:Date.now()};
  if(!operation){lock.current=false;setBusy(false);return false;}
  setUncertain(operation);
  try{sessionStorage.setItem(pendingKey,JSON.stringify(operation));}catch{/* Ephemeral retry still retains the idempotency key. */}
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:operation.action,body:operation.body,operation_key:operation.key})});
   if(!response.ok){
    if(![502,503,504].includes(response.status)){setUncertain(null);try{sessionStorage.removeItem(pendingKey);}catch{/* Best effort. */}}
    throw Error("HTTP "+response.status);
   }
   setUncertain(null);try{sessionStorage.removeItem(pendingKey);}catch{/* Best effort. */}
   setMessage(t("Saved. No message or notification was sent.","সংরক্ষিত হয়েছে। কোনো মেসেজ বা নোটিফিকেশন পাঠানো হয়নি।"));
   try{await refresh();}catch{setError(t("Saved, but refresh failed. Refresh to confirm the updated record.","সংরক্ষিত হয়েছে, কিন্তু তালিকা রিফ্রেশ হয়নি। আবার দেখুন।"));}
   return true;
  }catch(e){setError(t("Operation not confirmed. Check the latest list; retry with the same key if needed.","কাজটি নিশ্চিত নয়। নতুন তালিকা দেখুন; প্রয়োজন হলে একই key-তে আবার চেষ্টা করুন।")+" "+(e instanceof Error?e.message:""));return false;}
  finally{lock.current=false;setBusy(false);}
 }
 async function saveCampaign(e:React.FormEvent){e.preventDefault();if(!data?.can_manage)return;
  const planned=campaign.status==="planned"?new Date(campaign.planned_at).toISOString():null;
  const body={kind,audience:campaign.audience,title:campaign.title.trim(),body:campaign.body.trim(),time_zone:campaign.time_zone,status:campaign.status,planned_at:planned};
  const ok=await run(editing?"draft-update":"draft-create",editing?{...body,id:editing.id,revision:editing.revision}:body);
  if(ok){setEditing(null);setCampaign(emptyCampaign);}
 }
 async function book(e:React.FormEvent){e.preventDefault();if(!data?.can_manage||!resource)return;
  const ok=await run("booking-create",{resource_id:resource,customer_id:customer||null,summary:summary.trim(),time_zone:"Asia/Dhaka",starts_at:new Date(starts).toISOString(),ends_at:new Date(ends).toISOString()});
  if(ok){setSummary("");setStarts("");setEnds("");setCustomer("");}
 }
 async function reviewAudience(){
  if(!consentEnabled||!data?.can_manage)return;
  setReviewing(true);setConsentPreview(null);setError("");
  try{
   const response=await fetch(endpoint+"&kind=audience&channel="+encodeURIComponent(consentChannel)+"&audience="+encodeURIComponent(consentSegment),{cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const result=await response.json() as ConsentPreview;
   if(result.send_ready!==false||result.channel!==consentChannel||result.audience!==consentSegment)throw Error("Invalid safety preview");
   setConsentPreview(result);
  }catch{setError(t("Consent preview unavailable. No audience is approved for sending.","সম্মতি যাচাই পাওয়া যাচ্ছে না। কাউকে মেসেজ পাঠানোর অনুমোদন নেই।"));}
  finally{setReviewing(false);}
 }
 const isBooking=kind==="booking";
 const campaigns=!isBooking?(data?.items??[]) as Campaign[]:[];
 const bookings=isBooking?(data?.items??[]) as Booking[]:[];
 return <section className={styles.root} aria-busy={busy}>
  <header className={styles.header}><div><p className={styles.kicker}>{t("Single Store · Growth","একক স্টোর · গ্রোথ")}</p><h1>{isBooking?t("Bookings & availability","বুকিং ও সময়সূচি"):kind==="post"?t("Campaign posts","ক্যাম্পেইন পোস্ট"):t("Broadcast drafts","ব্রডকাস্ট ড্রাফট")}</h1>
  <p>{isBooking?t("Manage internal appointments with conflict protection. No external calendar or notification is connected.","অভ্যন্তরীণ অ্যাপয়েন্টমেন্ট পরিচালনা করুন; একই সময়ের বুকিং প্রতিরোধ করা হবে। বাইরের ক্যালেন্ডার বা নোটিফিকেশন সংযুক্ত নয়।"):t("Draft and plan content only. Verified marketing opt-in and an approved delivery provider are required before any customer send.","শুধু কনটেন্টের খসড়া ও পরিকল্পনা করুন। গ্রাহককে পাঠানোর আগে যাচাইকৃত সম্মতি ও অনুমোদিত প্রোভাইডার লাগবে।")}</p></div><button type="button" onClick={()=>void refresh().catch(()=>setError(t("Unable to reload.","আবার লোড হচ্ছে না।")))} disabled={busy}>{t("Refresh","রিফ্রেশ")}</button></header>
  {!isBooking&&<div className={styles.notice} role="status"><strong>{t("Sending is disabled","পাঠানো বন্ধ আছে")}</strong><p>{t("Potential matching CRM profiles:","সম্ভাব্য CRM প্রোফাইল:")} {data?.potential_audience??"—"}. {t("A profile preference or verified identity does not prove provider marketing consent. No send queue is activated.","প্রোফাইলের পছন্দ বা পরিচয় যাচাই প্রোভাইডারের প্রচারণা-সম্মতির প্রমাণ নয়। কোনো সেন্ড কিউ চালু নেই।")}</p></div>}
  {!isBooking&&consentEnabled&&data?.can_manage&&<div className={styles.panel}>
   <h2>{t("Channel consent & suppression review","চ্যানেলের সম্মতি ও অপ্ট-আউট যাচাই")}</h2>
   <p>{t("Review aggregate opt-in evidence before planning. Provider delivery remains disabled. These counts are not a send authorization.","পরিকল্পনার আগে সম্মতির প্রমাণের সারসংক্ষেপ দেখুন। প্রোভাইডারে পাঠানো বন্ধ আছে; সংখ্যাগুলো পাঠানোর অনুমোদন নয়।")}</p>
   <div className={styles.two}>
    <label>{t("Channel","চ্যানেল")}<select value={consentChannel} onChange={e=>{setConsentChannel(e.target.value);setConsentPreview(null);}}><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="messenger">Messenger</option><option value="instagram">Instagram</option></select></label>
    <label>{t("Audience","গ্রাহক দল")}<select value={consentSegment} onChange={e=>{setConsentSegment(e.target.value);setConsentPreview(null);}}><option value="all">{t("All profiles","সব প্রোফাইল")}</option><option value="qualified">{t("Qualified leads","যোগ্য লিড")}</option><option value="won">{t("Won customers","সফল গ্রাহক")}</option></select></label>
   </div>
   <button type="button" disabled={busy||reviewing} onClick={()=>void reviewAudience()}>{reviewing?t("Checking…","যাচাই হচ্ছে…"):t("Review consent evidence","সম্মতি যাচাই করুন")}</button>
   {consentPreview&&<div className={styles.notice} role="status"><strong>{t("Not send-ready · review only","পাঠানোর জন্য প্রস্তুত নয় · শুধু যাচাই")}</strong>
    <p>{t("Profiles:","প্রোফাইল:")} {consentPreview.candidate_profiles} · {t("Profile opted-out/DNC:","অপ্ট-আউট/যোগাযোগ নিষেধ:")} {consentPreview.profile_permission_blocked} · {t("Identity unverified:","পরিচয় যাচাই হয়নি:")} {consentPreview.identity_unverified}</p>
    <p>{t("Channel proof missing:","চ্যানেলের সম্মতির প্রমাণ নেই:")} {consentPreview.channel_proof_missing} · {t("Suppressed:","ব্লক করা হয়েছে:")} {consentPreview.suppressed} · {t("Potentially eligible on record:","রেকর্ড অনুযায়ী সম্ভাব্য যোগ্য:")} {consentPreview.potentially_eligible_with_proof}</p>
    <small>{t("Checks overlap. At actual dispatch, quiet hours, expiration, provider template rules and fresh opt-out must be revalidated.","কারণগুলো একাধিক হতে পারে। পাঠানোর সময় quiet hours, মেয়াদ, প্রোভাইডার নিয়ম ও নতুন অপ্ট-আউট পুনরায় যাচাই জরুরি।")}</small>
   </div>}
   <form onSubmit={e=>{e.preventDefault();void run("suppress-contact",{customer_id:suppressCustomer,channel:consentChannel,reason:"customer-request"}).then(ok=>{if(ok){setSuppressCustomer("");setConsentPreview(null);}});}}>
    <label>{t("Record customer opt-out (same Store customer ID)","গ্রাহকের অপ্ট-আউট লিখুন (একই স্টোরের গ্রাহক ID)")}<input required pattern="[0-9a-fA-F-]{36}" value={suppressCustomer} onChange={e=>setSuppressCustomer(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label>
    <button disabled={busy||reviewing||Boolean(uncertain)}>{t("Permanently suppress on channel","এই চ্যানেলে স্থায়ীভাবে বন্ধ করুন")}</button>
   </form>
   <p>{t("Opt-outs cannot be undone in this screen. Verified future re-consent requires a trusted provider flow.","এখানে অপ্ট-আউট বাতিল করা যায় না। নতুন সম্মতি যাচাই করতে অনুমোদিত প্রোভাইডার প্রক্রিয়া লাগবে।")}</p>
  </div>}
  {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p className={styles.success} role="status">{message}</p>}
  {uncertain&&<div className={styles.notice} role="alert"><strong>{t("Previous operation unconfirmed","আগের কাজ নিশ্চিত নয়")}</strong><button type="button" disabled={busy} onClick={()=>void run("",{},true)}>{t("Retry identical operation","একই কাজ আবার চেষ্টা")}</button><button type="button" disabled={busy} onClick={()=>void refresh().then(()=>{setUncertain(null);try{sessionStorage.removeItem(pendingKey);}catch{/* Best effort. */}setError("");}).catch(()=>setError(t("Unable to inspect current records.","বর্তমান তথ্য দেখা যাচ্ছে না।")))}>{t("Inspect records and clear","তালিকা দেখে পরের কাজে যান")}</button></div>}
  {!data?<div className={styles.notice}><p>{t("Data source is unavailable; no empty result is implied.","ডেটার উৎস পাওয়া যাচ্ছে না; তালিকা ফাঁকা বলে ধরে নেওয়া হচ্ছে না।")}</p></div>:isBooking?<div className={styles.grid}>
   <div className={styles.panel}><h2>{t("Service resources","সেবার রিসোর্স")}</h2>{data.resources?.map(r=><div className={styles.item} key={r.id}><strong>{r.title}</strong><small>{r.active?t("Available","সক্রিয়"):t("Paused","বন্ধ")}</small>{data.can_manage&&<button disabled={busy} onClick={()=>void run("resource-update",{id:r.id,title:r.title,revision:r.revision,active:!r.active})}>{r.active?t("Pause","বন্ধ করুন"):t("Resume","চালু করুন")}</button>}</div>)}
    {data.can_manage&&<form onSubmit={e=>{e.preventDefault();void run("resource-create",{title:resourceName.trim()}).then(ok=>{if(ok)setResourceName("");});}}><label>{t("New service or room","নতুন সেবা বা কক্ষ")}<input required minLength={1} maxLength={120} value={resourceName} onChange={e=>setResourceName(e.target.value)}/></label><button disabled={busy||Boolean(uncertain)}>{t("Add resource","রিসোর্স যোগ")}</button></form>}
   </div><div className={styles.panel}><h2>{t("Appointment","অ্যাপয়েন্টমেন্ট")}</h2>{data.can_manage&&<form onSubmit={e=>void book(e)}><label>{t("Resource","রিসোর্স")}<select required value={resource} onChange={e=>setResource(e.target.value)}><option value="">{t("Choose","বেছে নিন")}</option>{data.resources?.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><label>{t("Customer ID (optional, same Store)","গ্রাহক ID (ঐচ্ছিক, একই স্টোর)")}<input value={customer} onChange={e=>setCustomer(e.target.value)} pattern="[0-9a-fA-F-]{36}"/></label><label>{t("Reason","বিবরণ")}<input required maxLength={200} value={summary} onChange={e=>setSummary(e.target.value)}/></label><div className={styles.two}><label>{t("Start (browser local time)","শুরু (ব্রাউজারের সময়)")}<input required type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>{t("End (browser local time)","শেষ (ব্রাউজারের সময়)")}<input required type="datetime-local" value={ends} min={starts} onChange={e=>setEnds(e.target.value)}/></label></div><button disabled={busy||Boolean(uncertain)}>{t("Request booking","বুকিং অনুরোধ")}</button></form>}</div>
  </div>:<div className={styles.panel}><h2>{editing?t("Edit draft","খসড়া সম্পাদনা"):t("Create a draft","নতুন খসড়া")}</h2>{data.can_manage?<form onSubmit={e=>void saveCampaign(e)}><div className={styles.two}><label>{t("Title","শিরোনাম")}<input required maxLength={120} value={campaign.title} onChange={e=>setCampaign(c=>({...c,title:e.target.value}))}/></label><label>{t("Audience segment (planning only)","গ্রুপ (শুধু পরিকল্পনা)")}<select value={campaign.audience} onChange={e=>setCampaign(c=>({...c,audience:e.target.value as Campaign["audience"]}))}><option value="all">{t("All","সব")}</option><option value="qualified">{t("Qualified leads","যোগ্য লিড")}</option><option value="won">{t("Won customers","সফল গ্রাহক")}</option></select></label></div><label>{t("Content","লেখা")}<textarea required maxLength={4000} rows={5} value={campaign.body} onChange={e=>setCampaign(c=>({...c,body:e.target.value}))}/></label>{editing&&<><label>{t("Editorial state (never sends)","কনটেন্ট অবস্থা (কখনো পাঠাবে না)")}<select value={campaign.status} onChange={e=>setCampaign(c=>({...c,status:e.target.value as Campaign["status"]}))}><option value="draft">{t("Draft","খসড়া")}</option><option value="planned">{t("Planned","পরিকল্পিত")}</option><option value="archived">{t("Archived","আর্কাইভ")}</option></select></label>{campaign.status==="planned"&&<label>{t("Planned date (browser local time)","পরিকল্পিত তারিখ (ব্রাউজারের সময়)")}<input required type="datetime-local" value={campaign.planned_at} onChange={e=>setCampaign(c=>({...c,planned_at:e.target.value}))}/></label>}</>}<div className={styles.actions}><button disabled={busy||Boolean(uncertain)}>{editing?t("Save editorial changes","পরিবর্তন সংরক্ষণ"):t("Save draft","খসড়া রাখুন")}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setCampaign(emptyCampaign);}}>{t("Cancel edit","সম্পাদনা বাতিল")}</button>}</div></form>:<p>{t("Only Store owner/admin may edit campaigns.","শুধু স্টোরের মালিক বা অ্যাডমিন সম্পাদনা করতে পারবেন।")}</p>}</div>}
  <div className={styles.panel}><h2>{isBooking?t("Appointments","অ্যাপয়েন্টমেন্ট"):t("Saved content","সংরক্ষিত কনটেন্ট")}</h2>{(data?.items??[]).length===0?<p>{t("No records yet.","এখনো কোনো রেকর্ড নেই।")}</p>:isBooking?bookings.map(b=><article className={styles.item} key={b.id}><strong>{b.summary}</strong><span>{data?.resources?.find(r=>r.id===b.resource_id)?.title??t("Resource","রিসোর্স")} · {new Date(b.starts_at).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})} → {new Date(b.ends_at).toLocaleTimeString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}</span><small>{b.status}</small>{data?.can_manage&&["requested","confirmed"].includes(b.status)&&<div className={styles.actions}>{(b.status==="requested"?["confirmed","cancelled"]:["completed","cancelled"]).map(status=><button type="button" key={status} disabled={busy||Boolean(uncertain)} onClick={()=>void run("booking-status",{id:b.id,revision:b.revision,status})}>{status}</button>)}</div>}</article>):campaigns.map(c=><article className={styles.item} key={c.id}><strong>{c.title}</strong><small>{c.status} · {c.audience}{c.planned_at?" · "+new Date(c.planned_at).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:c.time_zone}):""}</small><p>{c.body}</p>{data?.can_manage&&c.status!=="archived"&&<button type="button" onClick={()=>{setEditing(c);setCampaign({title:c.title,body:c.body,audience:c.audience,time_zone:c.time_zone,status:c.status,planned_at:c.planned_at?localInputDate(c.planned_at):""});}}>{t("Edit","সম্পাদনা")}</button>}</article>)}</div>
 </section>;
}
