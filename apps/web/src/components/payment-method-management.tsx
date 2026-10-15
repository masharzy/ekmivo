"use client";
import Link from "next/link";
import {DashboardConfirmDialog} from "./dashboard-confirm-dialog";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type Phone={id:string;name:string;claimed_at?:string|null;revoked_at?:string|null;heartbeat_at?:string|null;bindings:{id:string;account_id:string;source:string;binding:string}[]};
const methodName:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
export function PaymentMethodManagement({locale,workspaceId,environment,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean}){
 const bn=locale==="bn";const t=useCallback((e:string,b:string)=>bn?b:e,[bn]);
 const base="/api/go/workspaces/"+workspaceId,href="/"+locale+"/w/"+workspaceId+"/payments/devices?env="+environment;
 const [accounts,setAccounts]=useState<Account[]>([]),[phones,setPhones]=useState<Phone[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const createDialog=useRef<HTMLDialogElement|null>(null);
 const editDialog=useRef<HTMLDialogElement|null>(null);
 const [method,setMethod]=useState("bkash"),[number,setNumber]=useState(""),[label,setLabel]=useState("");
 const [edited,setEdited]=useState<string|null>(null),[newLabel,setNewLabel]=useState(""),[newNumber,setNewNumber]=useState("");
 const [confirmAccount,setConfirmAccount]=useState<Account|null>(null);
 useEffect(()=>{const dialog=editDialog.current;if(!dialog)return;if(edited&&!dialog.open)dialog.showModal();else if(!edited&&dialog.open)dialog.close()},[edited]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{const response=await fetch(base+"/phones?environment="+environment,{cache:"no-store",signal});
   if(response.status===403)throw Error(t("You need owner/admin payment management access to see full receiving numbers.","সম্পূর্ণ গ্রহণকারী নম্বর দেখতে owner/admin permission প্রয়োজন।"));
   if(!response.ok)throw Error(t("Receiving-account service is unavailable. Configure financial databases and receipt pipeline first.","Receiving-account service প্রস্তুত নয়। Financial database ও receipt pipeline সেটআপ করুন।"));
   const data=await response.json();if(!signal?.aborted){setAccounts(data.accounts||[]);setPhones(data.items||[])}
  }catch(e){if(!signal?.aborted)setError(String(e))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,t]);
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)void load(c.signal)});return()=>c.abort()},[load]);
 async function post(path:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(base+path+(path.includes("?")?"":"?environment="+environment),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json();if(!response.ok)throw Error(data.error?.code||data.code||response.status);
   await load();setNotice(t("Saved. Link a phone once; payment verification remains server-controlled.","সংরক্ষিত। একটি ফোন pair করুন; payment verification server-এ থাকবে।"));
   return data;
  }catch(e){setError(t("Change not saved: ","পরিবর্তন সংরক্ষিত হয়নি: ")+String(e));return null}
  finally{setBusy(false)}
 }
 async function create(){
  if(!/^(\+?880|0)1[0-9]{9}$/.test(number)){setError(t("Enter a complete Bangladesh mobile number.","বাংলাদেশের সম্পূর্ণ মোবাইল নম্বর দিন।"));return}
  const data=await post("/operations/gateways",{method,account_number:number});
  if(!data)return;
  const accountId=data.id||data.account_id;
  if(label.trim()&&accountId)await post("/phones/"+accountId+"/edit-account",{label:label.trim()});
  setNumber("");setLabel("");createDialog.current?.close();
 }
 const paired=phones.filter(p=>p.claimed_at&&!p.revoked_at);
 return <section className="pg-phone-panel" aria-busy={loading||busy}>
  <div className="pg-phone-hero"><h1>{t("Payment Methods","পেমেন্ট মাধ্যম")}</h1><div className="pg-phone-header-actions">{canManage&&<button type="button" className="pg-phone-primary" onClick={()=>createDialog.current?.showModal()}>{t("+ Add Receiving Account","+ রিসিভিং অ্যাকাউন্ট যোগ করুন")}</button>}<button type="button" onClick={()=>void load()} disabled={loading||busy}>{t("Refresh","রিফ্রেশ")}</button></div></div>
  {error&&<div className="pg-phone-warning" role="alert"><strong>{t("Connection needs attention","সংযোগে সমস্যা")}</strong><p>{error}</p><button onClick={()=>void load()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p data-feedback="success" role="status" className="pg-phone-notice">{notice}</p>}
  {loading?<div className="pg-phone-placeholder" role="status">{t("Loading receiving accounts…","Receiving account লোড হচ্ছে…")}</div>:<>
   <div className="pg-method-grid">
    {accounts.map(a=>{return <article className="pg-method-card" key={a.ID}>
     <div className="pg-method-header"><div className="pg-method-symbol" aria-hidden="true"><span>{(methodName[a.Method]||a.Method).slice(0,1).toUpperCase()}</span></div><span className="pg-method-status">{a.Disabled?t("Disabled","বন্ধ"):paired.length===0?t("Phone needed","ফোন যুক্ত করুন"):t("SMS collection · verification pending","SMS সংগ্রহ · verification বাকি")}</span></div>
     <h3>{a.Label||methodName[a.Method]||a.Method}</h3>
     <div className="pg-method-number"><span>{a.Number}</span><button type="button" aria-label={t("Copy full receiving number","সম্পূর্ণ receiving number কপি")} onClick={()=>void navigator.clipboard.writeText(a.Number).then(()=>setNotice(t("Number copied","নম্বর কপি হয়েছে"))).catch(()=>setError(t("Copy failed","কপি হয়নি")))}>{t("Copy","কপি")}</button></div>
     <div className="pg-method-info"><span>{t("Paired SMS phones","Pair করা SMS ফোন")}</span><strong>{paired.length?paired.map(x=>x.name).join(", "):t("No phone paired","এখনো ফোন pair হয়নি")}</strong></div>

     <div className="pg-method-actions"><Link href={href}>{t("Manage connections","সংযোগ পরিচালনা")}</Link>
      {canManage&&<button type="button" onClick={()=>{setEdited(a.ID);setNewLabel(a.Label||"");setNewNumber(a.Number)}}>{t("Edit account","অ্যাকাউন্ট সম্পাদনা")}</button>}
      {canManage&&<button type="button" disabled={busy} onClick={()=>setConfirmAccount(a)}>{a.Disabled?t("Enable","চালু"):t("Disable","বন্ধ")}</button>}
     </div>

    </article>})}
    {!accounts.length&&!error&&<div className="pg-phone-empty"><h3>{t("No receiving accounts","এখনো receiving account নেই")}</h3><p>{t("Add a bKash, Nagad or Rocket receiving number to begin setup.","সেটআপের জন্য bKash, Nagad বা Rocket receiving number যোগ করুন।")}</p></div>}
   </div>
  </>}
  <DashboardConfirmDialog open={Boolean(confirmAccount)} title={confirmAccount?.Disabled?t("Enable account","অ্যাকাউন্ট চালু করুন"):t("Disable account","অ্যাকাউন্ট বন্ধ করুন")} message={confirmAccount?.Disabled?t("This receiving account will be available for payments.","এই অ্যাকাউন্টে পেমেন্ট গ্রহণ চালু হবে।"):t("New payments will no longer use this account.","নতুন পেমেন্টে এই অ্যাকাউন্ট ব্যবহার হবে না।")} confirmLabel={confirmAccount?.Disabled?t("Enable","চালু করুন"):t("Disable","বন্ধ করুন")} cancelLabel={t("Cancel","বাতিল")} disabled={busy} danger={!confirmAccount?.Disabled} onClose={()=>setConfirmAccount(null)} onConfirm={async()=>{if(confirmAccount)await post("/operations/gateways/"+confirmAccount.ID+"/"+(confirmAccount.Disabled?"enable":"disable"),{})}}/>
  <dialog ref={editDialog} className="pg-phone-dialog ekv2-account-dialog" aria-label={t("Edit account","অ্যাকাউন্ট সম্পাদনা")} onCancel={()=>setEdited(null)} onClose={()=>setEdited(null)} onClick={e=>{if(e.target===e.currentTarget)setEdited(null)}}>
  {edited&&accounts.filter(a=>a.ID===edited).map(a=><div key={a.ID}><div className="pg-phone-dialog-head"><h2>{t("Edit account","অ্যাকাউন্ট সম্পাদনা")}</h2><button type="button" onClick={()=>setEdited(null)} aria-label={t("Close","বন্ধ করুন")}>×</button></div>
  <form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void post("/phones/"+a.ID+"/edit-account",{label:newLabel,...(newNumber!==a.Number?{account_number:newNumber}:{})}).then(ok=>{if(ok)setEdited(null)})}}>
   <label>{t("Account name","অ্যাকাউন্টের নাম")}<input maxLength={100} value={newLabel} onChange={e=>setNewLabel(e.target.value)}/></label>
   <label>{t("Receiving number","রিসিভিং নম্বর")}<input type="tel" inputMode="tel" value={newNumber} onChange={e=>setNewNumber(e.target.value)}/></label>
   <div className="pg-phone-actions"><button type="button" onClick={()=>setEdited(null)}>{t("Cancel","বাতিল")}</button><button type="submit" className="pg-phone-primary" disabled={busy}>{t("Save changes","পরিবর্তন সংরক্ষণ")}</button></div>
  </form></div>)}
  </dialog>
  <dialog ref={createDialog} className="pg-phone-dialog" aria-labelledby="pg-add-account-title">
   <div className="pg-phone-dialog-head"><h2 id="pg-add-account-title">{t("Add Receiving Account","রিসিভিং অ্যাকাউন্ট যোগ করুন")}</h2><button type="button" onClick={()=>createDialog.current?.close()} aria-label={t("Close","বন্ধ করুন")}>×</button></div>
   <form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void create()}}>
    <label>{t("Payment method","পেমেন্ট মাধ্যম")}<select value={method} onChange={e=>setMethod(e.target.value)}>{Object.keys(methodName).map(m=><option key={m} value={m}>{methodName[m]}</option>)}</select></label>
    <label>{t("Receiving number","রিসিভিং নম্বর")}<input required type="tel" inputMode="tel" autoComplete="off" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+8801XXXXXXXXX"/></label>
    <label>{t("Account label (optional)","অ্যাকাউন্টের নাম (ঐচ্ছিক)")}<input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/></label>
    <div className="pg-phone-actions"><button type="button" onClick={()=>createDialog.current?.close()}>{t("Cancel","বাতিল")}</button><button type="submit" className="pg-phone-primary" disabled={busy||!number}>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button></div>
   </form>
  </dialog>
 </section>;
}
