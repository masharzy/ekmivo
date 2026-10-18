"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {managePaymentPlan} from "../actions/payment-plans";
import {planName,type AdminPaymentPlan,type PlanTerms} from "../lib/payment-plans";

type Locale="bn"|"en";
type Effective={active?:boolean;terms?:PlanTerms;access_until?:string;next_version_id?:string;extra_payments?:number};
type WorkspacePlan={effective?:Effective;subscription?:unknown;history?:Array<{id:string;action:string;reason:string;created_at:string}>;override?:unknown;usage?:{used:number;reserved:number};usage_error?:boolean};
export function AdminWorkspacePlanPanel({locale,workspaceId,workspaceName,plans}:{locale:Locale;workspaceId:string;workspaceName:string;plans:AdminPaymentPlan[]}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 const [data,setData]=useState<WorkspacePlan|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const [version,setVersion]=useState(""),[until,setUntil]=useState(""),[forever,setForever]=useState(false),[reason,setReason]=useState(""),[extra,setExtra]=useState(0);
 const reload=useCallback(async()=>{
  setBusy(true);setError("");
  try{
   const result=await managePaymentPlan("workspace",{workspace_id:workspaceId,reason:"View workspace subscription"});
   if(!result.ok||!result.data)throw Error(result.code);
   let next=result.data as WorkspacePlan;
   try{
    const r=await fetch("/api/go/platform/workspaces/"+workspaceId+"/payment-usage",{cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error("usage");
    const usage=await r.json();
    next={...next,usage:usage.usage,usage_error:usage.usage_error};
   }catch{next={...next,usage_error:true};}
   setData(next);
  }catch(e){setError(t("Unable to read this workspace subscription.","এই ওয়ার্কস্পেসের সাবস্ক্রিপশন পাওয়া যায়নি।")+" "+(e instanceof Error?e.message:""));}
  finally{setBusy(false)}
 },[workspaceId,bn]);
 useEffect(()=>{void Promise.resolve().then(()=>reload());},[reload]);
 async function mutate(op:string,payload:Record<string,unknown>){
  if(reason.trim().length<5){setError(t("Enter an audit reason (at least 5 characters).","Audit-এর কারণ কমপক্ষে ৫ অক্ষরে লিখুন।"));return;}
  setBusy(true);setError("");
  try{
   const result=await managePaymentPlan(op,{workspace_id:workspaceId,...payload,reason});
   if(!result.ok)throw Error(result.code);
   setOpen(false);setReason("");
   await reload();
  }catch(e){setError(t("Change was not saved: ","পরিবর্তন সংরক্ষিত হয়নি: ")+(e instanceof Error?e.message:""));}
  finally{setBusy(false)}
 }
 const eff=data?.effective;
 const chosen=plans.find(p=>p.current_version===version);
 const money=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(n/100);
 const date=(s:string|undefined)=>!s?"—":s==="infinity"?t("No expiry","মেয়াদহীন"):new Date(s).toLocaleDateString(bn?"bn-BD":"en-GB");
 return <div className="pa-workspace-plan">
  <div className="pa-page-head"><div><h2>{t("Payment plan","পেমেন্ট প্ল্যান")}</h2><p>{workspaceName}</p></div><div className="pa-page-actions"><button className="pa-button" onClick={()=>void reload()} disabled={busy}>{t("Refresh","রিফ্রেশ")}</button><button className="pa-button pa-button-primary" onClick={()=>setOpen(true)} disabled={busy}>{t("Manage subscription","সাবস্ক্রিপশন পরিচালনা")}</button></div></div>
  {error&&<p role="alert" className="pa-action-error">{error}</p>}
  <div className="pa-workspace-plan-metrics">
   <div><span>{t("Current plan","বর্তমান প্ল্যান")}</span><strong>{eff?.terms?planName(eff.terms,bn):busy?t("Loading…","লোড হচ্ছে…"):"—"}</strong></div>
   <div><span>{t("Access","অ্যাক্সেস")}</span><strong>{eff?.active?t("Active","সক্রিয়"):t("Inactive","নিষ্ক্রিয়")}</strong></div>
   <div><span>{t("Access until","মেয়াদ")}</span><strong>{date(eff?.access_until)}</strong></div>
   <div><span>{t("Payment allowance","পেমেন্ট সীমা")}</span><strong>{eff?.terms?.payment_limit===null?t("Unlimited","সীমাহীন"):eff?.terms?.payment_limit?.toLocaleString()??"—"}</strong></div>
  </div>
  <section className="pa-surface pa-description"><h2>{t("Entitlements & usage","সুবিধা ও ব্যবহার")}</h2>
   <div className="pa-workspace-plan-usage">
    <div><span>{t("Confirmed payments","নিশ্চিত পেমেন্ট")}</span><strong>{data?.usage?data.usage.used.toLocaleString():"—"}</strong></div>
    <div><span>{t("Reserved","সংরক্ষিত")}</span><strong>{data?.usage?data.usage.reserved.toLocaleString():"—"}</strong></div>
    <div><span>{t("Extra allowance","অতিরিক্ত সীমা")}</span><strong>{eff?.extra_payments??0}</strong></div>
   </div>
   {data?.usage_error&&<p className="pa-subtle" role="status">{t("Usage service unavailable; no zero usage is assumed.","ব্যবহারের তথ্য পাওয়া যায়নি; শূন্য ধরে নেওয়া হচ্ছে না।")}</p>}
   {eff?.next_version_id&&<p className="pa-subtle">{t("A plan change is scheduled for renewal.","নবায়নের জন্য একটি প্ল্যান পরিবর্তন নির্ধারিত আছে।")}</p>}
  </section>
  <section className="pa-surface pa-table-card"><div className="pa-workspace-plan-subhead"><h2>{t("Subscription history","সাবস্ক্রিপশন ইতিহাস")}</h2></div>
   <div className="pa-table-wrap"><table><thead><tr><th>{t("Action","কাজ")}</th><th>{t("Date","তারিখ")}</th><th>{t("Audit reason","Audit-এর কারণ")}</th></tr></thead><tbody>{(data?.history||[]).map(x=><tr key={x.id}><td>{x.action}</td><td>{date(x.created_at)}</td><td>{x.reason}</td></tr>)}{!data?.history?.length&&<tr><td colSpan={3}>{t("No changes recorded.","কোনো পরিবর্তন নেই।")}</td></tr>}</tbody></table></div>
  </section>
  {open&&<div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="pa-dialog pa-workspace-sub-modal" role="dialog" aria-modal="true" aria-label={t("Manage subscription","সাবস্ক্রিপশন পরিচালনা")}>
   <div className="pa-dialog-head"><h2>{t("Manage subscription","সাবস্ক্রিপশন পরিচালনা")}</h2><button type="button" className="pa-icon-button" aria-label={t("Close","বন্ধ")} onClick={()=>setOpen(false)}>×</button></div>
   <div className="pa-dialog-body pa-admin-fields">
    <label>{t("Published plan version","প্রকাশিত প্ল্যান version")}<select value={version} onChange={e=>{setVersion(e.target.value);setForever(false)}}><option value="">{t("Choose plan","প্ল্যান নির্বাচন")}</option>{plans.filter(p=>p.status==="published").map(p=><option key={p.plan_id} value={p.current_version}>{planName(p.terms,bn)} · v{p.version} · {p.terms.kind==="paid"?money(p.terms.amount_minor):p.terms.kind}</option>)}</select></label>
    {chosen?.terms.kind==="free"&&<label className="pa-workspace-check"><input type="checkbox" checked={forever} onChange={e=>setForever(e.target.checked)}/>{t("No expiry for free plan","ফ্রি প্ল্যানের মেয়াদহীন অ্যাক্সেস")}</label>}
    {!forever&&<label>{t("Access expires","অ্যাক্সেসের মেয়াদ")}<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>}
    <label>{t("Audit reason","Audit-এর কারণ")}<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={500} required/></label>
    <div className="pa-workspace-plan-actions">
     <button className="pa-button pa-button-primary" disabled={busy||!version||(!forever&&!until)} onClick={()=>{if(!window.confirm(t("Apply this grant? A manual grant does not record payment.","Grant প্রয়োগ করবেন? ম্যানুয়াল grant পেমেন্ট রেকর্ড করে না।")))return;void mutate("assign",{version_id:version,until_at:forever?"forever":new Date(until).toISOString()})}}>{t("Apply plan","প্ল্যান প্রয়োগ")}</button>
     <button className="pa-button" disabled={busy||!version||!data?.subscription||chosen?.terms.kind!=="paid"} onClick={()=>void mutate("schedule",{version_id:version})}>{t("Schedule at renewal","নবায়নে নির্ধারণ")}</button>
    </div>
    <div className="pa-workspace-plan-usage">
      <label>{t("Temporary extra payments","সাময়িক অতিরিক্ত পেমেন্ট")}<input type="number" min={0} max={1000000000} value={extra} onChange={e=>setExtra(Number(e.target.value))}/></label>
      <button className="pa-button" disabled={busy||!until||forever} onClick={()=>void mutate("override",{extra_payments:extra,until_at:new Date(until).toISOString()})}>{t("Save allowance","সীমা সংরক্ষণ")}</button>
    </div>
    <div className="pa-workspace-plan-actions">
     {eff?.next_version_id&&<button className="pa-button" disabled={busy} onClick={()=>void mutate("clear_schedule",{})}>{t("Cancel scheduled change","পরবর্তী পরিবর্তন বাতিল")}</button>}
     {eff?.active&&<button className="pa-button pa-workspace-danger" disabled={busy} onClick={()=>{if(window.confirm(t("End this subscription now? Existing records will be preserved.","সাবস্ক্রিপশন এখন শেষ করবেন? পুরোনো রেকর্ড থাকবে।")))void mutate("expire",{})}}>{t("End access","অ্যাক্সেস শেষ")}</button>}
    </div>
    <p className="pa-subtle">{t("Changes require a Super Admin and recent MFA. Existing paid records remain intact.","পরিবর্তনে Super Admin এবং সাম্প্রতিক MFA প্রয়োজন। আগের পেমেন্ট রেকর্ড অক্ষত থাকবে।")}</p>
   </div><div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={()=>setOpen(false)}>{t("Close","বন্ধ")}</button><Link href={"/"+locale+"/admin/plans"} className="pa-button">{t("View plan catalog","প্ল্যান তালিকা")}</Link></div>
  </section></div>}
 </div>;
}
