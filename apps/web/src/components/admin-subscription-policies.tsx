"use client";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {createSubscriptionPolicy,transitionSubscriptionPolicy,type LegalActionState} from "../actions/admin-subscription-policies";

type Policy={id:string;kind:"terms"|"privacy"|"refund";version_label:string;url:string;content_sha256:string;status:"draft"|"published"|"archived";created_at:string;published_at:string|null;acceptances:number};
const idle:LegalActionState={status:"idle",message:""};
type Locale="bn"|"en";

function PolicyEditor({locale,onClose}:{locale:Locale;onClose:()=>void}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const router=useRouter(),[state,action,pending]=useActionState(createSubscriptionPolicy,idle);
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 return <div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="pa-dialog pa-admin-modal" role="dialog" aria-modal="true" aria-labelledby="pa-legal-edit-title"><div className="pa-dialog-head"><h2 id="pa-legal-edit-title">{t("Register policy version","পলিসির সংস্করণ যোগ করুন")}</h2><button className="pa-icon-button" type="button" aria-label="Close" onClick={onClose}>×</button></div>
   <form action={action}><div className="pa-dialog-body pa-admin-fields">
    <label>{t("Document","ডকুমেন্ট")}<select name="kind"><option value="terms">Terms of Service</option><option value="privacy">Privacy Policy</option><option value="refund">Refund Policy</option></select></label>
    <label>{t("Immutable version label","অপরিবর্তনযোগ্য সংস্করণ")}<input name="version_label" required maxLength={64} placeholder="2026-10-v1" pattern="[A-Za-z0-9][A-Za-z0-9._-]*"/></label>
    <label>{t("Approved public HTTPS URL","অনুমোদিত HTTPS লিংক")}<input name="url" type="url" required placeholder="https://ekmivo.com/terms"/></label>
    <label>{t("SHA-256 of approved document bytes","অনুমোদিত ডকুমেন্টের SHA-256")}<input name="content_sha256" minLength={64} maxLength={64} required pattern="[0-9a-fA-F]{64}" placeholder="64-character lowercase SHA-256"/></label>
    <label>{t("Audit reason","পরিবর্তনের কারণ")}<textarea name="reason" minLength={10} maxLength={500} required/></label>
    {state.status!=="idle"&&<p className={state.status==="error"?"pa-action-error":"pa-action-success"} role="status">{state.message}</p>}
    <p className="pa-subtle">{t("A SHA-256 is a fingerprint, not a legal review. Only approved documents may be published.","SHA-256 কেবল ফিঙ্গারপ্রিন্ট, আইনি অনুমোদন নয়। কেবল অনুমোদিত ডকুমেন্ট প্রকাশ করবেন।")}</p>
   </div><div className="pa-dialog-foot"><button className="pa-button" type="button" onClick={onClose}>{t("Cancel","বাতিল")}</button><button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save draft","ড্রাফট সংরক্ষণ")}</button></div></form>
  </div>
 </div>;
}

function PolicyAction({policy,locale}:{policy:Policy;locale:Locale}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const router=useRouter(),[state,action,pending]=useActionState(transitionSubscriptionPolicy,idle);
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 if(policy.status==="archived")return <span className="pa-subtle">—</span>;
 return <form action={action} className="pa-admin-coupon-transition">
  <input name="id" type="hidden" value={policy.id}/>
  <label className="pa-sr-only" htmlFor={`pa-legal-action-${policy.id}`}>{t("Action","অ্যাকশন")}</label>
  <select name="op" defaultValue={policy.status==="draft"?"publish":"archive"} id={`pa-legal-action-${policy.id}`}>
   {policy.status==="draft"&&<option value="publish">Publish</option>}<option value="archive">Archive</option>
  </select>
  <label className="pa-sr-only" htmlFor={`pa-legal-reason-${policy.id}`}>{t("Audit reason","কারণ")}</label>
  <input name="reason" id={`pa-legal-reason-${policy.id}`} required minLength={10} maxLength={500} placeholder={t("Approval / audit reason","অনুমোদন / কারণ")}/>
  <button type="submit" disabled={pending} className="pa-button">{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Apply","প্রয়োগ")}</button>
  {state.status!=="idle"&&<span role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</span>}
 </form>;
}

export function AdminSubscriptionPolicies({locale,policies}:{locale:Locale;policies:Policy[]}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;const [open,setOpen]=useState(false);
 const published=(kind:Policy["kind"])=>policies.some(p=>p.kind===kind&&p.status==="published");
 return <>
  <div className="pa-page-head"><div><h1>{t("Legal policy versions","আইনি পলিসির সংস্করণ")}</h1><p>{t("Immutable policies used for consent on Ekmivo's own subscription checkout.","Ekmivo সাবস্ক্রিপশন চেকআউটের সম্মতির জন্য অপরিবর্তনযোগ্য নথি।")}</p></div><button className="pa-button pa-button-primary" type="button" onClick={()=>setOpen(true)}>{t("New version","নতুন সংস্করণ")}</button></div>
  <section className="pa-surface pa-description"><h2>{t("Publication readiness","প্রকাশের প্রস্তুতি")}</h2><div className="pa-admin-legal-readiness">{(["terms","privacy","refund"] as const).map(kind=><span key={kind} className="pa-status-text">{kind}: {published(kind)?t("Published","প্রকাশিত"):t("Missing","অনুপস্থিত")}</span>)}</div><p className="pa-subtle">{t("All three must be published before a checkout can request legally versioned consent. Checkout payment remains disabled until server confirmation is implemented.","তিনটি প্রকাশিত পলিসি ছাড়া চেকআউটে সংস্করণভিত্তিক সম্মতি নেওয়া যাবে না। সার্ভার কনফার্মেশন সম্পূর্ণ না হওয়া পর্যন্ত পেমেন্ট বন্ধ থাকবে।")}</p></section>
  <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr><th>{t("Policy","পলিসি")}</th><th>{t("Version","সংস্করণ")}</th><th>{t("Status","অবস্থা")}</th><th>{t("Fingerprint","ফিঙ্গারপ্রিন্ট")}</th><th>{t("Acceptances","সম্মতি")}</th><th>{t("Manage","পরিচালনা")}</th></tr></thead><tbody>
   {policies.map(p=><tr key={p.id}><td className="pa-primary-cell">{p.kind}<small className="pa-subtle"><a href={p.url} target="_blank" rel="noopener noreferrer">{t("Open approved document","অনুমোদিত নথি দেখুন")}</a></small></td><td>{p.version_label}</td><td>{p.status}</td><td className="pa-mono" title={p.content_sha256}>{p.content_sha256.slice(0,12)}…</td><td>{p.acceptances}</td><td><PolicyAction policy={p} locale={locale}/></td></tr>)}
   {!policies.length&&<tr><td colSpan={6} className="pa-empty-row">{t("No policy versions have been registered.","কোনো পলিসির সংস্করণ যোগ করা হয়নি।")}</td></tr>}
  </tbody></table></div></section>
  {open&&<PolicyEditor locale={locale} onClose={()=>setOpen(false)}/>}
 </>;
}
