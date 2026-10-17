"use client";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {DashboardConfirmDialog} from "./dashboard-confirm-dialog";
import {DashboardIcon} from "./dashboard-icon";
import {isPaymentProvider,paymentProviderAppearance,paymentProviderKeys,providerSurfaceStyle} from "./payment-provider-appearance";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type CatalogProvider={code:string;name:string;logo:string;checkout:boolean;live:boolean};
const legacyProviders:CatalogProvider[]=paymentProviderKeys.map(code=>({code,name:paymentProviderAppearance[code].name,logo:paymentProviderAppearance[code].logo,checkout:true,live:true}));
const methodName:Record<string,string>=Object.fromEntries(paymentProviderKeys.map(key=>[key,paymentProviderAppearance[key].name]));
export function PaymentMethodManagement({locale,workspaceId,environment,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,bd:string)=>bn?bd:en,[bn]);
 const formattedAccount=(value:string)=>{const digits=value.replace(/\D/g,"");const local=digits.startsWith("880")?digits.slice(3):digits.startsWith("0")?digits.slice(1):digits;return local.length===10?"+880 "+local.slice(0,4)+" "+local.slice(4):value};
 const base="/api/go/workspaces/"+workspaceId;
 const seed=useDashboardInitialData<{accounts:Account[]}>("phones");
 const [accounts,setAccounts]=useState<Account[]>(seed?.data?.accounts??[]),[loading,setLoading]=useState(!seed),[busy,setBusy]=useState(false),[error,setError]=useState(seed?.error??""),[notice,setNotice]=useState("");
 const createDialog=useRef<HTMLDialogElement>(null),editDialog=useRef<HTMLDialogElement>(null),detailsDialog=useRef<HTMLDialogElement>(null);
 const [method,setMethod]=useState(""),[number,setNumber]=useState(""),[label,setLabel]=useState("");
 const normalizeNumber=(raw:string)=>{const digits=raw.replace(/\D/g,"");return digits.startsWith("880")?("0"+digits.slice(3)):digits.startsWith("01")?digits:""};
 const [query,setQuery]=useState(""),[filter,setFilter]=useState<"all"|"active"|"disabled">("all"),[providerQuery,setProviderQuery]=useState("");
 const [providerItems,setProviderItems]=useState<CatalogProvider[]>(legacyProviders);
 const [providerError,setProviderError]=useState("");
 const [providerLoading,setProviderLoading]=useState(false);
 const providerName=(code:string)=>providerItems.find(p=>p.code===code)?.name||methodName[code]||code;
 const providerLogo=(code:string)=>providerItems.find(p=>p.code===code)?.logo||(isPaymentProvider(code)?paymentProviderAppearance[code].logo:"");
 const loadProviderCatalog=useCallback(async()=>{
  setProviderLoading(true);setProviderError("");
  try{
   const r=await fetch("/api/payment-providers",{cache:"no-store"});
   if(!r.ok)throw Error(String(r.status));
   const data:unknown=await r.json();
   if(!data||typeof data!=="object"||!("providers" in data)||!Array.isArray(data.providers))throw Error("Invalid catalog");
   const p:CatalogProvider[]=data.providers.filter((x:unknown)=>!!x&&typeof x==="object"&&"code" in x&&typeof x.code==="string"&&"name" in x&&typeof x.name==="string"&&isPaymentProvider(x.code)).map((x:{code:string;name:string;logo?:string;checkout?:boolean;live?:boolean})=>({code:x.code,name:x.name,logo:typeof x.logo==="string"?x.logo:"",checkout:x.checkout===true,live:x.live===true}));
   setProviderItems(p);
  }catch{
   // Preserve existing three-provider account creation if control DB migration has not been applied.
   setProviderItems(legacyProviders);
   setProviderError(t("Catalog could not be refreshed; showing existing supported methods.","ক্যাটালগ আপডেট হয়নি; পূর্বের সমর্থিত মাধ্যমগুলো দেখানো হচ্ছে।"));
  }finally{setProviderLoading(false)}
 },[t]);

 const visibleAccounts=accounts.filter(a=>(filter==="all"||(filter==="active"?!a.Disabled:a.Disabled))&&[a.Label,a.Number,formattedAccount(a.Number),providerName(a.Method)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 const openAdd=()=>{setMethod("");setNumber("");setLabel("");setProviderQuery("");setError("");createDialog.current?.showModal();void loadProviderCatalog()};
 const [selected,setSelected]=useState<string|null>(null),[edited,setEdited]=useState<string|null>(null),[newLabel,setNewLabel]=useState(""),[newNumber,setNewNumber]=useState("");
 const [confirmAccount,setConfirmAccount]=useState<Account|null>(null);
 const current=accounts.find(account=>account.ID===selected)||null;
 
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
   if(!signal?.aborted){setAccounts(data.accounts||[])}
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
  if(!/^01[3-9][0-9]{8}$/.test(normalizeNumber(number))){setError(t("Enter a valid Bangladesh mobile number.","সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"));return}
  const data=await post("/operations/gateways",{method,account_number:normalizeNumber(number)});
  if(!data)return;
  const id=data.id||data.account_id;
  if(label.trim()&&id)await post("/phones/"+id+"/edit-account",{label:label.trim()});
  setNumber("");setLabel("");createDialog.current?.close();
 }
 function edit(account:Account){setNewLabel(account.Label||"");setNewNumber(account.Number);setEdited(account.ID)}
 const status=(a:Account)=>a.Disabled?t("Disabled","বন্ধ"):t("Active","সক্রিয়");
 function numberCopy(value:string){void navigator.clipboard.writeText(value).then(()=>setNotice(t("Number copied","নম্বর কপি হয়েছে"))).catch(()=>setError(t("Copy failed.","কপি করা যায়নি।")))}
 const closeDetails=()=>setSelected(null);
 return <section className="pg-phone-panel ekv3-methods" aria-busy={loading||busy}>
  <header className="ekv3-page-header"><div><h1>{t("Payment methods","পেমেন্ট মাধ্যম")}</h1><p>{t("Accounts customers can pay into.","গ্রাহকের পেমেন্ট গ্রহণের অ্যাকাউন্টগুলো।")}</p></div><div className="ekv3-head-actions">
   <button type="button" className="ekv3-icon-button" aria-label={t("Refresh","রিফ্রেশ")} title={t("Refresh","রিফ্রেশ")} disabled={loading||busy} onClick={()=>void load()}><DashboardIcon name="refresh" width={16} height={16}/></button>
   {canManage&&<button type="button" className="ekv3-primary" onClick={openAdd}><DashboardIcon name="plus" width={16} height={16}/>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button>}
  </div></header>
  {error&&<div className="ekv3-page-error" role="alert">{error}<button type="button" onClick={()=>void load()}>{t("Try again","আবার চেষ্টা করুন")}</button></div>}
  <div className="ek-ref-toolbar">
   <label className="ek-ref-search"><DashboardIcon name="search" width={16} height={16}/><input type="search" aria-label={t("Search accounts","অ্যাকাউন্ট খুঁজুন")} placeholder={t("Search by number, provider or label","নম্বর, মাধ্যম বা নাম দিয়ে খুঁজুন")} value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="ek-ref-tabs" role="tablist" aria-label={t("Account status","অ্যাকাউন্টের অবস্থা")}>
    {(["all","active","disabled"] as const).map(key=><button key={key} type="button" className={filter===key?"is-selected":""} role="tab" aria-selected={filter===key} onClick={()=>setFilter(key)}>{key==="all"?t("All","সব"):key==="active"?t("Active","সক্রিয়"):t("Disabled","বন্ধ")} <span>{key==="all"?accounts.length:accounts.filter(a=>key==="active"?!a.Disabled:a.Disabled).length}</span></button>)}
   </div>
  </div>
  {loading&&accounts.length===0?<div className="ekv3-rows-skeleton" role="status" aria-label={t("Loading accounts","অ্যাকাউন্ট লোড হচ্ছে")}>{[0,1,2].map(i=><div key={i} className="ekv3-skeleton-row"><i/><span/><b/></div>)}</div>:
  <div className="ek-ref-cards">
   {visibleAccounts.map(a=><article className="ek-ref-account ek-provider-surface wc" style={providerSurfaceStyle(a.Method)} key={a.ID} data-disabled={a.Disabled}>
    <span className="ek-ref-orb" aria-hidden="true"/><div className={"ek-ref-logo ek-ref-"+a.Method}>{isPaymentProvider(a.Method)?<img className="ek-ref-provider-image" src={paymentProviderAppearance[a.Method as keyof typeof paymentProviderAppearance]?.logo??""} width={88} height={44} alt={(methodName[a.Method]||a.Method)+" logo"}/>:<span>{a.Method}</span>}</div><div className="ek-ref-account-identity"><span className="ek-ref-state"><i data-on={!a.Disabled}/>{status(a)}<span className="ek-ref-caption">{a.Label||t("Account number","অ্যাকাউন্ট নম্বর")}</span></span><span className="ek-ref-number">{formattedAccount(a.Number)} <button type="button" onClick={()=>numberCopy(a.Number)} aria-label={t("Copy number","নম্বর কপি")} title={t("Copy number","নম্বর কপি")}><DashboardIcon name="copy" width={14} height={14}/></button></span></div><div className="ek-ref-actions">{canManage&&<button type="button" role="switch" aria-checked={!a.Disabled} className="ek-ref-switch" disabled={busy} onClick={()=>setConfirmAccount(a)} aria-label={a.Disabled?t("Enable account","অ্যাকাউন্ট চালু করুন"):t("Disable account","অ্যাকাউন্ট বন্ধ করুন")}><span/></button>}<button type="button" className="ek-ref-manage" onClick={()=>setSelected(a.ID)}>{t("Manage","পরিচালনা")}</button></div>
   </article>)}
   {canManage&&<button type="button" className="ek-ref-add-card" onClick={openAdd}><span><DashboardIcon name="plus" width={16} height={16}/></span>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button>}
   {!loading&&visibleAccounts.length===0&&<div className="ek-ref-empty">{accounts.length?t("No accounts match your search.","অনুসন্ধানে কোনো অ্যাকাউন্ট পাওয়া যায়নি।"):t("No payment methods yet.","এখনো কোনো পেমেন্ট মাধ্যম নেই।")}</div>}
  </div>}
  <p className="ek-ref-count">{t("Showing","দেখানো হচ্ছে")} {visibleAccounts.length} {t("of","টি /")} {accounts.length} {t("accounts","অ্যাকাউন্ট")}</p>
  <dialog ref={detailsDialog} className="ekv3-drawer" aria-label={t("Account details","অ্যাকাউন্টের বিবরণ")} onCancel={closeDetails} onClose={closeDetails} onClick={event=>{if(event.target===event.currentTarget)closeDetails()}}>
   {current&&<div className="ekv3-drawer-content">
    <div className="ekv3-drawer-heading"><h2>{current.Label||providerName(current.Method)}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={closeDetails}>×</button></div>
    <div className="ekv3-drawer-list"><div><span>{t("Payment method","পেমেন্ট মাধ্যম")}</span><strong>{providerName(current.Method)||current.Method}</strong></div><div><span>{t("Receiving number","রিসিভিং নম্বর")}</span><strong>{formattedAccount(current.Number)}<button type="button" aria-label={t("Copy number","নম্বর কপি")} className="ekv3-copy" onClick={()=>numberCopy(current.Number)}><DashboardIcon name="copy" width={15} height={15}/></button></strong></div><div><span>{t("Status","অবস্থা")}</span><strong>{status(current)}</strong></div></div>
    
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
  <dialog ref={createDialog} className="pg-phone-dialog ekv3-form-modal ek-ref-modal" aria-labelledby="ekv3-add-account" onClick={event=>{if(event.target===event.currentTarget)createDialog.current?.close()}}>
   <div className="pg-phone-dialog-head"><div><h2 id="ekv3-add-account">{t("Add account","অ্যাকাউন্ট যোগ করুন")}</h2><p>{method?t("Enter the account customers will pay into.","গ্রাহক যে অ্যাকাউন্টে পেমেন্ট করবেন সেটি দিন।"):t("Choose a provider.","একটি মাধ্যম বেছে নিন।")}</p></div><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={()=>createDialog.current?.close()}>×</button></div>
   <form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void create()}}>
    {!method?<><label className="ek-ref-search ek-ref-provider-search"><DashboardIcon name="search" width={16} height={16}/><input aria-label={t("Search providers","মাধ্যম খুঁজুন")} placeholder={t("Search providers","মাধ্যম খুঁজুন")} value={providerQuery} onChange={e=>setProviderQuery(e.target.value)}/></label>{providerError&&<p className="ekv3-page-error" role="status">{providerError}<button type="button" onClick={()=>void loadProviderCatalog()}>{t("Retry","আবার চেষ্টা")}</button></p>}{providerLoading&&<p className="ek-ref-help">{t("Refreshing providers…","মাধ্যম লোড হচ্ছে…")}</p>}<div className="ek-ref-providers">{providerItems.filter(p=>p.name.toLowerCase().includes(providerQuery.toLowerCase())).map(({code:key,name,logo})=><button type="button" key={key} className="ek-ref-provider ek-provider-surface wc" style={providerSurfaceStyle(key)} onClick={()=>setMethod(key)}><span className={"ek-ref-logo ek-ref-"+key}>{isPaymentProvider(key)?<img className="ek-ref-provider-image" src={logo||providerLogo(key)} width={80} height={40} alt={name+" logo"}/>:name}</span><span className="ek-ref-provider-name">{name}</span></button>)}{!providerItems.some(p=>p.name.toLowerCase().includes(providerQuery.toLowerCase()))&&<div className="ek-ref-empty">{t("No provider found.","কোনো মাধ্যম পাওয়া যায়নি।")}</div>}</div></>:<div className="ek-ref-selected-provider ek-provider-surface" style={providerSurfaceStyle(method)}><span className={"ek-ref-logo ek-ref-"+method}>{isPaymentProvider(method)?<img className="ek-ref-provider-image" src={providerLogo(method)} width={84} height={42} alt={providerName(method)+" logo"}/>:methodName[method]}</span><span className="ek-ref-provider-title">{methodName[method]}</span><button type="button" onClick={()=>setMethod("")}>{t("Change","পরিবর্তন")}</button></div>}
    {method&&<><label className="ek-ref-field">{t("Account number","অ্যাকাউন্ট নম্বর")}<input required type="tel" inputMode="tel" autoComplete="off" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+880 1XXX XXXXXX"/></label>
    <label className="ek-ref-field">{t("Label","লেবেল")}<span className="ek-ref-help">{t("Optional, only you see this","ঐচ্ছিক, শুধু আপনি দেখবেন")}</span><input value={label} maxLength={100} placeholder={t("e.g. Main shop","যেমন: মূল দোকান")} onChange={e=>setLabel(e.target.value)}/></label>
    </>}<div className="pg-phone-actions"><button type="button" onClick={()=>createDialog.current?.close()}>{t("Cancel","বাতিল")}</button><button type="submit" className="ekv3-primary" disabled={busy||!method||!/^01[3-9][0-9]{8}$/.test(normalizeNumber(number))}>{t("Add account","অ্যাকাউন্ট যোগ করুন")}</button></div>
   </form>
  </dialog>
  {notice&&<div className="ekv3-toast" role="status">{notice}</div>}
 </section>;
}
