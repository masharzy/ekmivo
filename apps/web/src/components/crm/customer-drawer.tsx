"use client";
import {useEffect,useState} from "react";
import {RefModal} from "../reference-ui";
import {STAGES,stageText,tempText,type CustomerOrders,type Detail,type useCrm} from "./use-crm";

type H=ReturnType<typeof useCrm>;
const when=(iso:string,bn:boolean)=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?"—":new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(d);};
export const looksLikeId=(s:string)=>!s.trim()||/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s.trim())||/^\d{12,}$/.test(s.trim());

export function CustomerDrawer({h}:{h:H}){
 const {t,bn,data,detail,draft,dirty,busy,unconfirmed,tab,setTab,update,ordersEnabled}=h;
 const isNew=!detail,can=Boolean(data?.can_manage);
 const dead=Boolean(draft?.deleted_at||draft?.merged_into);
 const open=Boolean(draft&&data);
 const name=draft&&!looksLikeId(draft.name)?draft.name:isNew?t("New customer","নতুন গ্রাহক"):t("Unnamed customer","নামহীন গ্রাহক");
 const count=detail?.followups.filter(x=>x.status==="scheduled").length??0;
 return <RefModal drawer open={open} title={name} closeLabel={t("Close","বন্ধ করুন")} busy={busy} onClose={()=>void h.close()}
  footer={tab==="profile"&&draft&&data&&<>
   {can&&!isNew&&!dead&&<button type="button" className="ib" style={{marginRight:"auto",color:"#dc2626"}} disabled={busy||dirty} onClick={()=>{if(window.confirm(t("Delete this customer's personal data? Payment records stay.","এই গ্রাহকের ব্যক্তিগত তথ্য মুছবেন? পেমেন্ট রেকর্ড থেকে যাবে।")))void h.act("delete",{confirmed:true});}}>{t("Delete","মুছুন")}</button>}
   <button type="button" className="ib" disabled={busy} onClick={()=>void h.close()}>{t("Close","বন্ধ করুন")}</button>
   {can&&!dead&&<button type="submit" form="crm-profile" className="ib pri" disabled={busy||!dirty||unconfirmed}>{isNew?t("Create","তৈরি করুন"):t("Save","সংরক্ষণ")}</button>}</>}>
  {draft&&data&&<>
   {detail&&<div className="seg" role="tablist" style={{marginBottom:16}}>{([["profile",t("Profile","প্রোফাইল")],...(ordersEnabled?[["orders",t("Orders","অর্ডার")] as const]:[]),["followups",t("Follow-ups","ফলো-আপ")+(count?` · ${count}`:"")],["activity",t("Activity","কার্যক্রম")]] as const).map(([v,l])=><button key={v} type="button" role="tab" aria-selected={tab===v} className={tab===v?"on":""} onClick={()=>setTab(v)}>{l}</button>)}</div>}
   {h.message&&<p className="notice" role="status" data-feedback="success">{h.message}</p>}
   {h.error&&<p className="notice ref-errors" role="alert">{h.error}</p>}
   {unconfirmed&&<p className="notice">{t("An action is not confirmed yet.","একটি কাজ এখনো নিশ্চিত হয়নি।")} <button type="button" className="ib" disabled={busy} onClick={()=>void h.retry()}>{t("Retry","আবার চেষ্টা")}</button></p>}
   {tab==="profile"&&<form id="crm-profile" onSubmit={e=>{e.preventDefault();void h.save();}}>
    {dead?<p className="mut">{draft.deleted_at?t("Personal data was deleted from this profile.","এই প্রোফাইলের ব্যক্তিগত তথ্য মুছে ফেলা হয়েছে।"):t("This profile was merged into another one.","এই প্রোফাইল অন্যটির সঙ্গে একত্র করা হয়েছে।")}</p>:<fieldset disabled={!can||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <div className="fld"><label htmlFor="crm-field-1">{t("Name","নাম")}</label><input id="crm-field-1" className="in w" required maxLength={160} value={looksLikeId(draft.name)?"":draft.name} placeholder={t("Customer name","গ্রাহকের নাম")} onChange={e=>update("name",e.target.value)}/></div>
     {data.can_contact&&<div className="f2" style={{marginTop:13}}><div className="fld"><label htmlFor="crm-field-2">{t("Phone","ফোন")}</label><input id="crm-field-2" className="in w" maxLength={16} inputMode="tel" value={draft.phone??""} onChange={e=>update("phone",e.target.value)}/></div><div className="fld"><label htmlFor="crm-field-3">{t("Email","ইমেইল")}</label><input id="crm-field-3" className="in w" type="email" maxLength={254} value={draft.email??""} onChange={e=>update("email",e.target.value)}/></div></div>}
     <div className="f2" style={{marginTop:13}}><div className="fld"><label htmlFor="crm-field-4">{t("Stage","ধাপ")}</label><select id="crm-field-4" className="in w" value={draft.stage} onChange={e=>update("stage",e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{stageText(s,bn)}</option>)}</select></div><div className="fld"><label htmlFor="crm-field-5">{t("Priority","গুরুত্ব")}</label><select id="crm-field-5" className="in w" value={draft.temperature} onChange={e=>update("temperature",e.target.value)}>{["hot","warm","cold"].map(s=><option key={s} value={s}>{tempText(s,bn)}</option>)}</select></div></div>
     {!can&&draft.assigned&&<p className="mut">{t("Assigned to a team member","টিমের একজন সদস্যের দায়িত্বে")}</p>}
     {can&&<div className="fld"><label htmlFor="crm-field-6">{t("Assigned to","দায়িত্বে")}</label><select id="crm-field-6" className="in w" value={draft.assignee??""} onChange={e=>{update("assignee",e.target.value||null);update("assigned",Boolean(e.target.value));}}><option value="">{t("Unassigned","কেউ না")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
     <div className="fld"><label htmlFor="crm-field-7">{t("Tags","ট্যাগ")}</label><input id="crm-field-7" className="in w" maxLength={819} placeholder="vip, dhaka" value={draft.tags.join(", ")} onChange={e=>update("tags",e.target.value.trim()?e.target.value.split(",").map(v=>v.trim()):[])}/></div>
     {data.can_contact&&<div className="fld"><label htmlFor="crm-field-8">{t("Notes","নোট")}</label><textarea id="crm-field-8" className="in w" rows={3} maxLength={4000} value={draft.notes??""} onChange={e=>update("notes",e.target.value)}/></div>}
     {data.can_contact&&<label className="fld" style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={draft.preferences?.do_not_contact??false} onChange={e=>update("preferences",{marketing:draft.preferences?.marketing??"unknown",do_not_contact:e.target.checked})}/>{t("Do not contact","যোগাযোগ করবেন না")}</label>}
    </fieldset>}
   </form>}
   {tab==="orders"&&detail&&<Orders h={h} id={detail.customer.id!} threads={(detail.sources??[]).filter(x=>x.kind==="thread").map(x=>x.source_id)}/>}
   {tab==="followups"&&detail&&<Followups h={h} detail={detail}/>}
   {tab==="activity"&&detail&&<Activity h={h} detail={detail}/>}
  </>}
 </RefModal>;
}

function Followups({h,detail}:{h:H;detail:Detail}){
 const {t,bn,busy,dirty,act,data}=h;
 const [due,setDue]=useState(""),[body,setBody]=useState(""),[kind,setKind]=useState("reminder"),[quiet,setQuiet]=useState(false),[quietStart,setQuietStart]=useState("22:00"),[quietEnd,setQuietEnd]=useState("08:00");
 const can=Boolean(data?.can_manage);
 const label=(s:string)=>({scheduled:t("Scheduled","নির্ধারিত"),done:t("Done","সম্পন্ন"),skipped:t("Skipped","এড়ানো"),cancelled:t("Cancelled","বাতিল")} as Record<string,string>)[s]??s;
 return <>
  {detail.followups.length===0?<p className="mut">{t("No follow-ups yet.","এখনো কোনো ফলো-আপ নেই।")}</p>:detail.followups.map(f=><div key={f.id} className="drawer-group">
   <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><b>{when(f.due_at,bn)}</b><span className={`pill ${f.status==="done"?"green":f.status==="scheduled"?"orange":""}`}>{label(f.status)}</span></div>
   <p>{f.body}</p>
   {can&&f.status==="scheduled"&&<div style={{display:"flex",gap:8,marginTop:8}}><button type="button" className="ib pri" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"done"})}>{t("Done","সম্পন্ন")}</button><button type="button" className="ib" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"skipped"})}>{t("Skip","এড়ান")}</button></div>}
  </div>)}
  {can&&<form className="drawer-group" onSubmit={e=>{e.preventDefault();void act("followup",{due_at:new Date(due).toISOString(),time_zone:"Asia/Dhaka",body,kind,quiet_start:quiet?quietStart:"",quiet_end:quiet?quietEnd:""}).then(r=>{if(r){setBody("");setDue("");}});}}>
   <h4>{t("New follow-up","নতুন ফলো-আপ")}</h4>
   <div className="fld"><label htmlFor="crm-field-9">{t("When","কখন")}</label><input id="crm-field-9" className="in w" required type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></div>
   <div className="fld"><label htmlFor="crm-field-10">{t("What to do","কী করতে হবে")}</label><textarea id="crm-field-10" className="in w" required rows={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></div>
   <div className="fld"><label htmlFor="crm-reminder-kind">{t("Reminder kind","ধরন")}</label><select id="crm-reminder-kind" className="in w" value={kind} onChange={e=>setKind(e.target.value)}><option value="reminder">{t("Reminder","মনে করানো")}</option><option value="offer">{t("Offer","অফার")}</option></select></div>
   <label className="fld"><input type="checkbox" checked={quiet} onChange={e=>setQuiet(e.target.checked)}/>{t("Respect quiet hours","নীরব সময় মানুন")}</label>
   {quiet&&<div className="f2"><div className="fld"><label htmlFor="crm-quiet-start">{t("Quiet hours start","নীরব সময় শুরু")}</label><input id="crm-quiet-start" className="in w" type="time" required value={quietStart} onChange={e=>setQuietStart(e.target.value)}/></div><div className="fld"><label htmlFor="crm-quiet-end">{t("Quiet hours end","নীরব সময় শেষ")}</label><input id="crm-quiet-end" className="in w" type="time" required value={quietEnd} onChange={e=>setQuietEnd(e.target.value)}/></div></div>}
   <div className="fld"><button type="submit" className="ib pri" disabled={busy||dirty}>{t("Add","যোগ করুন")}</button></div>
  </form>}
 </>;
}

function Activity({h,detail}:{h:H;detail:Detail}){
 const {t,bn,busy,dirty}=h;
 const [page,setPage]=useState(0);
 const go=async(p:number)=>{setPage(p);await h.open(detail.customer.id!,p,"activity");};
 return <>
  {detail.events.length===0?<p className="mut">{t("No activity yet.","এখনো কোনো কার্যক্রম নেই।")}</p>:detail.events.slice(0,50).map(e=><p key={e.sequence} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid var(--line)"}}><span>{e.action}</span><span className="mut">{when(e.created_at,bn)}</span></p>)}
  <div style={{display:"flex",gap:8,marginTop:14}}><button type="button" className="ib" disabled={busy||dirty||page===0} onClick={()=>void go(Math.max(0,page-50))}>{t("Newer","নতুন")}</button><button type="button" className="ib" disabled={busy||dirty||detail.events.length<51} onClick={()=>void go(page+50)}>{t("Older","পুরোনো")}</button></div>
 </>;
}

const money=(minor:number,bn:boolean)=>"৳"+new Intl.NumberFormat(bn?"bn-BD":"en-GB").format(Math.round(minor/100));
const STATUS:Record<string,[string,string]>={draft:["Draft","খসড়া"],hold:["On hold","স্থগিত"],confirmed:["Confirmed","নিশ্চিত"],packed:["Packed","প্যাক"],shipped:["Shipped","পাঠানো"],delivered:["Delivered","পৌঁছেছে"],cancelled:["Cancelled","বাতিল"],returned:["Returned","ফেরত"]};

const PAY:Record<string,[string,string,string]>={verified:["Payment verified","পেমেন্ট যাচাইকৃত","green"],claimed:["Payment claimed","পেমেন্টের দাবি","orange"],cod:["Cash on delivery","ক্যাশ অন ডেলিভারি","blue"],awaiting:["Awaiting payment","পেমেন্টের অপেক্ষা",""],failed:["Payment failed","পেমেন্ট ব্যর্থ","red"]};
const CHANNEL:Record<string,string>={messenger:"Messenger",instagram:"Instagram",whatsapp:"WhatsApp",telegram:"Telegram",website:"Website chat"};
function Orders({h,id,threads}:{h:H;id:string;threads:string[]}){
 const {t,bn,loadOrders}=h;
 const [state,setState]=useState<{id:string;data:CustomerOrders|null}|null>(null);
 const [view,setView]=useState<"orders"|"products">("orders");
 useEffect(()=>{let live=true;void loadOrders(id).then(d=>{if(live)setState({id,data:d});});return()=>{live=false;};},[id,loadOrders]);
 if(!state||state.id!==id)return <div className="empty" role="status">{t("Loading…","লোড হচ্ছে…")}</div>;
 if(!state.data)return <p className="notice ref-errors" role="alert">{t("Orders could not be loaded.","অর্ডার আনা যায়নি।")}</p>;
 const {orders,numbers,stats,risk,channels=[],products=[],merge_suggestions=[]}=state.data;
 const placed=orders.filter(o=>o.status!=="draft");
 const total=placed.filter(o=>!["cancelled","returned"].includes(o.status)).reduce((a,o)=>a+o.total_minor,0);
 const bad=(stats?.cancelled??0)+(stats?.returned??0),rate=placed.length?Math.round(bad*100/placed.length):0;
 const average=placed.length?total/Math.max(1,placed.length-bad):0;
 return <>
  {risk&&risk.level!=="none"&&<p className="notice ref-errors" role="status"><span className="pill red">{t("Risk","ঝুঁকি")}</span>{" "}
   {risk.reasons.map(r=>r==="many_cancelled_or_returned"?t("Many cancelled or returned orders","অনেক অর্ডার বাতিল বা ফেরত"):r==="failed_payment_claims"?t("Several payment claims did not match","কয়েকটি পেমেন্টের দাবি মেলেনি"):r).join(" · ")}</p>}
  <div className="drawer-group">
   <p><b>{placed.length}</b> {t("orders","অর্ডার")} · <b>{money(total,bn)}</b> {t("bought","কেনা")} · {t("average","গড়")} {money(average,bn)}</p>
   {stats&&<p className="mut">{t("Delivered","ডেলিভারি")} {stats.delivered} · {t("Cancelled","বাতিল")} {stats.cancelled} · {t("Returned","ফেরত")} {stats.returned} · {t("cancel + return rate","বাতিল + ফেরতের হার")} {rate}%</p>}
   {orders[0]&&<p className="mut">{t("Last order","শেষ অর্ডার")} {when(orders[0].created_at,bn)}{channels.length?" · "+channels.map(c=>CHANNEL[c]??c).join(", "):""}</p>}
   {threads.length>0&&<p>{threads.slice(0,3).map((th,i)=><a key={th} className="ib" style={{marginRight:6}} href={"/inbox?thread="+th}>{threads.length>1?t("Open chat","চ্যাট খুলুন")+" "+(i+1):t("Open chat","চ্যাট খুলুন")}</a>)}</p>}
  </div>
  {merge_suggestions.length>0&&<div className="drawer-group"><h4>{t("Possible duplicates (same phone)","সম্ভাব্য একই গ্রাহক (একই ফোন)")}</h4>
   {merge_suggestions.map(m=><p key={m.id}><button type="button" className="ib" onClick={()=>void h.open(m.id)}>{m.name}</button></p>)}
   <p className="mut">{t("Nothing is merged automatically.","নিজে থেকে কিছু একত্র করা হয় না।")}</p></div>}
  {orders.length===0?<p className="mut">{t("No orders yet.","এখনো কোনো অর্ডার নেই।")}</p>:<>
  <div className="seg" role="tablist" style={{margin:"4px 0 12px"}}>{([["orders",t("Orders","অর্ডার")],["products",t("Products bought","কেনা পণ্য")]] as const).map(([v,l])=>
   <button key={v} type="button" role="tab" aria-selected={view===v} className={view===v?"on":""} onClick={()=>setView(v)}>{l}</button>)}</div>
  {view==="products"?(products.length===0?<p className="mut">{t("No completed purchases yet.","এখনো কোনো সম্পন্ন কেনাকাটা নেই।")}</p>
   :products.map(p=><div key={p.sku+p.name} className="drawer-group"><div style={{display:"flex",justifyContent:"space-between",gap:8}}><b>{p.name}</b><span className="mut">×{p.quantity}</span></div>
     <p className="mut">{p.orders} {t("orders","অর্ডার")} · {t("last","শেষ")} {when(p.last_at,bn)}</p></div>))
  :orders.map(o=>{const c=o.claimed_payment??{},has=Boolean(c.method||c.payer_phone||c.trx_id),pay=o.payment_state&&o.payment_state!=="none"?PAY[o.payment_state]:undefined;return <div key={o.id} className="drawer-group">
   <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><b>{o.reference.startsWith("INBOX-")?when(o.created_at,bn):o.reference}</b><span className="pill">{(STATUS[o.status]??[o.status,o.status])[bn?1:0]}</span></div>
   <p>{o.summary?o.summary.split("\n").slice(1).join(" ")||o.summary:"—"}</p>
   <p><b>{money(o.total_minor,bn)}</b>{pay?<> · <span className={"pill "+pay[2]}>{bn?pay[1]:pay[0]}</span></>:o.paid_verified&&<> · <span className="pill green">{t("Payment verified","পেমেন্ট যাচাইকৃত")}</span></>}</p>
   {has&&!o.paid_verified&&<p className="mut">{t("Customer said","গ্রাহক বলেছেন")}: {[c.method,c.payer_phone,c.trx_id&&"TrxID "+c.trx_id].filter(Boolean).join(" · ")} <span className="pill orange">{t("Not verified","যাচাই হয়নি")}</span></p>}
   <p><a href={"/orders?order="+o.id} className="mut">{t("Open order","অর্ডার খুলুন")}</a></p>
  </div>;})}
  {view==="orders"&&numbers.length>0&&<div className="drawer-group"><h4>{t("Numbers used","ব্যবহৃত নম্বর")}</h4>{numbers.map(n=><p key={n.value} className="mono">{n.value} <span className="mut">×{n.count}</span></p>)}</div>}
  </>}
 </>;
}
