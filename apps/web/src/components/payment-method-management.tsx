"use client";
import {useDashboardInitialData} from "./dashboard-initial-data";
import Link from "next/link";
import {DashboardConfirmDialog} from "./dashboard-confirm-dialog";
import {DashboardIcon} from "./dashboard-icon";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type Phone={id:string;name:string;claimed_at?:string|null;revoked_at?:string|null;heartbeat_at?:string|null;bindings:{id:string;account_id:string;source:string;binding:string}[]};
const methodName:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
export function PaymentMethodManagement({locale,workspaceId,environment,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,bd:string)=>bn?bd:en,[bn]);
 const formattedAccount=(value:string)=>{const digits=value.replace(/\D/g,"");const local=digits.startsWith("880")?digits.slice(3):digits.startsWith("0")?digits.slice(1):digits;return local.length===10?"+880 "+local.slice(0,4)+" "+local.slice(4):value};
 const base="/api/go/workspaces/"+workspaceId,deviceHref="/"+locale+"/w/"+workspaceId+"/payments/devices?env="+environment;
 const seed=useDashboardInitialData<{accounts:Account[];items:Phone[]}>("phones");
 const [accounts,setAccounts]=useState<Account[]>(seed?.data?.accounts??[]),[phones,setPhones]=useState<Phone[]>(seed?.data?.items??[]),[loading,setLoading]=useState(!seed),[busy,setBusy]=useState(false),[error,setError]=useState(seed?.error??""),[notice,setNotice]=useState("");
 const createDialog=useRef<HTMLDialogElement>(null),editDialog=useRef<HTMLDialogElement>(null),detailsDialog=useRef<HTMLDialogElement>(null);
 const [method,setMethod]=useState("bkash"),[number,setNumber]=useState(""),[label,setLabel]=useState("");
 const [selected,setSelected]=useState<string|null>(null),[edited,setEdited]=useState<string|null>(null),[newLabel,setNewLabel]=useState(""),[newNumber,setNewNumber]=useState("");
 const [confirmAccount,setConfirmAccount]=useState<Account|null>(null);
 const current=accounts.find(account=>account.ID===selected)||null;
 const paired=phones.filter(phone=>phone.claimed_at&&!phone.revoked_at);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),2400);return()=>clearTimeout(timer)},[notice]);
 useEffect(()=>{const dialog=detailsDialog.current;if(!dialog)return;if(selected&&!dialog.open)dialog.showModal();else if(!selected&&dialog.open)dialog.close()},[selected]);
 useEffect(()=>{const dialog=editDialog.current;if(!dialog)return;if(edited&&!dialog.open)dialog.showModal();else if(!edited&&dialog.open)dialog.close()},[edited]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const response=await fetch(base+"/phones?environment="+environment,{cache:"no-store",signal});
   if(response.status===403)throw Error(t("You do not have permission to view receiving accounts.","রিসিভিং অ্যাকাউন্ট দেখার অনুমতি নেই।"));
   if(!response.ok)throw Error(t("Unable to load payment methods.","পেমেন্ট মাধ্যমের তথ্য পাওয়া যায়নি।"));
   const data=await response.json();
   if(!signal?.aborted){setAccounts(data.accounts||[]);setPhones(data.items||[])}
  }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:t("Unable to load payment methods.","পেমেন্ট মাধ্যমের তথ্য পাওয়া যায়নি।"))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,t]);
 useEffect(()=>{if(seed)return;const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)void load(controller.signal)});return()=>controller.abort()},[load,seed]);
 async function post(path:string,body:unknown){
  setBusy(true);setError("");
  try{
   const response=await fetch(base+path+(path.includes("?")?"":"?environment="+environment),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json();if(!response.ok)throw Error(data.error?.code||data.code||String(response.status));
   await load();setNotice(t("Saved","সংরক্ষিত"));return data;
  }catch{setError(t("Unable to save changes.","পরিবর্তন সংরক্ষণ করা যায়নি।"));return null}
  finally{setBusy(false)}
 }
 async function create(){
  if(!/^(\+?880|0)1[0-9]{9}$/.test(number)){setError(t("Enter a valid Bangladesh mobile number.","সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"));return}
  const data=await post("/operations/gateways",{method,account_number:number});
  if(!data)return;
  const id=data.id||data.account_id;
  if(label.trim()&&id)await post("/phones/"+id+"/edit-account",{label:label.trim()});
  setNumber("");setLabel("");createDialog.current?.close();
 }
 function edit(account:Account){setNewLabel(account.Label||"");setNewNumber(account.Number);setEdited(account.ID)}
 const status=(a:Account)=>a.Disabled?t("Disabled","বন্ধ"):paired.length===0?t("No phone connected","কোনো ফোন যুক্ত নেই"):t("Active","সক্রিয়");
 function numberCopy(value:string){void navigator.clipboard.writeText(value).then(()=>setNotice(t("Number copied","নম্বর কপি হয়েছে"))).catch(()=>setError(t("Copy failed.","কপি করা যায়নি।")))}
 const closeDetails=()=>setSelected(null);
 return <section className="pg-phone-panel ekv3-methods" aria-busy={loading||busy}>
  <header className="ekv3-page-header"><div><h1>{t("Payment methods","পেমেন্ট মাধ্যম")}</h1><p>{t("Accounts customers can pay into.","গ্রাহকের পেমেন্ট গ্রহণের অ্যাকাউন্টগুলো।")}</p></div><div className="ekv3-head-actions">
   <button type="button" className="ekv3-icon-button" aria-label={t("Refresh","রিফ্রেশ")} title={t("Refresh","রিফ্রেশ")} disabled={loading||busy} onClick={()=>void load()}><DashboardIcon name="refresh" width={16} height={16}/></button>
   {canManage&&<button type="button" className="ekv3-primary" onClick={()=>{setError("");createDialog.current?.showModal()}}>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button>}
  </div></header>
  {error&&<div className="ekv3-page-error" role="alert">{error}<button type="button" onClick={()=>void load()}>{t("Try again","আবার চেষ্টা করুন")}</button></div>}
  {loading&&accounts.length===0?<div className="ekv3-rows-skeleton" role="status" aria-label={t("Loading accounts","অ্যাকাউন্ট লোড হচ্ছে")}>{[0,1,2].map(i=><div key={i} className="ekv3-skeleton-row"><i/><span/><b/></div>)}</div>:
  <div className="ekv3-list">
   {accounts.map(a=><div key={a.ID} className="ekv3-account-row">
    <span className="ekv3-method-avatar" aria-hidden="true">{(methodName[a.Method]||a.Method).slice(0,1).toUpperCase()}</span>
    <div className="ekv3-account-name"><strong>{a.Label||methodName[a.Method]||a.Method}</strong>{a.Label&&<small>{methodName[a.Method]||a.Method}</small>}</div>
    <div className="ekv3-account-number"><span>{formattedAccount(a.Number)}</span><button type="button" className="ekv3-copy" onClick={()=>numberCopy(a.Number)} title={t("Copy number","নম্বর কপি")} aria-label={t("Copy number","নম্বর কপি")}><DashboardIcon name="copy" width={15} height={15}/></button></div>
    <span className={paired.length?"ekv3-account-phones":"ekv3-account-phones ekv3-warning"}>{paired.length?paired.map(phone=>phone.name).join(", "):t("No phone connected","কোনো ফোন যুক্ত নেই")}</span>
    <span className="ekv3-status" data-tone={a.Disabled?"neutral":!paired.length?"warning":"success"}>{status(a)}</span>
    <button type="button" className="ekv3-secondary" onClick={()=>setSelected(a.ID)}>{t("Manage","পরিচালনা")}</button>
   </div>)}
   {!loading&&!accounts.length&&<div className="ekv3-empty">{t("No payment methods yet.","এখনো কোনো পেমেন্ট মাধ্যম নেই।")}{canManage&&<button className="ekv3-primary" type="button" onClick={()=>createDialog.current?.showModal()}>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button>}</div>}
  </div>}
  <dialog ref={detailsDialog} className="ekv3-drawer" aria-label={t("Account details","অ্যাকাউন্টের বিবরণ")} onCancel={closeDetails} onClose={closeDetails} onClick={event=>{if(event.target===event.currentTarget)closeDetails()}}>
   {current&&<div className="ekv3-drawer-content">
    <div className="ekv3-drawer-heading"><h2>{current.Label||methodName[current.Method]||current.Method}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={closeDetails}>×</button></div>
    <div className="ekv3-drawer-list"><div><span>{t("Payment method","পেমেন্ট মাধ্যম")}</span><strong>{methodName[current.Method]||current.Method}</strong></div><div><span>{t("Receiving number","রিসিভিং নম্বর")}</span><strong>{formattedAccount(current.Number)}<button type="button" aria-label={t("Copy number","নম্বর কপি")} className="ekv3-copy" onClick={()=>numberCopy(current.Number)}><DashboardIcon name="copy" width={15} height={15}/></button></strong></div><div><span>{t("Status","অবস্থা")}</span><strong>{status(current)}</strong></div></div>
    <div className="ekv3-drawer-section"><h3>{t("Phones","ফোন")}</h3>{paired.length?paired.map(phone=><div className="ekv3-device-name" key={phone.id}>{phone.name}</div>):<p>{t("No phone connected","কোনো ফোন যুক্ত নেই")}</p>}<Link className="ekv3-secondary" href={deviceHref}>{t("Manage phones","ফোন পরিচালনা")}</Link></div>
    <div className="ekv3-drawer-footer">{canManage&&<><button type="button" className="ekv3-danger" onClick={()=>setConfirmAccount(current)}>{current.Disabled?t("Enable","চালু করুন"):t("Disable","বন্ধ করুন")}</button><button type="button" className="ekv3-secondary" onClick={()=>edit(current)}>{t("Edit account","অ্যাকাউন্ট পরিবর্তন")}</button></>}<button type="button" className="ekv3-primary" onClick={closeDetails}>{t("Done","সম্পন্ন")}</button></div>
   </div>}
  </dialog>
  <DashboardConfirmDialog open={Boolean(confirmAccount)} title={confirmAccount?.Disabled?t("Enable account","অ্যাকাউন্ট চালু করুন"):t("Disable account","অ্যাকাউন্ট বন্ধ করুন")} message={confirmAccount?.Disabled?t("This account will accept new payments.","এই অ্যাকাউন্টে নতুন পেমেন্ট গ্রহণ চালু হবে।"):t("New payments will no longer use this account.","নতুন পেমেন্টে এই অ্যাকাউন্ট ব্যবহার হবে না।")} confirmLabel={confirmAccount?.Disabled?t("Enable","চালু করুন"):t("Disable","বন্ধ করুন")} cancelLabel={t("Cancel","বাতিল")} disabled={busy} danger={!confirmAccount?.Disabled} onClose={()=>setConfirmAccount(null)} onConfirm={async()=>{if(confirmAccount)await post("/operations/gateways/"+confirmAccount.ID+"/"+(confirmAccount.Disabled?"enable":"disable"),{})}}/>
  <dialog ref={editDialog} className="pg-phone-dialog ekv2-account-dialog ekv3-form-modal" aria-label={t("Edit account","অ্যাকাউন্ট পরিবর্তন")} onCancel={()=>setEdited(null)} onClose={()=>setEdited(null)} onClick={event=>{if(event.target===event.currentTarget)setEdited(null)}}>
   {edited&&accounts.filter(a=>a.ID===edited).map(a=><div key={a.ID}><div className="pg-phone-dialog-head"><h2>{t("Edit account","অ্যাকাউন্ট পরিবর্তন")}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={()=>setEdited(null)}>×</button></div>
   <form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void post("/phones/"+a.ID+"/edit-account",{label:newLabel,...(newNumber!==a.Number?{account_number:newNumber}:{})}).then(ok=>{if(ok)setEdited(null)})}}>
    <label>{t("Account name","অ্যাকাউন্টের নাম")}<input maxLength={100} value={newLabel} onChange={e=>setNewLabel(e.target.value)}/></label>
    <label>{t("Receiving number","রিসিভিং নম্বর")}<input type="tel" inputMode="tel" value={newNumber} onChange={e=>setNewNumber(e.target.value)}/></label>
    <div className="pg-phone-actions"><button type="button" onClick={()=>setEdited(null)}>{t("Cancel","বাতিল")}</button><button type="submit" className="ekv3-primary" disabled={busy}>{t("Save changes","পরিবর্তন সংরক্ষণ")}</button></div>
   </form></div>)}
  </dialog>
  <dialog ref={createDialog} className="pg-phone-dialog ekv3-form-modal" aria-labelledby="ekv3-add-account">
   <div className="pg-phone-dialog-head"><h2 id="ekv3-add-account">{t("Add account","অ্যাকাউন্ট যোগ করুন")}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={()=>createDialog.current?.close()}>×</button></div>
   <form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void create()}}>
    <label>{t("Payment method","পেমেন্ট মাধ্যম")}<select value={method} onChange={e=>setMethod(e.target.value)}>{Object.keys(methodName).map(m=><option key={m} value={m}>{methodName[m]}</option>)}</select></label>
    <label>{t("Receiving number","রিসিভিং নম্বর")}<input required autoFocus type="tel" inputMode="tel" autoComplete="off" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+8801XXXXXXXXX"/></label>
    <label>{t("Account name (optional)","অ্যাকাউন্টের নাম (ঐচ্ছিক)")}<input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/></label>
    <div className="pg-phone-actions"><button type="button" onClick={()=>createDialog.current?.close()}>{t("Cancel","বাতিল")}</button><button type="submit" className="ekv3-primary" disabled={busy||!number}>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button></div>
   </form>
  </dialog>
  {notice&&<div className="ekv3-toast" role="status">{notice}</div>}
 </section>;
}
