"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {initials,stageClass,stageText,STAGES,tempText,type Detail} from "./use-crm";
import type {useCrm} from "./use-crm";

type H=ReturnType<typeof useCrm>;
const when=(iso:string,tz:string,bn:boolean)=>{const d=new Date(iso);if(Number.isNaN(d.valueOf()))return "—";try{return new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:tz||"Asia/Dhaka"}).format(d);}catch{return d.toLocaleString();}};

export function CustomerDrawer({h}:{h:H}){
 const {t,bn,data,detail,draft,dirty,busy,unconfirmed,tab,setTab,update}=h;
 const ref=useRef<HTMLElement>(null);
 const closed=draft===null;
 useEffect(()=>{ref.current?.focus();},[closed]);
 if(!draft||!data)return null;
 const canManage=data.can_manage,isNew=!detail,locked=!canManage||busy;
 const dead=Boolean(draft.deleted_at||draft.merged_into);
 return <div className="crm-wrap" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();h.close();}}}>
  <div className="crm-scrim" onClick={()=>h.close()}/>
  <aside ref={ref} tabIndex={-1} className="crm-drawer" role="dialog" aria-modal="true" aria-label={draft.name||t("New customer","নতুন গ্রাহক")}>
   <div className="crm-dh"><span className="crm-av lg" aria-hidden="true">{initials(draft.name||"?")}</span><h2>{draft.name||t("New customer","নতুন গ্রাহক")}</h2>{!isNew&&<span className={stageClass(draft.stage)}>{stageText(draft.stage,bn)}</span>}<button type="button" className="x" aria-label={t("Close","বন্ধ করুন")} onClick={()=>h.close()}>×</button></div>
   {detail&&<div className="int-tabs crm-dtabs" role="tablist">{([["profile",t("Profile","প্রোফাইল")],["followups",`${t("Follow-ups","ফলো-আপ")}${detail.followups.filter(x=>x.status==="scheduled").length?` (${detail.followups.filter(x=>x.status==="scheduled").length})`:""}`],["activity",t("Activity","কার্যক্রম")]] as const).map(([v,l])=><button key={v} type="button" role="tab" aria-selected={tab===v} onClick={()=>setTab(v)}>{l}</button>)}</div>}
   {h.error&&<p className="int-feedback int-error" role="alert" style={{margin:"8px 24px 0"}}>{h.error}</p>}
   {h.unconfirmed&&<p className="int-feedback" style={{margin:"8px 24px 0"}}>{t("An action is not confirmed yet.","একটি কাজ এখনো নিশ্চিত হয়নি।")} <button type="button" disabled={busy} onClick={()=>void h.retry()}>{t("Retry","আবার চেষ্টা")}</button></p>}
   {tab==="profile"&&<>
    <form id="crm-profile" className="crm-db" onSubmit={e=>{e.preventDefault();void h.save();}}>
     {dead?<p className="int-feedback">{draft.deleted_at?t("Personal data was deleted from this profile. Payment records are kept separately.","এই প্রোফাইলের ব্যক্তিগত তথ্য মুছে ফেলা হয়েছে। পেমেন্ট রেকর্ড আলাদাভাবে থাকে।"):<>{t("This profile was merged into another one.","এই প্রোফাইল অন্য একটিতে মিশে গেছে।")} <button type="button" onClick={()=>void h.open(draft.merged_into!)}>{t("Open it","খুলুন")}</button></>}</p>:<fieldset disabled={locked} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:22}}>
      <section className="crm-sec"><h3>{t("Basics","মূল তথ্য")}</h3>
       <label>{t("Name","নাম")}<input required maxLength={160} value={draft.name} onChange={e=>update("name",e.target.value)}/></label>
       <div className="int-form-grid">
        <label>{t("Stage","ধাপ")}<select value={draft.stage} onChange={e=>update("stage",e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{stageText(s,bn)}</option>)}</select></label>
        <label>{t("Priority","গুরুত্ব")}<select value={draft.temperature} onChange={e=>update("temperature",e.target.value)}>{["hot","warm","cold"].map(s=><option key={s} value={s}>{tempText(s,bn)}</option>)}</select></label>
       </div>
       {canManage&&<label>{t("Assigned to","দায়িত্বে")}<select value={draft.assignee??""} onChange={e=>{update("assignee",e.target.value||null);update("assigned",Boolean(e.target.value));}}><option value="">{t("Unassigned","কেউ না")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
       <label>{t("Tags","ট্যাগ")}<input maxLength={819} placeholder={t("vip, dhaka","যেমন: vip, dhaka")} value={draft.tags.join(", ")} onChange={e=>update("tags",e.target.value.trim()?e.target.value.split(",").map(v=>v.trim()):[])}/></label>
      </section>
      {data.can_contact&&<section className="crm-sec"><h3>{t("Contact","যোগাযোগ")}</h3>
       <div className="int-form-grid">
        <label>{t("Phone","ফোন")}<input maxLength={16} inputMode="tel" value={draft.phone??""} onChange={e=>update("phone",e.target.value)}/></label>
        <label>{t("Email","ইমেইল")}<input type="email" maxLength={254} value={draft.email??""} onChange={e=>update("email",e.target.value)}/></label>
       </div>
       <p className="crm-note">{t("Contact details you type are not verified. A phone number never becomes a payer by itself.","আপনার লেখা ফোন বা ইমেইল যাচাইকৃত নয়। শুধু ফোন নম্বর দিয়ে কেউ payer হয়ে যায় না।")}</p>
       <label>{t("Marketing messages","প্রচারণার বার্তা")}<select value={draft.preferences?.marketing??"unknown"} onChange={e=>update("preferences",{marketing:e.target.value,do_not_contact:draft.preferences?.do_not_contact??false})}>{([["unknown",t("Not asked","জিজ্ঞাসা করা হয়নি")],["opted-in",t("Agreed","সম্মত")],["opted-out",t("Declined","অসম্মত")]] as const).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
       <label className="crm-check"><input type="checkbox" checked={draft.preferences?.do_not_contact??false} onChange={e=>update("preferences",{marketing:draft.preferences?.marketing??"unknown",do_not_contact:e.target.checked})}/>{t("Do not contact this customer","এই গ্রাহককে যোগাযোগ করবেন না")}</label>
      </section>}
      {data.can_contact&&<section className="crm-sec"><h3>{t("Notes","নোট")}</h3>
       <label>{t("Internal notes","অভ্যন্তরীণ নোট")}<textarea rows={3} maxLength={4000} value={draft.notes??""} onChange={e=>update("notes",e.target.value)}/></label>
       <label>{t("Why qualified, or why lost","কেন যোগ্য, বা কেন হারানো")}<textarea rows={2} maxLength={500} value={draft.reason??""} onChange={e=>update("reason",e.target.value)}/></label>
      </section>}
      {!data.can_contact&&<p className="crm-note">{t("Private contact details and notes are hidden for your role.","আপনার ভূমিকার জন্য ব্যক্তিগত যোগাযোগ ও নোট লুকানো।")}</p>}
     </fieldset>}
     {detail&&!dead&&<ProfileExtras h={h} detail={detail}/>}
    </form>
    {canManage&&!dead&&<div className="crm-df"><button type="submit" form="crm-profile" className="int-primary" disabled={busy||!dirty||unconfirmed}>{isNew?t("Create customer","গ্রাহক তৈরি করুন"):t("Save changes","পরিবর্তন সংরক্ষণ")}</button><button type="button" disabled={busy} onClick={()=>{if(isNew){h.close();}else{h.open(draft.id!);}}}>{dirty?t("Discard","বাতিল"):t("Close","বন্ধ করুন")}</button></div>}
   </>}
   {tab==="followups"&&detail&&<FollowupsTab h={h} detail={detail}/>}
   {tab==="activity"&&detail&&<ActivityTab h={h} detail={detail}/>}
  </aside>
 </div>;
}

function ProfileExtras({h,detail}:{h:H;detail:Detail}){
 const {t,data,busy,dirty,act}=h;
 const [ok,setOk]=useState(false),[consent,setConsent]=useState(false),[target,setTarget]=useState(""),[kind,setKind]=useState("finance-customer"),[sid,setSid]=useState("");
 if(!data)return null;
 const locked=busy||dirty;
 return <>
  <section className="crm-sec"><h3>{t("Linked records","যুক্ত রেকর্ড")}</h3>
   {detail.sources.length===0?<p className="crm-note">{t("No chats, orders or payments are linked yet.","এখনো কোনো চ্যাট, অর্ডার বা পেমেন্ট যুক্ত নেই।")}</p>:detail.sources.map(s=><div key={s.id} className="crm-row"><span><b style={{fontWeight:600}}>{({thread:t("Chat","চ্যাট"),order:t("Order","অর্ডার"),invoice:t("Invoice","ইনভয়েস"),payment:t("Payment","পেমেন্ট"),"finance-customer":t("Payer","পেয়ার"),api:"API"} as Record<string,string>)[s.kind]??s.kind}</b> <small style={{color:"var(--color-text-muted)"}}>{s.source_id.slice(0,8)}</small></span>{s.kind==="thread"&&<Link href={`/inbox?thread=${s.source_id}`}>{t("Open chat →","চ্যাট খুলুন →")}</Link>}</div>)}
  </section>
  {data.can_contact&&detail.can_manage&&<details className="crm-sec"><summary>{t("Identity and data tools","পরিচয় ও ডেটার কাজ")}</summary>
   <div style={{display:"grid",gap:14,marginTop:14}}>
    <p className="crm-note">{t("Merging needs two profiles with the same verified identity. Unlinking or disputing separates a record and stops contact. Payment records are never rewritten.","একত্র করতে দুই প্রোফাইলের একই যাচাইকৃত পরিচয় লাগবে। আলাদা বা আপত্তি করলে রেকর্ড আলাদা হয় ও যোগাযোগ বন্ধ থাকে। পেমেন্ট রেকর্ড বদলায় না।")}</p>
    <label className="crm-check"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/>{t("I checked and confirm this identity change or deletion.","আমি যাচাই করেছি এবং এই পরিবর্তন বা মুছে ফেলা নিশ্চিত করছি।")}</label>
    {detail.sources.length>0&&<div className="crm-sec"><h3>{t("Separate a record","রেকর্ড আলাদা করুন")}</h3>{detail.sources.map(s=><div key={s.id} className="crm-row"><span>{s.kind} · {s.source_id.slice(0,8)}</span><span style={{display:"flex",gap:8}}><button type="button" disabled={locked||!ok} onClick={()=>void act("unlink",{source:s.id,confirmed:ok})}>{t("Unlink","আলাদা করুন")}</button><button type="button" disabled={locked||!ok} onClick={()=>void act("dispute",{source:s.id,confirmed:ok})}>{t("Dispute","আপত্তি")}</button></span></div>)}</div>}
    <div className="crm-sec"><h3>{t("Merge with another profile","অন্য প্রোফাইলের সঙ্গে একত্র করুন")}</h3>
     <label>{t("Other profile","অন্য প্রোফাইল")}<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">{t("Choose…","বাছুন…")}</option>{data.items.filter(c=>c.id!==detail.customer.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
     <div><button type="button" disabled={locked||!ok||!target} onClick={()=>void act("merge",{target,confirmed:ok})}>{t("Merge verified profiles","যাচাইকৃত প্রোফাইল একত্র করুন")}</button></div></div>
    <div className="crm-sec"><h3>{t("Verify email","ইমেইল যাচাই")}</h3>
     <label className="crm-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t("The customer asked for verification at this address.","গ্রাহক এই ঠিকানায় যাচাই চেয়েছেন।")}</label>
     <div><button type="button" disabled={locked||!consent||!detail.customer.email} onClick={()=>void act("verify-email",{consented:consent})}>{t("Send verification email","যাচাইয়ের ইমেইল পাঠান")}</button></div>
     {detail.proofs.map(p=><p key={p.id} className="crm-note">{p.kind}: {p.value} · {p.revoked_at?t("Revoked","বাতিল"):t("Verified","যাচাইকৃত")}</p>)}</div>
    <div className="crm-sec"><h3>{t("Link a record","রেকর্ড যুক্ত করুন")}</h3>
     <div className="int-form-grid"><label>{t("Type","ধরন")}<select value={kind} onChange={e=>setKind(e.target.value)}>{["finance-customer","invoice","payment","order"].map(k=><option key={k} value={k}>{k}</option>)}</select></label><label>{t("Record ID","রেকর্ড ID")}<input value={sid} onChange={e=>setSid(e.target.value)}/></label></div>
     <div><button type="button" disabled={locked||!sid} onClick={()=>void act("link",{kind,source_id:sid})}>{t("Link record","রেকর্ড যুক্ত করুন")}</button></div></div>
    <div className="crm-sec"><h3 style={{color:"var(--color-danger,#b42318)"}}>{t("Delete personal data","ব্যক্তিগত তথ্য মুছুন")}</h3>
     <p className="crm-note">{t("Removes contacts, proofs, notes and reminder text from this profile. Chats and legally kept payment records follow their own rules.","এই প্রোফাইলের যোগাযোগ, প্রমাণ, নোট ও অনুস্মারক মুছে যাবে। চ্যাট ও আইনত রাখার পেমেন্ট রেকর্ড আলাদা নিয়মে থাকে।")}</p>
     <div><button type="button" disabled={locked||!ok} onClick={()=>void act("delete",{confirmed:ok})}>{t("Delete personal data","ব্যক্তিগত তথ্য মুছুন")}</button></div></div>
   </div></details>}
 </>;
}

function FollowupsTab({h,detail}:{h:H;detail:Detail}){
 const {t,bn,busy,dirty,act,data}=h;
 const [due,setDue]=useState(""),[body,setBody]=useState(""),[kind,setKind]=useState("reminder"),[quiet,setQuiet]=useState(false),[qs,setQs]=useState("22:00"),[qe,setQe]=useState("08:00"),[zone,setZone]=useState("Asia/Dhaka");
 const can=Boolean(data?.can_manage);
 const label=(s:string)=>({scheduled:t("Scheduled","নির্ধারিত"),done:t("Done","সম্পন্ন"),skipped:t("Skipped","এড়ানো"),cancelled:t("Cancelled","বাতিল")} as Record<string,string>)[s]??s;
 return <div className="crm-db">
  <section className="crm-sec"><h3>{t("Reminders for your team","আপনার টিমের অনুস্মারক")}</h3>
   <p className="crm-note">{t("These only remind your team. They never send a message to the customer.","এগুলো শুধু আপনার টিমকে মনে করায়। গ্রাহককে কোনো মেসেজ পাঠায় না।")}</p>
   {detail.followups.length===0?<p className="crm-note">{t("No reminders yet.","এখনো কোনো অনুস্মারক নেই।")}</p>:detail.followups.map(f=><div key={f.id} className="crm-fu">
    <div className="int-card-head"><b style={{fontWeight:600}}>{when(f.due_at,f.time_zone,bn)}</b><span className={`int-status${f.status==="done"?" int-status-active":f.status==="scheduled"?" int-status-pending":""}`}>{label(f.status)}</span></div>
    <p>{f.body}</p>
    {f.kind==="offer"&&<p className="crm-note">{t("Offer reminder","অফারের অনুস্মারক")}</p>}
    {f.requested_due_at&&f.requested_due_at!==f.due_at&&<p className="crm-note">{t("Moved out of quiet hours from","নীরব সময়ের বাইরে সরানো হয়েছে; আগের সময়")} {when(f.requested_due_at,f.time_zone,bn)}</p>}
    {can&&f.status==="scheduled"&&<div className="int-actions"><button type="button" className="int-primary" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"done"})}>{t("Mark done","সম্পন্ন করুন")}</button><button type="button" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"skipped"})}>{t("Skip","এড়িয়ে যান")}</button><button type="button" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"cancelled"})}>{t("Cancel","বাতিল")}</button></div>}
   </div>)}
  </section>
  {can&&<form className="crm-sec" onSubmit={e=>{e.preventDefault();void act("followup",{due_at:new Date(due).toISOString(),time_zone:zone,body,kind,quiet_start:quiet?qs:"",quiet_end:quiet?qe:""}).then(r=>{if(r){setBody("");setDue("");}});}}>
   <h3>{t("New reminder","নতুন অনুস্মারক")}</h3>
   <label>{t("When","কখন")}<input required type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
   <label>{t("What to do","কী করতে হবে")}<textarea required rows={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <details><summary>{t("More options","আরও অপশন")}</summary><div style={{display:"grid",gap:14,marginTop:14}}>
    <label>{t("Type","ধরন")}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="reminder">{t("Team reminder","টিমের অনুস্মারক")}</option><option value="offer">{t("Offer reminder","অফারের অনুস্মারক")}</option></select></label>
    <label>{t("Time zone","সময় অঞ্চল")}<input required value={zone} onChange={e=>setZone(e.target.value)}/></label>
    <label className="crm-check"><input type="checkbox" checked={quiet} onChange={e=>setQuiet(e.target.checked)}/>{t("Respect quiet hours","নীরব সময় মেনে চলুন")}</label>
    {quiet&&<div className="int-form-grid"><label>{t("Quiet from","নীরব শুরু")}<input required type="time" value={qs} onChange={e=>setQs(e.target.value)}/></label><label>{t("Quiet until","নীরব শেষ")}<input required type="time" value={qe} onChange={e=>setQe(e.target.value)}/></label></div>}
   </div></details>
   <div><button type="submit" className="int-primary" disabled={busy||dirty}>{t("Add reminder","অনুস্মারক যোগ করুন")}</button></div>
  </form>}
 </div>;
}

function ActivityTab({h,detail}:{h:H;detail:Detail}){
 const {t,bn,busy,dirty,endpoint,setError}=h;
 const [page,setPage]=useState(0);
 const go=async(p:number)=>{setPage(p);await h.open(detail.customer.id!,p,"activity");};
 async function exportProfile(){try{const r=await fetch(endpoint+"&customer="+detail.customer.id+"&format=export",{cache:"no-store"});if(!r.ok)throw Error();const url=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=url;a.download="customer.json";a.click();URL.revokeObjectURL(url);}catch{setError(t("Export is unavailable.","এক্সপোর্ট করা যায়নি।"));}}
 return <div className="crm-db">
  <section className="crm-sec"><h3>{t("History","ইতিহাস")}</h3>
   {detail.events.length===0?<p className="crm-note">{t("No activity yet.","এখনো কোনো কার্যক্রম নেই।")}</p>:detail.events.slice(0,50).map(e=><div key={e.sequence} className="crm-row"><span>{e.action}</span><small style={{color:"var(--color-text-muted)"}}>{new Date(e.created_at).toLocaleString(bn?"bn-BD":"en-GB")}</small></div>)}
   <div className="int-actions"><button type="button" disabled={busy||dirty||page===0} onClick={()=>void go(Math.max(0,page-50))}>{t("Newer","নতুন")}</button><button type="button" disabled={busy||dirty||detail.events.length<51||page>=10000} onClick={()=>void go(page+50)}>{t("Older","পুরোনো")}</button>{detail.can_export&&<button type="button" disabled={busy||dirty} onClick={()=>void exportProfile()}>{t("Export profile","প্রোফাইল এক্সপোর্ট")}</button>}</div>
  </section>
 </div>;
}
