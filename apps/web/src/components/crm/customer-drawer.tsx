"use client";
import {useState} from "react";
import {RefModal} from "../reference-ui";
import {STAGES,stageText,tempText,type Detail,type useCrm} from "./use-crm";

type H=ReturnType<typeof useCrm>;
const when=(iso:string,bn:boolean)=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?"—":new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(d);};
export const looksLikeId=(s:string)=>!s.trim()||/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s.trim())||/^\d{12,}$/.test(s.trim());

export function CustomerDrawer({h}:{h:H}){
 const {t,bn,data,detail,draft,dirty,busy,unconfirmed,tab,setTab,update}=h;
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
   {detail&&<div className="seg" role="tablist" style={{marginBottom:16}}>{([["profile",t("Profile","প্রোফাইল")],["followups",t("Follow-ups","ফলো-আপ")+(count?` · ${count}`:"")],["activity",t("Activity","কার্যক্রম")]] as const).map(([v,l])=><button key={v} type="button" role="tab" aria-selected={tab===v} className={tab===v?"on":""} onClick={()=>setTab(v)}>{l}</button>)}</div>}
   {h.error&&<p className="notice ref-errors" role="alert">{h.error}</p>}
   {unconfirmed&&<p className="notice">{t("An action is not confirmed yet.","একটি কাজ এখনো নিশ্চিত হয়নি।")} <button type="button" className="ib" disabled={busy} onClick={()=>void h.retry()}>{t("Retry","আবার চেষ্টা")}</button></p>}
   {tab==="profile"&&<form id="crm-profile" onSubmit={e=>{e.preventDefault();void h.save();}}>
    {dead?<p className="mut">{draft.deleted_at?t("Personal data was deleted from this profile.","এই প্রোফাইলের ব্যক্তিগত তথ্য মুছে ফেলা হয়েছে।"):t("This profile was merged into another one.","এই প্রোফাইল অন্যটির সঙ্গে একত্র করা হয়েছে।")}</p>:<fieldset disabled={!can||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <div className="fld"><label>{t("Name","নাম")}</label><input className="in w" required maxLength={160} value={looksLikeId(draft.name)?"":draft.name} placeholder={t("Customer name","গ্রাহকের নাম")} onChange={e=>update("name",e.target.value)}/></div>
     {data.can_contact&&<div className="f2" style={{marginTop:13}}><div className="fld"><label>{t("Phone","ফোন")}</label><input className="in w" maxLength={16} inputMode="tel" value={draft.phone??""} onChange={e=>update("phone",e.target.value)}/></div><div className="fld"><label>{t("Email","ইমেইল")}</label><input className="in w" type="email" maxLength={254} value={draft.email??""} onChange={e=>update("email",e.target.value)}/></div></div>}
     <div className="f2" style={{marginTop:13}}><div className="fld"><label>{t("Stage","ধাপ")}</label><select className="in w" value={draft.stage} onChange={e=>update("stage",e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{stageText(s,bn)}</option>)}</select></div><div className="fld"><label>{t("Priority","গুরুত্ব")}</label><select className="in w" value={draft.temperature} onChange={e=>update("temperature",e.target.value)}>{["hot","warm","cold"].map(s=><option key={s} value={s}>{tempText(s,bn)}</option>)}</select></div></div>
     {can&&<div className="fld"><label>{t("Assigned to","দায়িত্বে")}</label><select className="in w" value={draft.assignee??""} onChange={e=>{update("assignee",e.target.value||null);update("assigned",Boolean(e.target.value));}}><option value="">{t("Unassigned","কেউ না")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
     <div className="fld"><label>{t("Tags","ট্যাগ")}</label><input className="in w" maxLength={819} placeholder="vip, dhaka" value={draft.tags.join(", ")} onChange={e=>update("tags",e.target.value.trim()?e.target.value.split(",").map(v=>v.trim()):[])}/></div>
     {data.can_contact&&<div className="fld"><label>{t("Notes","নোট")}</label><textarea className="in w" rows={3} maxLength={4000} value={draft.notes??""} onChange={e=>update("notes",e.target.value)}/></div>}
     {data.can_contact&&<label className="fld" style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={draft.preferences?.do_not_contact??false} onChange={e=>update("preferences",{marketing:draft.preferences?.marketing??"unknown",do_not_contact:e.target.checked})}/>{t("Do not contact","যোগাযোগ করবেন না")}</label>}
    </fieldset>}
   </form>}
   {tab==="followups"&&detail&&<Followups h={h} detail={detail}/>}
   {tab==="activity"&&detail&&<Activity h={h} detail={detail}/>}
  </>}
 </RefModal>;
}

function Followups({h,detail}:{h:H;detail:Detail}){
 const {t,bn,busy,dirty,act,data}=h;
 const [due,setDue]=useState(""),[body,setBody]=useState("");
 const can=Boolean(data?.can_manage);
 const label=(s:string)=>({scheduled:t("Scheduled","নির্ধারিত"),done:t("Done","সম্পন্ন"),skipped:t("Skipped","এড়ানো"),cancelled:t("Cancelled","বাতিল")} as Record<string,string>)[s]??s;
 return <>
  {detail.followups.length===0?<p className="mut">{t("No follow-ups yet.","এখনো কোনো ফলো-আপ নেই।")}</p>:detail.followups.map(f=><div key={f.id} className="drawer-group">
   <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><b>{when(f.due_at,bn)}</b><span className={`pill ${f.status==="done"?"green":f.status==="scheduled"?"orange":""}`}>{label(f.status)}</span></div>
   <p>{f.body}</p>
   {can&&f.status==="scheduled"&&<div style={{display:"flex",gap:8,marginTop:8}}><button type="button" className="ib pri" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"done"})}>{t("Done","সম্পন্ন")}</button><button type="button" className="ib" disabled={busy||dirty} onClick={()=>void act("followup-status",{followup_id:f.id,status:"skipped"})}>{t("Skip","এড়ান")}</button></div>}
  </div>)}
  {can&&<form className="drawer-group" onSubmit={e=>{e.preventDefault();void act("followup",{due_at:new Date(due).toISOString(),time_zone:"Asia/Dhaka",body,kind:"reminder",quiet_start:"",quiet_end:""}).then(r=>{if(r){setBody("");setDue("");}});}}>
   <h4>{t("New follow-up","নতুন ফলো-আপ")}</h4>
   <div className="fld"><label>{t("When","কখন")}</label><input className="in w" required type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></div>
   <div className="fld"><label>{t("What to do","কী করতে হবে")}</label><textarea className="in w" required rows={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></div>
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
