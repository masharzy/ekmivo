"use client";
import {RefIcon} from "../reference-ui";
import {crmPageCsv} from "../../lib/crm-csv";
import {CustomerDrawer,looksLikeId} from "./customer-drawer";
import {stageText,STAGES,useCrm,type CRMList,type Profile} from "./use-crm";

type Props={workspaceId:string;actorId:string;bn:boolean;view:string;embedded?:boolean;financeEnabled:boolean;ordersEnabled?:boolean;environment:"live"|"sandbox";initial:CRMList|null};
const LEAD_STAGES=["new","contacted","qualified","proposal"] as const;
const pill=(s:string)=>`pill ${s==="won"?"green":s==="lost"?"red":s==="qualified"||s==="proposal"||s==="contacted"?"orange":""}`;

export function CrmApp(p:Props){
 const leads=p.view==="leads",due=p.view==="follow-ups";
 const h=useCrm({workspaceId:p.workspaceId,actorId:p.actorId,environment:p.environment,initial:leads?null:p.initial,bn:p.bn,ordersEnabled:p.ordersEnabled,initialFilter:due?"due":p.view==="interest"?"unconverted":leads?"new":""});
 const {t,bn,data,f,set,loading,stats}=h;
 const oe=Boolean(p.ordersEnabled);
 const money=(m:number)=>"৳"+new Intl.NumberFormat(bn?"bn-BD":"en-GB").format(Math.round(m/100));
 const day=(v?:string|null)=>v?new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium"}).format(new Date(v)):"—";
 const title=leads?t("Leads","লিড"):due?t("Follow-ups","ফলো-আপ"):p.view==="interest"?t("Interested, no order yet","আগ্রহী, অর্ডার হয়নি"):t("Customers","গ্রাহক");
 const sub=leads?t("People who have not bought yet.","যারা এখনো কেনেননি।"):due?t("Customers with a follow-up due.","যাদের ফলো-আপের সময় হয়েছে।"):t("Everyone who messaged, ordered or paid.","যারা মেসেজ, অর্ডার বা পেমেন্ট করেছেন।");
 const rows=data?.items.slice(0,50)??[];
 const member=(id:string|null)=>id?data?.members.find(m=>m.id===id)?.name??"—":"—";
 const exportCsv=()=>{if(!data?.can_export)return;const url=URL.createObjectURL(new Blob([crmPageCsv(data.items,data.members)],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="customers.csv";a.click();URL.revokeObjectURL(url);};
 const importFinance=async()=>{const r=await h.command("finance-import",{cursor:""});if(r)h.setMessage(t(`Imported ${r.imported??0} new profiles.${r.next_cursor?" Run Import again for more.":""}`,`নতুন ${r.imported??0}টি প্রোফাইল আনা হয়েছে।${r.next_cursor?" আরও আছে, আবার চালান।":""}`));};
 const name=(c:Profile)=>looksLikeId(c.name)?t("Unnamed customer","নামহীন গ্রাহক"):c.name;
 const filtered=Boolean(f.q||f.assignee||(!leads&&!due&&f.filter));
 return <div className="ref-dashboard"><div className="ref-page" aria-busy={loading}>
  {!p.embedded&&<div className="top"><h1>{title}</h1><div className="acts">
   {data?.can_export&&!leads&&<button type="button" className="ib" disabled={h.busy} onClick={exportCsv}><RefIcon name="download"/>{t("Export","এক্সপোর্ট")}</button>}
   {p.financeEnabled&&data?.can_contact&&p.view===""&&<button type="button" className="ib" disabled={h.busy||h.unconfirmed} onClick={()=>void importFinance()}>{t("Import payers","পেয়ার আনুন")}</button>}
   {data?.can_manage&&<button type="button" className="ib pri" disabled={h.busy||h.unconfirmed} onClick={()=>h.startNew(data.can_contact)}><RefIcon name="plus"/>{t("Add customer","গ্রাহক যোগ")}</button>}
  </div><p>{sub}</p></div>}
  {h.error&&!h.draft&&<div className="notice ref-errors" role="alert">{h.error}<button type="button" className="ib" onClick={()=>void h.refresh()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {h.message&&!h.draft&&<p className="notice" role="status" data-feedback="success">{h.message}</p>}
  {h.unconfirmed&&!h.draft&&<div className="notice">{t("An action is not confirmed yet.","একটি কাজ এখনো নিশ্চিত হয়নি।")}<button type="button" className="ib" disabled={h.busy} onClick={()=>void h.retry()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  <div className="card">
   <div className="toolbar">
    <input className="in searchbox" aria-label={t("Search","খুঁজুন")} placeholder={t("Search customers…","গ্রাহক খুঁজুন…")} maxLength={100} value={f.q} onChange={e=>set({q:e.target.value})}/>
    {leads?<div className="seg">{LEAD_STAGES.map(s=><button key={s} type="button" className={f.filter===s?"on":""} onClick={()=>set({filter:s})}>{stageText(s,bn)}</button>)}</div>
     :!due&&p.view!=="interest"&&<select className="in" aria-label={t("Stage","ধাপ")} value={f.filter} onChange={e=>set({filter:e.target.value})}><option value="">{t("All stages","সব ধাপ")}</option>{STAGES.map(s=><option key={s} value={s}>{stageText(s,bn)}</option>)}</select>}
    {data?.can_manage&&<select className="in" aria-label={t("Assigned to","দায়িত্বে")} value={f.assignee} onChange={e=>set({assignee:e.target.value})}><option value="">{t("Anyone","যে কেউ")}</option><option value="unassigned">{t("Unassigned","কেউ না")}</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
    <div className="sp"/><button type="button" className="ib i" aria-label={t("Refresh","রিফ্রেশ")} disabled={loading} onClick={()=>void h.refresh()}><RefIcon name="refresh"/></button>
   </div>
   {data&&rows.length>0&&<div className="tw" role="region" aria-label={title} tabIndex={0}><table><thead><tr><th>{t("Customer","গ্রাহক")}</th><th>{t("Stage","ধাপ")}</th>{oe&&<><th className="num">{t("Orders","অর্ডার")}</th><th className="num">{t("Total","মোট")}</th><th>{t("Last order","শেষ অর্ডার")}</th></>}<th>{t("Tags","ট্যাগ")}</th>{data.can_manage&&<th>{t("Assigned to","দায়িত্বে")}</th>}<th/></tr></thead><tbody>
    {rows.map(c=><tr className="rowclick" key={c.id} tabIndex={0} onClick={()=>void h.open(c.id!,0,due?"followups":undefined)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();void h.open(c.id!,0,due?"followups":undefined);}}}>
     <td><span className="itemtitle">{name(c)}</span>{data.can_contact&&(c.phone||c.email)&&<span className="rmeta">{c.phone||c.email}</span>}</td>
     <td><span className={pill(c.stage)}>{stageText(c.stage,bn)}</span></td>
     {oe&&<><td className="num">{stats[c.id!]?.orders??0}</td><td className="num">{stats[c.id!]?money(stats[c.id!].total_minor):"—"}</td><td className="mut">{day(stats[c.id!]?.last_at)}</td></>}
     <td className="mut">{c.tags.length?c.tags.slice(0,3).join(", ")+(c.tags.length>3?` +${c.tags.length-3}`:""):"—"}</td>
     {data.can_manage&&<td className="mut">{member(c.assignee)}</td>}
     <td className="num"><RefIcon name="chevron"/></td>
    </tr>)}</tbody></table></div>}
   {!data&&!loading&&<div className="table-empty"><b>{t("Customers are unavailable","গ্রাহকের তালিকা পাওয়া যাচ্ছে না")}</b><p>{t("You may not have access, or the service is busy.","আপনার অনুমতি নাও থাকতে পারে, অথবা সেবা ব্যস্ত।")}</p></div>}
   {loading&&rows.length===0&&<div className="empty" role="status">{t("Loading…","লোড হচ্ছে…")}</div>}
   {data&&!loading&&rows.length===0&&<div className="table-empty"><b>{filtered?t("No customers match.","কোনো গ্রাহক মেলেনি।"):due?t("Nothing is due.","কোনো ফলো-আপ বাকি নেই।"):t("No customers yet.","এখনো কোনো গ্রাহক নেই।")}</b><p>{filtered?t("Try another search.","অন্যভাবে খুঁজুন।"):t("People appear here when they message, order or pay.","কেউ মেসেজ, অর্ডার বা পেমেন্ট করলে এখানে আসবে।")}</p></div>}
   {data&&(f.offset>0||data.items.length>50)&&<div className="toolbar-note"><button type="button" className="ib" disabled={loading||f.offset===0} onClick={()=>set({offset:Math.max(0,f.offset-50)})}>{t("Previous","আগের")}</button> <button type="button" className="ib" disabled={loading||data.items.length<51} onClick={()=>set({offset:f.offset+50})}>{t("Next","পরের")}</button></div>}
  </div>
  <CustomerDrawer h={h}/>
 </div></div>;
}
