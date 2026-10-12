"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type Phone={id:string;name:string;claimed_at?:string|null;revoked_at?:string|null;heartbeat_at?:string|null;bindings:{id:string;account_id:string;source:string;binding:string}[]};
const methodName:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
export function PaymentMethodManagement({locale,workspaceId,environment,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean}){
 const bn=locale==="bn",t=(e:string,b:string)=>bn?b:e;
 const base="/api/go/workspaces/"+workspaceId,href="/"+locale+"/w/"+workspaceId+"/payments/devices?env="+environment;
 const [accounts,setAccounts]=useState<Account[]>([]),[phones,setPhones]=useState<Phone[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [step,setStep]=useState(0),[method,setMethod]=useState("bkash"),[number,setNumber]=useState(""),[label,setLabel]=useState("");
 const [edited,setEdited]=useState<string|null>(null),[newLabel,setNewLabel]=useState(""),[newNumber,setNewNumber]=useState("");
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{const response=await fetch(base+"/phones?environment="+environment,{cache:"no-store",signal});
   if(!response.ok)throw Error(t("Receiving-account service is unavailable. Configure financial databases and receipt pipeline first.","Receiving-account service প্রস্তুত নয়। Financial database ও receipt pipeline সেটআপ করুন।"));
   const data=await response.json();if(!signal?.aborted){setAccounts(data.accounts||[]);setPhones(data.items||[])}
  }catch(e){if(!signal?.aborted)setError(String(e))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,bn]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort()},[load]);
 async function post(path:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(base+path+(path.includes("?")?"":"?environment="+environment),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json();if(!response.ok)throw Error(data.error?.code||data.code||response.status);
   await load();setNotice(t("Saved. Verify the receiving account and device source before collecting payments.","সংরক্ষিত। Payment নেওয়ার আগে account ও device source যাচাই করুন।"));
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
  setNumber("");setLabel("");setStep(3);
 }
 const connected=(a:Account)=>phones.flatMap(p=>p.bindings.filter(b=>b.account_id===a.ID).map(b=>({p,b})));
 return <section className="pg-phone-panel" aria-busy={loading||busy}>
  <div className="pg-phone-hero"><div><p className="pg-device-kicker">{t("Receiving & verification","টাকা গ্রহণ ও যাচাই")} / {environment.toUpperCase()}</p><h2>{t("Payment methods","পেমেন্ট মাধ্যম")}</h2><p>{t("Receiving numbers are shown in full only in your authorized workspace. Each account must be associated with an approved phone/source before real verification.","শুধু অনুমোদিত workspace-এ পুরো receiving number দেখানো হয়। আসল verification-এর আগে account-এর অনুমোদিত phone/source যুক্ত করুন।")}</p></div><button type="button" onClick={()=>void load()} disabled={loading||busy}>{t("Refresh","Refresh")}</button></div>
  {error&&<div className="pg-phone-warning" role="alert"><strong>{t("Connection needs attention","সংযোগে সমস্যা")}</strong><p>{error}</p><button onClick={()=>void load()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p role="status" className="pg-phone-notice">{notice}</p>}
  {loading?<div className="pg-phone-placeholder" role="status">{t("Loading receiving accounts…","Receiving account লোড হচ্ছে…")}</div>:<>
   <div className="pg-method-grid">
    {accounts.map(a=>{const bindings=connected(a);return <article className="pg-method-card" key={a.ID}>
     <div className="pg-method-header"><div className="pg-method-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="5" width="20" height="15" rx="2"/><path d="M2 10h20M6 16h5"/></svg></div><span className="pg-method-status">{a.Disabled?t("Disabled","বন্ধ"):bindings.length===0?t("Setup required","সেটআপ বাকি"):t("Connected","সংযুক্ত")}</span></div>
     <h3>{a.Label||methodName[a.Method]||a.Method}</h3><p>{methodName[a.Method]||a.Method}</p>
     <div className="pg-method-number"><span>{a.Number}</span><button type="button" aria-label={t("Copy full receiving number","সম্পূর্ণ receiving number কপি")} onClick={()=>void navigator.clipboard.writeText(a.Number).then(()=>setNotice(t("Number copied","নম্বর কপি হয়েছে"))).catch(()=>setError(t("Copy failed","কপি হয়নি")))}>{t("Copy","কপি")}</button></div>
     <div className="pg-method-info"><span>{t("Connected phone/source","যুক্ত ফোন/উৎস")}</span><strong>{bindings.length?bindings.map(x=>x.p.name+" · "+x.b.binding).join(", "):t("No phone source linked","কোনো ফোন উৎস যুক্ত নেই")}</strong></div>
     {bindings.length===0&&!a.Disabled&&<p className="pg-phone-muted">{t("Next: open SMS Devices, connect a phone, then select this account and source.","পরের ধাপ: SMS Devices-এ ফোন যুক্ত করে এই account ও source বেছে নিন।")}</p>}
     <div className="pg-method-actions"><Link href={href}>{t("Manage connections","সংযোগ পরিচালনা")}</Link>
      {canManage&&<button type="button" onClick={()=>{setEdited(a.ID);setNewLabel(a.Label||"");setNewNumber(a.Number)}}>{t("Edit account","অ্যাকাউন্ট সম্পাদনা")}</button>}
      {canManage&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm(a.Disabled?t("Enable this account?","অ্যাকাউন্ট চালু করবেন?"):t("Disable this account for new payment requests?","নতুন পেমেন্টের জন্য account বন্ধ করবেন?")))void post("/operations/gateways/"+a.ID+"/"+(a.Disabled?"enable":"disable"),{})}}>{a.Disabled?t("Enable","চালু"):t("Disable","বন্ধ")}</button>}
     </div>
     {edited===a.ID&&<form className="pg-phone-inline" onSubmit={e=>{e.preventDefault();void post("/phones/"+a.ID+"/edit-account",{label:newLabel,...(newNumber!==a.Number?{account_number:newNumber}:{})}).then(ok=>{if(ok)setEdited(null)})}}><label>{t("Account label","অ্যাকাউন্টের নাম")}<input maxLength={100} value={newLabel} onChange={e=>setNewLabel(e.target.value)}/></label><label>{t("Full receiving number","সম্পূর্ণ receiving নম্বর")}<input type="tel" inputMode="tel" value={newNumber} onChange={e=>setNewNumber(e.target.value)}/></label><small>{t("A number with receipt, device, or payment history cannot be changed in place; disable and create a replacement.","Receipt, device বা payment history থাকলে নম্বর পরিবর্তন করা যাবে না; পুরোনো account বন্ধ করে নতুনটি যুক্ত করুন।")}</small><button type="submit" disabled={busy}>{t("Save","সংরক্ষণ")}</button><button type="button" onClick={()=>setEdited(null)}>{t("Cancel","বাতিল")}</button></form>}
    </article>})}
    {!accounts.length&&!error&&<div className="pg-phone-empty"><h3>{t("No receiving accounts","এখনো receiving account নেই")}</h3><p>{t("Add a bKash, Nagad or Rocket receiving number to begin setup.","সেটআপের জন্য bKash, Nagad বা Rocket receiving number যোগ করুন।")}</p></div>}
   </div>
   {canManage&&<section className="pg-phone-box"><h3>{t("Add receiving account","Receiving account যোগ করুন")}</h3>
    <div className="pg-phone-steps"><span>{t("1. Method","১. মাধ্যম")}</span><span>{t("2. Number & label","২. নম্বর ও নাম")}</span><span>{t("3. Connect phone","৩. ফোন সংযোগ")}</span></div>
    {step===0?<div className="pg-method-picker">{Object.keys(methodName).map(m=><button key={m} type="button" className={m===method?"is-selected":""} onClick={()=>setMethod(m)}>{methodName[m]}</button>)}<button className="pg-phone-primary" type="button" onClick={()=>setStep(1)}>{t("Continue","পরবর্তী")}</button></div>
    :step===1?<form className="pg-phone-setup" onSubmit={e=>{e.preventDefault();void create()}}>
     <label>{t("Full receiving number","সম্পূর্ণ receiving নম্বর")}<input required type="tel" inputMode="tel" autoComplete="off" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+8801XXXXXXXXX"/></label>
     <label>{t("Account label (optional)","অ্যাকাউন্টের নাম (ঐচ্ছিক)")}<input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)} placeholder={t("e.g. Main shop","যেমন: মূল দোকান")}/></label>
     <p className="pg-phone-muted">{t("The receiving number cannot be silently replaced after payment history is created. To change it, disable this account and add a new receiving number.","পেমেন্টের ইতিহাস তৈরি হলে এই নম্বর গোপনে পরিবর্তন করা যাবে না। বদলাতে আগের account বন্ধ করে নতুন নম্বর যুক্ত করুন।")}</p>
     <div className="pg-phone-actions"><button type="button" onClick={()=>setStep(0)}>{t("Back","পেছনে")}</button><button type="submit" disabled={busy||!number}>{t("Save account","অ্যাকাউন্ট সংরক্ষণ")}</button></div>
    </form>:<div className="pg-phone-setup"><p>{t("Next: pair a phone once or select your existing phone, then add this receiving account's approved source mapping.","এবার একটি ফোন একবার pair করুন অথবা আগের ফোনে এই account-এর approved source mapping যুক্ত করুন।")}</p><Link href={href}>{t("Go to SMS Devices","SMS Devices-এ যান")}</Link><button onClick={()=>setStep(0)}>{t("Add another account","আরেকটি account যোগ করুন")}</button></div>}
   </section>}
  </>}
 </section>;
}
