"use client";
import "./crm.css";
import {useCallback,useEffect,useRef,useState} from "react";
import {IntegrationEmpty,IntegrationIntro} from "../integration-ui";
import {crmPageCsv} from "../../lib/crm-csv";
import {CustomerDrawer} from "./customer-drawer";
import {initials,stageClass,stageText,STAGES,tempText,useCrm,type CRMList,type Profile} from "./use-crm";

type H=ReturnType<typeof useCrm>;
type Props={workspaceId:string;actorId:string;bn:boolean;view:string;embedded?:boolean;financeEnabled:boolean;environment:"live"|"sandbox";initial:CRMList|null};

export function CrmApp(p:Props){
 const first=p.view==="follow-ups"?"due":p.view==="interest"?"unconverted":p.view==="leads"?"new":"";
 const h=useCrm({workspaceId:p.workspaceId,actorId:p.actorId,environment:p.environment,initial:p.view==="leads"?null:p.initial,bn:p.bn,initialFilter:first});
 const {t,data}=h;
 const titles:Record<string,[string,string,string,string]>={
  "":["Customers","গ্রাহক","Everyone who messaged you, ordered or paid, in one list.","যারা মেসেজ করেছেন, অর্ডার করেছেন বা পেমেন্ট করেছেন, সবাই একটি তালিকায়।"],
  leads:["Leads","লিড","People who have not bought yet. Move them along as the conversation goes.","যারা এখনো কেনেননি। কথাবার্তা এগোলে ধাপ বদলান।"],
  "follow-ups":["Follow-ups","ফলো-আপ","Customers whose reminder is due. Open one to finish it.","যাদের অনুস্মারকের সময় হয়েছে। শেষ করতে খুলুন।"],
  interest:["Interested, no order yet","আগ্রহী, অর্ডার হয়নি","Qualified or proposal-stage leads with no active order.","যোগ্য বা প্রস্তাব ধাপের লিড, যাদের চলমান অর্ডার নেই।"]};
 const [ti,tb,de,db]=titles[p.view]??titles[""];
 const exportCsv=()=>{if(!data?.can_export)return;const url=URL.createObjectURL(new Blob([crmPageCsv(data.items,data.members)],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`customers-page-${Math.floor(h.f.offset/50)+1}.csv`;a.click();URL.revokeObjectURL(url);};
 const importFinance=async()=>{const r=await h.command("finance-import",{cursor:""});if(r)h.setMessage(t(`Imported ${r.imported??0} new profiles.${r.next_cursor?" More are available; run Import again.":""}`,`নতুন ${r.imported??0}টি প্রোফাইল আনা হয়েছে।${r.next_cursor?" আরও আছে; আবার Import চালান।":""}`));};
 return <section className="int-workspace crm" aria-busy={h.loading}>
  {p.embedded?<h2 style={{margin:0,fontSize:18}}>{t(ti,tb)}</h2>:<IntegrationIntro icon="activity" title={t(ti,tb)} description={t(de,db)}>
   <div className="int-actions">
    {data?.can_export&&p.view!=="leads"&&<button type="button" disabled={h.busy} onClick={exportCsv}>{t("Export page","এই পাতা এক্সপোর্ট")}</button>}
    {p.financeEnabled&&data?.can_contact&&p.view===""&&<button type="button" disabled={h.busy||h.unconfirmed} onClick={()=>void importFinance()}>{t("Import payers","পেয়ার আনুন")}</button>}
    {data?.can_manage&&<button type="button" className="int-primary" disabled={h.busy||h.unconfirmed} onClick={()=>h.startNew(data.can_contact)}>{t("New customer","নতুন গ্রাহক")}</button>}
   </div></IntegrationIntro>}
  {h.error&&!h.draft&&<p className="int-feedback int-error" role="alert">{h.error}</p>}
  {h.message&&!h.draft&&<p className="int-feedback" role="status">{h.message}</p>}
  {h.unconfirmed&&!h.draft&&<p className="int-feedback">{t("An action is not confirmed yet.","একটি কাজ এখনো নিশ্চিত হয়নি।")} <button type="button" disabled={h.busy} onClick={()=>void h.retry()}>{t("Retry","আবার চেষ্টা")}</button></p>}
  {!data&&!h.loading&&!h.error&&<IntegrationEmpty title={t("Customers are unavailable","গ্রাহকের তালিকা পাওয়া যাচ্ছে না")} description={t("You may not have access, or the service is busy. Try again in a moment.","আপনার অনুমতি নাও থাকতে পারে, অথবা সেবা ব্যস্ত। একটু পরে আবার চেষ্টা করুন।")}><button type="button" onClick={()=>void h.refresh()}>{t("Try again","আবার চেষ্টা করুন")}</button></IntegrationEmpty>}
  {p.view==="leads"?<LeadBoard h={h}/>:p.view==="follow-ups"?<DueList h={h}/>:<Directory h={h} view={p.view}/>}
  <CustomerDrawer h={h}/>
 </section>;
}

function Filters({h,view,stage=true}:{h:H;view:string;stage?:boolean}){
 const {t,bn,data,f,set}=h;
 return <div className="crm-bar">
  <label>{t("Search","খুঁজুন")}<input aria-label={t("Search customers","গ্রাহক খুঁজুন")} placeholder={t("Name, phone or email","নাম, ফোন বা ইমেইল")} maxLength={100} value={f.q} onChange={e=>set({q:e.target.value})}/></label>
  {stage&&view!=="interest"&&<label>{t("Stage","ধাপ")}<select value={f.filter} onChange={e=>set({filter:e.target.value})}><option value="">{t("All","সব")}</option>{STAGES.map(s=><option key={s} value={s}>{stageText(s,bn)}</option>)}<option value="due">{t("Follow-up due","ফলো-আপ বাকি")}</option></select></label>}
  <label>{t("Priority","গুরুত্ব")}<select value={f.priority} onChange={e=>set({priority:e.target.value})}><option value="">{t("Any","যেকোনো")}</option>{["hot","warm","cold"].map(v=><option key={v} value={v}>{tempText(v,bn)}</option>)}</select></label>
  <label>{t("Source","উৎস")}<select value={f.source} onChange={e=>set({source:e.target.value})}>{([["",t("Any","যেকোনো")],["thread",t("Chat","চ্যাট")],["finance-customer",t("Payer","পেয়ার")],["order",t("Order","অর্ডার")],["invoice",t("Invoice","ইনভয়েস")],["payment",t("Payment","পেমেন্ট")],["api","API"]] as const).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  {data?.can_manage&&<label>{t("Assigned to","দায়িত্বে")}<select value={f.assignee} onChange={e=>set({assignee:e.target.value})}><option value="">{t("Anyone","যে কেউ")}</option><option value="unassigned">{t("Unassigned","কেউ না")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
 </div>;
}

function Who({c,sub,bn}:{c:Profile;sub:string;bn:boolean}){void bn;return <div className="crm-who"><span className="crm-av" aria-hidden="true">{initials(c.name)}</span><span style={{minWidth:0}}><b>{c.name}</b>{sub&&<small>{sub}</small>}</span></div>;}

function Directory({h,view}:{h:H;view:string}){
 const {t,bn,data,loading,f}=h;
 const rows=data?.items.slice(0,50)??[];
 const member=(id:string|null)=>id?data?.members.find(m=>m.id===id)?.name??"—":"—";
 const filtered=Boolean(f.q||f.source||f.priority||f.assignee||(f.filter&&view===""));
 return <>
  <Filters h={h} view={view}/>
  {data&&<div className="crm-card">
   {rows.length>0&&<div style={{overflowX:"auto"}}><table className="crm-table"><thead><tr><th>{t("Customer","গ্রাহক")}</th><th>{t("Stage","ধাপ")}</th><th className="crm-hide-md">{t("Priority","গুরুত্ব")}</th><th className="crm-hide-md">{t("Tags","ট্যাগ")}</th>{data.can_manage&&<th className="crm-hide-md">{t("Assigned to","দায়িত্বে")}</th>}</tr></thead>
    <tbody>{rows.map(c=><tr key={c.id} tabIndex={0} onClick={()=>void h.open(c.id!)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void h.open(c.id!);}}}>
     <td><Who c={c} bn={bn} sub={data.can_contact?(c.phone||c.email||""):""}/></td>
     <td><span className={stageClass(c.stage)}>{stageText(c.stage,bn)}</span></td>
     <td className="crm-hide-md"><span className={`crm-dot ${c.temperature}`}/>{tempText(c.temperature,bn)}</td>
     <td className="crm-hide-md"><span className="crm-tags">{c.tags.slice(0,3).map(x=><span key={x} className="crm-tag">{x}</span>)}{c.tags.length>3&&<span className="crm-tag">+{c.tags.length-3}</span>}</span></td>
     {data.can_manage&&<td className="crm-hide-md">{member(c.assignee)}</td>}
    </tr>)}</tbody></table></div>}
   {rows.length===0&&!loading&&<div style={{padding:24}}><IntegrationEmpty title={filtered?t("No customers match","কোনো গ্রাহক মেলেনি"):t("No customers yet","এখনো কোনো গ্রাহক নেই")} description={filtered?t("Try a different search or clear a filter.","অন্য শব্দ দিন বা কোনো ফিল্টার সরান।"):t("People appear here when they message you, order or pay. You can also add one by hand.","কেউ মেসেজ করলে, অর্ডার করলে বা পেমেন্ট করলে এখানে আসবে। হাতেও যোগ করতে পারেন।")}>{!filtered&&data.can_manage&&<button type="button" className="int-primary" onClick={()=>h.startNew(data.can_contact)}>{t("Add a customer","গ্রাহক যোগ করুন")}</button>}</IntegrationEmpty></div>}
   {loading&&rows.length===0&&<><div className="crm-skel"/><div className="crm-skel"/><div className="crm-skel"/></>}
   <Pager h={h} count={data.items.length}/>
  </div>}
 </>;
}

function Pager({h,count}:{h:H;count:number}){
 const {t,loading,f,set}=h;const shown=Math.min(count,50);
 return <div className="crm-foot"><span>{shown>0?`${f.offset+1}–${f.offset+shown}`:"0"}</span><span className="int-actions">
  <button type="button" disabled={loading||f.offset===0} onClick={()=>set({offset:Math.max(0,f.offset-50)})}>{t("Previous","আগের")}</button>
  <button type="button" disabled={loading||count<51} onClick={()=>set({offset:f.offset+50})}>{t("Next","পরের")}</button></span></div>;
}

function DueList({h}:{h:H}){
 const {t,bn,data,loading,f}=h;
 const rows=data?.items.slice(0,50)??[];
 const filtered=Boolean(f.q||f.source||f.priority||f.assignee);
 return <>
  <Filters h={h} view="follow-ups" stage={false}/>
  {data&&<div className="crm-card">
   {rows.map(c=><div key={c.id} className="crm-due">
    <Who c={c} bn={bn} sub={data.can_contact?(c.phone||c.email||""):""}/>
    <span className="int-actions"><span className={stageClass(c.stage)}>{stageText(c.stage,bn)}</span><button type="button" className="int-primary" onClick={()=>void h.open(c.id!,0,"followups")}>{t("Open follow-up","ফলো-আপ খুলুন")}</button></span>
   </div>)}
   {rows.length===0&&!loading&&<div style={{padding:24}}><IntegrationEmpty title={filtered?t("No customers match","কোনো গ্রাহক মেলেনি"):t("Nothing is due","কোনো ফলো-আপ বাকি নেই")} description={filtered?t("Try a different search or clear a filter.","অন্য শব্দ দিন বা কোনো ফিল্টার সরান।"):t("Reminders you set on a customer show up here when they are due.","গ্রাহকের জন্য দেওয়া অনুস্মারকের সময় হলে এখানে দেখাবে।")}/></div>}
   {loading&&rows.length===0&&<><div className="crm-skel"/><div className="crm-skel"/></>}
   <Pager h={h} count={data.items.length}/>
  </div>}
 </>;
}

const BOARD=["new","contacted","qualified","proposal"] as const;
function LeadBoard({h}:{h:H}){
 const {t,bn,data,f,request}=h;
 const [cols,setCols]=useState<Record<string,Profile[]>|null>(null),[failed,setFailed]=useState(false);
 const fr=useRef(f);useEffect(()=>{fr.current=f;});
 const load=useCallback(async(signal?:AbortSignal)=>{
  const x=fr.current;
  try{const r=await Promise.all(BOARD.map(s=>request(undefined,0,signal,{...x,filter:s,offset:0}) as Promise<CRMList>));
   if(signal?.aborted)return;setCols(Object.fromEntries(BOARD.map((s,i)=>[s,r[i].items.slice(0,50)])));setFailed(false);}
  catch{if(!signal?.aborted)setFailed(true);}
 },[request]);
 useEffect(()=>{const c=new AbortController();const id=setTimeout(()=>void load(c.signal),f.q?250:0);return()=>{c.abort();clearTimeout(id);};},[load,data,f.q,f.priority,f.source,f.assignee]);
 return <>
  <Filters h={h} view="leads" stage={false}/>
  {failed&&<p className="int-feedback int-error" role="alert">{t("The board could not be loaded.","বোর্ড আনা যায়নি।")} <button type="button" onClick={()=>void load()}>{t("Try again","আবার চেষ্টা করুন")}</button></p>}
  {!cols&&!failed&&<div className="crm-board">{BOARD.map(s=><div key={s} className="crm-col"><div className="crm-skel"/><div className="crm-skel"/></div>)}</div>}
  {cols&&<div className="crm-board">{BOARD.map(s=><section key={s} className="crm-col" aria-label={stageText(s,bn)}>
   <header><span>{stageText(s,bn)}</span><span>{cols[s].length}{cols[s].length>=50?"+":""}</span></header>
   {cols[s].map(c=><article key={c.id} className="crm-lead" tabIndex={0} onClick={()=>void h.open(c.id!)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();void h.open(c.id!);}}}>
    <Who c={c} bn={bn} sub={data?.can_contact?(c.phone||c.email||""):""}/>
    <span><span className={`crm-dot ${c.temperature}`}/>{tempText(c.temperature,bn)}</span>
    {data?.can_manage&&<select aria-label={t("Move to","সরান")} value={c.stage} disabled={h.busy} onClick={e=>e.stopPropagation()} onChange={e=>void h.moveStage(c,e.target.value)}>{STAGES.map(x=><option key={x} value={x}>{stageText(x,bn)}</option>)}</select>}
   </article>)}
   {cols[s].length===0&&<p className="crm-empty-col">{t("No one here","এখানে কেউ নেই")}</p>}
  </section>)}</div>}
 </>;
}
